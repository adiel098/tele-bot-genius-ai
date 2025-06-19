
import modal
import json
import os
import asyncio
import logging
from typing import Dict, Any, Optional
from datetime import datetime
import aiohttp
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

# Configure Modal app
app = modal.App("telegram-bot-platform")

# Create Modal image with all required Python dependencies for Telegram bots
image = (
    modal.Image.debian_slim()
    .pip_install([
        "python-telegram-bot>=20.0",
        "requests>=2.28.0",
        "python-dotenv>=1.0.0",
        "aiohttp>=3.8.0",
        "fastapi[standard]>=0.115.0"
    ])
    .env({"PYTHONUNBUFFERED": "1"})
)

# Persistent volume for bot files and data
volume = modal.Volume.from_name("bot-files", create_if_missing=True)

# Dictionary to store active bot instances in memory
bot_instances: Dict[str, Any] = {}

@app.function(
    image=image,
    volumes={"/data": volume},
    timeout=300,
    memory=512
)
def store_bot_code(bot_id: str, user_id: str, bot_code: str, bot_token: str, bot_name: str) -> Dict[str, Any]:
    """Store bot code in Modal volume"""
    try:
        print(f"[MODAL] Storing bot {bot_id} for user {user_id}")
        
        # Create bot directory in Modal volume
        bot_dir = f"/data/bots/{user_id}/{bot_id}"
        os.makedirs(bot_dir, exist_ok=True)
        
        # Write main bot code
        with open(f"{bot_dir}/main.py", "w") as f:
            f.write(bot_code)
        
        # Write bot metadata
        metadata = {
            "bot_id": bot_id,
            "user_id": user_id,
            "bot_name": bot_name,
            "created_at": datetime.now().isoformat(),
            "status": "stored",
            "bot_token": bot_token
        }
        
        with open(f"{bot_dir}/metadata.json", "w") as f:
            json.dump(metadata, f)
        
        # Commit changes to volume
        volume.commit()
        
        print(f"[MODAL] Bot {bot_id} files stored successfully")
        
        return {
            "success": True,
            "bot_id": bot_id,
            "deployment_type": "modal",
            "status": "stored",
            "logs": [
                f"[MODAL] Bot {bot_id} stored successfully",
                f"[MODAL] Files stored in Modal volume: {bot_dir}",
                f"[MODAL] Ready for deployment"
            ]
        }
        
    except Exception as e:
        print(f"[MODAL] Error storing bot {bot_id}: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "logs": [f"[MODAL ERROR] Failed to store bot: {str(e)}"]
        }

@app.function(
    image=image,
    volumes={"/data": volume},
    min_containers=1,
    timeout=3600
)
@modal.asgi_app()
def telegram_bot_service():
    """Single FastAPI service that handles all Telegram bots"""
    web_app = FastAPI(title="Telegram Bot Platform")
    
    # Allow CORS for webhook requests
    web_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    async def load_bot_instance(bot_id: str, user_id: str):
        """Load and initialize a bot instance"""
        try:
            bot_dir = f"/data/bots/{user_id}/{bot_id}"
            
            # Load metadata
            with open(f"{bot_dir}/metadata.json", "r") as f:
                metadata = json.load(f)
            
            # Load and execute bot code
            with open(f"{bot_dir}/main.py", "r") as f:
                bot_code = f.read()
            
            # Create a namespace for the bot code
            bot_namespace = {"__name__": "__main__"}
            
            # Set environment variables for this bot
            os.environ["BOT_TOKEN"] = metadata["bot_token"]
            
            # Execute bot code to get the bot instance
            exec(bot_code, bot_namespace)
            
            # Try to get the application instance from the bot code
            bot_handler = None
            if "application" in bot_namespace:
                bot_handler = bot_namespace["application"]
            elif "app" in bot_namespace:
                bot_handler = bot_namespace["app"]
            
            if bot_handler:
                # Initialize the application
                await bot_handler.initialize()
                bot_instances[bot_id] = {
                    "handler": bot_handler,
                    "metadata": metadata,
                    "loaded_at": datetime.now().isoformat()
                }
                print(f"[MODAL] Bot {bot_id} loaded and initialized successfully")
                return True
            else:
                print(f"[MODAL] No application instance found in bot {bot_id} code")
                return False
                
        except Exception as e:
            print(f"[MODAL] Error loading bot {bot_id}: {str(e)}")
            return False

    @web_app.post("/webhook/{bot_id}")
    async def handle_webhook(bot_id: str, request: Request):
        """Handle incoming Telegram webhook requests for specific bot"""
        try:
            body = await request.json()
            print(f"[MODAL] Bot {bot_id} received webhook: {body}")
            
            # Load bot if not already loaded
            if bot_id not in bot_instances:
                # Try to find user_id from the request or database
                # For now, we'll try to load from any user directory
                user_dirs = []
                try:
                    base_dir = "/data/bots"
                    if os.path.exists(base_dir):
                        for user_dir in os.listdir(base_dir):
                            bot_path = f"{base_dir}/{user_dir}/{bot_id}"
                            if os.path.exists(bot_path):
                                user_dirs.append(user_dir)
                
                    if user_dirs:
                        await load_bot_instance(bot_id, user_dirs[0])
                except Exception as e:
                    print(f"[MODAL] Error finding bot {bot_id}: {str(e)}")
            
            # Process webhook with bot handler
            if bot_id in bot_instances:
                bot_handler = bot_instances[bot_id]["handler"]
                
                # Process the update with the bot
                from telegram import Update
                
                update = Update.de_json(body, None)
                if update and bot_handler:
                    # Process the update asynchronously
                    await bot_handler.process_update(update)
                
                return {"ok": True}
            else:
                print(f"[MODAL] Bot {bot_id} not found or not loaded")
                return {"ok": False, "error": "Bot not found"}
                
        except Exception as e:
            print(f"[MODAL] Error processing webhook for bot {bot_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))

    @web_app.get("/health/{bot_id}")
    async def health_check(bot_id: str):
        """Health check endpoint for specific bot"""
        is_loaded = bot_id in bot_instances
        return {
            "status": "healthy" if is_loaded else "not_loaded",
            "bot_id": bot_id,
            "loaded": is_loaded,
            "timestamp": datetime.now().isoformat()
        }

    @web_app.get("/logs/{bot_id}")
    async def get_bot_logs(bot_id: str):
        """Get bot logs"""
        try:
            logs = [
                f"[{datetime.now().isoformat()}] Bot {bot_id} FastAPI service active",
                f"[{datetime.now().isoformat()}] Webhook endpoint: /webhook/{bot_id}"
            ]
            
            if bot_id in bot_instances:
                logs.append(f"[{datetime.now().isoformat()}] Bot {bot_id} is loaded and running")
                logs.append(f"[{datetime.now().isoformat()}] Loaded at: {bot_instances[bot_id]['loaded_at']}")
            else:
                logs.append(f"[{datetime.now().isoformat()}] Bot {bot_id} is not currently loaded")
            
            return {"success": True, "logs": logs}
            
        except Exception as e:
            return {"success": False, "error": str(e), "logs": []}

    @web_app.post("/load-bot/{bot_id}")
    async def load_bot(bot_id: str, request: Request):
        """Manually load a bot instance"""
        try:
            body = await request.json()
            user_id = body.get("user_id")
            
            if not user_id:
                raise HTTPException(status_code=400, detail="user_id required")
            
            success = await load_bot_instance(bot_id, user_id)
            
            return {
                "success": success,
                "bot_id": bot_id,
                "loaded": bot_id in bot_instances
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    @web_app.post("/unload-bot/{bot_id}")
    async def unload_bot(bot_id: str):
        """Unload a bot instance"""
        try:
            if bot_id in bot_instances:
                # Clean up bot instance
                bot_handler = bot_instances[bot_id]["handler"]
                if hasattr(bot_handler, 'shutdown'):
                    await bot_handler.shutdown()
                
                del bot_instances[bot_id]
                
                return {
                    "success": True,
                    "bot_id": bot_id,
                    "message": "Bot unloaded successfully"
                }
            else:
                return {
                    "success": False,
                    "bot_id": bot_id,
                    "message": "Bot was not loaded"
                }
                
        except Exception as e:
            return {"success": False, "error": str(e)}

    @web_app.get("/")
    async def root():
        """Root endpoint"""
        return {
            "service": "Telegram Bot Platform",
            "status": "running",
            "loaded_bots": list(bot_instances.keys()),
            "timestamp": datetime.now().isoformat()
        }

    return web_app

@app.function(
    image=image,
    volumes={"/data": volume}
)
async def register_webhook(bot_id: str, user_id: str, webhook_url: str) -> Dict[str, Any]:
    """Register webhook URL with Telegram API"""
    try:
        bot_dir = f"/data/bots/{user_id}/{bot_id}"
        
        # Load bot metadata to get token
        with open(f"{bot_dir}/metadata.json", "r") as f:
            metadata = json.load(f)
        
        bot_token = metadata["bot_token"]
        
        # Register webhook with Telegram
        telegram_url = f"https://api.telegram.org/bot{bot_token}/setWebhook"
        
        async with aiohttp.ClientSession() as session:
            async with session.post(telegram_url, json={
                "url": webhook_url,
                "allowed_updates": ["message", "callback_query"]
            }) as response:
                result = await response.json()
                
                if result.get("ok"):
                    print(f"[MODAL] Webhook registered for bot {bot_id}: {webhook_url}")
                    
                    # Update metadata
                    metadata["webhook_url"] = webhook_url
                    metadata["status"] = "running"
                    metadata["started_at"] = datetime.now().isoformat()
                    
                    with open(f"{bot_dir}/metadata.json", "w") as f:
                        json.dump(metadata, f)
                    
                    volume.commit()
                    
                    return {
                        "success": True,
                        "webhook_url": webhook_url,
                        "status": "running"
                    }
                else:
                    raise Exception(f"Telegram API error: {result}")
                    
    except Exception as e:
        print(f"[MODAL] Error registering webhook for bot {bot_id}: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

@app.function(
    image=image,
    volumes={"/data": volume}
)
async def unregister_webhook(bot_id: str, user_id: str) -> Dict[str, Any]:
    """Unregister webhook from Telegram API"""
    try:
        bot_dir = f"/data/bots/{user_id}/{bot_id}"
        
        # Load bot metadata
        with open(f"{bot_dir}/metadata.json", "r") as f:
            metadata = json.load(f)
        
        bot_token = metadata["bot_token"]
        
        # Remove webhook from Telegram
        telegram_url = f"https://api.telegram.org/bot{bot_token}/deleteWebhook"
        
        async with aiohttp.ClientSession() as session:
            async with session.post(telegram_url) as response:
                result = await response.json()
                
                print(f"[MODAL] Webhook unregistered for bot {bot_id}")
                
                # Update metadata
                metadata["status"] = "stopped"
                metadata["stopped_at"] = datetime.now().isoformat()
                metadata.pop("webhook_url", None)
                
                with open(f"{bot_dir}/metadata.json", "w") as f:
                    json.dump(metadata, f)
                
                volume.commit()
                
                return {
                    "success": True,
                    "status": "stopped"
                }
                
    except Exception as e:
        print(f"[MODAL] Error unregistering webhook for bot {bot_id}: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

@app.function(
    image=image,
    volumes={"/data": volume}
)
def get_logs(bot_id: str, user_id: str) -> Dict[str, Any]:
    """Get bot logs from the stored files"""
    try:
        bot_dir = f"/data/bots/{user_id}/{bot_id}"
        
        # Get metadata
        with open(f"{bot_dir}/metadata.json", "r") as f:
            metadata = json.load(f)
        
        # Generate status logs
        current_time = datetime.now().isoformat()
        
        logs = [
            f"[{current_time}] MODAL BOT RUNTIME LOGS",
            f"[{current_time}] Bot ID: {bot_id}",
            f"[{current_time}] Status: {metadata.get('status', 'unknown')}",
            f"[{current_time}] Runtime: Modal FastAPI Service"
        ]
        
        if metadata.get("status") == "running":
            logs.extend([
                f"[{current_time}] Bot is actively processing webhooks",
                f"[{current_time}] Webhook URL: {metadata.get('webhook_url', 'Not set')}"
            ])
        
        return {
            "success": True,
            "logs": logs
        }
        
    except Exception as e:
        return {
            "success": False,
            "logs": [f"[MODAL ERROR] Failed to get logs: {str(e)}"]
        }

@app.function(
    image=image,
    volumes={"/data": volume}
)
def get_status(bot_id: str, user_id: str) -> Dict[str, Any]:
    """Get bot status from metadata"""
    try:
        bot_dir = f"/data/bots/{user_id}/{bot_id}"
        
        with open(f"{bot_dir}/metadata.json", "r") as f:
            metadata = json.load(f)
        
        return {
            "success": True,
            "status": metadata.get("status", "unknown"),
            "deployment_type": "modal",
            "runtime": "Modal FastAPI Service",
            "created_at": metadata.get("created_at"),
            "started_at": metadata.get("started_at"),
            "stopped_at": metadata.get("stopped_at"),
            "webhook_url": metadata.get("webhook_url")
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

@app.function(
    image=image,
    volumes={"/data": volume}
)
def get_files(bot_id: str, user_id: str) -> Dict[str, Any]:
    """Get bot files for viewing or modification"""
    try:
        bot_dir = f"/data/bots/{user_id}/{bot_id}"
        
        files = {}
        if os.path.exists(f"{bot_dir}/main.py"):
            with open(f"{bot_dir}/main.py", "r") as f:
                files["main.py"] = f.read()
        
        return {
            "success": True,
            "files": files
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "files": {}
        }

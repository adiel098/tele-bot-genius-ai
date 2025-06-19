
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

    @web_app.post("/store-bot/{bot_id}")
    async def store_bot_endpoint(bot_id: str, request: Request):
        """Store bot code directly in the FastAPI service"""
        try:
            body = await request.json()
            
            user_id = body.get("user_id")
            bot_code = body.get("bot_code")
            bot_token = body.get("bot_token")
            bot_name = body.get("bot_name", f"Bot {bot_id}")
            
            if not all([user_id, bot_code, bot_token]):
                raise HTTPException(status_code=400, detail="Missing required fields")
            
            print(f"[MODAL] Storing bot {bot_id} for user {user_id}")
            
            # Create bot directory in Modal volume
            bot_dir = f"/data/bots/{user_id}/{bot_id}"
            os.makedirs(bot_dir, exist_ok=True)
            print(f"[MODAL] Created directory: {bot_dir}")
            
            # Write main bot code
            main_py_path = f"{bot_dir}/main.py"
            with open(main_py_path, "w") as f:
                f.write(bot_code)
            print(f"[MODAL] Wrote main.py: {len(bot_code)} characters")
            
            # Write bot metadata
            metadata = {
                "bot_id": bot_id,
                "user_id": user_id,
                "bot_name": bot_name,
                "created_at": datetime.now().isoformat(),
                "status": "stored",
                "bot_token": bot_token
            }
            
            metadata_path = f"{bot_dir}/metadata.json"
            with open(metadata_path, "w") as f:
                json.dump(metadata, f, indent=2)
            print(f"[MODAL] Wrote metadata.json")
            
            # CRITICAL: Commit changes to volume
            volume.commit()
            print(f"[MODAL] Volume committed successfully")
            
            # Verify files were written correctly
            verification_results = []
            
            # Check main.py
            if os.path.exists(main_py_path):
                with open(main_py_path, "r") as f:
                    stored_code = f.read()
                if stored_code == bot_code:
                    verification_results.append(f"✓ main.py verified ({len(stored_code)} chars)")
                else:
                    verification_results.append(f"✗ main.py content mismatch")
            else:
                verification_results.append(f"✗ main.py not found after write")
            
            # Check metadata.json
            if os.path.exists(metadata_path):
                with open(metadata_path, "r") as f:
                    stored_metadata = json.load(f)
                if stored_metadata.get("bot_id") == bot_id:
                    verification_results.append(f"✓ metadata.json verified")
                else:
                    verification_results.append(f"✗ metadata.json content invalid")
            else:
                verification_results.append(f"✗ metadata.json not found after write")
            
            print(f"[MODAL] Verification results: {verification_results}")
            
            return {
                "success": True,
                "bot_id": bot_id,
                "deployment_type": "modal",
                "status": "stored",
                "verification": verification_results,
                "logs": [
                    f"[MODAL] Bot {bot_id} stored successfully",
                    f"[MODAL] Files stored in Modal volume: {bot_dir}",
                    f"[MODAL] Volume committed and verified",
                    f"[MODAL] Ready for deployment"
                ] + verification_results
            }
            
        except Exception as e:
            print(f"[MODAL] Error storing bot {bot_id}: {str(e)}")
            import traceback
            traceback.print_exc()
            return {
                "success": False,
                "error": str(e),
                "logs": [f"[MODAL ERROR] Failed to store bot: {str(e)}"]
            }

    @web_app.get("/debug/volume/{bot_id}")
    async def debug_volume_endpoint(bot_id: str, user_id: str):
        """Debug endpoint to inspect volume contents"""
        try:
            bot_dir = f"/data/bots/{user_id}/{bot_id}"
            
            debug_info = {
                "bot_dir": bot_dir,
                "dir_exists": os.path.exists(bot_dir),
                "files": []
            }
            
            if os.path.exists(bot_dir):
                for item in os.listdir(bot_dir):
                    item_path = os.path.join(bot_dir, item)
                    file_info = {
                        "name": item,
                        "path": item_path,
                        "is_file": os.path.isfile(item_path),
                        "size": os.path.getsize(item_path) if os.path.isfile(item_path) else 0
                    }
                    
                    if item == "main.py" and os.path.isfile(item_path):
                        with open(item_path, "r") as f:
                            content = f.read()
                            file_info["content_preview"] = content[:200] + "..." if len(content) > 200 else content
                            file_info["content_length"] = len(content)
                    
                    debug_info["files"].append(file_info)
            
            return {
                "success": True,
                "debug_info": debug_info
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    @web_app.get("/debug/volume-info")
    async def debug_volume_info():
        """Debug endpoint to show volume mount status"""
        try:
            volume_info = {
                "volume_mount_exists": os.path.exists("/data"),
                "bots_dir_exists": os.path.exists("/data/bots"),
                "volume_contents": []
            }
            
            if os.path.exists("/data"):
                try:
                    volume_info["volume_contents"] = os.listdir("/data")
                except Exception as e:
                    volume_info["volume_list_error"] = str(e)
            
            if os.path.exists("/data/bots"):
                try:
                    bots_contents = []
                    for user_dir in os.listdir("/data/bots"):
                        user_path = f"/data/bots/{user_dir}"
                        if os.path.isdir(user_path):
                            user_bots = os.listdir(user_path)
                            bots_contents.append({
                                "user_id": user_dir,
                                "bots": user_bots
                            })
                    volume_info["bots_structure"] = bots_contents
                except Exception as e:
                    volume_info["bots_list_error"] = str(e)
            
            return {
                "success": True,
                "volume_info": volume_info
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    @web_app.post("/register-webhook/{bot_id}")
    async def register_webhook_endpoint(bot_id: str, request: Request):
        """Register webhook via REST API"""
        try:
            body = await request.json()
            user_id = body.get("user_id")
            webhook_url = body.get("webhook_url")
            
            if not all([user_id, webhook_url]):
                raise HTTPException(status_code=400, detail="Missing required fields")
            
            # Call the Modal function to register webhook
            webhook_result = await register_webhook(bot_id, user_id, webhook_url)
            
            return webhook_result
            
        except Exception as e:
            print(f"[MODAL API] Error registering webhook for bot {bot_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))

    @web_app.post("/unregister-webhook/{bot_id}")
    async def unregister_webhook_endpoint(bot_id: str, request: Request):
        """Unregister webhook via REST API"""
        try:
            body = await request.json()
            user_id = body.get("user_id")
            
            if not user_id:
                raise HTTPException(status_code=400, detail="Missing user_id")
            
            # Call the Modal function to unregister webhook
            webhook_result = await unregister_webhook(bot_id, user_id)
            
            return webhook_result
            
        except Exception as e:
            print(f"[MODAL API] Error unregistering webhook for bot {bot_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))

    @web_app.get("/files/{bot_id}")
    async def get_bot_files_endpoint(bot_id: str, user_id: str):
        """Get bot files via REST API"""
        try:
            bot_dir = f"/data/bots/{user_id}/{bot_id}"
            
            files = {}
            main_py_path = f"{bot_dir}/main.py"
            
            if os.path.exists(main_py_path):
                with open(main_py_path, "r") as f:
                    files["main.py"] = f.read()
                print(f"[MODAL] Retrieved main.py: {len(files['main.py'])} characters")
            else:
                print(f"[MODAL] main.py not found at {main_py_path}")
            
            return {
                "success": True,
                "files": files
            }
            
        except Exception as e:
            print(f"[MODAL API] Error getting files for bot {bot_id}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "files": {}
            }

    @web_app.get("/status/{bot_id}")
    async def get_bot_status_endpoint(bot_id: str, user_id: str):
        """Get bot status via REST API"""
        try:
            bot_dir = f"/data/bots/{user_id}/{bot_id}"
            metadata_path = f"{bot_dir}/metadata.json"
            
            if not os.path.exists(metadata_path):
                return {
                    "success": False,
                    "error": "Bot metadata not found"
                }
            
            with open(metadata_path, "r") as f:
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

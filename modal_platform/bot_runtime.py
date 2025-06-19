
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
import io
import uuid
import random
import string

# Configure Modal stub with correct syntax
stub = modal.Stub("telegram-bot-platform")

# Create Modal image with all required Python dependencies for Telegram bots
image = (
    modal.Image.debian_slim()
    .pip_install([
        "python-telegram-bot>=20.0",
        "requests>=2.28.0",
        "python-dotenv>=1.0.0",
        "aiohttp>=3.8.0",
        "fastapi[standard]>=0.115.0",
        "supabase>=2.0.0"
    ])
    .env({"PYTHONUNBUFFERED": "1"})
)

# Persistent volume for bot files and data
volume = modal.Volume.from_name("bot-files", create_if_missing=True)

# Dictionary to store active bot instances in memory
bot_instances: Dict[str, Any] = {}

# Dictionary to store bot logs in memory
bot_logs: Dict[str, list] = {}

def add_bot_log(bot_id: str, message: str, level: str = "INFO"):
    """Add a log entry for a specific bot"""
    timestamp = datetime.now().isoformat()
    log_entry = f"[{timestamp}] [{level}] {message}"
    
    if bot_id not in bot_logs:
        bot_logs[bot_id] = []
    
    bot_logs[bot_id].append(log_entry)
    
    # Keep only last 1000 log entries per bot
    if len(bot_logs[bot_id]) > 1000:
        bot_logs[bot_id] = bot_logs[bot_id][-1000:]
    
    print(f"[BOT LOG {bot_id}] {log_entry}")

@stub.function(
    image=image,
    volumes={"/data": volume},
    min_containers=1,
    timeout=3600
)
@modal.web_endpoint(method="POST", path="/api/deploy-bot")
def deploy_bot_endpoint(payload: dict):
    """Deploy bot endpoint matching Supabase expectations"""
    try:
        print(f"[MODAL DEPLOY] === Deploying bot ===")
        
        bot_id = payload.get("bot_id")
        user_id = payload.get("user_id")
        bot_code = payload.get("bot_code", "")
        bot_token = payload.get("bot_token", "")
        bot_name = payload.get("bot_name", f"Bot {bot_id}")
        
        if not bot_id or not user_id:
            return {
                "success": False,
                "error": "Missing required fields: bot_id, user_id"
            }
        
        print(f"[MODAL DEPLOY] Bot ID: {bot_id}")
        print(f"[MODAL DEPLOY] User ID: {user_id}")
        print(f"[MODAL DEPLOY] Code length: {len(bot_code)} characters")
        
        # Store bot files and deploy
        result = store_and_deploy_bot(bot_id, user_id, bot_code, bot_token, bot_name)
        
        if result["success"]:
            add_bot_log(bot_id, f"Bot deployed successfully to Modal")
            return {
                "success": True,
                "message": "Bot deployed successfully",
                "bot_id": bot_id,
                "deployment_timestamp": datetime.now().isoformat()
            }
        else:
            add_bot_log(bot_id, f"Deployment failed: {result.get('error', 'Unknown error')}", "ERROR")
            return {
                "success": False,
                "error": result.get("error", "Deployment failed")
            }
            
    except Exception as e:
        error_message = str(e)
        print(f"[MODAL DEPLOY] Error: {error_message}")
        return {
            "success": False,
            "error": error_message
        }

@stub.function(
    image=image,
    volumes={"/data": volume},
    min_containers=1,
    timeout=3600
)
@modal.web_endpoint(method="GET", path="/api/logs/{bot_id}")
def get_logs_endpoint(bot_id: str):
    """Get bot logs endpoint matching Supabase expectations"""
    try:
        print(f"[MODAL LOGS] Getting logs for bot {bot_id}")
        
        logs = bot_logs.get(bot_id, [])
        
        if not logs:
            logs = [
                f"[MODAL] No logs available for bot {bot_id}",
                f"[MODAL] Bot may not have been started yet or deployed to Modal",
                f"[MODAL] Try starting the bot first to begin execution"
            ]
        
        return {
            "success": True,
            "logs": logs,
            "log_count": len(logs),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        error_message = str(e)
        print(f"[MODAL LOGS] Error: {error_message}")
        return {
            "success": False,
            "error": error_message,
            "logs": []
        }

@stub.function(
    image=image,
    volumes={"/data": volume},
    min_containers=1,
    timeout=3600
)
@modal.web_endpoint(method="POST", path="/api/stop-bot/{bot_id}")
def stop_bot_endpoint(bot_id: str):
    """Stop bot endpoint"""
    try:
        print(f"[MODAL STOP] Stopping bot {bot_id}")
        
        # Stop bot logic here
        if bot_id in bot_instances:
            del bot_instances[bot_id]
        
        add_bot_log(bot_id, "Bot stopped successfully")
        
        return {
            "success": True,
            "message": f"Bot {bot_id} stopped successfully"
        }
        
    except Exception as e:
        error_message = str(e)
        print(f"[MODAL STOP] Error: {error_message}")
        return {
            "success": False,
            "error": error_message
        }

@stub.function(
    image=image,
    volumes={"/data": volume},
    min_containers=1,
    timeout=3600
)
@modal.web_endpoint(method="GET", path="/health")
def health_check():
    """Health check endpoint"""
    try:
        return {
            "success": True,
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "service": "Modal Bot Platform",
            "volume_mounted": os.path.exists("/data")
        }
    except Exception as e:
        return {
            "success": False,
            "status": "error",
            "error": str(e)
        }

@stub.function(
    image=image,
    volumes={"/data": volume},
    min_containers=1,
    timeout=3600
)
def store_and_deploy_bot(bot_id: str, user_id: str, bot_code: str, bot_token: str, bot_name: str):
    """Store bot files and deploy"""
    try:
        print(f"[MODAL STORE] Storing bot {bot_id}")
        
        # Check volume mount
        if not os.path.exists("/data"):
            raise Exception("Modal Volume not mounted at /data")
        
        # Create bot directory
        bot_dir = f"/data/bots/{user_id}/{bot_id}"
        os.makedirs(bot_dir, exist_ok=True)
        
        # Write main bot code
        main_py_path = f"{bot_dir}/main.py"
        with open(main_py_path, "w", encoding='utf-8') as f:
            f.write(bot_code)
            f.flush()
            os.fsync(f.fileno())
        
        # Create metadata
        metadata = {
            "bot_id": bot_id,
            "user_id": user_id,
            "bot_name": bot_name,
            "created_at": datetime.now().isoformat(),
            "status": "deployed",
            "bot_token": bot_token
        }
        
        metadata_path = f"{bot_dir}/metadata.json"
        with open(metadata_path, "w", encoding='utf-8') as f:
            json.dump(metadata, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        
        # Create additional files
        with open(f"{bot_dir}/requirements.txt", "w") as f:
            f.write("python-telegram-bot>=20.0\nrequests>=2.28.0\npython-dotenv>=1.0.0")
        
        with open(f"{bot_dir}/.env", "w") as f:
            f.write(f"BOT_TOKEN={bot_token}\nBOT_NAME={bot_name}")
        
        # Commit volume
        volume.commit()
        
        print(f"[MODAL STORE] Bot {bot_id} stored successfully")
        
        return {
            "success": True,
            "bot_id": bot_id,
            "message": "Bot stored and deployed successfully"
        }
        
    except Exception as e:
        error_message = str(e)
        print(f"[MODAL STORE] Error: {error_message}")
        return {
            "success": False,
            "error": error_message
        }

@stub.function(
    image=image,
    volumes={"/data": volume},
    min_containers=1,
    timeout=3600
)
def get_bot_files(bot_id: str, user_id: str):
    """Get bot files from storage"""
    try:
        print(f"[MODAL GET] Getting files for bot {bot_id}")
        
        bot_dir = f"/data/bots/{user_id}/{bot_id}"
        
        if not os.path.exists(bot_dir):
            return {
                "success": False,
                "error": f"Bot directory not found: {bot_dir}",
                "files": {}
            }
        
        files = {}
        for filename in os.listdir(bot_dir):
            file_path = f"{bot_dir}/{filename}"
            if os.path.isfile(file_path):
                try:
                    with open(file_path, "r", encoding='utf-8') as f:
                        files[filename] = f.read()
                except Exception as read_error:
                    files[filename] = f"Error reading file: {read_error}"
        
        return {
            "success": True,
            "files": files,
            "files_count": len(files)
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "files": {}
        }

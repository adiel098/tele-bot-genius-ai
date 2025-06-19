
import modal
import json
import os
import asyncio
import logging
from typing import Dict, Any, Optional
from datetime import datetime
import subprocess
import tempfile
import shutil

# Configure Modal app
app = modal.App("telegram-bot-platform")

# Create Modal image with all required Python dependencies for Telegram bots
image = (
    modal.Image.debian_slim()
    .pip_install([
        "python-telegram-bot>=20.0",
        "requests>=2.28.0",
        "python-dotenv>=1.0.0",
        "aiohttp>=3.8.0"
    ])
    .env({"PYTHONUNBUFFERED": "1"})
)

# Persistent volume for bot files and data
volume = modal.Volume.from_name("bot-files", create_if_missing=True)

# Shared secrets for Telegram tokens
secrets = [modal.Secret.from_name("telegram-bot-secrets")]

@app.function(
    image=image,
    secrets=secrets,
    volumes={"/data": volume},
    timeout=300,
    memory=512
)
def store_and_run_bot(bot_id: str, user_id: str, bot_code: str, bot_token: str, bot_name: str) -> Dict[str, Any]:
    """
    Store bot code in Modal volume and start the bot
    """
    try:
        print(f"[MODAL] Storing and running bot {bot_id} for user {user_id}")
        
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
            "status": "created"
        }
        
        with open(f"{bot_dir}/metadata.json", "w") as f:
            json.dump(metadata, f)
        
        # Create bot token environment file
        with open(f"{bot_dir}/.env", "w") as f:
            f.write(f"BOT_TOKEN={bot_token}\n")
        
        # Commit changes to volume
        volume.commit()
        
        print(f"[MODAL] Bot {bot_id} files stored successfully")
        
        # Start the bot immediately
        start_result = start_bot.remote(bot_id, user_id)
        
        return {
            "success": True,
            "bot_id": bot_id,
            "deployment_type": "modal",
            "status": "running" if start_result.get("success") else "created",
            "logs": [
                f"[MODAL] Bot {bot_id} stored successfully",
                f"[MODAL] Files stored in Modal volume: {bot_dir}",
                f"[MODAL] Bot deployment type: Modal Function"
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
    secrets=secrets,
    volumes={"/data": volume},
    timeout=3600,
    memory=256
)
def start_bot(bot_id: str, user_id: str) -> Dict[str, Any]:
    """
    Start a Telegram bot by executing the Python code
    """
    try:
        print(f"[MODAL] Starting bot {bot_id}")
        
        bot_dir = f"/data/bots/{user_id}/{bot_id}"
        
        # Load bot metadata
        with open(f"{bot_dir}/metadata.json", "r") as f:
            metadata = json.load(f)
        
        # Load bot token
        with open(f"{bot_dir}/.env", "r") as f:
            env_content = f.read()
            bot_token = env_content.split("=")[1].strip()
        
        # Set environment variable for the bot
        os.environ["BOT_TOKEN"] = bot_token
        
        # Execute bot code in a subprocess
        bot_process = subprocess.Popen(
            ["python", f"{bot_dir}/main.py"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=os.environ.copy()
        )
        
        # Update metadata
        metadata["status"] = "running"
        metadata["started_at"] = datetime.now().isoformat()
        metadata["process_id"] = bot_process.pid
        
        with open(f"{bot_dir}/metadata.json", "w") as f:
            json.dump(metadata, f)
        
        volume.commit()
        
        print(f"[MODAL] Bot {bot_id} started successfully with PID {bot_process.pid}")
        
        return {
            "success": True,
            "status": "running",
            "process_id": bot_process.pid,
            "logs": [
                f"[MODAL] Bot {bot_id} started successfully",
                f"[MODAL] Process ID: {bot_process.pid}",
                f"[MODAL] Runtime: Modal Function Process"
            ]
        }
        
    except Exception as e:
        print(f"[MODAL] Error starting bot {bot_id}: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "logs": [f"[MODAL ERROR] Failed to start bot: {str(e)}"]
        }

@app.function(
    image=image,
    secrets=secrets,
    volumes={"/data": volume},
    timeout=300
)
def stop_bot(bot_id: str, user_id: str) -> Dict[str, Any]:
    """
    Stop a Telegram bot process
    """
    try:
        print(f"[MODAL] Stopping bot {bot_id}")
        
        bot_dir = f"/data/bots/{user_id}/{bot_id}"
        
        # Load and update metadata
        with open(f"{bot_dir}/metadata.json", "r") as f:
            metadata = json.load(f)
        
        # Try to kill the process if it exists
        process_id = metadata.get("process_id")
        if process_id:
            try:
                os.kill(process_id, 9)  # SIGKILL
                print(f"[MODAL] Killed process {process_id}")
            except ProcessLookupError:
                print(f"[MODAL] Process {process_id} was already terminated")
        
        metadata["status"] = "stopped"
        metadata["stopped_at"] = datetime.now().isoformat()
        
        with open(f"{bot_dir}/metadata.json", "w") as f:
            json.dump(metadata, f)
        
        volume.commit()
        
        print(f"[MODAL] Bot {bot_id} stopped successfully")
        
        return {
            "success": True,
            "status": "stopped",
            "logs": [
                f"[MODAL] Bot {bot_id} stopped successfully",
                f"[MODAL] Process terminated"
            ]
        }
        
    except Exception as e:
        print(f"[MODAL] Error stopping bot {bot_id}: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "logs": [f"[MODAL ERROR] Failed to stop bot: {str(e)}"]
        }

@app.function(
    image=image,
    secrets=secrets,
    volumes={"/data": volume}
)
def get_logs(bot_id: str, user_id: str) -> Dict[str, Any]:
    """
    Get bot logs from the stored files
    """
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
            f"[{current_time}] Runtime: Modal Function"
        ]
        
        if metadata.get("status") == "running":
            logs.extend([
                f"[{current_time}] Bot is actively processing messages",
                f"[{current_time}] Process ID: {metadata.get('process_id', 'unknown')}"
            ])
        
        # Try to read log file if it exists
        log_file = f"{bot_dir}/bot.log"
        if os.path.exists(log_file):
            with open(log_file, "r") as f:
                file_logs = f.read().strip().split('\n')
                logs.extend(file_logs[-50:])  # Last 50 lines
        
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
    secrets=secrets,
    volumes={"/data": volume}
)
def get_status(bot_id: str, user_id: str) -> Dict[str, Any]:
    """
    Get bot status from metadata
    """
    try:
        bot_dir = f"/data/bots/{user_id}/{bot_id}"
        
        with open(f"{bot_dir}/metadata.json", "r") as f:
            metadata = json.load(f)
        
        return {
            "success": True,
            "status": metadata.get("status", "unknown"),
            "deployment_type": "modal",
            "runtime": "Modal Function",
            "created_at": metadata.get("created_at"),
            "started_at": metadata.get("started_at"),
            "stopped_at": metadata.get("stopped_at"),
            "process_id": metadata.get("process_id")
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

@app.function(
    image=image,
    secrets=secrets,
    volumes={"/data": volume}
)
def get_files(bot_id: str, user_id: str) -> Dict[str, Any]:
    """
    Get bot files for viewing or modification
    """
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

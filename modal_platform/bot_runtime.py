
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

def generate_random_string(length: int = 10) -> str:
    """Generate a random string for testing"""
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

@app.function(
    image=image,
    volumes={"/data": volume},
    min_containers=1,
    timeout=3600
)
def enhanced_store_bot_files(bot_id: str, user_id: str, bot_code: str, bot_token: str, bot_name: str):
    """Enhanced Modal function to store bot files with comprehensive debugging"""
    try:
        print(f"[MODAL STORE ENHANCED] === Starting Enhanced Modal storage for bot {bot_id} ===")
        print(f"[MODAL STORE ENHANCED] Volume path: /data")
        print(f"[MODAL STORE ENHANCED] Bot ID: {bot_id}")
        print(f"[MODAL STORE ENHANCED] User ID: {user_id}")
        print(f"[MODAL STORE ENHANCED] Code length: {len(bot_code)} characters")
        print(f"[MODAL STORE ENHANCED] Bot name: {bot_name}")
        
        add_bot_log(bot_id, f"Starting enhanced Modal Volume storage for bot {bot_id}")
        
        # Step 1: Check volume mount status
        if not os.path.exists("/data"):
            print(f"[MODAL STORE ENHANCED] ❌ Volume not mounted at /data")
            raise Exception("Modal Volume not mounted at /data")
        
        print(f"[MODAL STORE ENHANCED] ✓ Volume mounted at /data")
        
        # Step 2: Check volume permissions
        try:
            test_file = f"/data/test_{bot_id}.txt"
            with open(test_file, "w") as f:
                f.write("test")
            os.remove(test_file)
            print(f"[MODAL STORE ENHANCED] ✓ Volume write permissions OK")
        except Exception as perm_error:
            print(f"[MODAL STORE ENHANCED] ❌ Volume permission error: {perm_error}")
            raise Exception(f"Volume permission error: {perm_error}")
        
        # Step 3: Create comprehensive directory structure
        bot_dir = f"/data/bots/{user_id}/{bot_id}"
        logs_dir = f"{bot_dir}/logs"
        
        print(f"[MODAL STORE ENHANCED] Creating directory structure: {bot_dir}")
        os.makedirs(bot_dir, exist_ok=True)
        os.makedirs(logs_dir, exist_ok=True)
        
        # Verify directories were created
        if not os.path.exists(bot_dir):
            raise Exception(f"Failed to create bot directory: {bot_dir}")
        if not os.path.exists(logs_dir):
            raise Exception(f"Failed to create logs directory: {logs_dir}")
            
        print(f"[MODAL STORE ENHANCED] ✓ Directories created and verified")
        add_bot_log(bot_id, "Directory structure created and verified")
        
        # Step 4: Write main bot code with extensive validation
        main_py_path = f"{bot_dir}/main.py"
        print(f"[MODAL STORE ENHANCED] Writing main.py to: {main_py_path}")
        
        # Write with explicit encoding and sync
        with open(main_py_path, "w", encoding='utf-8') as f:
            f.write(bot_code)
            f.flush()
            os.fsync(f.fileno())  # Force write to disk
        
        print(f"[MODAL STORE ENHANCED] ✓ main.py written with fsync")
        
        # Verify file exists and content is correct
        if not os.path.exists(main_py_path):
            raise Exception(f"main.py not found after write: {main_py_path}")
        
        # Read back and verify content
        with open(main_py_path, "r", encoding='utf-8') as f:
            stored_content = f.read()
        
        if len(stored_content) != len(bot_code):
            raise Exception(f"Content length mismatch: expected {len(bot_code)}, got {len(stored_content)}")
        
        if stored_content != bot_code:
            raise Exception("File content verification failed - content differs")
        
        print(f"[MODAL STORE ENHANCED] ✓ main.py content verified ({len(stored_content)} chars)")
        add_bot_log(bot_id, f"main.py written and verified ({len(stored_content)} chars)")
        
        # Step 5: Create comprehensive metadata
        metadata = {
            "bot_id": bot_id,
            "user_id": user_id,
            "bot_name": bot_name,
            "created_at": datetime.now().isoformat(),
            "status": "stored",
            "bot_token": bot_token,
            "storage_method": "enhanced_modal_volume",
            "file_size": len(bot_code),
            "storage_version": "4.0_enhanced",
            "verification_passed": True,
            "volume_path": "/data",
            "bot_directory": bot_dir
        }
        
        metadata_path = f"{bot_dir}/metadata.json"
        print(f"[MODAL STORE ENHANCED] Writing metadata to: {metadata_path}")
        
        with open(metadata_path, "w", encoding='utf-8') as f:
            json.dump(metadata, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        
        # Verify metadata file
        if not os.path.exists(metadata_path):
            raise Exception(f"metadata.json not found after write: {metadata_path}")
        
        with open(metadata_path, "r", encoding='utf-8') as f:
            stored_metadata = json.load(f)
        
        if stored_metadata["bot_id"] != bot_id:
            raise Exception("Metadata verification failed")
        
        print(f"[MODAL STORE ENHANCED] ✓ Metadata written and verified")
        add_bot_log(bot_id, "Metadata written and verified")
        
        # Step 6: Create additional files
        files_to_create = {
            f"{bot_dir}/requirements.txt": "python-telegram-bot>=20.0\nrequests>=2.28.0\npython-dotenv>=1.0.0",
            f"{bot_dir}/.env": f"BOT_TOKEN={bot_token}\nBOT_NAME={bot_name}",
            f"{logs_dir}/bot.log": f"[{datetime.now().isoformat()}] [INFO] Bot {bot_id} stored successfully\n"
        }
        
        for file_path, content in files_to_create.items():
            print(f"[MODAL STORE ENHANCED] Creating file: {os.path.basename(file_path)}")
            with open(file_path, "w", encoding='utf-8') as f:
                f.write(content)
                f.flush()
                os.fsync(f.fileno())
            
            # Verify each file
            if not os.path.exists(file_path):
                print(f"[MODAL STORE ENHANCED] ⚠️  File not found after creation: {file_path}")
            else:
                file_size = os.path.getsize(file_path)
                print(f"[MODAL STORE ENHANCED] ✓ {os.path.basename(file_path)} created ({file_size} bytes)")
        
        # Step 7: CRITICAL - Explicit volume commit with error handling
        print(f"[MODAL STORE ENHANCED] === Performing volume commit ===")
        try:
            volume.commit()
            print(f"[MODAL STORE ENHANCED] ✓ Volume commit completed")
        except Exception as commit_error:
            print(f"[MODAL STORE ENHANCED] ❌ Volume commit failed: {commit_error}")
            raise Exception(f"Volume commit failed: {commit_error}")
        
        add_bot_log(bot_id, "Volume committed successfully")
        
        # Step 8: Post-commit comprehensive verification
        print(f"[MODAL STORE ENHANCED] === Post-commit verification ===")
        verification_results = []
        
        # Check all files exist
        files_to_check = [main_py_path, metadata_path] + list(files_to_create.keys())
        
        for file_path in files_to_check:
            if os.path.exists(file_path):
                file_size = os.path.getsize(file_path)
                verification_results.append(f"✓ {os.path.basename(file_path)}: {file_size} bytes")
                print(f"[MODAL STORE ENHANCED] ✓ File verified: {os.path.basename(file_path)} ({file_size} bytes)")
            else:
                verification_results.append(f"❌ {os.path.basename(file_path)}: NOT FOUND")
                print(f"[MODAL STORE ENHANCED] ❌ File missing: {file_path}")
        
        # Directory listing for debugging
        try:
            dir_contents = os.listdir(bot_dir)
            print(f"[MODAL STORE ENHANCED] Directory contents: {dir_contents}")
            verification_results.append(f"Directory contents: {', '.join(dir_contents)}")
        except Exception as list_error:
            print(f"[MODAL STORE ENHANCED] ❌ Cannot list directory: {list_error}")
            verification_results.append(f"❌ Directory listing failed: {list_error}")
        
        # Step 9: Final success report
        success_summary = {
            "success": True,
            "bot_id": bot_id,
            "storage_method": "enhanced_modal_volume",
            "storage_version": "4.0_enhanced",
            "files_created": len(files_to_create) + 2,  # +2 for main.py and metadata.json
            "verification_results": verification_results,
            "volume_path": "/data",
            "bot_directory": bot_dir,
            "timestamp": datetime.now().isoformat(),
            "logs": [
                f"[ENHANCED] Bot {bot_id} stored with comprehensive verification",
                f"[ENHANCED] Files created: {len(files_to_create) + 2}",
                f"[ENHANCED] Volume committed successfully",
                f"[ENHANCED] All files verified post-commit",
                f"[ENHANCED] Enhanced Modal Volume storage complete"
            ]
        }
        
        print(f"[MODAL STORE ENHANCED] === Storage completed successfully ===")
        print(f"[MODAL STORE ENHANCED] Summary: {len(verification_results)} files verified")
        
        return success_summary
        
    except Exception as e:
        error_message = str(e)
        print(f"[MODAL STORE ENHANCED] ❌ CRITICAL ERROR: {error_message}")
        
        # Detailed error logging
        import traceback
        error_traceback = traceback.format_exc()
        print(f"[MODAL STORE ENHANCED] Error traceback:\n{error_traceback}")
        
        add_bot_log(bot_id, f"Storage error: {error_message}", "ERROR")
        
        return {
            "success": False,
            "error": error_message,
            "error_type": "modal_storage_error",
            "storage_method": "enhanced_modal_volume",
            "storage_version": "4.0_enhanced",
            "traceback": error_traceback,
            "logs": [f"[ENHANCED ERROR] {error_message}"]
        }

@app.function(
    image=image,
    volumes={"/data": volume},
    min_containers=1,
    timeout=3600
)
def enhanced_get_bot_files(bot_id: str, user_id: str):
    """Enhanced Modal function to retrieve bot files with comprehensive debugging"""
    try:
        print(f"[MODAL GET ENHANCED] === Starting Enhanced file retrieval for bot {bot_id} ===")
        print(f"[MODAL GET ENHANCED] User ID: {user_id}")
        
        # Check volume mount
        if not os.path.exists("/data"):
            raise Exception("Modal Volume not mounted at /data")
        
        # Construct bot directory path
        bot_dir = f"/data/bots/{user_id}/{bot_id}"
        print(f"[MODAL GET ENHANCED] Bot directory: {bot_dir}")
        
        # Check if bot directory exists
        if not os.path.exists(bot_dir):
            print(f"[MODAL GET ENHANCED] ❌ Bot directory not found: {bot_dir}")
            
            # List what's in the bots directory for debugging
            bots_dir = f"/data/bots"
            if os.path.exists(bots_dir):
                print(f"[MODAL GET ENHANCED] Available in /data/bots/:")
                for item in os.listdir(bots_dir):
                    print(f"[MODAL GET ENHANCED]   - {item}")
                    user_dir = f"{bots_dir}/{item}"
                    if os.path.isdir(user_dir):
                        print(f"[MODAL GET ENHANCED]     User {item} bots:")
                        for bot in os.listdir(user_dir):
                            print(f"[MODAL GET ENHANCED]       - {bot}")
            
            return {
                "success": False,
                "error": f"Bot directory not found: {bot_dir}",
                "files": {},
                "debug_info": f"Directory {bot_dir} does not exist"
            }
        
        print(f"[MODAL GET ENHANCED] ✓ Bot directory found")
        
        # List all files in bot directory
        try:
            all_files = os.listdir(bot_dir)
            print(f"[MODAL GET ENHANCED] Files in directory: {all_files}")
        except Exception as list_error:
            print(f"[MODAL GET ENHANCED] ❌ Cannot list directory: {list_error}")
            return {
                "success": False,
                "error": f"Cannot list directory: {list_error}",
                "files": {}
            }
        
        # Read all files
        files = {}
        files_read = 0
        
        for filename in all_files:
            file_path = f"{bot_dir}/{filename}"
            
            # Skip directories
            if os.path.isdir(file_path):
                print(f"[MODAL GET ENHANCED] Skipping directory: {filename}")
                continue
            
            try:
                print(f"[MODAL GET ENHANCED] Reading file: {filename}")
                with open(file_path, "r", encoding='utf-8') as f:
                    content = f.read()
                files[filename] = content
                files_read += 1
                print(f"[MODAL GET ENHANCED] ✓ {filename}: {len(content)} characters")
            except Exception as read_error:
                print(f"[MODAL GET ENHANCED] ❌ Error reading {filename}: {read_error}")
                files[filename] = f"Error reading file: {read_error}"
        
        print(f"[MODAL GET ENHANCED] === File retrieval completed ===")
        print(f"[MODAL GET ENHANCED] Files read: {files_read}")
        print(f"[MODAL GET ENHANCED] Files available: {list(files.keys())}")
        
        return {
            "success": True,
            "files": files,
            "files_count": files_read,
            "directory": bot_dir,
            "debug_info": f"Retrieved {files_read} files from {bot_dir}",
            "storage_method": "enhanced_modal_volume"
        }
        
    except Exception as e:
        error_message = str(e)
        print(f"[MODAL GET ENHANCED] ❌ CRITICAL ERROR: {error_message}")
        
        import traceback
        error_traceback = traceback.format_exc()
        print(f"[MODAL GET ENHANCED] Error traceback:\n{error_traceback}")
        
        return {
            "success": False,
            "error": error_message,
            "files": {},
            "traceback": error_traceback,
            "storage_method": "enhanced_modal_volume"
        }

@app.function(
    image=image,
    volumes={"/data": volume},
    min_containers=1,
    timeout=3600
)
@modal.asgi_app()
def enhanced_telegram_bot_service():
    """Enhanced FastAPI service with comprehensive Modal Volume operations"""
    web_app = FastAPI(title="Enhanced Telegram Bot Platform")
    
    # Allow CORS for webhook requests
    web_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @web_app.post("/store-bot/{bot_id}")
    async def enhanced_store_bot_endpoint(bot_id: str, request: Request):
        """Enhanced store bot endpoint with comprehensive error handling"""
        try:
            print(f"[MODAL API ENHANCED] === Enhanced storage request for bot {bot_id} ===")
            
            # Parse request body with enhanced error handling
            try:
                body = await request.json()
                print(f"[MODAL API ENHANCED] Request body parsed successfully")
            except Exception as parse_error:
                print(f"[MODAL API ENHANCED] ❌ JSON parse error: {parse_error}")
                return {
                    "success": False,
                    "error": f"Invalid JSON: {parse_error}",
                    "error_type": "json_parse_error"
                }
            
            # Validate required fields
            required_fields = ["user_id", "bot_code", "bot_token"]
            missing_fields = [field for field in required_fields if not body.get(field)]
            
            if missing_fields:
                return {
                    "success": False,
                    "error": f"Missing required fields: {', '.join(missing_fields)}",
                    "error_type": "missing_fields"
                }
            
            user_id = body.get("user_id")
            bot_code = body.get("bot_code")
            bot_token = body.get("bot_token")
            bot_name = body.get("bot_name", f"Bot {bot_id}")
            
            print(f"[MODAL API ENHANCED] Validated request for bot {bot_id}")
            print(f"[MODAL API ENHANCED] Code length: {len(bot_code)} characters")
            
            # Call enhanced storage function
            result = enhanced_store_bot_files.remote(bot_id, user_id, bot_code, bot_token, bot_name)
            
            print(f"[MODAL API ENHANCED] Storage function completed")
            print(f"[MODAL API ENHANCED] Result success: {result.get('success', False)}")
            
            return result
            
        except Exception as e:
            error_message = str(e)
            print(f"[MODAL API ENHANCED] ❌ Endpoint error: {error_message}")
            
            import traceback
            error_traceback = traceback.format_exc()
            print(f"[MODAL API ENHANCED] Error traceback:\n{error_traceback}")
            
            return {
                "success": False,
                "error": error_message,
                "error_type": "endpoint_error",
                "traceback": error_traceback
            }

    @web_app.get("/files/{bot_id}")
    async def enhanced_get_files_endpoint(bot_id: str, user_id: str):
        """Enhanced get files endpoint"""
        try:
            print(f"[MODAL API ENHANCED] === Enhanced file retrieval for bot {bot_id} ===")
            print(f"[MODAL API ENHANCED] User ID: {user_id}")
            
            result = enhanced_get_bot_files.remote(bot_id, user_id)
            
            print(f"[MODAL API ENHANCED] File retrieval completed")
            print(f"[MODAL API ENHANCED] Success: {result.get('success', False)}")
            print(f"[MODAL API ENHANCED] Files count: {len(result.get('files', {}))}")
            
            return result
            
        except Exception as e:
            error_message = str(e)
            print(f"[MODAL API ENHANCED] ❌ File retrieval error: {error_message}")
            
            return {
                "success": False,
                "error": error_message,
                "files": {},
                "error_type": "file_retrieval_error"
            }

    @web_app.get("/logs/{bot_id}")
    async def get_bot_logs_endpoint(bot_id: str):
        """Get bot logs endpoint"""
        try:
            logs = bot_logs.get(bot_id, [])
            
            return {
                "success": True,
                "logs": logs,
                "log_count": len(logs),
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "logs": []
            }

    @web_app.get("/health-check/{bot_id}")
    async def health_check_endpoint(bot_id: str, user_id: str):
        """Enhanced health check endpoint"""
        try:
            print(f"[MODAL HEALTH] Health check for bot {bot_id}")
            
            # Check if volume is mounted
            volume_status = "mounted" if os.path.exists("/data") else "not_mounted"
            
            # Check if bot directory exists
            bot_dir = f"/data/bots/{user_id}/{bot_id}"
            bot_exists = os.path.exists(bot_dir)
            
            # Count total bots
            total_bots = 0
            if os.path.exists("/data/bots"):
                for user_dir in os.listdir("/data/bots"):
                    user_path = f"/data/bots/{user_dir}"
                    if os.path.isdir(user_path):
                        total_bots += len([d for d in os.listdir(user_path) if os.path.isdir(f"{user_path}/{d}")])
            
            health_info = {
                "volume_status": volume_status,
                "bot_exists": bot_exists,
                "bot_directory": bot_dir,
                "total_bots": total_bots,
                "timestamp": datetime.now().isoformat()
            }
            
            return {
                "success": True,
                "health_info": health_info,
                "check_type": "enhanced_health_check"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "check_type": "enhanced_health_check"
            }

    @web_app.get("/")
    async def root():
        """Enhanced root endpoint"""
        return {
            "service": "Enhanced Telegram Bot Platform",
            "status": "running",
            "version": "4.0_enhanced",
            "storage_info": "Enhanced Modal Volume with comprehensive debugging",
            "features": [
                "Enhanced file storage with fsync",
                "Comprehensive error handling",
                "Detailed debugging and logging",
                "Post-commit verification",
                "Volume mount validation"
            ],
            "loaded_bots": list(bot_instances.keys()),
            "timestamp": datetime.now().isoformat()
        }

    return web_app

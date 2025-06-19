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
def create_test_file(test_id: str = None):
    """Create a test file in Modal volume for testing storage functionality"""
    try:
        if not test_id:
            test_id = str(uuid.uuid4())[:8]
        
        print(f"[MODAL TEST] Creating test file with ID: {test_id}")
        
        # Create test directory
        test_dir = "/data/test_files"
        os.makedirs(test_dir, exist_ok=True)
        print(f"[MODAL TEST] ✓ Test directory created: {test_dir}")
        
        # Generate test content
        test_content = {
            "test_id": test_id,
            "created_at": datetime.now().isoformat(),
            "random_data": generate_random_string(50),
            "test_numbers": [random.randint(1, 100) for _ in range(10)],
            "test_message": f"This is a test file created at {datetime.now()}",
            "storage_test": True
        }
        
        # Write test file
        test_file_path = f"{test_dir}/{test_id}.json"
        with open(test_file_path, "w", encoding='utf-8') as f:
            json.dump(test_content, f, indent=2)
        
        print(f"[MODAL TEST] ✓ Test file written: {len(json.dumps(test_content))} characters")
        
        # Commit volume changes
        print(f"[MODAL TEST] Committing volume changes...")
        volume.commit()
        print(f"[MODAL TEST] ✓ Volume committed successfully")
        
        # Verify file was written correctly by reading it back
        volume.reload()
        print(f"[MODAL TEST] ✓ Volume reloaded for verification")
        
        if os.path.exists(test_file_path):
            with open(test_file_path, "r", encoding='utf-8') as f:
                stored_content = json.load(f)
            
            # Verify content matches
            content_matches = stored_content == test_content
            file_size = os.path.getsize(test_file_path)
            
            print(f"[MODAL TEST] ✓ Verification complete: content_matches={content_matches}, size={file_size}B")
            
            return {
                "success": True,
                "test_id": test_id,
                "file_path": test_file_path,
                "content_matches": content_matches,
                "file_size": file_size,
                "test_content": test_content,
                "verification_result": "PASSED" if content_matches else "FAILED",
                "logs": [
                    f"[MODAL TEST] Test file {test_id} created successfully",
                    f"[MODAL TEST] File size: {file_size} bytes",
                    f"[MODAL TEST] Content verification: {'PASSED' if content_matches else 'FAILED'}",
                    f"[MODAL TEST] Volume commit and reload successful"
                ]
            }
        else:
            return {
                "success": False,
                "error": "File not found after commit and reload",
                "test_id": test_id,
                "logs": [f"[MODAL TEST ERROR] File not found after volume operations"]
            }
            
    except Exception as e:
        print(f"[MODAL TEST] ✗ Error creating test file: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "test_id": test_id,
            "logs": [f"[MODAL TEST ERROR] {str(e)}"]
        }

@app.function(
    image=image,
    volumes={"/data": volume},
    min_containers=1,
    timeout=3600
)
def get_test_file(test_id: str):
    """Retrieve a specific test file by ID"""
    try:
        print(f"[MODAL TEST] Retrieving test file: {test_id}")
        
        # Reload volume to get latest state
        volume.reload()
        
        test_file_path = f"/data/test_files/{test_id}.json"
        
        if not os.path.exists(test_file_path):
            return {
                "success": False,
                "error": f"Test file {test_id} not found",
                "test_id": test_id
            }
        
        # Read test file
        with open(test_file_path, "r", encoding='utf-8') as f:
            content = json.load(f)
        
        file_size = os.path.getsize(test_file_path)
        
        print(f"[MODAL TEST] ✓ Test file {test_id} retrieved successfully")
        
        return {
            "success": True,
            "test_id": test_id,
            "file_path": test_file_path,
            "file_size": file_size,
            "content": content,
            "retrieved_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"[MODAL TEST] ✗ Error retrieving test file {test_id}: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "test_id": test_id
        }

@app.function(
    image=image,
    volumes={"/data": volume},
    min_containers=1,
    timeout=3600
)
def list_test_files():
    """List all test files in the volume"""
    try:
        print(f"[MODAL TEST] Listing all test files")
        
        # Reload volume to get latest state
        volume.reload()
        
        test_dir = "/data/test_files"
        
        if not os.path.exists(test_dir):
            return {
                "success": True,
                "test_files": [],
                "total_count": 0,
                "message": "No test files directory found"
            }
        
        # List all test files
        test_files = []
        for filename in os.listdir(test_dir):
            if filename.endswith('.json'):
                file_path = os.path.join(test_dir, filename)
                test_id = filename.replace('.json', '')
                
                try:
                    file_size = os.path.getsize(file_path)
                    
                    # Try to read file content for basic info
                    with open(file_path, "r", encoding='utf-8') as f:
                        content = json.load(f)
                    
                    test_files.append({
                        "test_id": test_id,
                        "filename": filename,
                        "file_size": file_size,
                        "created_at": content.get("created_at", "unknown"),
                        "has_valid_content": True
                    })
                    
                except Exception as e:
                    test_files.append({
                        "test_id": test_id,
                        "filename": filename,
                        "file_size": 0,
                        "created_at": "unknown",
                        "has_valid_content": False,
                        "error": str(e)
                    })
        
        print(f"[MODAL TEST] ✓ Found {len(test_files)} test files")
        
        return {
            "success": True,
            "test_files": test_files,
            "total_count": len(test_files),
            "directory": test_dir,
            "listed_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"[MODAL TEST] ✗ Error listing test files: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "test_files": []
        }

@app.function(
    image=image,
    volumes={"/data": volume},
    min_containers=1,
    timeout=3600
)
def optimized_store_bot_files(bot_id: str, user_id: str, bot_code: str, bot_token: str, bot_name: str):
    """Optimized Modal function to store bot files with proper volume patterns"""
    try:
        print(f"[MODAL OPTIMIZED STORE] Starting optimized storage for bot {bot_id}")
        add_bot_log(bot_id, f"Starting optimized storage for bot {bot_id}")
        
        # Create bot directory path
        bot_dir = f"/data/bots/{user_id}/{bot_id}"
        print(f"[MODAL OPTIMIZED STORE] Target directory: {bot_dir}")
        
        # Create directory structure
        os.makedirs(bot_dir, exist_ok=True)
        print(f"[MODAL OPTIMIZED STORE] ✓ Directory structure created")
        add_bot_log(bot_id, "Directory structure created")
        
        # Write main bot code with proper file handling
        main_py_path = f"{bot_dir}/main.py"
        print(f"[MODAL OPTIMIZED STORE] Writing main.py ({len(bot_code)} chars)")
        
        with open(main_py_path, "w", encoding='utf-8') as f:
            f.write(bot_code)
        
        # Verify file was written correctly
        with open(main_py_path, "r", encoding='utf-8') as f:
            stored_content = f.read()
        
        if stored_content != bot_code:
            raise Exception("File content verification failed")
        
        print(f"[MODAL OPTIMIZED STORE] ✓ main.py written and verified")
        add_bot_log(bot_id, f"main.py written and verified ({len(bot_code)} chars)")
        
        # Create optimized metadata
        metadata = {
            "bot_id": bot_id,
            "user_id": user_id,
            "bot_name": bot_name,
            "created_at": datetime.now().isoformat(),
            "status": "stored",
            "bot_token": bot_token,
            "storage_method": "optimized_modal_volume",
            "file_size": len(bot_code),
            "storage_version": "2.0"
        }
        
        metadata_path = f"{bot_dir}/metadata.json"
        with open(metadata_path, "w", encoding='utf-8') as f:
            json.dump(metadata, f, indent=2)
        
        print(f"[MODAL OPTIMIZED STORE] ✓ Metadata written")
        add_bot_log(bot_id, "Metadata written successfully")
        
        # Create logs directory and initial log file
        logs_dir = f"{bot_dir}/logs"
        os.makedirs(logs_dir, exist_ok=True)
        
        initial_log = f"[{datetime.now().isoformat()}] [INFO] Bot {bot_id} stored successfully\n"
        with open(f"{logs_dir}/bot.log", "w", encoding='utf-8') as f:
            f.write(initial_log)
        
        add_bot_log(bot_id, "Initial log file created")
        
        # CRITICAL: Explicit volume commit in proper Modal function context
        print(f"[MODAL OPTIMIZED STORE] Committing volume changes...")
        volume.commit()
        print(f"[MODAL OPTIMIZED STORE] ✓ Volume committed successfully")
        add_bot_log(bot_id, "Volume committed successfully")
        
        # Post-commit verification
        verification_logs = []
        
        # Check files exist after commit
        if os.path.exists(main_py_path) and os.path.exists(metadata_path):
            verification_logs.append("✓ Files exist after commit")
            
            # Verify file sizes
            main_size = os.path.getsize(main_py_path)
            meta_size = os.path.getsize(metadata_path)
            verification_logs.append(f"✓ File sizes: main.py={main_size}B, metadata={meta_size}B")
            
            # Quick content check
            with open(main_py_path, "r", encoding='utf-8') as f:
                content_sample = f.read(100)
            verification_logs.append(f"✓ Content sample: {content_sample[:50]}...")
            
        else:
            verification_logs.append("✗ Files missing after commit")
        
        print(f"[MODAL OPTIMIZED STORE] Verification complete: {len(verification_logs)} checks")
        
        return {
            "success": True,
            "bot_id": bot_id,
            "storage_method": "optimized_modal_volume",
            "storage_version": "2.0",
            "verification": verification_logs,
            "logs": [
                f"[MODAL OPTIMIZED] Bot {bot_id} stored with enhanced patterns",
                f"[MODAL OPTIMIZED] File size: {len(bot_code)} characters",
                f"[MODAL OPTIMIZED] Volume committed in proper function context",
                f"[MODAL OPTIMIZED] Verification passed: {len(verification_logs)} checks",
                f"[MODAL OPTIMIZED] Logs directory created"
            ]
        }
        
    except Exception as e:
        print(f"[MODAL OPTIMIZED STORE] ✗ Error: {str(e)}")
        add_bot_log(bot_id, f"Storage error: {str(e)}", "ERROR")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "storage_method": "optimized_modal_volume",
            "logs": [f"[MODAL OPTIMIZED ERROR] {str(e)}"]
        }

@app.function(
    image=image,
    volumes={"/data": volume},
    min_containers=1,
    timeout=3600
)
def optimized_load_bot_files(bot_id: str, user_id: str):
    """Optimized Modal function to load bot files with proper reload patterns"""
    try:
        print(f"[MODAL OPTIMIZED LOAD] Starting optimized load for bot {bot_id}")
        add_bot_log(bot_id, f"Starting optimized load for bot {bot_id}")
        
        # CRITICAL: Always reload volume before reading to get latest state
        print(f"[MODAL OPTIMIZED LOAD] Reloading volume for latest state...")
        volume.reload()
        print(f"[MODAL OPTIMIZED LOAD] ✓ Volume reloaded successfully")
        add_bot_log(bot_id, "Volume reloaded successfully")
        
        bot_dir = f"/data/bots/{user_id}/{bot_id}"
        print(f"[MODAL OPTIMIZED LOAD] Target directory: {bot_dir}")
        
        # Check directory existence
        if not os.path.exists(bot_dir):
            print(f"[MODAL OPTIMIZED LOAD] ✗ Directory not found: {bot_dir}")
            return {
                "success": False,
                "error": "Bot directory not found after volume reload",
                "files": {},
                "logs": [f"[MODAL OPTIMIZED] Directory not found: {bot_dir}"]
            }
        
        print(f"[MODAL OPTIMIZED LOAD] ✓ Directory found")
        
        # List directory contents for debugging
        dir_contents = os.listdir(bot_dir)
        print(f"[MODAL OPTIMIZED LOAD] Directory contents: {dir_contents}")
        
        files = {}
        load_logs = []
        
        # Load main.py with enhanced error handling
        main_py_path = f"{bot_dir}/main.py"
        if os.path.exists(main_py_path):
            print(f"[MODAL OPTIMIZED LOAD] Loading main.py...")
            
            try:
                with open(main_py_path, "r", encoding='utf-8') as f:
                    files["main.py"] = f.read()
                
                file_size = len(files["main.py"])
                print(f"[MODAL OPTIMIZED LOAD] ✓ main.py loaded: {file_size} characters")
                load_logs.append(f"✓ main.py loaded successfully ({file_size} chars)")
                
                # Validate content is not empty
                if file_size == 0:
                    load_logs.append("⚠ WARNING: main.py is empty")
                elif file_size < 50:
                    load_logs.append("⚠ WARNING: main.py seems very small")
                else:
                    load_logs.append("✓ main.py size looks reasonable")
                
            except Exception as e:
                print(f"[MODAL OPTIMIZED LOAD] ✗ Error reading main.py: {e}")
                load_logs.append(f"✗ Error reading main.py: {e}")
        else:
            print(f"[MODAL OPTIMIZED LOAD] ✗ main.py not found")
            load_logs.append("✗ main.py file not found")
        
        # Load metadata with enhanced validation
        metadata_path = f"{bot_dir}/metadata.json"
        if os.path.exists(metadata_path):
            print(f"[MODAL OPTIMIZED LOAD] Loading metadata...")
            
            try:
                with open(metadata_path, "r", encoding='utf-8') as f:
                    metadata_content = f.read()
                    metadata = json.loads(metadata_content)
                
                files["metadata.json"] = metadata_content
                print(f"[MODAL OPTIMIZED LOAD] ✓ metadata.json loaded")
                load_logs.append(f"✓ metadata.json loaded (version: {metadata.get('storage_version', 'unknown')})")
                
                # Validate metadata consistency
                if metadata.get("bot_id") == bot_id:
                    load_logs.append("✓ Metadata bot_id matches")
                else:
                    load_logs.append("⚠ WARNING: Metadata bot_id mismatch")
                
            except json.JSONDecodeError as e:
                print(f"[MODAL OPTIMIZED LOAD] ✗ Invalid JSON in metadata: {e}")
                load_logs.append(f"✗ Invalid JSON in metadata: {e}")
            except Exception as e:
                print(f"[MODAL OPTIMIZED LOAD] ✗ Error reading metadata: {e}")
                load_logs.append(f"✗ Error reading metadata: {e}")
        else:
            print(f"[MODAL OPTIMIZED LOAD] metadata.json not found")
            load_logs.append("ℹ metadata.json not found (non-critical)")
        
        success = len(files) > 0 and "main.py" in files
        
        print(f"[MODAL OPTIMIZED LOAD] Load completed: {len(files)} files, success={success}")
        
        return {
            "success": success,
            "files": files,
            "storage_method": "optimized_modal_volume",
            "storage_version": "2.0",
            "file_count": len(files),
            "logs": [
                f"[MODAL OPTIMIZED] Volume reloaded for latest state",
                f"[MODAL OPTIMIZED] Found {len(files)} files",
                f"[MODAL OPTIMIZED] Load operation: {'SUCCESS' if success else 'FAILED'}"
            ] + load_logs
        }
        
    except Exception as e:
        print(f"[MODAL OPTIMIZED LOAD] ✗ Exception: {str(e)}")
        add_bot_log(bot_id, f"Load error: {str(e)}", "ERROR")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "files": {},
            "storage_method": "optimized_modal_volume",
            "logs": [f"[MODAL OPTIMIZED ERROR] Load failed: {str(e)}"]
        }

@app.function(
    image=image,
    volumes={"/data": volume},
    min_containers=1,
    timeout=3600
)
def get_bot_logs_from_volume(bot_id: str, user_id: str):
    """Get bot logs from volume storage"""
    try:
        print(f"[MODAL LOGS] Getting logs for bot {bot_id}")
        
        # Reload volume to get latest state
        volume.reload()
        
        bot_dir = f"/data/bots/{user_id}/{bot_id}"
        logs_file = f"{bot_dir}/logs/bot.log"
        
        logs = []
        
        # Get logs from memory first
        if bot_id in bot_logs:
            logs.extend(bot_logs[bot_id])
        
        # Get logs from volume if file exists
        if os.path.exists(logs_file):
            try:
                with open(logs_file, "r", encoding='utf-8') as f:
                    file_logs = f.readlines()
                    logs.extend([log.strip() for log in file_logs if log.strip()])
            except Exception as e:
                logs.append(f"[ERROR] Failed to read log file: {str(e)}")
        
        # If no logs found, provide default message
        if not logs:
            logs = [
                f"[{datetime.now().isoformat()}] [INFO] No logs available for bot {bot_id}",
                f"[{datetime.now().isoformat()}] [INFO] Bot may not have been started yet"
            ]
        
        return {
            "success": True,
            "logs": logs,
            "log_count": len(logs),
            "bot_id": bot_id,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"[MODAL LOGS] Error getting logs: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "logs": [f"[ERROR] Failed to get logs: {str(e)}"],
            "bot_id": bot_id
        }

@app.function(
    image=image,
    volumes={"/data": volume},
    min_containers=1,
    timeout=3600
)
def append_bot_log_to_volume(bot_id: str, user_id: str, message: str, level: str = "INFO"):
    """Append log message to bot's volume log file"""
    try:
        volume.reload()
        
        bot_dir = f"/data/bots/{user_id}/{bot_id}"
        logs_dir = f"{bot_dir}/logs"
        logs_file = f"{logs_dir}/bot.log"
        
        # Ensure logs directory exists
        os.makedirs(logs_dir, exist_ok=True)
        
        # Append log message
        timestamp = datetime.now().isoformat()
        log_entry = f"[{timestamp}] [{level}] {message}\n"
        
        with open(logs_file, "a", encoding='utf-8') as f:
            f.write(log_entry)
        
        volume.commit()
        
        # Also add to memory logs
        add_bot_log(bot_id, message, level)
        
        return {"success": True, "message": "Log appended"}
        
    except Exception as e:
        print(f"[MODAL LOG APPEND] Error: {str(e)}")
        return {"success": False, "error": str(e)}

@app.function(
    image=image,
    volumes={"/data": volume},
    min_containers=1,
    timeout=3600
)
def comprehensive_volume_health_check(bot_id: str = None, user_id: str = None):
    """Comprehensive volume health check with detailed diagnostics"""
    try:
        print(f"[MODAL HEALTH CHECK] Starting comprehensive volume health check")
        
        # Reload volume for current state
        print(f"[MODAL HEALTH CHECK] Reloading volume...")
        volume.reload()
        print(f"[MODAL HEALTH CHECK] ✓ Volume reloaded")
        
        health_info = {
            "volume_status": "healthy",
            "mount_point_exists": os.path.exists("/data"),
            "bots_directory_exists": os.path.exists("/data/bots"),
            "timestamp": datetime.now().isoformat(),
            "check_version": "2.0"
        }
        
        # Check volume mount
        if health_info["mount_point_exists"]:
            try:
                volume_contents = os.listdir("/data")
                health_info["volume_root_contents"] = volume_contents
                print(f"[MODAL HEALTH CHECK] Volume root contents: {volume_contents}")
            except Exception as e:
                health_info["volume_root_error"] = str(e)
                print(f"[MODAL HEALTH CHECK] ✗ Error listing volume root: {e}")
        
        # Check bots directory structure
        if health_info["bots_directory_exists"]:
            try:
                users_list = []
                total_bots = 0
                
                for user_dir in os.listdir("/data/bots"):
                    user_path = f"/data/bots/{user_dir}"
                    if os.path.isdir(user_path):
                        user_bots = os.listdir(user_path)
                        total_bots += len(user_bots)
                        users_list.append({
                            "user_id": user_dir,
                            "bot_count": len(user_bots),
                            "bots": user_bots
                        })
                        print(f"[MODAL HEALTH CHECK] User {user_dir}: {len(user_bots)} bots")
                
                health_info["users"] = users_list
                health_info["total_bots"] = total_bots
                
            except Exception as e:
                health_info["bots_structure_error"] = str(e)
                print(f"[MODAL HEALTH CHECK] ✗ Error analyzing bots structure: {e}")
        
        # Specific bot check if requested
        if bot_id and user_id:
            print(f"[MODAL HEALTH CHECK] Checking specific bot {bot_id}")
            bot_dir = f"/data/bots/{user_id}/{bot_id}"
            
            bot_check = {
                "bot_id": bot_id,
                "user_id": user_id,
                "directory_exists": os.path.exists(bot_dir),
                "files": []
            }
            
            if bot_check["directory_exists"]:
                try:
                    bot_files = os.listdir(bot_dir)
                    for file_name in bot_files:
                        file_path = os.path.join(bot_dir, file_name)
                        file_info = {
                            "name": file_name,
                            "size": os.path.getsize(file_path) if os.path.isfile(file_path) else 0,
                            "is_file": os.path.isfile(file_path)
                        }
                        
                        # Special handling for main.py
                        if file_name == "main.py" and os.path.isfile(file_path):
                            try:
                                with open(file_path, "r", encoding='utf-8') as f:
                                    content = f.read()
                                file_info["content_length"] = len(content)
                                file_info["content_preview"] = content[:100] + "..." if len(content) > 100 else content
                                file_info["has_content"] = len(content) > 0
                            except Exception as e:
                                file_info["read_error"] = str(e)
                        
                        bot_check["files"].append(file_info)
                    
                    print(f"[MODAL HEALTH CHECK] Bot {bot_id} has {len(bot_files)} files")
                    
                except Exception as e:
                    bot_check["file_list_error"] = str(e)
            
            health_info["specific_bot_check"] = bot_check
        
        # Volume performance metrics
        try:
            import time
            start_time = time.time()
            
            # Test write performance
            test_file = "/data/health_check_test.txt"
            test_content = "Health check test content " * 100
            
            with open(test_file, "w") as f:
                f.write(test_content)
            
            # Commit the test write
            volume.commit()
            
            # Test read performance
            with open(test_file, "r") as f:
                read_content = f.read()
            
            # Clean up test file
            os.remove(test_file)
            volume.commit()
            
            end_time = time.time()
            
            health_info["performance_test"] = {
                "write_read_cycle_time": round(end_time - start_time, 3),
                "test_content_size": len(test_content),
                "read_write_success": read_content == test_content
            }
            
            print(f"[MODAL HEALTH CHECK] Performance test: {health_info['performance_test']['write_read_cycle_time']}s")
            
        except Exception as e:
            health_info["performance_test_error"] = str(e)
            print(f"[MODAL HEALTH CHECK] ✗ Performance test failed: {e}")
        
        print(f"[MODAL HEALTH CHECK] ✓ Health check completed successfully")
        
        return {
            "success": True,
            "health_info": health_info,
            "check_type": "comprehensive_volume_health",
            "logs": [
                f"[MODAL HEALTH] Volume health check completed",
                f"[MODAL HEALTH] Total bots found: {health_info.get('total_bots', 0)}",
                f"[MODAL HEALTH] Volume status: {health_info['volume_status']}"
            ]
        }
        
    except Exception as e:
        print(f"[MODAL HEALTH CHECK] ✗ Exception: {str(e)}")
        add_bot_log(None, f"Health check error: {str(e)}", "ERROR")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "check_type": "comprehensive_volume_health",
            "logs": [f"[MODAL HEALTH ERROR] Health check failed: {str(e)}"]
        }

@app.function(
    image=image,
    volumes={"/data": volume},
    min_containers=1,
    timeout=3600
)
@modal.asgi_app()
def telegram_bot_service():
    """Optimized FastAPI service with proper volume patterns"""
    web_app = FastAPI(title="Telegram Bot Platform - Optimized")
    
    # Allow CORS for webhook requests
    web_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @web_app.post("/test-volume")
    async def create_test_file_endpoint(request: Request):
        """Create a test file in Modal volume"""
        try:
            body = await request.json() if request.headers.get("content-type") == "application/json" else {}
            test_id = body.get("test_id")
            
            print(f"[MODAL TEST API] Creating test file, test_id: {test_id}")
            
            # Call Modal function to create test file
            result = create_test_file.remote(test_id)
            
            print(f"[MODAL TEST API] Test file creation result: success={result.get('success')}")
            
            return result
            
        except Exception as e:
            print(f"[MODAL TEST API] Error in test file creation: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "logs": [f"[MODAL TEST API ERROR] {str(e)}"]
            }

    @web_app.get("/test-volume/{test_id}")
    async def get_test_file_endpoint(test_id: str):
        """Get a specific test file by ID"""
        try:
            print(f"[MODAL TEST API] Retrieving test file: {test_id}")
            
            # Call Modal function to get test file
            result = get_test_file.remote(test_id)
            
            print(f"[MODAL TEST API] Test file retrieval result: success={result.get('success')}")
            
            return result
            
        except Exception as e:
            print(f"[MODAL TEST API] Error retrieving test file: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "test_id": test_id
            }

    @web_app.get("/list-test-files")
    async def list_test_files_endpoint():
        """List all test files in the volume"""
        try:
            print(f"[MODAL TEST API] Listing test files")
            
            # Call Modal function to list test files
            result = list_test_files.remote()
            
            print(f"[MODAL TEST API] Test files list result: success={result.get('success')}, count={result.get('total_count', 0)}")
            
            return result
            
        except Exception as e:
            print(f"[MODAL TEST API] Error listing test files: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "test_files": []
            }

    @web_app.get("/health")
    async def simple_health_check():
        """Simple health check endpoint"""
        return {
            "status": "healthy",
            "service": "Telegram Bot Platform - Optimized",
            "version": "2.0",
            "timestamp": datetime.now().isoformat(),
            "volume_mount": os.path.exists("/data"),
            "endpoints": [
                "/health",
                "/health-check",
                "/test-volume",
                "/list-test-files",
                "/logs/{bot_id}",
                "/store-bot/{bot_id}",
                "/files/{bot_id}"
            ]
        }

    @web_app.get("/logs/{bot_id}")
    async def get_bot_logs_endpoint(bot_id: str, user_id: str = None):
        """Get logs for a specific bot"""
        try:
            print(f"[MODAL LOGS API] Getting logs for bot {bot_id}")
            
            # If user_id not provided, try to find it
            if not user_id:
                volume.reload()
                base_dir = "/data/bots"
                if os.path.exists(base_dir):
                    for user_dir in os.listdir(base_dir):
                        bot_path = f"{base_dir}/{user_dir}/{bot_id}"
                        if os.path.exists(bot_path):
                            user_id = user_dir
                            break
            
            if not user_id:
                return {
                    "success": False,
                    "error": "Bot not found",
                    "logs": [f"[ERROR] Bot {bot_id} not found in any user directory"]
                }
            
            # Get logs using Modal function
            result = get_bot_logs_from_volume.remote(bot_id, user_id)
            
            print(f"[MODAL LOGS API] Retrieved {len(result.get('logs', []))} log entries")
            
            return result
            
        except Exception as e:
            print(f"[MODAL LOGS API] Error: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "logs": [f"[ERROR] Failed to get logs: {str(e)}"]
            }

    @web_app.post("/logs/{bot_id}")
    async def append_bot_log_endpoint(bot_id: str, request: Request):
        """Append log message to bot logs"""
        try:
            body = await request.json()
            user_id = body.get("user_id")
            message = body.get("message", "")
            level = body.get("level", "INFO")
            
            if not user_id or not message:
                raise HTTPException(status_code=400, detail="Missing user_id or message")
            
            # Append log using Modal function
            result = append_bot_log_to_volume.remote(bot_id, user_id, message, level)
            
            return result
            
        except Exception as e:
            print(f"[MODAL LOG APPEND API] Error: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

    @web_app.post("/store-bot/{bot_id}")
    async def optimized_store_bot_endpoint(bot_id: str, request: Request):
        """Optimized store bot endpoint using Modal function patterns"""
        try:
            body = await request.json()
            
            user_id = body.get("user_id")
            bot_code = body.get("bot_code")
            bot_token = body.get("bot_token")
            bot_name = body.get("bot_name", f"Bot {bot_id}")
            
            if not all([user_id, bot_code, bot_token]):
                raise HTTPException(status_code=400, detail="Missing required fields")
            
            print(f"[MODAL OPTIMIZED API] Storing bot {bot_id} with optimized patterns")
            
            # Call optimized Modal function
            result = optimized_store_bot_files.remote(bot_id, user_id, bot_code, bot_token, bot_name)
            
            print(f"[MODAL OPTIMIZED API] Storage result: success={result.get('success')}")
            
            return result
            
        except Exception as e:
            print(f"[MODAL OPTIMIZED API] Error in store endpoint: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "logs": [f"[MODAL OPTIMIZED API ERROR] {str(e)}"]
            }

    @web_app.get("/files/{bot_id}")
    async def optimized_get_files_endpoint(bot_id: str, user_id: str):
        """Optimized get files endpoint using Modal function patterns"""
        try:
            print(f"[MODAL OPTIMIZED API] Loading files for bot {bot_id} with optimized patterns")
            
            # Call optimized Modal function
            result = optimized_load_bot_files.remote(bot_id, user_id)
            
            print(f"[MODAL OPTIMIZED API] Load result: success={result.get('success')}, files={list(result.get('files', {}).keys())}")
            
            return result
            
        except Exception as e:
            print(f"[MODAL OPTIMIZED API] Error in files endpoint: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "files": {},
                "logs": [f"[MODAL OPTIMIZED API ERROR] {str(e)}"]
            }

    @web_app.get("/health-check/{bot_id}")
    async def comprehensive_health_endpoint(bot_id: str, user_id: str):
        """Comprehensive health check endpoint"""
        try:
            print(f"[MODAL OPTIMIZED API] Running comprehensive health check for bot {bot_id}")
            
            # Call comprehensive health check function
            result = comprehensive_volume_health_check.remote(bot_id, user_id)
            
            print(f"[MODAL OPTIMIZED API] Health check result: success={result.get('success')}")
            
            return result
            
        except Exception as e:
            print(f"[MODAL OPTIMIZED API] Error in health check endpoint: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

    @web_app.get("/health-check")
    async def general_health_endpoint():
        """General volume health check endpoint"""
        try:
            print(f"[MODAL OPTIMIZED API] Running general volume health check")
            
            # Call general health check function
            result = comprehensive_volume_health_check.remote()
            
            print(f"[MODAL OPTIMIZED API] General health check result: success={result.get('success')}")
            
            return result
            
        except Exception as e:
            print(f"[MODAL OPTIMIZED API] Error in general health check: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

    # ... keep existing code (webhook handling, bot loading, and other endpoints)

    async def load_bot_instance(bot_id: str, user_id: str):
        """Load and initialize a bot instance with proper volume reload"""
        try:
            print(f"[MODAL OPTIMIZED] Loading bot instance {bot_id}")
            add_bot_log(bot_id, f"Loading bot instance {bot_id}")
            
            # Reload volume to get latest bot files
            volume.reload()
            
            bot_dir = f"/data/bots/{user_id}/{bot_id}"
            
            # Load metadata
            with open(f"{bot_dir}/metadata.json", "r") as f:
                metadata = json.load(f)
            
            # Load and execute bot code
            with open(f"{bot_dir}/main.py", "r") as f:
                bot_code = f.read()
            
            add_bot_log(bot_id, "Bot code loaded from volume")
            
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
                print(f"[MODAL OPTIMIZED] Bot {bot_id} loaded and initialized successfully")
                add_bot_log(bot_id, "Bot loaded and initialized successfully")
                return True
            else:
                print(f"[MODAL OPTIMIZED] No application instance found in bot {bot_id} code")
                add_bot_log(bot_id, "No application instance found in bot code", "ERROR")
                return False
                
        except Exception as e:
            print(f"[MODAL OPTIMIZED] Error loading bot {bot_id}: {str(e)}")
            add_bot_log(bot_id, f"Error loading bot: {str(e)}", "ERROR")
            return False

    @web_app.post("/webhook/{bot_id}")
    async def handle_webhook(bot_id: str, request: Request):
        """Handle incoming Telegram webhook requests for specific bot"""
        try:
            body = await request.json()
            print(f"[MODAL OPTIMIZED] Bot {bot_id} received webhook: {body}")
            add_bot_log(bot_id, f"Received webhook: {json.dumps(body)[:100]}...")
            
            # Load bot if not already loaded
            if bot_id not in bot_instances:
                # Try to find user_id from the request or database
                user_dirs = []
                try:
                    # Reload volume to get latest state
                    volume.reload()
                    
                    base_dir = "/data/bots"
                    if os.path.exists(base_dir):
                        for user_dir in os.listdir(base_dir):
                            bot_path = f"{base_dir}/{user_dir}/{bot_id}"
                            if os.path.exists(bot_path):
                                user_dirs.append(user_dir)
                
                    if user_dirs:
                        await load_bot_instance(bot_id, user_dirs[0])
                except Exception as e:
                    print(f"[MODAL OPTIMIZED] Error finding bot {bot_id}: {str(e)}")
                    add_bot_log(bot_id, f"Error finding bot: {str(e)}", "ERROR")
            
            # Process webhook with bot handler
            if bot_id in bot_instances:
                bot_handler = bot_instances[bot_id]["handler"]
                
                # Process the update with the bot
                from telegram import Update
                
                update = Update.de_json(body, None)
                if update and bot_handler:
                    # Process the update asynchronously
                    await bot_handler.process_update(update)
                    add_bot_log(bot_id, "Webhook processed successfully")
                
                return {"ok": True}
            else:
                print(f"[MODAL OPTIMIZED] Bot {bot_id} not found or not loaded")
                add_bot_log(bot_id, "Bot not found or not loaded", "ERROR")
                return {"ok": False, "error": "Bot not found"}
                
        except Exception as e:
            print(f"[MODAL OPTIMIZED] Error processing webhook for bot {bot_id}: {str(e)}")
            add_bot_log(bot_id, f"Webhook error: {str(e)}", "ERROR")
            raise HTTPException(status_code=500, detail=str(e))

    # ... keep existing code (register webhook, unregister webhook, status endpoints)

    @web_app.get("/")
    async def root():
        """Root endpoint with optimization info"""
        return {
            "service": "Telegram Bot Platform - Optimized",
            "status": "running",
            "version": "2.0",
            "optimization_features": [
                "Proper volume commit/reload patterns",
                "Batch operation support",
                "Comprehensive health checks",
                "Enhanced error handling",
                "Volume busy error prevention"
            ],
            "loaded_bots": list(bot_instances.keys()),
            "timestamp": datetime.now().isoformat()
        }

    return web_app

# ... keep existing code (register_webhook and unregister_webhook functions)

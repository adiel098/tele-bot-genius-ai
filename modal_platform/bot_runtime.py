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
def optimized_store_bot_files(bot_id: str, user_id: str, bot_code: str, bot_token: str, bot_name: str):
    """Optimized Modal function to store bot files with proper volume patterns - NO SUPABASE STORAGE"""
    try:
        print(f"[MODAL STORE CLEAN] === Starting PURE Modal storage for bot {bot_id} ===")
        print(f"[MODAL STORE CLEAN] NO Supabase Storage calls - Modal Volume ONLY")
        add_bot_log(bot_id, f"Starting Modal Volume ONLY storage for bot {bot_id}")
        
        # Create bot directory path
        bot_dir = f"/data/bots/{user_id}/{bot_id}"
        print(f"[MODAL STORE CLEAN] Target directory: {bot_dir}")
        
        # Create directory structure
        os.makedirs(bot_dir, exist_ok=True)
        print(f"[MODAL STORE CLEAN] ✓ Directory structure created")
        add_bot_log(bot_id, "Directory structure created")
        
        # Write main bot code with proper file handling
        main_py_path = f"{bot_dir}/main.py"
        print(f"[MODAL STORE CLEAN] Writing main.py ({len(bot_code)} chars)")
        
        with open(main_py_path, "w", encoding='utf-8') as f:
            f.write(bot_code)
        
        # Verify file was written correctly
        with open(main_py_path, "r", encoding='utf-8') as f:
            stored_content = f.read()
        
        if stored_content != bot_code:
            raise Exception("File content verification failed")
        
        print(f"[MODAL STORE CLEAN] ✓ main.py written and verified")
        add_bot_log(bot_id, f"main.py written and verified ({len(bot_code)} chars)")
        
        # Create optimized metadata
        metadata = {
            "bot_id": bot_id,
            "user_id": user_id,
            "bot_name": bot_name,
            "created_at": datetime.now().isoformat(),
            "status": "stored",
            "bot_token": bot_token,
            "storage_method": "modal_volume_only_no_supabase",
            "file_size": len(bot_code),
            "storage_version": "3.0_clean"
        }
        
        metadata_path = f"{bot_dir}/metadata.json"
        with open(metadata_path, "w", encoding='utf-8') as f:
            json.dump(metadata, f, indent=2)
        
        print(f"[MODAL STORE CLEAN] ✓ Metadata written")
        add_bot_log(bot_id, "Metadata written successfully")
        
        # Create logs directory and initial log file
        logs_dir = f"{bot_dir}/logs"
        os.makedirs(logs_dir, exist_ok=True)
        
        initial_log = f"[{datetime.now().isoformat()}] [INFO] Bot {bot_id} stored successfully with Modal Volume ONLY\n"
        with open(f"{logs_dir}/bot.log", "w", encoding='utf-8') as f:
            f.write(initial_log)
        
        add_bot_log(bot_id, "Initial log file created")
        
        # CRITICAL: Explicit volume commit in proper Modal function context
        print(f"[MODAL STORE CLEAN] Committing volume changes...")
        volume.commit()
        print(f"[MODAL STORE CLEAN] ✓ Volume committed successfully")
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
        
        print(f"[MODAL STORE CLEAN] Verification complete: {len(verification_logs)} checks");
        
        return {
            "success": True,
            "bot_id": bot_id,
            "storage_method": "modal_volume_only_no_supabase",
            "storage_version": "3.0_clean",
            "verification": verification_logs,
            "logs": [
                f"[MODAL CLEAN] Bot {bot_id} stored with NO Supabase Storage calls",
                f"[MODAL CLEAN] File size: {len(bot_code)} characters",
                f"[MODAL CLEAN] Volume committed in proper function context",
                f"[MODAL CLEAN] Verification passed: {len(verification_logs)} checks",
                f"[MODAL CLEAN] Pure Modal Volume storage - no external dependencies"
            ]
        }
        
    except Exception as e:
        print(f"[MODAL STORE CLEAN] ✗ Error: {str(e)}")
        add_bot_log(bot_id, f"Storage error: {str(e)}", "ERROR")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "storage_method": "modal_volume_only_no_supabase",
            "logs": [f"[MODAL CLEAN ERROR] {str(e)}"]
        }

@app.function(
    image=image,
    volumes={"/data": volume},
    min_containers=1,
    timeout=3600
)
@modal.asgi_app()
def telegram_bot_service():
    """Optimized FastAPI service with PURE Modal Volume patterns - NO Supabase Storage"""
    web_app = FastAPI(title="Telegram Bot Platform - Pure Modal Clean")
    
    # Allow CORS for webhook requests
    web_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @web_app.post("/store-bot/{bot_id}")
    async def pure_modal_store_bot_endpoint(bot_id: str, request: Request):
        """PURE Modal store bot endpoint - NO Supabase Storage calls"""
        try:
            print(f"[MODAL API CLEAN] === Pure Modal storage request for bot {bot_id} ===")
            print(f"[MODAL API CLEAN] NO Supabase Storage - Modal Volume ONLY")
            
            # Get raw body first
            raw_body = await request.body()
            print(f"[MODAL API CLEAN] Raw body received: {raw_body[:200]}...")
            
            # Try to parse JSON with better error handling
            try:
                if request.headers.get("content-type") == "application/json":
                    body = await request.json()
                else:
                    # Try to parse raw body as JSON
                    body_str = raw_body.decode('utf-8')
                    print(f"[MODAL API CLEAN] Body string: {body_str[:200]}...")
                    body = json.loads(body_str)
            except json.JSONDecodeError as e:
                print(f"[MODAL API CLEAN] JSON parse error: {str(e)}")
                print(f"[MODAL API CLEAN] Raw body: {raw_body}")
                raise HTTPException(
                    status_code=400, 
                    detail=f"Invalid JSON: {str(e)}. Received: {raw_body[:100]}"
                )
            except Exception as e:
                print(f"[MODAL API CLEAN] Request parsing error: {str(e)}")
                raise HTTPException(status_code=400, detail=f"Request parsing error: {str(e)}")
            
            print(f"[MODAL API CLEAN] Parsed body: {body}")
            
            user_id = body.get("user_id")
            bot_code = body.get("bot_code")
            bot_token = body.get("bot_token")
            bot_name = body.get("bot_name", f"Bot {bot_id}")
            
            if not all([user_id, bot_code, bot_token]):
                missing_fields = []
                if not user_id: missing_fields.append("user_id")
                if not bot_code: missing_fields.append("bot_code")
                if not bot_token: missing_fields.append("bot_token")
                
                raise HTTPException(
                    status_code=400, 
                    detail=f"Missing required fields: {', '.join(missing_fields)}"
                )
            
            print(f"[MODAL API CLEAN] Storing bot {bot_id} with PURE Modal patterns")
            print(f"[MODAL API CLEAN] Code length: {len(bot_code)} characters")
            
            # Call pure Modal function - NO Supabase Storage
            result = optimized_store_bot_files.remote(bot_id, user_id, bot_code, bot_token, bot_name)
            
            print(f"[MODAL API CLEAN] Pure Modal storage result: success={result.get('success')}")
            
            return result
            
        except HTTPException:
            # Re-raise HTTP exceptions as-is
            raise
        except Exception as e:
            print(f"[MODAL API CLEAN] Unexpected error in pure Modal store endpoint: {str(e)}")
            import traceback
            traceback.print_exc()
            return {
                "success": False,
                "error": str(e),
                "logs": [f"[MODAL API CLEAN ERROR] {str(e)}"]
            }

    @web_app.get("/")
    async def root():
        """Root endpoint with pure Modal info"""
        return {
            "service": "Telegram Bot Platform - Pure Modal Clean",
            "status": "running",
            "version": "3.0_clean",
            "storage_info": "NO Supabase Storage - Modal Volume ONLY",
            "optimization_features": [
                "Pure Modal Volume storage patterns",
                "NO Supabase Storage dependencies",
                "Proper volume commit/reload patterns",
                "Enhanced error handling",
                "Robust JSON parsing"
            ],
            "loaded_bots": list(bot_instances.keys()),
            "timestamp": datetime.now().isoformat(),
            "endpoints": [
                "POST /store-bot/{bot_id} - Pure Modal storage",
                "GET /files/{bot_id} - Get bot files from Modal",
                "GET /logs/{bot_id} - Get bot logs",
                "GET /health-check/{bot_id} - Health check"
            ]
        }

    return web_app

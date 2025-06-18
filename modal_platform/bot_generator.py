
import modal
import openai
import os
import json
from typing import Dict, Any, List
from datetime import datetime

app = modal.App("bot-code-generator")

# Modal image with OpenAI dependencies
image = modal.Image.debian_slim().pip_install([
    "openai>=1.0.0",
    "supabase>=1.0.0",
    "requests>=2.28.0"
])

secrets = [
    modal.Secret.from_name("openai-secrets"),
    modal.Secret.from_name("supabase-secrets")
]

@app.function(
    image=image,
    secrets=secrets,
    timeout=300,
    memory=512
)
def generate_telegram_bot_code(
    prompt: str, 
    bot_token: str, 
    conversation_history: List[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Generate Telegram bot code using OpenAI - replaces generate-bot-code Edge Function
    """
    try:
        print(f"[MODAL] Generating bot code with OpenAI")
        
        # Initialize OpenAI client
        client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        
        # Build conversation context
        messages = [
            {
                "role": "system",
                "content": """You are an expert Python developer specializing in Telegram bots using python-telegram-bot library v20+.

Generate complete, production-ready Python code for Telegram bots based on user requirements.

IMPORTANT REQUIREMENTS:
1. Use python-telegram-bot v20+ syntax (Application, not Updater)
2. Include proper error handling and logging
3. Use async/await patterns correctly
4. Include health check endpoint on port 8080
5. Make the bot token configurable via environment variable
6. Include proper webhook setup for production deployment
7. Add comprehensive comments explaining the code

Generate a complete main.py file that can run independently in a Modal function.

Example structure:
```python
import logging
import os
from telegram import Update, Bot
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
import asyncio
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
import json

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Bot token from environment
BOT_TOKEN = os.getenv('BOT_TOKEN', 'your-bot-token-here')

# Your bot handlers here...

# Health check server
class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status": "healthy"}')

def start_health_server():
    server = HTTPServer(('0.0.0.0', 8080), HealthHandler)
    server.serve_forever()

async def main():
    # Start health check server in background
    health_thread = threading.Thread(target=start_health_server, daemon=True)
    health_thread.start()
    
    # Create application
    application = Application.builder().token(BOT_TOKEN).build()
    
    # Add handlers
    # ... your handlers here
    
    # Start the bot
    await application.initialize()
    await application.start()
    await application.updater.start_polling()
    
    # Keep running
    try:
        await asyncio.Future()  # Run forever
    except KeyboardInterrupt:
        pass
    finally:
        await application.updater.stop()
        await application.stop()
        await application.shutdown()

if __name__ == '__main__':
    asyncio.run(main())
```

Respond with:
1. explanation: Brief explanation of what the bot does
2. code: Complete Python code for main.py
3. requirements: List of Python packages needed
"""
            }
        ]
        
        # Add conversation history if provided
        if conversation_history:
            for msg in conversation_history[-10:]:  # Last 10 messages for context
                messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
        
        # Add current user prompt
        messages.append({
            "role": "user",
            "content": f"Create a Telegram bot with the following requirements:\n\n{prompt}\n\nBot token: {bot_token}"
        })
        
        # Generate bot code
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=3000
        )
        
        assistant_response = response.choices[0].message.content
        
        # Parse the response to extract code and explanation
        code_start = assistant_response.find("```python")
        code_end = assistant_response.find("```", code_start + 9)
        
        if code_start != -1 and code_end != -1:
            generated_code = assistant_response[code_start + 9:code_end].strip()
            explanation = assistant_response[:code_start].strip()
        else:
            # Fallback if no code blocks found
            generated_code = assistant_response
            explanation = "Generated Telegram bot code"
        
        # Ensure bot token is properly configured
        if "BOT_TOKEN" not in generated_code:
            generated_code = f"BOT_TOKEN = '{bot_token}'\n\n" + generated_code
        
        # Default requirements
        requirements = [
            "python-telegram-bot>=20.0",
            "python-dotenv>=1.0.0",
            "requests>=2.28.0"
        ]
        
        print(f"[MODAL] Bot code generated successfully: {len(generated_code)} characters")
        
        return {
            "success": True,
            "explanation": explanation,
            "code": generated_code,
            "requirements": requirements,
            "files": {
                "main.py": generated_code,
                "requirements.txt": "\n".join(requirements),
                ".env": f"BOT_TOKEN={bot_token}"
            }
        }
        
    except Exception as e:
        print(f"[MODAL] Error generating bot code: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "explanation": "Failed to generate bot code",
            "code": "",
            "requirements": [],
            "files": {}
        }

@app.function(
    image=image,
    secrets=secrets,
    timeout=300
)
def modify_bot_code(
    bot_id: str,
    user_id: str, 
    modification_prompt: str,
    current_code: str,
    conversation_history: List[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Modify existing bot code based on user request - replaces bot modification logic
    """
    try:
        print(f"[MODAL] Modifying bot {bot_id} code")
        
        # Initialize OpenAI client  
        client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        
        messages = [
            {
                "role": "system", 
                "content": """You are modifying an existing Telegram bot. 
                
The user will provide:
1. Current bot code
2. Modification request

Your task:
1. Analyze the current code
2. Make the requested modifications
3. Ensure the modified code maintains all existing functionality
4. Return the complete updated code

Maintain the same structure and patterns as the original code."""
            },
            {
                "role": "user",
                "content": f"""Current bot code:
```python
{current_code}
```

Modification request: {modification_prompt}

Please provide the complete modified code."""
            }
        ]
        
        # Add conversation context if available
        if conversation_history:
            messages.insert(-1, {
                "role": "assistant",
                "content": f"I'll modify the bot code based on your request: {modification_prompt}"
            })
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=3000
        )
        
        assistant_response = response.choices[0].message.content
        
        # Extract modified code
        code_start = assistant_response.find("```python")
        code_end = assistant_response.find("```", code_start + 9)
        
        if code_start != -1 and code_end != -1:
            modified_code = assistant_response[code_start + 9:code_end].strip()
            explanation = assistant_response[:code_start].strip()
        else:
            modified_code = assistant_response
            explanation = f"Modified bot code based on: {modification_prompt}"
        
        print(f"[MODAL] Bot code modified successfully")
        
        return {
            "success": True,
            "explanation": explanation,
            "code": modified_code,
            "files": {
                "main.py": modified_code,
                "requirements.txt": "python-telegram-bot>=20.0\npython-dotenv>=1.0.0\nrequests>=2.28.0",
            }
        }
        
    except Exception as e:
        print(f"[MODAL] Error modifying bot code: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "explanation": "Failed to modify bot code",
            "code": current_code,  # Return original code if modification fails
            "files": {}
        }

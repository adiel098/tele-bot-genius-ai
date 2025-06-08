
export function generatePythonBotScript(botId: string, containerId: string, token: string, actualBotCode: string): string {
  // If actual bot code is provided, use it directly
  if (actualBotCode && actualBotCode.trim().length > 0) {
    // Replace any token placeholders in the code with the actual token
    let updatedCode = actualBotCode.replace(/\${token}/g, token);
    updatedCode = updatedCode.replace(/BOT_TOKEN\s*=\s*['"][^'"]*['"]/, `BOT_TOKEN = "${token}"`);
    updatedCode = updatedCode.replace(/os\.getenv\(['"]TELEGRAM_TOKEN['"][^)]*\)/, `"${token}"`);
    updatedCode = updatedCode.replace(/os\.getenv\(['"]BOT_TOKEN['"][^)]*\)/, `"${token}"`);
    
    return updatedCode;
  }

  // Fallback to a simple bot template if no code is provided
  return `
import os
import sys
import asyncio
import logging
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
import json
import aiohttp
from datetime import datetime

# Set up logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Get bot token from environment
BOT_TOKEN = "${token}"

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command"""
    user = update.effective_user
    await update.message.reply_text(
        f"🤖 Hello {user.first_name}! I'm your AI bot running in a real Docker container!\\n"
        f"Your user ID is: {user.id}\\n"
        f"Container ID: ${containerId}"
    )

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /help command"""
    help_text = """
Available commands:
/start - Get started
/help - Show this help
/status - Check bot status

I'm running real Python code in a Docker container! 🐳
"""
    await update.message.reply_text(help_text)

async def status_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /status command"""
    await update.message.reply_text(
        f"✅ Bot Status: RUNNING\\n"
        f"🐳 Container: ${containerId}\\n"
        f"🐍 Python: {sys.version}\\n"
        f"⏰ Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    )

async def echo_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Echo user messages with processing info"""
    user_message = update.message.text
    user = update.effective_user
    
    response = f"🤖 Processing your message in real Python!\\n\\n"
    response += f"📝 You said: '{user_message}'\\n"
    response += f"👤 User: {user.first_name} (@{user.username})\\n"
    response += f"🆔 Chat ID: {update.effective_chat.id}\\n"
    response += f"🐳 Container: ${containerId}"
    
    await update.message.reply_text(response)

async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE):
    """Handle errors"""
    logger.error(f"Exception while handling an update: {context.error}")

def main():
    """Start the bot"""
    logger.info(f"Starting bot with token: {BOT_TOKEN[:10]}...")
    logger.info(f"Container ID: ${containerId}")
    
    # Create application
    application = Application.builder().token(BOT_TOKEN).build()
    
    # Add handlers
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("status", status_command))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo_message))
    
    # Add error handler
    application.add_error_handler(error_handler)
    
    logger.info("Starting bot with webhook...")
    
    try:
        # Start the bot with webhook
        application.run_webhook(
            listen="0.0.0.0",
            port=8080,
            url_path="/webhook",
            webhook_url=f"https://efhwjkhqbbucvedgznba.supabase.co/functions/v1/telegram-webhook/${botId}"
        )
    except Exception as e:
        logger.error(f"Failed to start bot: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
`;
}

export function generateDockerfile(token: string): string {
  return `FROM python:3.11-slim
WORKDIR /app
RUN pip install python-telegram-bot aiohttp
COPY main.py .
ENV TELEGRAM_TOKEN=${token}
ENV PYTHONUNBUFFERED=1
EXPOSE 8080
CMD ["python", "main.py"]`;
}

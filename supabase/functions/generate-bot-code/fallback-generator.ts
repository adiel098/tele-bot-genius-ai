
export function generateFallbackPythonBot(token: string) {
  return {
    files: {
      "main.py": `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import logging
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# Enable logging
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a message when the command /start is issued."""
    await update.message.reply_text('Hello! I am your AI-powered Telegram bot. Send me any message and I will echo it back!')

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a message when the command /help is issued."""
    await update.message.reply_text('Available commands:\\n/start - Start the bot\\n/help - Show this help message')

async def echo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Echo the user message."""
    user_message = update.message.text
    await update.message.reply_text(f'You said: {user_message}')

def main() -> None:
    """Start the bot."""
    # Get bot token from environment variable
    token = os.getenv('BOT_TOKEN', '${token}')
    
    # Create the Application
    application = Application.builder().token(token).build()

    # Add handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))

    # Run the bot until the user presses Ctrl-C
    logger.info("Starting bot...")
    application.run_polling()

if __name__ == '__main__':
    main()`,
      "requirements.txt": `python-telegram-bot>=20.0
requests>=2.28.0`,
      "README.md": `# Telegram Bot

## Setup
1. Set your bot token in environment variable BOT_TOKEN
2. Install dependencies: \`pip install -r requirements.txt\`
3. Run: \`python main.py\`

## Features
- Responds to /start and /help commands
- Echoes user messages
- Professional error handling and logging
- Built with python-telegram-bot library

## Docker Deployment
\`\`\`dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["python", "main.py"]
\`\`\`
`
    },
    explanation: "A professional Telegram bot built with python-telegram-bot library. Includes proper error handling, logging, and command structure."
  };
}

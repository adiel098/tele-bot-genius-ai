
export function generateFallbackPythonBot(token: string) {
  return {
    files: {
      "main.py": `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import logging
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# Load environment variables for local development
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # dotenv not available in production, that's fine
    pass

# Enable logging
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a message when the command /start is issued."""
    user_name = update.effective_user.first_name
    await update.message.reply_text(
        f'Hello {user_name}! 👋\\n\\n'
        'I am your AI-powered Telegram bot created with BotFactory! 🤖\\n\\n'
        'Available commands:\\n'
        '/start - Start the bot\\n'
        '/help - Show help message\\n\\n'
        'Send me any message and I will echo it back!'
    )

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a message when the command /help is issued."""
    await update.message.reply_text(
        'Available commands:\\n'
        '/start - Start the bot\\n'
        '/help - Show this help message\\n\\n'
        'I\\'m an AI bot created with BotFactory! 🤖\\n'
        'Send me any message and I will echo it back.'
    )

async def echo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Echo the user message."""
    user_message = update.message.text
    user_name = update.effective_user.first_name
    await update.message.reply_text(
        f'Hello {user_name}! You said: "{user_message}"\\n\\n'
        'I\\'m an AI bot running your custom code! 🤖'
    )

def main() -> None:
    """Start the bot."""
    # Get bot token from environment variable
    token = os.getenv('BOT_TOKEN', '${token}')
    
    if not token or token == '${token}':
        logger.error('BOT_TOKEN not found in environment variables. Please check your .env file.')
        return
    
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
      ".env": `# Telegram Bot Configuration
# Get your bot token from @BotFather on Telegram
BOT_TOKEN=${token}

# Optional: Set log level (DEBUG, INFO, WARNING, ERROR)
LOG_LEVEL=INFO

# Optional: Database configuration (if needed)
# DATABASE_URL=

# Optional: API Keys (if your bot uses external services)
# OPENAI_API_KEY=
# WEATHER_API_KEY=
# NEWS_API_KEY=`,
      "requirements.txt": `python-telegram-bot>=20.0
requests>=2.28.0
python-dotenv>=1.0.0`,
      "README.md": `# Telegram Bot

## Local Development Setup

### Prerequisites
- Python 3.8 or higher
- pip (Python package installer)

### Installation Steps

1. **Create virtual environment:**
   \`\`\`bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\\Scripts\\activate
   \`\`\`

2. **Install dependencies:**
   \`\`\`bash
   pip install -r requirements.txt
   \`\`\`

3. **Configure environment:**
   - The \`.env\` file contains your bot token
   - If you need to change it, get a new token from @BotFather on Telegram
   - Update the \`BOT_TOKEN\` value in the \`.env\` file

4. **Run the bot:**
   \`\`\`bash
   python main.py
   \`\`\`

## Docker Deployment

### Build and run with Docker:
\`\`\`bash
# Build the image
docker build -t telegram-bot .

# Run the container
docker run -d --env-file .env --name my-telegram-bot telegram-bot
\`\`\`

### Using Docker Compose:
\`\`\`yaml
version: '3.8'
services:
  telegram-bot:
    build: .
    env_file: .env
    restart: unless-stopped
\`\`\`

## Features
- Responds to /start and /help commands
- Echoes user messages with friendly responses
- Professional error handling and logging
- Built with python-telegram-bot library
- Ready for both local and cloud deployment
- Environment variable configuration
- Docker support included

## Project Structure
- \`main.py\` - Main bot application
- \`.env\` - Environment variables (bot token, etc.)
- \`requirements.txt\` - Python dependencies
- \`Dockerfile\` - Docker configuration
- \`README.md\` - This documentation

## Development Tips
- Check logs for debugging information
- Use virtual environments to avoid dependency conflicts
- Keep your bot token secure and never commit it to version control
- Test locally before deploying to production

## Getting Help
- Telegram Bot API documentation: https://core.telegram.org/bots/api
- python-telegram-bot library: https://python-telegram-bot.readthedocs.io/
`,
      "Dockerfile": `FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy bot code
COPY . .

# Run the bot
CMD ["python", "main.py"]`,
      ".gitignore": `# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg

# Virtual environments
venv/
env/
ENV/

# Environment variables
.env.local
.env.production

# IDE
.vscode/
.idea/
*.swp
*.swo

# Logs
*.log

# OS
.DS_Store
Thumbs.db`
    },
    explanation: "A professional Telegram bot built with python-telegram-bot library. Includes complete local development setup with .env file, virtual environment support, Docker deployment, and comprehensive documentation for both local and cloud deployment."
  };
}

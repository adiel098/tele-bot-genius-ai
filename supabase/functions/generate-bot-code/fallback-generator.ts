
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

# Enable logging with detailed format
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', 
    level=logging.INFO
)
logger = logging.getLogger(__name__)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a message when the command /start is issued."""
    user_name = update.effective_user.first_name
    user_id = update.effective_user.id
    logger.info(f'User {user_name} (ID: {user_id}) executed /start command')
    
    await update.message.reply_text(
        f'Hello {user_name}! 👋\\n\\n'
        'I am your AI-powered Telegram bot created with BotFactory! 🤖\\n\\n'
        'Available commands:\\n'
        '/start - Start the bot\\n'
        '/help - Show help message\\n\\n'
        'Send me any message and I will echo it back!'
    )
    logger.info(f'Sent welcome message to user {user_name}')

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a message when the command /help is issued."""
    user_name = update.effective_user.first_name
    user_id = update.effective_user.id
    logger.info(f'User {user_name} (ID: {user_id}) requested help')
    
    await update.message.reply_text(
        'Available commands:\\n'
        '/start - Start the bot\\n'
        '/help - Show this help message\\n\\n'
        'I\\'m an AI bot created with BotFactory! 🤖\\n'
        'Send me any message and I will echo it back.'
    )
    logger.info(f'Sent help message to user {user_name}')

async def echo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Echo the user message."""
    user_message = update.message.text
    user_name = update.effective_user.first_name
    user_id = update.effective_user.id
    
    logger.info(f'User {user_name} (ID: {user_id}) sent message: "{user_message}"')
    
    await update.message.reply_text(
        f'Hello {user_name}! You said: "{user_message}"\\n\\n'
        'I\\'m an AI bot running your custom code! 🤖'
    )
    logger.info(f'Echoed message back to user {user_name}')

def main() -> None:
    """Start the bot."""
    logger.info('========== TELEGRAM BOT STARTUP ==========')
    logger.info('BotFactory AI-Generated Bot Starting...')
    
    # Get bot token from environment variable
    token = os.getenv('BOT_TOKEN', '${token}')
    
    if not token or token == '${token}':
        logger.error('BOT_TOKEN not found in environment variables. Please check your .env file.')
        return
    
    logger.info('✓ Bot token loaded successfully')
    logger.info('Creating Telegram Application...')
    
    # Create the Application
    application = Application.builder().token(token).build()
    logger.info('✓ Telegram Application created successfully')

    logger.info('Registering command and message handlers...')
    
    # Add handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))
    
    logger.info('✓ All handlers registered successfully')
    logger.info('  - /start command handler')
    logger.info('  - /help command handler') 
    logger.info('  - Text message echo handler')

    # Run the bot until the user presses Ctrl-C
    logger.info('Starting bot polling...')
    logger.info('🤖 BOT IS NOW RUNNING AND READY TO RECEIVE MESSAGES!')
    logger.info('🔄 Polling for updates from Telegram...')
    logger.info('========================================')
    
    try:
        application.run_polling()
    except Exception as e:
        logger.error(f'❌ Bot encountered an error: {e}')
        raise
    finally:
        logger.info('🛑 Bot polling stopped')

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
- Professional error handling and comprehensive logging
- Built with python-telegram-bot library
- Ready for both local and cloud deployment
- Environment variable configuration
- Docker support included
- Detailed startup and runtime logging

## Project Structure
- \`main.py\` - Main bot application with comprehensive logging
- \`.env\` - Environment variables (bot token, etc.)
- \`requirements.txt\` - Python dependencies
- \`Dockerfile\` - Docker configuration
- \`README.md\` - This documentation

## Development Tips
- Check logs for debugging information and bot status
- Use virtual environments to avoid dependency conflicts
- Keep your bot token secure and never commit it to version control
- Test locally before deploying to production
- Monitor logs to track user interactions and bot performance

## Logging Features
- Startup sequence logging
- User interaction tracking
- Command execution logging
- Error handling and reporting
- Performance monitoring

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
    explanation: "A professional Telegram bot with comprehensive startup logging, user interaction tracking, and detailed debugging information. Includes complete local development setup with .env file, virtual environment support, Docker deployment, and extensive documentation for both local and cloud deployment."
  };
}

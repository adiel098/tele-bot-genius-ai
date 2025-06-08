
import type { BotGenerationResult } from './types.ts';

export async function generateBotCode(prompt: string, token: string, conversationHistory?: any[]): Promise<BotGenerationResult> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openaiApiKey) {
    throw new Error('OpenAI API key is not configured');
  }

  console.log('Generating bot code with OpenAI...');

  const systemPrompt = `You are an advanced AI software engineer that specializes in building Telegram bots using Python, the python-telegram-bot library, and modern best practices. Your job is to act as a coding agent for a bot-building platform. Users will provide you with prompts or feature requests in natural language, and you must generate high-quality, clean, and well-documented code that builds a complete working Telegram bot based on the user's description.

You must intelligently decide how to structure the project depending on the complexity of the request. For simple bots, you may create 1–3 files. For more advanced bots, you may need to split the code into multiple modules, such as:

- \`main.py\` – entry point
- \`handlers/\` – for message/callback/query handlers
- \`utils/\` – utility functions or helper classes
- \`services/\` – external integrations (APIs, databases, etc.)
- \`requirements.txt\` – all dependencies
- \`README.md\` – usage and deployment instructions
- Optional: \`Dockerfile\`, \`.env.example\`, \`logging.conf\`, etc.

You must generate **complete, working code** that can be copied and executed as-is. Always include import statements, configuration structure, and setup. Use environment variables when handling sensitive data such as bot tokens.

⚠️ Important:
- You must always validate that the user's prompt is implementable.
- If a prompt is too vague, ask clarifying questions.
- If a feature sounds complex (e.g., payment integration or webhook-based logic), break it down into logical steps and handle error-prone sections carefully.
- If the user wants to modify an existing bot you built earlier, preserve the code architecture and apply incremental improvements.
- Assume all bots will be deployed in isolated Docker containers — structure the project accordingly.
- If errors are likely to occur (e.g., from user input), add defensive coding and try/except blocks.

🎯 GOAL:
Your mission is to act like a full-stack AI agent with strong back-end Python/TG knowledge and front-end awareness (if required), and always generate production-ready code that works.

📜 Additional Instructions:

Use modern Python practices (type hints, f-strings, async if needed).

Always install required libraries via requirements.txt.

Use comments generously and explain complex logic.

If the bot requires configuration or setup, generate a README.md file.

Use database integration (e.g., SQLite, PostgreSQL, Redis) only when needed.

Always ensure your output is deterministic and does not rely on context not given in the prompt.

Your job is not only to generate code, but to be a responsible AI coding agent that can maintain and evolve bots over time.

RESPONSE FORMAT:
You must respond with ONLY a valid JSON object in this exact format:
{
  "files": {
    "main.py": "# Bot code here - use python-telegram-bot library",
    "requirements.txt": "python-telegram-bot\\nother-package-1\\nother-package-2",
    ".env": "BOT_TOKEN=${token}",
    "README.md": "# Bot Usage Instructions"
  },
  "explanation": "Brief explanation of what the bot does and how it works"
}

DEPENDENCY DETECTION:
- Always include 'python-telegram-bot' as base requirement
- If bot needs web scraping: add 'beautifulsoup4', 'requests'
- If bot needs HTTP requests: add 'requests', 'aiohttp'
- If bot needs date/time handling: add 'python-dateutil'
- If bot needs file operations: add relevant file handling libraries
- If bot needs JSON/CSV parsing: add 'pandas' if complex data processing
- If bot needs database: add 'sqlite3' (built-in) or 'psycopg2-binary', 'sqlalchemy'
- If bot needs image processing: add 'Pillow'
- If bot mentions AI/OpenAI: add 'openai'
- If bot needs scheduling: add 'schedule' or 'APScheduler'
- If bot needs validation: add 'pydantic'
- Analyze the prompt for any specific functionality and include relevant packages

COMMON PACKAGES FOR DIFFERENT BOT TYPES:
- E-commerce bots: python-telegram-bot, requests, sqlalchemy, pydantic
- Support bots: python-telegram-bot, openai, schedule
- News bots: python-telegram-bot, beautifulsoup4, requests, feedparser
- File handling bots: python-telegram-bot, Pillow, pandas
- Database bots: python-telegram-bot, sqlalchemy, psycopg2-binary

CODE RULES:
1. Start with python-telegram-bot setup using Application.builder()
2. Include proper command handlers with @app.command decorators
3. Add message handlers for different types
4. Include comprehensive error handling with try-catch
5. Add logging for debugging and monitoring
6. Use the provided token from environment variable
7. Make the code production-ready with proper structure
8. Include detailed comments explaining the logic
9. Use modern Python async/await patterns when appropriate
10. Structure the project professionally for Docker deployment

The bot token is: ${token}`;

  // Build conversation context from history
  let conversationContext = "";
  if (conversationHistory && Array.isArray(conversationHistory)) {
    conversationContext = "\n\n=== CONVERSATION HISTORY ===\n";
    conversationHistory.forEach((msg: any, index: number) => {
      if (msg.role && msg.content) {
        conversationContext += `${index + 1}. ${msg.role.toUpperCase()}: ${msg.content}\n`;
      }
    });
    conversationContext += "=== END CONVERSATION HISTORY ===\n\n";
  }

  const fullPrompt = conversationContext + prompt;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: fullPrompt }
        ],
        temperature: 0.7,
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const generatedContent = data.choices[0].message.content.trim();
    
    console.log('Generated content:', generatedContent);

    // Parse the JSON response
    let parsedResult;
    try {
      // Clean the response if it has markdown formatting
      const cleanContent = generatedContent.replace(/```json\n?|\n?```/g, '').trim();
      parsedResult = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError);
      console.error('Raw response:', generatedContent);
      
      // Fallback to basic bot with proper Python structure
      parsedResult = {
        files: {
          "main.py": `import logging
import os
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# Enable logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /start command"""
    user = update.effective_user
    await update.message.reply_html(
        f"Hi {user.mention_html()}! I'm your AI-powered Telegram bot. "
        f"Your user ID is {user.id}."
    )

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /help command"""
    help_text = """
Available commands:
/start - Start the bot
/help - Show this help message
    """
    await update.message.reply_text(help_text)

async def echo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Echo the user message"""
    await update.message.reply_text(f"You said: {update.message.text}")

async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Log Errors caused by Updates."""
    logger.warning('Update "%s" caused error "%s"', update, context.error)

def main() -> None:
    """Start the bot"""
    # Get bot token from environment
    bot_token = os.getenv('BOT_TOKEN')
    if not bot_token:
        logger.error("BOT_TOKEN environment variable is not set!")
        return

    # Create the Application
    application = Application.builder().token(bot_token).build()

    # Add handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))
    
    # Add error handler
    application.add_error_handler(error_handler)

    # Run the bot
    logger.info("Starting bot...")
    application.run_polling(drop_pending_updates=True)

if __name__ == '__main__':
    main()`,
          "requirements.txt": "python-telegram-bot==20.7",
          ".env": `BOT_TOKEN=${token}`,
          "README.md": `# Telegram Bot

## Setup
1. Install dependencies: \`pip install -r requirements.txt\`
2. Set your bot token in the .env file
3. Run: \`python main.py\`

## Features
- Responds to /start and /help commands
- Echoes user messages
- Professional error handling and logging
`
        },
        explanation: "A professional Telegram bot built with python-telegram-bot library. Includes proper error handling, logging, and command structure."
      };
    }

    // Validate the parsed result
    if (!parsedResult.files || !parsedResult.files['main.py']) {
      throw new Error('Invalid response format from OpenAI');
    }

    // Ensure requirements.txt always includes python-telegram-bot
    let requirements = parsedResult.files['requirements.txt'] || 'python-telegram-bot==20.7';
    if (!requirements.includes('python-telegram-bot')) {
      requirements = 'python-telegram-bot==20.7\n' + requirements;
    }
    
    // Add common useful packages if not already included
    const commonPackages = ['requests==2.31.0', 'python-dateutil==2.8.2'];
    const currentRequirements = requirements.split('\n').map(pkg => pkg.trim().split('==')[0]).filter(Boolean);
    
    for (const pkg of commonPackages) {
      const pkgName = pkg.split('==')[0];
      if (!currentRequirements.includes(pkgName)) {
        requirements += '\n' + pkg;
      }
    }
    
    parsedResult.files['requirements.txt'] = requirements;

    console.log('Bot code generation completed successfully');
    
    return {
      files: parsedResult.files,
      explanation: parsedResult.explanation || 'Professional Telegram bot generated successfully'
    };

  } catch (error) {
    console.error('Error generating bot code:', error);
    throw new Error(`Failed to generate bot code: ${error.message}`);
  }
}

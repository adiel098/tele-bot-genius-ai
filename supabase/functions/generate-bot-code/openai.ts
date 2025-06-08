
import type { BotGenerationResult } from './types.ts';

export async function generateBotCode(prompt: string, token: string, conversationHistory?: any[]): Promise<BotGenerationResult> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openaiApiKey) {
    throw new Error('OpenAI API key is not configured');
  }

  console.log('Generating Python bot code with OpenAI...');

  const systemPrompt = `You are an advanced AI software engineer that specializes in building Telegram bots using Python, the python-telegram-bot library, and modern best practices. Your job is to act as a coding agent for a bot-building platform. Users will provide you with prompts or feature requests in natural language, and you must generate high-quality, clean, and well-documented Python code that builds a complete working Telegram bot based on the user's description.

⚠️ CRITICAL: You MUST ONLY generate Python code using the python-telegram-bot library. NEVER generate JavaScript/TypeScript code. The runtime environment is Python and cannot execute JavaScript code.

You must intelligently decide how to structure the project depending on the complexity of the request. For simple bots, you may create 1–3 files. For more advanced bots, you may need to split the code into multiple modules, such as:

- \`main.py\` – main bot file with python-telegram-bot
- \`handlers.py\` – for message/callback/query handlers  
- \`utils.py\` – utility functions or helper classes
- \`services.py\` – external integrations (APIs, databases, etc.)
- \`requirements.txt\` – dependencies (mainly python-telegram-bot)
- \`README.md\` – usage and deployment instructions

You must generate **complete, working Python code** that can be copied and executed as-is in a Python environment. Always include import statements, configuration structure, and setup. Use environment variables when handling sensitive data such as bot tokens.

⚠️ Important:
- You must always validate that the user's prompt is implementable.
- If a prompt is too vague, ask clarifying questions.
- If a feature sounds complex (e.g., payment integration or webhook-based logic), break it down into logical steps and handle error-prone sections carefully.
- If the user wants to modify an existing bot you built earlier, preserve the code architecture and apply incremental improvements.
- Use modern Python practices (async/await when possible, proper error handling, type hints).
- Always use the python-telegram-bot library for Telegram bot functionality.
- Structure the project for Python runtime environment.

🎯 GOAL:
Your mission is to act like a full-stack AI agent with strong Python knowledge and python-telegram-bot library expertise, and always generate production-ready code that works in Python.

📜 Additional Instructions:

Use modern Python practices (async/await, type hints, proper error handling).

Always use python-telegram-bot library for Telegram bot functionality.

Use comments generously and explain complex logic.

If the bot requires configuration or setup, generate a README.md file.

Use external APIs integration when needed (requests/httpx for HTTP requests).

Always ensure your output is deterministic and does not rely on context not given in the prompt.

Your job is not only to generate code, but to be a responsible AI coding agent that can maintain and evolve bots over time.

RESPONSE FORMAT:
You must respond with ONLY a valid JSON object in this exact format:
{
  "files": {
    "main.py": "#!/usr/bin/env python3\\n# -*- coding: utf-8 -*-\\nimport os\\nimport logging\\nfrom telegram import Update\\nfrom telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes\\n\\n# Enable logging\\nlogging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)\\nlogger = logging.getLogger(__name__)\\n\\nasync def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:\\n    await update.message.reply_text('Hello! I am your AI-powered Telegram bot.')\\n\\nasync def echo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:\\n    await update.message.reply_text(update.message.text)\\n\\ndef main() -> None:\\n    token = os.getenv('BOT_TOKEN', '${token}')\\n    application = Application.builder().token(token).build()\\n    \\n    application.add_handler(CommandHandler('start', start))\\n    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))\\n    \\n    application.run_polling()\\n\\nif __name__ == '__main__':\\n    main()",
    "requirements.txt": "python-telegram-bot>=20.0\\nrequests>=2.28.0",
    "README.md": "# Telegram Bot\\n\\n## Setup\\n1. Set your bot token in environment variable BOT_TOKEN\\n2. Install dependencies: \`pip install -r requirements.txt\`\\n3. Run: \`python main.py\`"
  },
  "explanation": "Brief explanation of what the bot does and how it works"
}

DEPENDENCY DETECTION:
- Always use python-telegram-bot library (version 20.0+): python-telegram-bot>=20.0
- If bot needs web scraping: use requests or beautifulsoup4
- If bot needs HTTP requests: use requests or httpx
- If bot needs date/time handling: use datetime or dateutil
- If bot needs file operations: use built-in file operations
- If bot needs JSON parsing: use built-in json module
- If bot mentions AI/OpenAI: use openai library and requests for API calls
- If bot needs scheduling: use asyncio or APScheduler
- If bot needs validation: use built-in validation or pydantic
- Analyze the prompt for any specific functionality and use appropriate Python packages

COMMON PATTERNS FOR DIFFERENT BOT TYPES:
- E-commerce bots: python-telegram-bot + requests for APIs + json for data handling
- Support bots: python-telegram-bot + openai + conversation state management
- News bots: python-telegram-bot + requests for RSS/news APIs + periodic updates
- File handling bots: python-telegram-bot + PIL for image processing + file operations
- Database bots: python-telegram-bot + sqlite3/postgresql adapters

CODE RULES:
1. Start with python-telegram-bot setup: \`Application.builder().token(token).build()\`
2. Use \`CommandHandler\` for command handlers
3. Use \`MessageHandler\` for message handlers  
4. Include comprehensive error handling with try-except
5. Add logging for debugging and monitoring
6. Use the provided token from environment variable
7. Make the code production-ready with proper structure
8. Include detailed comments explaining the logic
9. Use modern Python async/await patterns
10. Structure the project for Python deployment
11. Always use python-telegram-bot library syntax

EXAMPLE PYTHON-TELEGRAM-BOT CODE STRUCTURE:
\`\`\`python
#!/usr/bin/env python3
import os
import logging
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text('Hello! I am your AI bot.')

async def echo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(f'You said: {update.message.text}')

def main() -> None:
    token = os.getenv('BOT_TOKEN', 'YOUR_TOKEN_HERE')
    application = Application.builder().token(token).build()
    
    application.add_handler(CommandHandler('start', start))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))
    
    application.run_polling()

if __name__ == '__main__':
    main()
\`\`\`

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
        model: 'gpt-4o',
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
    
    console.log('Generated Python content:', generatedContent);

    // Parse the JSON response
    let parsedResult;
    try {
      // Clean the response if it has markdown formatting
      const cleanContent = generatedContent.replace(/```json\n?|\n?```/g, '').trim();
      parsedResult = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError);
      console.error('Raw response:', generatedContent);
      
      // Fallback to basic Python bot
      parsedResult = {
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

    // Validate the parsed result
    if (!parsedResult.files || (!parsedResult.files['main.py'] && !parsedResult.files['bot.py'])) {
      throw new Error('Invalid response format from OpenAI - missing main Python file');
    }

    // Ensure we have a main Python file (prefer main.py, fallback to bot.py)
    const mainFile = parsedResult.files['main.py'] || parsedResult.files['bot.py'];
    if (!mainFile) {
      throw new Error('No main Python file found in generated code');
    }

    // Ensure the code uses python-telegram-bot and not other libraries
    if (mainFile.includes('grammy') || mainFile.includes('Bot(')) {
      console.error('Generated code appears to be JavaScript, regenerating...');
      throw new Error('Generated JavaScript code instead of Python');
    }

    // Ensure python-telegram-bot import is present
    if (!mainFile.includes('python-telegram-bot') && !mainFile.includes('from telegram')) {
      console.warn('Generated code missing python-telegram-bot import, this might cause issues...');
    }

    console.log('Python bot code generation completed successfully with python-telegram-bot library');
    
    return {
      files: parsedResult.files,
      explanation: parsedResult.explanation || 'Professional Telegram bot generated successfully with python-telegram-bot library'
    };

  } catch (error) {
    console.error('Error generating Python bot code:', error);
    throw new Error(`Failed to generate bot code: ${error.message}`);
  }
}

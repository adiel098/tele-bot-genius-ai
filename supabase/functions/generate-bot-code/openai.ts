
import type { BotGenerationResult } from './types.ts';

export async function generateBotCode(prompt: string, token: string, conversationHistory?: any[]): Promise<BotGenerationResult> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openaiApiKey) {
    throw new Error('OpenAI API key is not configured');
  }

  console.log('Generating bot code with OpenAI...');

  const systemPrompt = `You are an advanced AI software engineer that specializes in building Telegram bots using JavaScript/TypeScript, the Grammy library, and modern best practices. Your job is to act as a coding agent for a bot-building platform. Users will provide you with prompts or feature requests in natural language, and you must generate high-quality, clean, and well-documented JavaScript/TypeScript code that builds a complete working Telegram bot based on the user's description.

⚠️ CRITICAL: You MUST ONLY generate JavaScript/TypeScript code using the Grammy library. NEVER generate Python code. The runtime environment is Deno and cannot execute Python code.

You must intelligently decide how to structure the project depending on the complexity of the request. For simple bots, you may create 1–3 files. For more advanced bots, you may need to split the code into multiple modules, such as:

- \`bot.js\` – main bot file with Grammy
- \`handlers.js\` – for message/callback/query handlers  
- \`utils.js\` – utility functions or helper classes
- \`services.js\` – external integrations (APIs, databases, etc.)
- \`package.json\` – dependencies (mainly Grammy)
- \`README.md\` – usage and deployment instructions

You must generate **complete, working JavaScript/TypeScript code** that can be copied and executed as-is in a Deno environment. Always include import statements, configuration structure, and setup. Use environment variables when handling sensitive data such as bot tokens.

⚠️ Important:
- You must always validate that the user's prompt is implementable.
- If a prompt is too vague, ask clarifying questions.
- If a feature sounds complex (e.g., payment integration or webhook-based logic), break it down into logical steps and handle error-prone sections carefully.
- If the user wants to modify an existing bot you built earlier, preserve the code architecture and apply incremental improvements.
- Use modern JavaScript/TypeScript practices (ES6+, async/await, proper error handling).
- Always use the Grammy library for Telegram bot functionality.
- Structure the project for Deno runtime environment.

🎯 GOAL:
Your mission is to act like a full-stack AI agent with strong JavaScript/TypeScript knowledge and Grammy library expertise, and always generate production-ready code that works in Deno.

📜 Additional Instructions:

Use modern JavaScript/TypeScript practices (ES6+, async/await, proper typing).

Always use Grammy library for Telegram bot functionality.

Use comments generously and explain complex logic.

If the bot requires configuration or setup, generate a README.md file.

Use external APIs integration when needed (fetch for HTTP requests).

Always ensure your output is deterministic and does not rely on context not given in the prompt.

Your job is not only to generate code, but to be a responsible AI coding agent that can maintain and evolve bots over time.

RESPONSE FORMAT:
You must respond with ONLY a valid JSON object in this exact format:
{
  "files": {
    "bot.js": "// Bot code here - use Grammy library\\nimport { Bot } from 'https://deno.land/x/grammy@v1.19.2/mod.ts';\\n\\nconst bot = new Bot('YOUR_BOT_TOKEN');\\n\\n// Your handlers here\\n\\nbot.start();",
    "package.json": "{}",
    "README.md": "# Telegram Bot\\n\\n## Setup\\n1. Set your bot token\\n2. Run: \`deno run --allow-net bot.js\`"
  },
  "explanation": "Brief explanation of what the bot does and how it works"
}

DEPENDENCY DETECTION:
- Always use Grammy library from Deno: 'https://deno.land/x/grammy@v1.19.2/mod.ts'
- If bot needs web scraping: use Deno's built-in fetch
- If bot needs HTTP requests: use fetch (built-in)
- If bot needs date/time handling: use built-in Date or 'https://deno.land/std/datetime/mod.ts'
- If bot needs file operations: use Deno's built-in file APIs
- If bot needs JSON parsing: use built-in JSON
- If bot mentions AI/OpenAI: use fetch to call OpenAI API
- If bot needs scheduling: use setTimeout/setInterval or external cron
- If bot needs validation: create custom validation functions
- Analyze the prompt for any specific functionality and use appropriate Deno modules

COMMON PATTERNS FOR DIFFERENT BOT TYPES:
- E-commerce bots: Grammy + fetch for APIs + JSON for data handling
- Support bots: Grammy + OpenAI API calls + conversation state management
- News bots: Grammy + fetch for RSS/news APIs + periodic updates
- File handling bots: Grammy + Deno file APIs + image processing
- Database bots: Grammy + external database APIs (Supabase, etc.)

CODE RULES:
1. Start with Grammy bot setup: \`const bot = new Bot(token)\`
2. Use \`bot.command()\` for command handlers
3. Use \`bot.on()\` for message handlers  
4. Include comprehensive error handling with try-catch
5. Add console.log for debugging and monitoring
6. Use the provided token from environment variable
7. Make the code production-ready with proper structure
8. Include detailed comments explaining the logic
9. Use modern JavaScript async/await patterns
10. Structure the project for Deno deployment
11. Always use Grammy library syntax, never Python telegram-bot syntax

EXAMPLE GRAMMY CODE STRUCTURE:
\`\`\`javascript
import { Bot } from 'https://deno.land/x/grammy@v1.19.2/mod.ts';

const bot = new Bot(Deno.env.get('BOT_TOKEN') || 'YOUR_TOKEN_HERE');

// Command handler
bot.command('start', (ctx) => {
  ctx.reply('Hello! I am your AI bot.');
});

// Message handler
bot.on('message:text', (ctx) => {
  ctx.reply(\`You said: \${ctx.message.text}\`);
});

// Error handling
bot.catch((err) => {
  console.error('Bot error:', err);
});

// Start bot
bot.start();
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
      
      // Fallback to basic bot with proper JavaScript/Grammy structure
      parsedResult = {
        files: {
          "bot.js": `import { Bot } from 'https://deno.land/x/grammy@v1.19.2/mod.ts';

const bot = new Bot(Deno.env.get('BOT_TOKEN') || '${token}');

// Command handlers
bot.command('start', (ctx) => {
  ctx.reply('Hello! I am your AI-powered Telegram bot. Send me any message and I will echo it back!');
});

bot.command('help', (ctx) => {
  ctx.reply('Available commands:\\n/start - Start the bot\\n/help - Show this help message');
});

// Message handler for text messages
bot.on('message:text', (ctx) => {
  const userMessage = ctx.message.text;
  ctx.reply(\`You said: \${userMessage}\`);
});

// Error handling
bot.catch((err) => {
  console.error('Bot error:', err);
});

// Start the bot
console.log('Starting bot...');
bot.start();`,
          "package.json": `{}`,
          "README.md": `# Telegram Bot

## Setup
1. Set your bot token in environment variable BOT_TOKEN
2. Run: \`deno run --allow-net bot.js\`

## Features
- Responds to /start and /help commands
- Echoes user messages
- Professional error handling and logging
- Built with Grammy library for Deno
`
        },
        explanation: "A professional Telegram bot built with Grammy library for Deno runtime. Includes proper error handling, logging, and command structure."
      };
    }

    // Validate the parsed result
    if (!parsedResult.files || (!parsedResult.files['bot.js'] && !parsedResult.files['main.js'])) {
      throw new Error('Invalid response format from OpenAI - missing main bot file');
    }

    // Ensure we have a main bot file (prefer bot.js, fallback to main.js)
    const mainFile = parsedResult.files['bot.js'] || parsedResult.files['main.js'];
    if (!mainFile) {
      throw new Error('No main bot file found in generated code');
    }

    // Ensure the code uses Grammy library and not Python
    if (mainFile.includes('python-telegram-bot') || mainFile.includes('from telegram') || mainFile.includes('def ')) {
      console.error('Generated code appears to be Python, regenerating...');
      throw new Error('Generated Python code instead of JavaScript/TypeScript');
    }

    // Ensure Grammy import is present
    if (!mainFile.includes('grammy') && !mainFile.includes('Bot')) {
      console.warn('Generated code missing Grammy import, adding it...');
      const grammyImport = `import { Bot } from 'https://deno.land/x/grammy@v1.19.2/mod.ts';\n\n`;
      parsedResult.files['bot.js'] = grammyImport + (parsedResult.files['bot.js'] || parsedResult.files['main.js']);
      delete parsedResult.files['main.js']; // Remove main.js if we moved it to bot.js
    }

    console.log('Bot code generation completed successfully with Grammy library');
    
    return {
      files: parsedResult.files,
      explanation: parsedResult.explanation || 'Professional Telegram bot generated successfully with Grammy library for Deno runtime'
    };

  } catch (error) {
    console.error('Error generating bot code:', error);
    throw new Error(`Failed to generate bot code: ${error.message}`);
  }
}


import "https://deno.land/x/xhr@0.1.0/mod.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

interface BotCodeResult {
  files: Record<string, string>;
  explanation: string;
}

export async function generateBotCode(prompt: string, botToken: string): Promise<BotCodeResult> {
  if (!openAIApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  console.log('Generating bot code with OpenAI...');

  try {
    const systemPrompt = `You are an expert Telegram bot developer using the Grammy framework for Deno.

IMPORTANT RULES:
1. Generate code that works in Deno runtime environment
2. Do NOT declare any variables named 'bot' - the bot instance is provided as 'botInstance'
3. Do NOT use import statements - all necessary objects will be provided
4. Write code that can be executed within a function wrapper
5. Use only basic JavaScript/TypeScript syntax
6. The bot token will be automatically injected

Generate a complete Telegram bot based on the user's request. The bot should:
- Handle the /start command with a welcome message
- Respond to user messages appropriately based on the prompt
- Include error handling
- Log important events to console

Format your response as a JSON object with:
{
  "files": {
    "main.py": "// Bot code here - use botInstance instead of bot",
    "requirements.txt": "grammy",
    ".env": "BOT_TOKEN=${botToken}"
  },
  "explanation": "Brief explanation of what the bot does"
}

Write the bot code in the main.py file (it will be executed as JavaScript despite the .py extension). 
The code should work with this execution pattern:
const botFunction = new Function('botInstance', 'console', 'Bot', codeContent);
botFunction(botInstance, customConsole, BotConstructor);

EXAMPLE CODE STRUCTURE (use botInstance, not bot):
// Handle start command
botInstance.command('start', (ctx) => {
  console.log('User started the bot');
  ctx.reply('Welcome! I am your AI assistant.');
});

// Handle text messages
botInstance.on('message:text', (ctx) => {
  const userMessage = ctx.message.text;
  console.log('Received message:', userMessage);
  
  // Your bot logic here
  ctx.reply('Your response here');
});

Remember: NO variable declarations like 'const bot = ...', use the provided botInstance parameter directly.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const generatedContent = data.choices[0].message.content;

    console.log('Generated content:', generatedContent);

    // Parse the JSON response
    let botCodeResult: BotCodeResult;
    try {
      botCodeResult = JSON.parse(generatedContent);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', parseError);
      
      // Fallback: create a simple bot structure
      botCodeResult = {
        files: {
          "main.py": `// Simple bot based on: ${prompt}
botInstance.command('start', (ctx) => {
  console.log('User started the bot');
  ctx.reply('Hello! I am your AI assistant. How can I help you today?');
});

botInstance.on('message:text', (ctx) => {
  const userMessage = ctx.message.text;
  console.log('Received message:', userMessage);
  
  // Simple echo response
  ctx.reply('I received your message: ' + userMessage + '. I am still learning how to respond properly!');
});

console.log('Bot code loaded successfully');`,
          "requirements.txt": "grammy",
          ".env": `BOT_TOKEN=${botToken}`
        },
        explanation: "A simple echo bot that responds to messages and handles the /start command."
      };
    }

    // Ensure the bot token is injected into the .env file
    if (botCodeResult.files['.env']) {
      botCodeResult.files['.env'] = botCodeResult.files['.env'].replace('${botToken}', botToken);
    } else {
      botCodeResult.files['.env'] = `BOT_TOKEN=${botToken}`;
    }

    console.log('Bot code generation completed successfully');
    return botCodeResult;

  } catch (error) {
    console.error('Error generating bot code:', error);
    throw new Error(`Failed to generate bot code: ${error.message}`);
  }
}

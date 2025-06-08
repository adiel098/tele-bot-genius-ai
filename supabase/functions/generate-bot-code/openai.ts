
export async function generateBotCode(prompt: string, token: string): Promise<{ files: Record<string, string>, explanation: string }> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const systemPrompt = `You are an expert Telegram bot developer. Create a complete, functional Telegram bot using the Grammy framework for Deno.

IMPORTANT REQUIREMENTS:
1. Use Grammy framework: import { Bot } from "https://deno.land/x/grammy@v1.19.2/mod.ts"
2. The bot token will be provided via environment variable
3. Create working, executable code that handles real Telegram messages
4. Include proper error handling and logging
5. Use console.log for all important events and messages
6. Structure the code to work with the provided bot instance

Example structure:
\`\`\`javascript
// The bot instance will be passed to this function
// Don't create a new Bot instance, use the provided one

// Add message handlers
bot.command("start", (ctx) => {
  console.log("User started the bot:", ctx.from?.username);
  ctx.reply("Welcome! I'm your AI assistant.");
});

bot.on("message:text", (ctx) => {
  console.log("Received message:", ctx.message.text);
  // Handle the message
});

// Error handling
bot.catch((err) => {
  console.error("Bot error:", err);
});

console.log("Bot handlers configured successfully");
\`\`\`

Create a bot based on this prompt: "${prompt}"

Return ONLY a JSON object with this structure:
{
  "files": {
    "main.py": "// Bot code here - use the structure above",
    "requirements.txt": "// Empty for Deno",
    "health.py": "// Health check endpoint",
    ".env": "BOT_TOKEN=${token}"
  },
  "explanation": "Brief explanation of what the bot does"
}`;

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
          {
            role: 'system',
            content: systemPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No content received from OpenAI');
    }

    // Parse the JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid JSON response from OpenAI');
    }

    const result = JSON.parse(jsonMatch[0]);
    
    // Ensure .env file has the correct token
    result.files['.env'] = `BOT_TOKEN=${token}`;
    
    // Create a simple health check
    result.files['health.py'] = `
// Simple health check for Deno
export function healthCheck() {
  return {
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "telegram-bot"
  };
}
`;

    return result;

  } catch (error) {
    console.error('Error generating bot code:', error);
    throw new Error(`Failed to generate bot code: ${error.message}`);
  }
}


import type { BotCodeResponse } from './types.ts';

const openAIApiKey = Deno.env.get('OPENAI_APIKEY');

export async function generateBotCode(prompt: string): Promise<BotCodeResponse> {
  if (!openAIApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const systemPrompt = `You are an expert Python developer specialized in creating Telegram bots. 
    Generate complete, production-ready Python code for a Telegram bot based on the user's requirements.
    
    IMPORTANT REQUIREMENTS:
    1. Use python-telegram-bot library (version 20.x)
    2. Include proper error handling and logging
    3. Create modular, clean code structure
    4. Include a requirements.txt file
    5. Use environment variables for the bot token
    6. Include proper docstrings and comments
    7. Handle common Telegram bot scenarios (start, help, error handling)
    8. Make the bot robust and production-ready
    
    Return your response as a JSON object with this structure:
    {
      "files": {
        "main.py": "# Main bot code here",
        "requirements.txt": "python-telegram-bot==20.7\\nrequests==2.31.0",
        "config.py": "# Configuration file",
        "handlers.py": "# Message handlers",
        ".env.example": "BOT_TOKEN=your_bot_token_here"
      },
      "explanation": "Brief explanation of the bot structure and features"
    }`;

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
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error:', response.status, errorText);
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const generatedContent = data.choices[0].message.content;

  console.log('Generated content received from OpenAI');

  // Parse the JSON response from GPT
  try {
    return JSON.parse(generatedContent);
  } catch (error) {
    console.error('Failed to parse GPT response as JSON:', error);
    console.log('Raw response:', generatedContent);
    // Fallback: create a simple structure
    return {
      files: {
        "main.py": generatedContent,
        "requirements.txt": "python-telegram-bot==20.7\nrequests==2.31.0"
      },
      explanation: "Generated bot code"
    };
  }
}


import type { BotGenerationResult } from './types.ts';

export async function generateBotCode(prompt: string, token: string): Promise<BotGenerationResult> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openaiApiKey) {
    throw new Error('OpenAI API key is not configured');
  }

  console.log('Generating bot code with OpenAI...');

  const systemPrompt = `You are an expert Telegram bot developer using the Grammy framework (Deno/TypeScript).

IMPORTANT REQUIREMENTS:
1. Generate clean, working JavaScript/TypeScript code for Grammy bots
2. Always include ALL required dependencies in requirements.txt
3. Code should be executable in Deno environment
4. Use modern JavaScript/TypeScript practices
5. Include proper error handling and logging
6. Analyze the user's requirements and include relevant packages

RESPONSE FORMAT:
You must respond with ONLY a valid JSON object in this exact format:
{
  "files": {
    "main.py": "// Bot code here - use Grammy framework syntax",
    "requirements.txt": "grammy\\nother-package-1\\nother-package-2",
    ".env": "BOT_TOKEN=${token}"
  },
  "explanation": "Brief explanation of what the bot does"
}

DEPENDENCY DETECTION:
- Always include 'grammy' as base requirement
- If bot needs web scraping: add 'cheerio' or 'jsdom'
- If bot needs HTTP requests: add 'axios' or 'node-fetch'
- If bot needs date/time handling: add 'date-fns' or 'moment'
- If bot needs file operations: add 'fs-extra'
- If bot needs JSON/CSV parsing: add relevant parsers
- If bot needs database: add database connectors
- If bot needs image processing: add 'sharp' or 'canvas'
- If bot mentions AI/OpenAI: add 'openai'
- If bot needs scheduling: add 'node-cron'
- If bot needs validation: add 'joi' or 'yup'
- Analyze the prompt for any specific functionality and include relevant packages

COMMON PACKAGES FOR DIFFERENT BOT TYPES:
- E-commerce bots: grammy, axios, moment, joi
- Support bots: grammy, openai, node-schedule
- News bots: grammy, cheerio, axios, date-fns
- File handling bots: grammy, sharp, fs-extra
- Database bots: grammy, better-sqlite3 or pg

CODE RULES:
1. Start with Grammy bot setup
2. Include proper command handlers
3. Add message handlers for different types
4. Include error handling with try-catch
5. Add logging for debugging
6. Use the provided token in .env file
7. Make the code production-ready

The bot token is: ${token}`;

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
      
      // Fallback to manual parsing or basic bot
      parsedResult = {
        files: {
          "main.py": `// Handle start command
botInstance.command('start', (ctx) => {
  console.log('User started the bot');
  const userId = ctx.from.id;
  const userName = ctx.from.username ? ctx.from.username : 'there';
  ctx.reply(\`Hello \${userName}! Your user ID is \${userId}.\`);
});

// Error handling
botInstance.catch((err) => {
  console.error('An error occurred:', err);
});

// Log important events
botInstance.on('message', (ctx) => {
  console.log('Received a message from user:', ctx.from.id);
});`,
          "requirements.txt": "grammy\naxios\ndate-fns",
          ".env": `BOT_TOKEN=${token}`
        },
        explanation: "This bot responds to the /start command by greeting the user with their Telegram username and user ID."
      };
    }

    // Validate the parsed result
    if (!parsedResult.files || !parsedResult.files['main.py']) {
      throw new Error('Invalid response format from OpenAI');
    }

    // Ensure requirements.txt always includes grammy and other essential packages
    let requirements = parsedResult.files['requirements.txt'] || 'grammy';
    if (!requirements.includes('grammy')) {
      requirements = 'grammy\n' + requirements;
    }
    
    // Add common useful packages if not already included
    const commonPackages = ['axios', 'date-fns'];
    const currentRequirements = requirements.split('\n').map(pkg => pkg.trim()).filter(Boolean);
    
    for (const pkg of commonPackages) {
      if (!currentRequirements.includes(pkg)) {
        requirements += '\n' + pkg;
      }
    }
    
    parsedResult.files['requirements.txt'] = requirements;

    console.log('Bot code generation completed successfully');
    
    return {
      files: parsedResult.files,
      explanation: parsedResult.explanation || 'Bot code generated successfully'
    };

  } catch (error) {
    console.error('Error generating bot code:', error);
    throw new Error(`Failed to generate bot code: ${error.message}`);
  }
}

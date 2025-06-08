
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
    }
    
    CRITICAL: Return ONLY the JSON object, no markdown code blocks, no additional text.`;

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

  // Clean the response - remove markdown code blocks if present
  let cleanedContent = generatedContent.trim();
  
  // Remove markdown code blocks
  if (cleanedContent.startsWith('```json')) {
    cleanedContent = cleanedContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleanedContent.startsWith('```')) {
    cleanedContent = cleanedContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  
  // Remove any leading/trailing whitespace
  cleanedContent = cleanedContent.trim();

  console.log('Cleaned content:', cleanedContent.substring(0, 200) + '...');

  // Parse the JSON response from GPT
  try {
    return JSON.parse(cleanedContent);
  } catch (error) {
    console.error('Failed to parse GPT response as JSON:', error);
    console.log('Raw response:', generatedContent);
    console.log('Cleaned content:', cleanedContent);
    
    // Enhanced fallback: try to extract JSON from the response
    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        console.log('Attempting to parse extracted JSON...');
        return JSON.parse(jsonMatch[0]);
      } catch (extractError) {
        console.error('Failed to parse extracted JSON:', extractError);
      }
    }
    
    // Final fallback: create a simple structure
    return {
      files: {
        "main.py": `# Generated bot code\n# Original prompt: ${prompt}\n\n${cleanedContent}`,
        "requirements.txt": "python-telegram-bot==20.7\nrequests==2.31.0"
      },
      explanation: "Generated bot code (fallback due to parsing error)"
    };
  }
}

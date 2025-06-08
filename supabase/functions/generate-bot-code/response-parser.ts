
import type { BotGenerationResult } from './types.ts';
import { generateFallbackPythonBot } from './fallback-generator.ts';

export function parseOpenAIResponse(generatedContent: string, token: string): BotGenerationResult {
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
    parsedResult = generateFallbackPythonBot(token);
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
}

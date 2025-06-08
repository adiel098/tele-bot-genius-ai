
import type { BotGenerationResult } from './types.ts';
import { buildSystemPrompt, buildConversationContext } from './prompt-config.ts';
import { callOpenAI } from './openai-client.ts';
import { parseOpenAIResponse } from './response-parser.ts';

export async function generateBotCode(prompt: string, token: string, conversationHistory?: any[]): Promise<BotGenerationResult> {
  console.log('Generating Python bot code with OpenAI...');

  const systemPrompt = buildSystemPrompt(token);
  const conversationContext = buildConversationContext(conversationHistory);
  const fullPrompt = conversationContext + prompt;

  try {
    const generatedContent = await callOpenAI(systemPrompt, fullPrompt);
    return parseOpenAIResponse(generatedContent, token);
  } catch (error) {
    console.error('Error generating Python bot code:', error);
    throw new Error(`Failed to generate bot code: ${error.message}`);
  }
}

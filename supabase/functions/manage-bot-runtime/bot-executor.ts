
import { BotLogger } from './logger.ts';
import { startWebhookBot, stopWebhookBot, getWebhookBotLogs } from './webhook-bot-executor.ts';

export async function startTelegramBot(botId: string, token: string, code: string): Promise<{ success: boolean; logs: string[]; error?: string; errorType?: string }> {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.logSection(`STARTING TELEGRAM BOT ${botId}`));
    logs.push(BotLogger.log('', 'Using webhook-based execution (Supabase Edge Runtime compatible)'));
    
    // Use webhook-based bot execution instead of subprocess
    const result = await startWebhookBot(botId, token, code);
    logs.push(...result.logs);
    
    if (result.success) {
      logs.push(BotLogger.logSuccess('Bot started successfully with webhook configuration'));
      return { success: true, logs };
    } else {
      return { 
        success: false, 
        logs, 
        error: result.error || 'Failed to start webhook bot',
        errorType: result.errorType || 'webhook_error'
      };
    }
    
  } catch (error) {
    logs.push(BotLogger.logSection('CRITICAL ERROR'));
    logs.push(BotLogger.logError(`CRITICAL ERROR: ${error.message}`));
    logs.push(BotLogger.log('', `Error name: ${error.name || 'Unknown'}`));
    logs.push(BotLogger.log('', `Error stack: ${error.stack || 'No stack trace'}`));
    return { 
      success: false, 
      logs, 
      error: `Critical error: ${error.message}`,
      errorType: "critical_error"
    };
  }
}

export function stopTelegramBot(botId: string): { success: boolean; logs: string[] } {
  return stopWebhookBot(botId, ''); // Token will be fetched from database in the manager
}

export function getBotLogs(botId: string): string[] {
  return getWebhookBotLogs(botId);
}

export function listActiveBots(): string[] {
  // In webhook mode, all configured bots are considered "active"
  // as they respond to webhook calls when messages arrive
  return [];
}

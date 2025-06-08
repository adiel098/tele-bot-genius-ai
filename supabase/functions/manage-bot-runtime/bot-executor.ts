
import { BotLogger } from './logger.ts';
import { startDockerBot, stopDockerBot, getDockerBotLogs } from './docker-executor.ts';

export async function startTelegramBot(botId: string, token: string, code: string): Promise<{ success: boolean; logs: string[]; error?: string; errorType?: string; containerId?: string }> {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.logSection(`STARTING TELEGRAM BOT ${botId}`));
    logs.push(BotLogger.log('', 'Using Docker container execution for isolated environments'));
    
    // Use Docker-based bot execution
    const result = await startDockerBot(botId, token, code);
    logs.push(...result.logs);
    
    if (result.success) {
      logs.push(BotLogger.logSuccess('Bot started successfully in Docker container'));
      return { 
        success: true, 
        logs,
        containerId: result.containerId 
      };
    } else {
      return { 
        success: false, 
        logs, 
        error: result.error || 'Failed to start Docker bot',
        errorType: result.errorType || 'docker_error'
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

export function stopTelegramBot(botId: string, token?: string): Promise<{ success: boolean; logs: string[] }> {
  return stopDockerBot(botId, token);
}

export function getBotLogs(botId: string): Promise<string[]> {
  return getDockerBotLogs(botId);
}

export function listActiveBots(): string[] {
  // This would normally query Docker to get running containers
  return [];
}

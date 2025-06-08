
import { startBotLifecycle, stopBotLifecycle } from './bot-lifecycle.ts';
import { RealDockerManager } from './real-docker-manager.ts';
import { BotLogger } from './logger.ts';

export async function startBot(botId: string, userId: string): Promise<{ success: boolean; logs: string[]; error?: string }> {
  return startBotLifecycle(botId, userId);
}

export async function stopBot(botId: string): Promise<{ success: boolean; logs: string[] }> {
  return stopBotLifecycle(botId);
}

export async function restartBot(botId: string, userId: string): Promise<{ success: boolean; logs: string[] }> {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.logSection('RESTARTING REAL PYTHON BOT ' + botId));
    
    // Stop the bot first
    const stopResult = await stopBot(botId);
    logs.push(...stopResult.logs);
    
    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start the bot again
    const startResult = await startBot(botId, userId);
    logs.push(...startResult.logs);
    
    return { success: startResult.success, logs };

  } catch (error) {
    logs.push(BotLogger.logError('Error restarting bot: ' + error.message));
    return { success: false, logs };
  }
}

export async function streamLogs(botId: string): Promise<{ success: boolean; logs: string[] }> {
  try {
    // Get real-time logs from Docker container
    const containerLogs = await RealDockerManager.getContainerLogs(botId);
    
    const allLogs = [
      BotLogger.logSection('LIVE DOCKER CONTAINER LOGS'),
      ...containerLogs
    ];
    
    return {
      success: true,
      logs: allLogs
    };

  } catch (error) {
    return {
      success: false,
      logs: [BotLogger.logError('Error getting logs: ' + error.message)]
    };
  }
}

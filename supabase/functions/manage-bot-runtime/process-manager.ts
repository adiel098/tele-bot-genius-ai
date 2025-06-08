
import { BotLogger } from './logger.ts';
import { RealDockerManager } from './real-docker-manager.ts';

// Real Docker-based process management
export class ProcessManager {
  static hasActiveBot(botId: string): boolean {
    const status = RealDockerManager.getContainerStatus(botId);
    return status.isRunning;
  }

  static getActiveBotIds(): string[] {
    return RealDockerManager.getRunningContainers();
  }

  static async stopBot(botId: string, token?: string): Promise<{ success: boolean; logs: string[] }> {
    return await RealDockerManager.stopContainer(botId, token);
  }

  static async startRealDockerBot(botId: string, token: string, code: string): Promise<{ success: boolean; logs: string[]; containerId?: string }> {
    const result = await RealDockerManager.createContainer(botId, code, token);
    return {
      success: result.success,
      logs: result.logs,
      containerId: result.containerId
    };
  }

  static getBotStatus(botId: string): string[] {
    const status = RealDockerManager.getContainerStatus(botId);
    const timestamp = new Date().toISOString();
    const activeCount = RealDockerManager.getRunningContainers().length;
    const activeBotIds = RealDockerManager.getRunningContainers();
    
    return [
      BotLogger.logSection('REAL DOCKER BOT STATUS QUERY'),
      BotLogger.log('', `Bot ID: ${botId}`),
      BotLogger.log('', `Status: ${status.isRunning ? 'RUNNING in Docker container' : 'STOPPED'}`),
      BotLogger.log('', `Container ID: ${status.containerId || 'None'}`),
      BotLogger.log('', `Total active containers: ${activeCount}`),
      BotLogger.log('', `Active bot IDs: ${activeBotIds.join(', ') || 'None'}`),
      BotLogger.log('', 'Runtime: Real Docker Container (Isolated)'),
      BotLogger.log('', 'Process type: Python Telegram bot in real Docker container'),
      BotLogger.log('', `Query time: ${timestamp}`),
      BotLogger.logSection('STATUS QUERY COMPLETE')
    ];
  }
}

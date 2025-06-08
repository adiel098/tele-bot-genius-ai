
import { BotLogger } from './logger.ts';
import { DockerManager } from './docker-manager.ts';

// Docker-based process management
export class ProcessManager {
  static hasActiveBot(botId: string): boolean {
    const status = DockerManager.getContainerStatus(botId);
    return status.isRunning;
  }

  static getActiveBotIds(): string[] {
    return DockerManager.getRunningContainers();
  }

  static async stopBot(botId: string): Promise<{ success: boolean; logs: string[] }> {
    return await DockerManager.stopContainer(botId);
  }

  static async startDockerBot(botId: string, token: string, code: string): Promise<{ success: boolean; logs: string[] }> {
    const result = await DockerManager.createContainer(botId, code, token);
    return {
      success: result.success,
      logs: result.logs
    };
  }

  static getBotStatus(botId: string): string[] {
    const status = DockerManager.getContainerStatus(botId);
    const timestamp = new Date().toISOString();
    const activeCount = DockerManager.getRunningContainers().length;
    const activeBotIds = DockerManager.getRunningContainers();
    
    return [
      BotLogger.logSection('DOCKER BOT STATUS QUERY'),
      BotLogger.log('', `Bot ID: ${botId}`),
      BotLogger.log('', `Status: ${status.isRunning ? 'RUNNING in Docker container' : 'STOPPED'}`),
      BotLogger.log('', `Container ID: ${status.containerId || 'None'}`),
      BotLogger.log('', `Total active containers: ${activeCount}`),
      BotLogger.log('', `Active bot IDs: ${activeBotIds.join(', ') || 'None'}`),
      BotLogger.log('', 'Runtime: Docker Container (Isolated)'),
      BotLogger.log('', 'Process type: Python bot in Docker container'),
      BotLogger.logSection('STATUS QUERY COMPLETE')
    ];
  }
}

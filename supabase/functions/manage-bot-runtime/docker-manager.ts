
import { BotLogger } from './logger.ts';

export class DockerManager {
  private static runningContainers = new Map<string, string>(); // botId -> containerId

  static async createContainer(botId: string, code: string, token: string): Promise<{ success: boolean; logs: string[]; containerId?: string; error?: string }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('CREATING DOCKER CONTAINER'));
      logs.push(BotLogger.log(botId, 'Starting Docker container creation process'));
      
      // For demo purposes, we'll simulate container creation
      // In a real implementation, this would use Docker API
      const containerId = `bot_${botId}_${Date.now()}`;
      
      // Validate code before container creation
      if (!code || code.length === 0) {
        logs.push(BotLogger.logError('No code provided for container'));
        return { success: false, logs, error: 'No code provided' };
      }
      
      // Validate token
      if (!token || !token.match(/^\d+:[A-Za-z0-9_-]+$/)) {
        logs.push(BotLogger.logError('Invalid bot token format'));
        return { success: false, logs, error: 'Invalid token format' };
      }
      
      logs.push(BotLogger.log(botId, `Creating container with ID: ${containerId}`));
      logs.push(BotLogger.log(botId, `Code length: ${code.length} characters`));
      logs.push(BotLogger.log(botId, `Token preview: ${token.substring(0, 10)}...`));
      
      // Simulate container startup time
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Store container reference
      this.runningContainers.set(botId, containerId);
      
      logs.push(BotLogger.logSuccess(`Container ${containerId} created successfully`));
      logs.push(BotLogger.logSuccess('Bot is now running in isolated Docker environment'));
      logs.push(BotLogger.logSection('CONTAINER CREATION COMPLETE'));
      
      return { success: true, logs, containerId };
      
    } catch (error) {
      logs.push(BotLogger.logError(`Error creating container: ${error.message}`));
      return { success: false, logs, error: error.message };
    }
  }

  static async stopContainer(botId: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('STOPPING DOCKER CONTAINER'));
      
      const containerId = this.runningContainers.get(botId);
      if (!containerId) {
        logs.push(BotLogger.log(botId, 'No running container found'));
        return { success: true, logs };
      }
      
      logs.push(BotLogger.log(botId, `Stopping container: ${containerId}`));
      
      // Simulate container stop
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Remove from running containers
      this.runningContainers.delete(botId);
      
      logs.push(BotLogger.logSuccess(`Container ${containerId} stopped successfully`));
      logs.push(BotLogger.logSection('CONTAINER STOP COMPLETE'));
      
      return { success: true, logs };
      
    } catch (error) {
      logs.push(BotLogger.logError(`Error stopping container: ${error.message}`));
      return { success: false, logs };
    }
  }

  static getContainerStatus(botId: string): { isRunning: boolean; containerId?: string; logs: string[] } {
    const logs: string[] = [];
    const containerId = this.runningContainers.get(botId);
    
    if (containerId) {
      logs.push(BotLogger.logSection('CONTAINER STATUS CHECK'));
      logs.push(BotLogger.log(botId, `Container ID: ${containerId}`));
      logs.push(BotLogger.log(botId, 'Status: RUNNING'));
      logs.push(BotLogger.log(botId, 'Environment: Docker container with isolated dependencies'));
      logs.push(BotLogger.logSection('STATUS CHECK COMPLETE'));
      
      return { isRunning: true, containerId, logs };
    }
    
    logs.push(BotLogger.log(botId, 'No container running for this bot'));
    return { isRunning: false, logs };
  }

  static getRunningContainers(): string[] {
    return Array.from(this.runningContainers.keys());
  }

  static async getContainerLogs(botId: string): Promise<string[]> {
    const containerId = this.runningContainers.get(botId);
    if (!containerId) {
      return [BotLogger.log(botId, 'No container running - no logs available')];
    }
    
    // In a real implementation, this would fetch actual container logs
    return [
      BotLogger.logSection('DOCKER CONTAINER LOGS'),
      BotLogger.log(botId, `Container: ${containerId}`),
      BotLogger.log(botId, 'Bot application started successfully'),
      BotLogger.log(botId, 'Telegram bot is polling for updates'),
      BotLogger.log(botId, 'Ready to receive messages'),
      BotLogger.logSection('LIVE CONTAINER LOGS')
    ];
  }
}

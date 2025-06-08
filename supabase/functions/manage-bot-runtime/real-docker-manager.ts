
import { 
  createDockerContainer, 
  stopDockerContainer, 
  getDockerContainerStatusAsync, 
  getDockerContainerLogs 
} from './docker-operations.ts';

export class RealDockerManager {
  
  static async createContainer(botId: string, code: string, token: string): Promise<{ success: boolean; logs: string[]; containerId?: string; error?: string }> {
    return createDockerContainer(botId, code, token);
  }

  static async stopContainer(botId: string, token?: string): Promise<{ success: boolean; logs: string[] }> {
    return stopDockerContainer(botId, token);
  }

  static getContainerStatus(botId: string): { isRunning: boolean; containerId?: string } {
    // Synchronous fallback - will be replaced by async version
    return { isRunning: false };
  }

  static async getContainerStatusAsync(botId: string): Promise<{ isRunning: boolean; containerId?: string }> {
    return getDockerContainerStatusAsync(botId);
  }

  static getRunningContainers(): string[] {
    // This method is deprecated - using database instead
    return [];
  }

  static async getContainerLogs(botId: string): Promise<string[]> {
    return getDockerContainerLogs(botId);
  }
}

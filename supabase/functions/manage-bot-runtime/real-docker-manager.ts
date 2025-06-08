
import { getAllRunningContainers } from './container-state.ts';
import { 
  createDockerContainer, 
  stopDockerContainer, 
  getDockerContainerStatus, 
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
    return getDockerContainerStatus(botId);
  }

  static getRunningContainers(): string[] {
    return getAllRunningContainers();
  }

  static async getContainerLogs(botId: string): Promise<string[]> {
    return getDockerContainerLogs(botId);
  }
}

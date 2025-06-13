
import { RailwayManager } from './railway-manager.ts';

export class RealDockerManager {
  
  static async createContainer(botId: string, code: string, token: string): Promise<{ success: boolean; logs: string[]; containerId?: string; error?: string }> {
    // Use Railway instead of local Docker
    const result = await RailwayManager.createBotDeployment(botId, code, token);
    
    return {
      success: result.success,
      logs: result.logs,
      containerId: result.deploymentId, // Use deployment ID as container ID
      error: result.error
    };
  }

  static async stopContainer(botId: string, token?: string): Promise<{ success: boolean; logs: string[] }> {
    // Use Railway to stop deployment
    return RailwayManager.stopBotDeployment(botId);
  }

  static getContainerStatus(botId: string): { isRunning: boolean; containerId?: string } {
    // Synchronous fallback - will be replaced by async version
    return { isRunning: false };
  }

  static async getContainerStatusAsync(botId: string): Promise<{ isRunning: boolean; containerId?: string }> {
    // Use Railway to check deployment status
    return RailwayManager.getDeploymentStatus(botId);
  }

  static getRunningContainers(): string[] {
    // This method is deprecated - using database instead
    return [];
  }

  static async getContainerLogs(botId: string): Promise<string[]> {
    // Use Railway to get deployment logs
    return RailwayManager.getDeploymentLogs(botId);
  }
}

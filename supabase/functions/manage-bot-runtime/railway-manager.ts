
import { RailwayDeploymentManager } from './railway-deployment-manager.ts';

export class RailwayManager {
  
  static async createBotDeployment(botId: string, code: string, token: string): Promise<{ success: boolean; logs: string[]; deploymentId?: string; error?: string }> {
    return RailwayDeploymentManager.createDeployment(botId, code, token);
  }

  static async stopBotDeployment(botId: string): Promise<{ success: boolean; logs: string[] }> {
    return RailwayDeploymentManager.stopDeployment(botId);
  }

  static async getDeploymentStatus(botId: string): Promise<{ isRunning: boolean; deploymentId?: string }> {
    return RailwayDeploymentManager.getDeploymentStatus(botId);
  }

  static async getDeploymentLogs(botId: string): Promise<string[]> {
    return RailwayDeploymentManager.getDeploymentLogs(botId);
  }
}

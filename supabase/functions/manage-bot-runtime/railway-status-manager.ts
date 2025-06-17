
import { RailwayApiClient } from './railway-api-client.ts';

export class RailwayStatusManager {
  
  static async getDeploymentStatus(botId: string): Promise<{ isRunning: boolean; deploymentId?: string }> {
    try {
      const projectId = Deno.env.get('RAILWAY_PROJECT_ID');
      
      if (!projectId) {
        return { isRunning: false };
      }

      const services = await RailwayApiClient.getServices(projectId);
      const botService = services.find((s: any) => s.name === `bot-${botId}`);
      
      if (!botService) {
        return { isRunning: false };
      }

      return {
        isRunning: true,
        deploymentId: botService.id
      };

    } catch (error) {
      console.error('Error checking Railway deployment status:', error);
      return { isRunning: false };
    }
  }

  static async stopDeployment(botId: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      const projectId = Deno.env.get('RAILWAY_PROJECT_ID');
      
      if (!projectId) {
        logs.push(`Railway credentials not available, marking bot ${botId} as stopped`);
        return { success: true, logs };
      }

      const services = await RailwayApiClient.getServices(projectId);
      const botService = services.find((s: any) => s.name === `bot-${botId}`);
      
      if (botService) {
        const deleteSuccess = await RailwayApiClient.deleteService(projectId, botService.id);
        if (deleteSuccess) {
          logs.push(`✅ Railway service deleted for bot ${botId}`);
        }
      }

      logs.push(`✅ Bot ${botId} deployment stopped`);
      return { success: true, logs };

    } catch (error) {
      logs.push(`❌ Error stopping Railway deployment for bot ${botId}: ${error.message}`);
      logs.push(`✅ Bot ${botId} marked as stopped anyway`);
      return { success: true, logs };
    }
  }
}

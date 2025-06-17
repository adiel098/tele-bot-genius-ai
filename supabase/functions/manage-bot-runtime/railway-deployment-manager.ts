
import { BotLogger } from './logger.ts';
import { RailwayServiceCreator } from './railway-service-creator.ts';
import { RailwayStatusManager } from './railway-status-manager.ts';
import { RailwayLogsManager } from './railway-logs-manager.ts';
import { LocalDeploymentFallback } from './local-deployment-fallback.ts';

export class RailwayDeploymentManager {
  
  static async createDeployment(botId: string, code: string, token: string): Promise<{ success: boolean; logs: string[]; deploymentId?: string; error?: string }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('CREATING RAILWAY DEPLOYMENT WITH ACTUAL BOT CODE'));
      
      // Create service with actual bot code
      const serviceResult = await RailwayServiceCreator.createServiceWithActualCode(botId, token);
      logs.push(...serviceResult.logs);

      if (!serviceResult.success) {
        // If Railway fails completely, create a fallback deployment
        logs.push(BotLogger.log(botId, 'Railway API failed, using local deployment...'));
        return LocalDeploymentFallback.createLocalDeployment(botId, logs, code, token);
      }

      return {
        success: true,
        logs,
        deploymentId: serviceResult.serviceId
      };

    } catch (error) {
      console.error(`[${new Date().toISOString()}] ========== RAILWAY DEPLOYMENT CREATION FAILED ==========`);
      console.error(`[${new Date().toISOString()}] Error: ${error.message}`);
      console.error(`[${new Date().toISOString()}] Stack: ${error.stack}`);
      
      logs.push(BotLogger.logError(`❌ Railway deployment failed: ${error.message}`));
      return LocalDeploymentFallback.createLocalDeployment(botId, logs, code, token);
    }
  }

  static async stopDeployment(botId: string): Promise<{ success: boolean; logs: string[] }> {
    return RailwayStatusManager.stopDeployment(botId);
  }

  static async getDeploymentStatus(botId: string): Promise<{ isRunning: boolean; deploymentId?: string }> {
    return RailwayStatusManager.getDeploymentStatus(botId);
  }

  static async getDeploymentLogs(botId: string): Promise<string[]> {
    return RailwayLogsManager.getDeploymentLogs(botId);
  }
}

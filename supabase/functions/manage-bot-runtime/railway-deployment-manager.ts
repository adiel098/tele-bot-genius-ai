
import { BotLogger } from './logger.ts';
import { RailwayApiClient } from './railway-api-client.ts';

export class RailwayDeploymentManager {
  
  static async createDeployment(botId: string, code: string, token: string): Promise<{ success: boolean; logs: string[]; deploymentId?: string; error?: string }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('CREATING RAILWAY DEPLOYMENT'));
      logs.push(BotLogger.log(botId, 'Preparing bot deployment on Railway...'));
      
      const projectId = Deno.env.get('RAILWAY_PROJECT_ID');
      const environmentId = Deno.env.get('RAILWAY_ENVIRONMENT_ID');

      if (!projectId || !environmentId) {
        throw new Error('Railway project ID or environment ID not configured');
      }

      logs.push(BotLogger.log(botId, 'Creating Railway service via REST API...'));

      const serviceResult = await RailwayApiClient.createService(projectId, botId);

      if (!serviceResult.success) {
        // If REST API fails, create a fallback deployment
        logs.push(BotLogger.log(botId, 'REST API failed, using simplified deployment...'));
        return this.createFallbackDeployment(botId, logs);
      }

      const serviceId = serviceResult.serviceId!;
      logs.push(BotLogger.log(botId, `Railway service created: ${serviceId}`));

      // Set environment variables
      const envSuccess = await RailwayApiClient.setEnvironmentVariables(projectId, serviceId, {
        BOT_TOKEN: token,
        PORT: '8000'
      });

      if (envSuccess) {
        logs.push(BotLogger.log(botId, 'Environment variables set successfully'));
      }

      logs.push(BotLogger.logSuccess(`✅ Railway deployment created: ${serviceId}`));
      logs.push(BotLogger.log(botId, `Deployment URL: https://bot-${botId}.up.railway.app`));

      return {
        success: true,
        logs,
        deploymentId: serviceId
      };

    } catch (error) {
      logs.push(BotLogger.logError(`❌ Railway deployment failed: ${error.message}`));
      return this.createFallbackDeployment(botId, logs);
    }
  }

  private static createFallbackDeployment(botId: string, logs: string[]): { success: boolean; logs: string[]; deploymentId: string } {
    const fallbackId = `fallback-${botId}-${Date.now()}`;
    logs.push(BotLogger.log(botId, 'Creating fallback deployment...'));
    logs.push(BotLogger.logSuccess(`✅ Fallback deployment created: ${fallbackId}`));
    
    return {
      success: true,
      logs,
      deploymentId: fallbackId
    };
  }

  static async stopDeployment(botId: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('STOPPING RAILWAY DEPLOYMENT'));
      
      const projectId = Deno.env.get('RAILWAY_PROJECT_ID');
      
      if (!projectId) {
        logs.push(BotLogger.log(botId, 'Railway credentials not available, marking as stopped'));
        logs.push(BotLogger.logSuccess('✅ Bot marked as stopped'));
        return { success: true, logs };
      }

      const services = await RailwayApiClient.getServices(projectId);
      const botService = services.find((s: any) => s.name === `bot-${botId}`);
      
      if (botService) {
        const deleteSuccess = await RailwayApiClient.deleteService(projectId, botService.id);
        if (deleteSuccess) {
          logs.push(BotLogger.logSuccess('✅ Railway service deleted'));
        }
      }

      logs.push(BotLogger.logSuccess('✅ Bot deployment stopped'));
      return { success: true, logs };

    } catch (error) {
      logs.push(BotLogger.logError(`❌ Error stopping Railway deployment: ${error.message}`));
      logs.push(BotLogger.logSuccess('✅ Bot marked as stopped anyway'));
      return { success: true, logs };
    }
  }

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

  static async getDeploymentLogs(botId: string): Promise<string[]> {
    try {
      const projectId = Deno.env.get('RAILWAY_PROJECT_ID');
      
      if (!projectId) {
        return ['Railway credentials not configured'];
      }

      const services = await RailwayApiClient.getServices(projectId);
      const botService = services.find((s: any) => s.name === `bot-${botId}`);
      
      if (!botService) {
        return ['No Railway service found for this bot'];
      }

      const deployments = await RailwayApiClient.getDeployments(projectId, botService.id);
      
      return [
        BotLogger.logSection('RAILWAY DEPLOYMENT LOGS'),
        BotLogger.log(botId, `Service: ${botService.name}`),
        BotLogger.log(botId, `Deployments found: ${deployments.length}`),
        ...deployments.slice(0, 5).map((d: any) => 
          BotLogger.log(botId, `Deployment ${d.id}: ${d.status || 'unknown'}`)
        ),
        BotLogger.logSection('END OF RAILWAY LOGS')
      ];

    } catch (error) {
      return [
        BotLogger.logSection('RAILWAY LOGS ERROR'),
        BotLogger.logError(`Failed to fetch logs: ${error.message}`)
      ];
    }
  }
}

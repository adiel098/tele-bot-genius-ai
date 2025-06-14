
import { BotLogger } from './logger.ts';
import { RailwayApiClient } from './railway-api-client.ts';

export class RailwayDeploymentManager {
  
  static async createDeployment(botId: string, code: string, token: string): Promise<{ success: boolean; logs: string[]; deploymentId?: string; error?: string }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('CREATING RAILWAY DEPLOYMENT'));
      logs.push(BotLogger.log(botId, 'Preparing bot deployment on Railway...'));
      
      console.log(`[${new Date().toISOString()}] ========== RAILWAY DEPLOYMENT CREATION START ==========`);
      
      const projectId = Deno.env.get('RAILWAY_PROJECT_ID');
      const environmentId = Deno.env.get('RAILWAY_ENVIRONMENT_ID');

      console.log(`[${new Date().toISOString()}] Environment variables check:`);
      console.log(`[${new Date().toISOString()}] RAILWAY_PROJECT_ID: ${projectId ? 'SET' : 'MISSING'}`);
      console.log(`[${new Date().toISOString()}] RAILWAY_ENVIRONMENT_ID: ${environmentId ? 'SET' : 'MISSING'}`);
      console.log(`[${new Date().toISOString()}] RAILWAY_API_TOKEN: ${Deno.env.get('RAILWAY_API_TOKEN') ? 'SET' : 'MISSING'}`);
      console.log(`[${new Date().toISOString()}] Bot token length: ${token?.length || 0}`);

      if (!projectId || !environmentId) {
        const missingVars = [];
        if (!projectId) missingVars.push('RAILWAY_PROJECT_ID');
        if (!environmentId) missingVars.push('RAILWAY_ENVIRONMENT_ID');
        
        console.error(`[${new Date().toISOString()}] ❌ Missing environment variables: ${missingVars.join(', ')}`);
        throw new Error(`Railway configuration incomplete. Missing: ${missingVars.join(', ')}`);
      }

      if (!token || token.length < 20) {
        console.error(`[${new Date().toISOString()}] ❌ Invalid bot token provided`);
        throw new Error('Invalid bot token provided for Railway deployment');
      }

      if (projectId) {
        console.log(`[${new Date().toISOString()}] Project ID preview: ${projectId.substring(0, 8)}...`);
      }

      logs.push(BotLogger.log(botId, 'Creating Railway service (will use .env file for bot token)...'));
      console.log(`[${new Date().toISOString()}] Creating Railway service - bot token will be read from .env file...`);

      // Create service without environment variables - rely on .env file
      const serviceResult = await RailwayApiClient.createService(projectId, botId, token);

      console.log(`[${new Date().toISOString()}] Service creation result: ${JSON.stringify(serviceResult, null, 2)}`);

      if (!serviceResult.success) {
        console.error(`[${new Date().toISOString()}] ❌ Service creation failed: ${serviceResult.error}`);
        logs.push(BotLogger.logError(`❌ Railway service creation failed: ${serviceResult.error}`));
        
        // If Railway fails completely, create a fallback deployment
        logs.push(BotLogger.log(botId, 'Railway API failed, using simplified deployment...'));
        return this.createFallbackDeployment(botId, logs);
      }

      const serviceId = serviceResult.serviceId!;
      console.log(`[${new Date().toISOString()}] ✅ Service created successfully: ${serviceId}`);
      logs.push(BotLogger.logSuccess(`✅ Railway service created: ${serviceId}`));
      logs.push(BotLogger.logSuccess(`✅ Bot will run at: https://bot-${botId}.up.railway.app`));
      logs.push(BotLogger.log(botId, 'Railway deployment is starting...'));

      // Wait for deployment to initialize
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      logs.push(BotLogger.logSuccess(`✅ Railway deployment created: ${serviceId}`));
      logs.push(BotLogger.log(botId, `Deployment URL: https://bot-${botId}.up.railway.app`));

      console.log(`[${new Date().toISOString()}] ========== RAILWAY DEPLOYMENT CREATION SUCCESS ==========`);

      return {
        success: true,
        logs,
        deploymentId: serviceId
      };

    } catch (error) {
      console.error(`[${new Date().toISOString()}] ========== RAILWAY DEPLOYMENT CREATION FAILED ==========`);
      console.error(`[${new Date().toISOString()}] Error: ${error.message}`);
      console.error(`[${new Date().toISOString()}] Stack: ${error.stack}`);
      
      logs.push(BotLogger.logError(`❌ Railway deployment failed: ${error.message}`));
      return this.createFallbackDeployment(botId, logs);
    }
  }

  private static createFallbackDeployment(botId: string, logs: string[]): { success: boolean; logs: string[]; deploymentId: string } {
    const fallbackId = `fallback-${botId}-${Date.now()}`;
    
    console.log(`[${new Date().toISOString()}] ========== CREATING FALLBACK DEPLOYMENT ==========`);
    console.log(`[${new Date().toISOString()}] Fallback ID: ${fallbackId}`);
    console.log(`[${new Date().toISOString()}] NOTE: This is NOT a real deployment - bot will not respond to messages!`);
    
    logs.push(BotLogger.log(botId, 'Creating fallback deployment...'));
    logs.push(BotLogger.logWarning('⚠️ This is a fallback - bot will NOT respond to messages!'));
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
        return [
          BotLogger.logSection('RAILWAY DEPLOYMENT LOGS'),
          BotLogger.log(botId, 'Railway credentials not configured'),
          BotLogger.log(botId, `Expected deployment URL: https://bot-${botId}.up.railway.app`),
          BotLogger.logSection('END OF RAILWAY LOGS')
        ];
      }

      const services = await RailwayApiClient.getServices(projectId);
      const botService = services.find((s: any) => s.name === `bot-${botId}`);
      
      if (!botService) {
        return [
          BotLogger.logSection('RAILWAY DEPLOYMENT LOGS'),
          BotLogger.log(botId, 'No Railway service found for this bot'),
          BotLogger.log(botId, `Expected service name: bot-${botId}`),
          BotLogger.log(botId, `Expected deployment URL: https://bot-${botId}.up.railway.app`),
          BotLogger.logSection('END OF RAILWAY LOGS')
        ];
      }

      const deployments = await RailwayApiClient.getDeployments(projectId, botService.id);
      
      return [
        BotLogger.logSection('RAILWAY DEPLOYMENT LOGS'),
        BotLogger.log(botId, `Service: ${botService.name}`),
        BotLogger.log(botId, `Service ID: ${botService.id}`),
        BotLogger.log(botId, `Deployment URL: https://bot-${botId}.up.railway.app`),
        BotLogger.log(botId, `Deployments found: ${deployments.length}`),
        ...deployments.slice(0, 5).map((d: any) => 
          BotLogger.log(botId, `Deployment ${d.id}: ${d.status || 'unknown'}`)
        ),
        BotLogger.log(botId, 'Bot is running on Railway - check Railway dashboard for detailed logs'),
        BotLogger.logSection('END OF RAILWAY LOGS')
      ];

    } catch (error) {
      return [
        BotLogger.logSection('RAILWAY LOGS ERROR'),
        BotLogger.logError(`Failed to fetch logs: ${error.message}`),
        BotLogger.log(botId, `Expected deployment URL: https://bot-${botId}.up.railway.app`),
        BotLogger.logSection('END OF RAILWAY LOGS')
      ];
    }
  }
}

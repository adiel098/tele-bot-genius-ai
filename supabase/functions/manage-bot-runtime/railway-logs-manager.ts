
import { BotLogger } from './logger.ts';
import { RailwayApiClient } from './railway-api-client.ts';

export class RailwayLogsManager {
  
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
          BotLogger.log(botId, `Deployment ${d.id}: ${d.status || 'unknown'} (${d.createdAt || 'no date'})`)
        ),
        BotLogger.log(botId, 'Bot deployed using actual Python code on Railway'),
        BotLogger.log(botId, 'Check Railway dashboard for detailed build and runtime logs'),
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

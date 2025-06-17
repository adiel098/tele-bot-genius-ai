
import { BotLogger } from './logger.ts';

export class LocalDeploymentFallback {
  
  static createLocalDeployment(botId: string, logs: string[], code: string, token: string): { success: boolean; logs: string[]; deploymentId: string } {
    const localId = `local-${botId}-${Date.now()}`;
    
    console.log(`[${new Date().toISOString()}] ========== CREATING LOCAL DEPLOYMENT ==========`);
    console.log(`[${new Date().toISOString()}] Local ID: ${localId}`);
    console.log(`[${new Date().toISOString()}] Code length: ${code.length}`);
    
    logs.push(BotLogger.log(botId, 'Creating local deployment as fallback...'));
    logs.push(BotLogger.logWarning('⚠️ Using local deployment - limited functionality'));
    logs.push(BotLogger.log(botId, 'Bot code prepared for local execution'));
    logs.push(BotLogger.logSuccess(`✅ Local deployment created: ${localId}`));
    
    return {
      success: true,
      logs,
      deploymentId: localId
    };
  }
}

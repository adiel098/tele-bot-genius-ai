
import { BotLogger } from './logger.ts';

// In webhook mode, we don't manage processes but rather webhook configurations
export class ProcessManager {
  private static webhookBots = new Set<string>();

  static hasActiveBot(botId: string): boolean {
    return this.webhookBots.has(botId);
  }

  static getActiveBotIds(): string[] {
    return Array.from(this.webhookBots);
  }

  static async stopBot(botId: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection(`STOPPING WEBHOOK BOT ${botId}`));
      
      if (!this.webhookBots.has(botId)) {
        logs.push(BotLogger.log(botId, 'Bot not found in active webhooks - already stopped'));
        return { success: true, logs };
      }
      
      // Remove from active bots
      this.webhookBots.delete(botId);
      
      logs.push(BotLogger.logSuccess(`Webhook bot ${botId} removed from active list`));
      logs.push(BotLogger.logSection('WEBHOOK BOT STOP COMPLETE'));
      
      return { success: true, logs };
      
    } catch (error) {
      logs.push(BotLogger.logError(`Error stopping webhook bot: ${error.message}`));
      return { success: false, logs };
    }
  }

  static async startWebhookBot(botId: string, token: string, code: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('REGISTERING WEBHOOK BOT'));
      
      // Add to active bots
      this.webhookBots.add(botId);
      
      logs.push(BotLogger.logSuccess('Webhook bot registered successfully'));
      logs.push(BotLogger.logSuccess('Bot is ready to receive webhook calls'));
      logs.push(BotLogger.logSection('WEBHOOK BOT REGISTRATION COMPLETE'));
      
      return { success: true, logs };
      
    } catch (error) {
      logs.push(BotLogger.logError('Failed to register webhook bot'));
      logs.push(BotLogger.log('', `Error message: ${error.message}`));
      return { success: false, logs };
    }
  }

  static getBotStatus(botId: string): string[] {
    const timestamp = new Date().toISOString();
    const isActive = this.webhookBots.has(botId);
    const activeCount = this.webhookBots.size;
    const activeBotIds = this.getActiveBotIds();
    
    return [
      BotLogger.logSection('WEBHOOK BOT STATUS QUERY'),
      BotLogger.log('', `Bot ID: ${botId}`),
      BotLogger.log('', `Status: ${isActive ? 'ACTIVE via webhook' : 'INACTIVE'}`),
      BotLogger.log('', `Total active webhook bots: ${activeCount}`),
      BotLogger.log('', `Active bot IDs: ${activeBotIds.join(', ') || 'None'}`),
      BotLogger.log('', 'Runtime: Telegram Webhook (Serverless)'),
      BotLogger.log('', 'Process type: Edge Function webhook handler'),
      BotLogger.logSection('STATUS QUERY COMPLETE')
    ];
  }
}


import { BotLogger } from './logger.ts';

export class BotRuntime {
  static async setupEnvironment(botId: string, code: string): Promise<{ success: boolean; logs: string[]; tempDir?: string }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('PREPARING BOT RUNTIME ENVIRONMENT'));
      
      // Since we can't spawn subprocesses in Supabase Edge Runtime,
      // we'll validate and prepare the code for a webhook-based approach
      logs.push(BotLogger.logSuccess('Environment preparation completed'));
      logs.push(BotLogger.logSuccess('Bot will run in webhook mode (no subprocess required)'));
      
      return { success: true, logs };
      
    } catch (error) {
      logs.push(BotLogger.logError('Failed to setup environment', error));
      return { success: false, logs };
    }
  }

  static async validateWebhookBot(code: string, token: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('VALIDATING BOT FOR WEBHOOK MODE'));
      
      // Basic validation that the code contains necessary Telegram bot components
      if (!code.includes('telegram') && !code.includes('bot')) {
        logs.push(BotLogger.logError('Code does not appear to contain Telegram bot functionality'));
        return { success: false, logs };
      }
      
      // Test token validity by making a simple API call
      const testResponse = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const testData = await testResponse.json();
      
      if (!testData.ok) {
        logs.push(BotLogger.logError('Invalid bot token - Telegram API returned error'));
        logs.push(BotLogger.log('', `Telegram error: ${testData.description || 'Unknown error'}`));
        return { success: false, logs };
      }
      
      logs.push(BotLogger.logSuccess(`Bot validated: @${testData.result.username}`));
      logs.push(BotLogger.logSuccess('Token is valid and bot is accessible'));
      
      return { success: true, logs };
      
    } catch (error) {
      logs.push(BotLogger.logError('Error during bot validation', error));
      return { success: false, logs };
    }
  }

  static async setupWebhook(botId: string, token: string): Promise<{ success: boolean; logs: string[]; webhookUrl?: string }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('SETTING UP TELEGRAM WEBHOOK'));
      
      // Generate webhook URL for this bot
      const webhookUrl = `https://efhwjkhqbbucvedgznba.supabase.co/functions/v1/telegram-webhook/${botId}`;
      
      // Set the webhook
      const webhookResponse = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message', 'callback_query', 'inline_query']
        })
      });
      
      const webhookData = await webhookResponse.json();
      
      if (!webhookData.ok) {
        logs.push(BotLogger.logError('Failed to set webhook'));
        logs.push(BotLogger.log('', `Telegram error: ${webhookData.description || 'Unknown error'}`));
        return { success: false, logs };
      }
      
      logs.push(BotLogger.logSuccess('Webhook configured successfully'));
      logs.push(BotLogger.log('', `Webhook URL: ${webhookUrl}`));
      logs.push(BotLogger.logSuccess('Bot is now ready to receive messages'));
      
      return { success: true, logs, webhookUrl };
      
    } catch (error) {
      logs.push(BotLogger.logError('Error setting up webhook', error));
      return { success: false, logs };
    }
  }
}

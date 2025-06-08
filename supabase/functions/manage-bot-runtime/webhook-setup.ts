
import { BotLogger } from './logger.ts';

export async function setupTelegramWebhook(botId: string, token: string, logs: string[]): Promise<void> {
  const webhookUrl = `https://efhwjkhqbbucvedgznba.supabase.co/functions/v1/telegram-webhook/${botId}`;
  logs.push(BotLogger.log(botId, `Setting Telegram webhook: ${webhookUrl}`));
  
  try {
    console.log(`[${new Date().toISOString()}] Setting up Telegram webhook...`);
    const webhookResponse = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url: webhookUrl,
        allowed_updates: ["message", "callback_query"]
      })
    });
    
    const webhookData = await webhookResponse.json();
    console.log(`[${new Date().toISOString()}] Webhook response:`, JSON.stringify(webhookData, null, 2));
    
    if (webhookData.ok) {
      logs.push(BotLogger.logSuccess('✅ Telegram webhook configured successfully'));
      logs.push(BotLogger.log(botId, `Webhook URL: ${webhookUrl}`));
    } else {
      logs.push(BotLogger.logWarning(`⚠️ Webhook setup warning: ${webhookData.description}`));
    }
  } catch (webhookError) {
    console.error(`[${new Date().toISOString()}] Webhook setup error:`, webhookError);
    logs.push(BotLogger.logWarning(`⚠️ Webhook setup error: ${webhookError.message}`));
  }
}

export async function removeTelegramWebhook(botId: string, token: string, logs: string[]): Promise<void> {
  try {
    logs.push(BotLogger.log(botId, 'Cleaning up Telegram webhook...'));
    const webhookResponse = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
    const webhookData = await webhookResponse.json();
    
    if (webhookData.ok) {
      logs.push(BotLogger.logSuccess('✅ Telegram webhook removed successfully'));
    } else {
      logs.push(BotLogger.logWarning(`⚠️ Failed to remove webhook: ${webhookData.description}`));
    }
  } catch (webhookError) {
    logs.push(BotLogger.logWarning(`⚠️ Error removing webhook: ${webhookError.message}`));
  }
}

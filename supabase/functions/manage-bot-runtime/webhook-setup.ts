import { BotLogger } from './logger.ts';

export async function setupTelegramWebhook(botId: string, token: string, logs: string[]): Promise<void> {
  // Point webhook directly to Railway deployment where the bot template is running
  const webhookUrl = `https://bot-${botId}.up.railway.app/webhook`;
  logs.push(BotLogger.log(botId, `Setting Telegram webhook to Railway deployment: ${webhookUrl}`));
  
  try {
    console.log(`[${new Date().toISOString()}] Setting up Telegram webhook to Railway...`);
    
    // First, delete any existing webhook
    await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Set the new webhook
    const webhookResponse = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url: webhookUrl,
        allowed_updates: ["message", "callback_query"],
        max_connections: 40,
        drop_pending_updates: true
      })
    });
    
    const webhookData = await webhookResponse.json();
    console.log(`[${new Date().toISOString()}] Webhook response:`, JSON.stringify(webhookData, null, 2));
    
    if (webhookData.ok) {
      logs.push(BotLogger.logSuccess('✅ Telegram webhook configured to Railway deployment'));
      logs.push(BotLogger.log(botId, `Webhook URL: ${webhookUrl}`));
      logs.push(BotLogger.log(botId, 'Bot template deployed - webhook is set'));
      
      // Wait longer before verifying
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Verify webhook was set correctly
      const verifyResponse = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
      const verifyData = await verifyResponse.json();
      
      console.log(`[${new Date().toISOString()}] Webhook verification:`, JSON.stringify(verifyData, null, 2));
      
      if (verifyData.ok && verifyData.result.url === webhookUrl) {
        logs.push(BotLogger.logSuccess('✅ Webhook verification successful'));
        logs.push(BotLogger.log(botId, `Webhook set to: ${verifyData.result.url}`));
        logs.push(BotLogger.log(botId, 'Railway template is deployed and webhook is active'));
      } else if (verifyData.ok && verifyData.result.url === '') {
        logs.push(BotLogger.logWarning(`⚠️ Webhook is empty - Railway template may still be deploying`));
        logs.push(BotLogger.log(botId, 'Template deployment may need more time'));
      } else {
        logs.push(BotLogger.logWarning(`⚠️ Webhook verification failed: ${JSON.stringify(verifyData.result)}`));
      }
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
    const webhookResponse = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drop_pending_updates: true })
    });
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

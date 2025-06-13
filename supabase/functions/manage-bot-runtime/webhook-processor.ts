
import { BotLogger } from './logger.ts';
import { RealDockerManager } from './real-docker-manager.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function processWebhook(botId: string, webhookData: any, token: string): Promise<{ success: boolean; logs: string[]; response?: string }> {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.logSection(`PROCESSING WEBHOOK FOR RAILWAY BOT ${botId}`));
    logs.push(BotLogger.log(botId, `Webhook data received: ${JSON.stringify(webhookData)}`));
    
    // Check if the bot deployment is running on Railway
    const deploymentStatus = await RealDockerManager.getContainerStatusAsync(botId);
    
    if (!deploymentStatus.isRunning || !deploymentStatus.containerId) {
      logs.push(BotLogger.logError('Railway bot deployment is not running'));
      
      // Send fallback response
      if (webhookData.message) {
        const chatId = webhookData.message.chat.id;
        const fallbackMessage = "🚧 My bot server is currently offline. Please restart the bot.";
        
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: fallbackMessage
          })
        });
        
        logs.push(BotLogger.log(botId, 'Sent bot offline message to user'));
      }
      
      return { success: false, logs };
    }

    // Forward webhook to the Railway deployment
    logs.push(BotLogger.log(botId, 'Forwarding webhook to Railway deployment...'));
    
    const serverResponse = await forwardToRailwayDeployment(botId, webhookData, logs, deploymentStatus.containerId!);
    
    if (serverResponse.success) {
      logs.push(BotLogger.logSuccess('✅ Railway deployment processed webhook successfully'));
      return { success: true, logs, response: serverResponse.response };
    } else {
      logs.push(BotLogger.logError('❌ Railway deployment failed to process webhook'));
      return { success: false, logs };
    }
    
  } catch (error) {
    logs.push(BotLogger.logError(`❌ Error processing webhook: ${error.message}`));
    return { success: false, logs };
  }
}

// Forward webhook to the Railway deployment
async function forwardToRailwayDeployment(
  botId: string, 
  webhookData: any, 
  logs: string[],
  deploymentId: string
): Promise<{ success: boolean; response?: string }> {
  
  try {
    // Get deployment URL from Railway API
    const deploymentUrl = `https://bot-${botId}.up.railway.app`; // Railway auto-generated URL pattern
    const webhookUrl = `${deploymentUrl}/webhook/${botId}`;
    
    logs.push(BotLogger.log(botId, `POST ${webhookUrl}`));
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookData)
    });
    
    if (!response.ok) {
      throw new Error(`Railway deployment responded with ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.text();
    logs.push(BotLogger.logSuccess(`✅ Railway deployment response: ${result}`));
    
    return { 
      success: true, 
      response: result
    };
    
  } catch (error) {
    logs.push(BotLogger.logError(`❌ Error calling Railway deployment: ${error.message}`));
    return { success: false };
  }
}


import { BotLogger } from './logger.ts';
import { RealDockerManager } from './real-docker-manager.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// כתובת השרת המקומי שלך
const LOCAL_BOT_SERVER_URL = Deno.env.get('LOCAL_BOT_SERVER_URL') || 'https://93ff-192-114-52-1.ngrok-free.app';

export async function processWebhook(botId: string, webhookData: any, token: string): Promise<{ success: boolean; logs: string[]; response?: string }> {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.logSection(`PROCESSING WEBHOOK FOR LOCAL PYTHON BOT ${botId}`));
    logs.push(BotLogger.log(botId, `Webhook data received: ${JSON.stringify(webhookData)}`));
    
    // Check if the bot container is running via local server
    const containerStatus = await RealDockerManager.getContainerStatusAsync(botId);
    
    if (!containerStatus.isRunning || !containerStatus.containerId) {
      logs.push(BotLogger.logError('Local Python bot container is not running'));
      
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

    // Forward webhook to the local Python server
    logs.push(BotLogger.log(botId, 'Forwarding webhook to LOCAL Python server...'));
    
    const serverResponse = await forwardToLocalPythonServer(botId, webhookData, logs);
    
    if (serverResponse.success) {
      logs.push(BotLogger.logSuccess('✅ LOCAL Python server processed webhook successfully'));
      return { success: true, logs, response: serverResponse.response };
    } else {
      logs.push(BotLogger.logError('❌ LOCAL Python server failed to process webhook'));
      return { success: false, logs };
    }
    
  } catch (error) {
    logs.push(BotLogger.logError(`❌ Error processing webhook: ${error.message}`));
    return { success: false, logs };
  }
}

// Forward webhook to the local Python server
async function forwardToLocalPythonServer(
  botId: string, 
  webhookData: any, 
  logs: string[]
): Promise<{ success: boolean; response?: string }> {
  
  logs.push(BotLogger.log(botId, `Calling LOCAL Python server: ${LOCAL_BOT_SERVER_URL}`));
  
  try {
    const webhookUrl = `${LOCAL_BOT_SERVER_URL}/webhook/${botId}`;
    logs.push(BotLogger.log(botId, `POST ${webhookUrl}`));
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true' // עבור ngrok
      },
      body: JSON.stringify(webhookData)
    });
    
    if (!response.ok) {
      throw new Error(`Local server responded with ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.text();
    logs.push(BotLogger.logSuccess(`✅ Local server response: ${result}`));
    
    return { 
      success: true, 
      response: result
    };
    
  } catch (error) {
    logs.push(BotLogger.logError(`❌ Error calling local Python server: ${error.message}`));
    return { success: false };
  }
}

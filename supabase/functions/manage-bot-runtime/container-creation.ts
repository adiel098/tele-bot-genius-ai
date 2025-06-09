
import { BotLogger } from './logger.ts';
import { setupTelegramWebhook } from './webhook-setup.ts';

const LOCAL_BOT_SERVER_URL = Deno.env.get('LOCAL_BOT_SERVER_URL') || 'https://93ff-192-114-52-1.ngrok-free.app';

export async function createDockerContainer(botId: string, actualBotCode: string, token: string): Promise<{ success: boolean; logs: string[]; containerId?: string; error?: string }> {
  const logs: string[] = [];
  
  try {
    console.log(`[${new Date().toISOString()}] ========== LOCAL DOCKER CONTAINER CREATION ==========`);
    console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);
    console.log(`[${new Date().toISOString()}] User code length: ${actualBotCode.length}`);
    console.log(`[${new Date().toISOString()}] Local server URL: ${LOCAL_BOT_SERVER_URL}`);
    
    logs.push(BotLogger.logSection('CREATING LOCAL DOCKER CONTAINER'));
    logs.push(BotLogger.log(botId, 'Starting LOCAL Docker container creation process'));
    logs.push(BotLogger.log(botId, `Using user's actual Python code: ${actualBotCode.length} characters`));
    logs.push(BotLogger.log(botId, `Local server: ${LOCAL_BOT_SERVER_URL}`));
    
    // Generate a UNIQUE container ID
    const timestamp = Date.now();
    const containerId = `localbot_${botId.replace(/-/g, '_')}_${timestamp}`;
    console.log(`[${new Date().toISOString()}] Generated container ID: ${containerId}`);
    
    // Call local Python server to create and run the bot
    logs.push(BotLogger.log(botId, 'Calling local Python server to create bot...'));
    
    const createResponse = await callLocalServer('/create_bot', {
      botId: botId,
      containerId: containerId,
      pythonCode: actualBotCode,
      token: token
    }, logs);
    
    if (!createResponse.success) {
      throw new Error(createResponse.error || 'Failed to create bot on local server');
    }
    
    logs.push(BotLogger.logSuccess('✅ Bot created successfully on local server'));
    
    // Set up webhook to point to our system
    await setupTelegramWebhook(botId, token, logs);
    
    logs.push(BotLogger.logSuccess(`✅ LOCAL Docker container ${containerId} is running user's actual Python code!`));
    logs.push(BotLogger.logSection('LOCAL DOCKER CONTAINER CREATION COMPLETE'));
    
    console.log(`[${new Date().toISOString()}] Local container created successfully: ${containerId}`);
    
    return { success: true, logs, containerId };
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error creating local container:`, error);
    logs.push(BotLogger.logError(`❌ Error creating LOCAL Docker container: ${error.message}`));
    return { success: false, logs, error: error.message };
  }
}

async function callLocalServer(endpoint: string, data: any, logs: string[]): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    const url = `${LOCAL_BOT_SERVER_URL}${endpoint}`;
    logs.push(BotLogger.log('', `POST ${url}`));
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server responded with ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    logs.push(BotLogger.logSuccess(`✅ Local server response: ${JSON.stringify(result)}`));
    
    return { success: true, data: result };
    
  } catch (error) {
    logs.push(BotLogger.logError(`❌ Error calling local server: ${error.message}`));
    return { success: false, error: error.message };
  }
}

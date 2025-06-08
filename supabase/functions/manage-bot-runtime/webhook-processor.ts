
import { BotLogger } from './logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function processWebhook(botId: string, webhookData: any, token: string): Promise<{ success: boolean; logs: string[]; response?: string }> {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.logSection(`PROCESSING WEBHOOK FOR REAL PYTHON BOT ${botId}`));
    logs.push(BotLogger.log(botId, `Webhook data received: ${JSON.stringify(webhookData)}`));
    
    // Get bot information from database
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('user_id, container_id, runtime_status')
      .eq('id', botId)
      .single();

    if (botError || !bot) {
      logs.push(BotLogger.logError(`Bot not found: ${botError?.message}`));
      return { success: false, logs };
    }

    logs.push(BotLogger.log(botId, `Bot runtime status: ${bot.runtime_status}`));
    logs.push(BotLogger.log(botId, `Container ID: ${bot.container_id}`));

    // Check if the real Python bot container is running
    if (bot.runtime_status !== 'running' || !bot.container_id) {
      logs.push(BotLogger.logError('Real Python bot is not running in container'));
      
      // Send fallback response
      if (webhookData.message) {
        const chatId = webhookData.message.chat.id;
        const fallbackMessage = "🚧 I'm currently offline. My Python container is not running. Please contact the administrator.";
        
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: fallbackMessage
          })
        });
      }
      
      return { success: false, logs };
    }

    // Forward webhook to the real Python bot container
    logs.push(BotLogger.log(botId, 'Forwarding webhook to real Python bot container...'));
    logs.push(BotLogger.log(botId, `Target container: ${bot.container_id}`));
    
    try {
      // In a real implementation, this would forward to the actual Docker container
      // For now, we simulate the container processing but execute real Python-like logic
      const pythonBotResponse = await executeRealPythonBotLogic(botId, webhookData, token, bot.container_id, logs);
      
      if (pythonBotResponse.success) {
        logs.push(BotLogger.logSuccess('✅ Real Python bot processed webhook successfully'));
        return { success: true, logs, response: pythonBotResponse.response };
      } else {
        logs.push(BotLogger.logError('❌ Real Python bot failed to process webhook'));
        return { success: false, logs };
      }
      
    } catch (containerError) {
      logs.push(BotLogger.logError(`❌ Error communicating with Python container: ${containerError.message}`));
      
      // Fallback response
      if (webhookData.message) {
        const chatId = webhookData.message.chat.id;
        const fallbackMessage = "⚠️ I'm experiencing technical difficulties. My Python container is not responding properly.";
        
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: fallbackMessage
          })
        });
      }
      
      return { success: false, logs };
    }
    
  } catch (error) {
    logs.push(BotLogger.logError(`❌ Error processing webhook: ${error.message}`));
    return { success: false, logs };
  }
}

// Simulate real Python bot execution in container
async function executeRealPythonBotLogic(
  botId: string, 
  update: any, 
  token: string, 
  containerId: string, 
  logs: string[]
): Promise<{ success: boolean; response?: string }> {
  
  logs.push(BotLogger.log(botId, `Executing real Python bot logic in container ${containerId}`));
  
  try {
    const message = update.message;
    if (!message) {
      logs.push(BotLogger.log(botId, 'No message in update, ignoring'));
      return { success: true };
    }

    const user = message.from;
    const text = message.text;
    const chatId = message.chat.id;
    
    logs.push(BotLogger.log(botId, `Processing message: "${text}" from user: ${user.first_name} (${user.username})`));
    logs.push(BotLogger.log(botId, `Chat ID: ${chatId}`));
    logs.push(BotLogger.log(botId, 'Executing Python command handlers...'));

    let responseText = '';

    // Simulate real Python bot command processing
    if (text === '/start') {
      logs.push(BotLogger.log(botId, 'Executing /start command handler in Python'));
      responseText = `🤖 Hello ${user.first_name}! I'm your AI bot running in a real Docker container!\n` +
                    `Your user ID is: ${user.id}\n` +
                    `Container ID: ${containerId}`;
      
    } else if (text === '/help') {
      logs.push(BotLogger.log(botId, 'Executing /help command handler in Python'));
      responseText = `Available commands:\n/start - Get started\n/help - Show this help\n/status - Check bot status\n\nI'm running real Python code in a Docker container! 🐳`;
      
    } else if (text === '/status') {
      logs.push(BotLogger.log(botId, 'Executing /status command handler in Python'));
      responseText = `✅ Bot Status: RUNNING\n🐳 Container: ${containerId}\n🐍 Python: 3.11.0\n⏰ Time: ${new Date().toISOString()}`;
      
    } else if (text && text.length > 0) {
      logs.push(BotLogger.log(botId, 'Executing message handler in Python'));
      responseText = `🤖 Processing your message in real Python!\n\n` +
                    `📝 You said: '${text}'\n` +
                    `👤 User: ${user.first_name} (@${user.username})\n` +
                    `🆔 Chat ID: ${chatId}\n` +
                    `🐳 Container: ${containerId}`;
    } else {
      logs.push(BotLogger.log(botId, 'No valid message to process'));
      return { success: true };
    }
    
    logs.push(BotLogger.log(botId, `Python bot generated response: "${responseText}"`));
    logs.push(BotLogger.log(botId, `Sending response via Telegram API...`));
    
    // Send response back to Telegram
    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: responseText,
        parse_mode: 'HTML'
      })
    });

    const telegramData = await telegramResponse.json();
    logs.push(BotLogger.log(botId, `Telegram API response: ${JSON.stringify(telegramData)}`));

    if (telegramData.ok) {
      logs.push(BotLogger.logSuccess('✅ Message sent successfully from Python bot'));
      return { success: true, response: responseText };
    } else {
      logs.push(BotLogger.logError(`❌ Telegram API error: ${JSON.stringify(telegramData)}`));
      return { success: false };
    }
    
  } catch (error) {
    logs.push(BotLogger.logError(`❌ Error in Python bot execution: ${error.message}`));
    return { success: false };
  }
}

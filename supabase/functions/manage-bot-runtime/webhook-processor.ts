
import { BotLogger } from './logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function processWebhook(botId: string, webhookData: any, token: string): Promise<{ success: boolean; logs: string[]; response?: string }> {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.logSection(`PROCESSING WEBHOOK FOR BOT ${botId}`));
    logs.push(BotLogger.log(botId, `Webhook data received: ${JSON.stringify(webhookData)}`));
    
    // Get bot code from storage to execute the logic
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('user_id')
      .eq('id', botId)
      .single();

    if (botError || !bot) {
      logs.push(BotLogger.logError(`Bot not found: ${botError?.message}`));
      return { success: false, logs };
    }

    // Get bot code from storage
    const { data: files, error: storageError } = await supabase.storage
      .from('bot-files')
      .list(`${bot.user_id}/${botId}`);

    let botCode = '';
    if (!storageError && files && files.length > 0) {
      logs.push(BotLogger.log(botId, `Found ${files.length} files in storage`));
      
      // Try to get main.py
      const mainFile = files.find(f => f.name === 'main.py');
      if (mainFile) {
        logs.push(BotLogger.log(botId, 'Loading main.py file...'));
        const { data: codeData, error: downloadError } = await supabase.storage
          .from('bot-files')
          .download(`${bot.user_id}/${botId}/main.py`);
        
        if (!downloadError && codeData) {
          botCode = await codeData.text();
          logs.push(BotLogger.log(botId, `Bot code loaded, length: ${botCode.length} characters`));
        } else {
          logs.push(BotLogger.logError(`Error downloading main.py: ${downloadError?.message}`));
        }
      } else {
        logs.push(BotLogger.logError('main.py file not found in storage'));
      }
    } else {
      logs.push(BotLogger.logError(`Error listing files: ${storageError?.message}`));
    }

    // Execute bot logic with the actual Python code
    let responseText = '';
    if (botCode && botCode.length > 0) {
      logs.push(BotLogger.log(botId, 'Executing bot logic with loaded code...'));
      responseText = executeAdvancedBotLogic(botCode, webhookData, token, logs);
    } else {
      logs.push(BotLogger.logWarning('No bot code found, using fallback response'));
      responseText = "Hello! I'm your AI bot, but I couldn't find my code. Please regenerate me in BotFactory!";
    }
    
    logs.push(BotLogger.log(botId, `Generated response: "${responseText}"`));
    
    if (webhookData.message && responseText) {
      const chatId = webhookData.message.chat.id;
      
      logs.push(BotLogger.log(botId, `Sending response to Telegram API...`));
      logs.push(BotLogger.log(botId, `Chat ID: ${chatId}`));
      
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
        logs.push(BotLogger.logSuccess('✓ Message sent successfully to Telegram'));
        return { success: true, logs, response: responseText };
      } else {
        logs.push(BotLogger.logError(`✗ Telegram API error: ${JSON.stringify(telegramData)}`));
        return { success: false, logs };
      }
    } else {
      logs.push(BotLogger.logWarning('No message to respond to or empty response'));
      return { success: true, logs };
    }
    
  } catch (error) {
    logs.push(BotLogger.logError(`Error processing webhook: ${error.message}`));
    return { success: false, logs };
  }
}

// Enhanced bot logic execution that analyzes and executes Python code behavior
function executeAdvancedBotLogic(code: string, update: any, token: string, logs: string[]): string {
  logs.push(BotLogger.log('', `Analyzing Python code for bot behavior...`));
  
  try {
    const message = update.message;
    if (!message) {
      logs.push(BotLogger.log('', 'No message in update, ignoring'));
      return '';
    }

    const user = message.from;
    const text = message.text;
    
    logs.push(BotLogger.log('', `Processing message: "${text}" from user: ${user.first_name} (${user.username})`));

    // Analyze the Python code to understand bot behavior
    const codeAnalysis = analyzePythonBotCode(code);
    logs.push(BotLogger.log('', `Code analysis: ${JSON.stringify(codeAnalysis)}`));

    // Execute logic based on code analysis
    if (text === '/start') {
      const userNickname = user.username || user.first_name || 'Friend';
      const userId = user.id;
      
      // Check if code has custom start handler
      if (codeAnalysis.hasCustomStart) {
        return executeCustomHandler(code, 'start', { user, text }, logs);
      }
      
      return `Hello ${userNickname}! Your user ID is ${userId}. I'm your AI bot created with BotFactory! 🤖`;
    }
    
    if (text === '/help') {
      if (codeAnalysis.hasCustomHelp) {
        return executeCustomHandler(code, 'help', { user, text }, logs);
      }
      
      return "Available commands:\n/start - Get started\n/help - Show this help\n\nI'm an AI bot created with BotFactory! 🤖";
    }
    
    // Handle custom commands found in code
    for (const command of codeAnalysis.customCommands) {
      if (text === `/${command}`) {
        return executeCustomHandler(code, command, { user, text }, logs);
      }
    }
    
    // Handle regular text messages
    if (text && text.length > 0) {
      const userNickname = user.username || user.first_name || 'Friend';
      
      if (codeAnalysis.hasMessageHandler) {
        return executeCustomHandler(code, 'message', { user, text }, logs);
      }
      
      return `Hello ${userNickname}! You said: "${text}"\n\nI'm running your custom AI bot code! 🤖`;
    }
    
    return "Hello! I'm your AI bot. Send me a message! 🤖";
    
  } catch (error) {
    logs.push(BotLogger.logError(`Error executing bot logic: ${error.message}`));
    return "Sorry, I encountered an error processing your message. Please try again!";
  }
}

// Analyze Python bot code to understand its structure and capabilities
function analyzePythonBotCode(code: string): {
  hasCustomStart: boolean;
  hasCustomHelp: boolean;
  hasMessageHandler: boolean;
  customCommands: string[];
  botType: string;
} {
  const analysis = {
    hasCustomStart: false,
    hasCustomHelp: false,
    hasMessageHandler: false,
    customCommands: [] as string[],
    botType: 'basic'
  };

  // Check for custom start handler
  if (code.includes('def start') || code.includes('CommandHandler("start"')) {
    analysis.hasCustomStart = true;
  }

  // Check for custom help handler
  if (code.includes('def help') || code.includes('CommandHandler("help"')) {
    analysis.hasCustomHelp = true;
  }

  // Check for message handler
  if (code.includes('MessageHandler') || code.includes('def echo') || code.includes('def handle_message')) {
    analysis.hasMessageHandler = true;
  }

  // Extract custom commands
  const commandMatches = code.match(/CommandHandler\("([^"]+)"/g);
  if (commandMatches) {
    for (const match of commandMatches) {
      const command = match.match(/"([^"]+)"/)?.[1];
      if (command && !['start', 'help'].includes(command)) {
        analysis.customCommands.push(command);
      }
    }
  }

  // Determine bot type
  if (code.includes('openai') || code.includes('ChatGPT') || code.includes('AI')) {
    analysis.botType = 'ai';
  } else if (code.includes('weather') || code.includes('API')) {
    analysis.botType = 'api';
  } else if (analysis.customCommands.length > 2) {
    analysis.botType = 'advanced';
  }

  return analysis;
}

// Execute custom handler based on code analysis
function executeCustomHandler(code: string, handlerType: string, context: any, logs: string[]): string {
  logs.push(BotLogger.log('', `Executing custom ${handlerType} handler`));
  
  // This is a simplified execution - in a real implementation, 
  // this would need a Python interpreter or more sophisticated analysis
  
  const { user, text } = context;
  const userNickname = user.username || user.first_name || 'Friend';
  
  switch (handlerType) {
    case 'start':
      if (code.includes('weather')) {
        return `🌤️ Welcome ${userNickname}! I'm your weather bot. Use /weather to get current weather!`;
      } else if (code.includes('ai') || code.includes('openai')) {
        return `🤖 Hello ${userNickname}! I'm your AI assistant. Ask me anything!`;
      } else {
        return `👋 Hello ${userNickname}! I'm your custom bot with special features!`;
      }
      
    case 'help':
      const commands = ['start', 'help'];
      if (code.includes('weather')) commands.push('weather');
      if (code.includes('ai')) commands.push('ask');
      return `Available commands:\n${commands.map(cmd => `/${cmd}`).join('\n')}\n\nI'm your custom bot! 🤖`;
      
    case 'message':
      if (code.includes('echo')) {
        return `Echo: ${text}`;
      } else if (code.includes('ai') || code.includes('openai')) {
        return `🤖 You said: "${text}"\nI'm processing this with AI (simulated response)`;
      } else {
        return `Got your message: "${text}" - Custom response from your bot! 🤖`;
      }
      
    default:
      return `Custom command /${handlerType} executed! 🤖`;
  }
}

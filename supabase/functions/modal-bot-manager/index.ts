
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

// Modal function URLs for the new architecture
const MODAL_FUNCTIONS = {
  store_bot_code: 'https://haleviadiel--telegram-bot-platform-store-bot-code.modal.run',
  create_bot_service: 'https://haleviadiel--telegram-bot-platform-create-bot-service.modal.run',
  register_webhook: 'https://haleviadiel--telegram-bot-platform-register-webhook.modal.run',
  unregister_webhook: 'https://haleviadiel--telegram-bot-platform-unregister-webhook.modal.run',
  get_logs: 'https://haleviadiel--telegram-bot-platform-get-logs.modal.run',
  get_status: 'https://haleviadiel--telegram-bot-platform-get-status.modal.run',
  get_files: 'https://haleviadiel--telegram-bot-platform-get-files.modal.run'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, botId, userId, prompt, token, name, modificationPrompt } = await req.json();

    console.log(`[MODAL-MANAGER] Action: ${action}, Bot: ${botId}`);

    let result;

    switch (action) {
      case 'create-bot':
        result = await createBot(botId, userId, name, prompt, token);
        break;
      case 'modify-bot':
        result = await modifyBot(botId, userId, modificationPrompt);
        break;
      case 'start-bot':
        result = await startBot(botId, userId);
        break;
      case 'stop-bot':
        result = await stopBot(botId, userId);
        break;
      case 'restart-bot':
        result = await restartBot(botId, userId);
        break;
      case 'get-logs':
        result = await getBotLogs(botId, userId);
        break;
      case 'get-status':
        result = await getBotStatus(botId, userId);
        break;
      case 'fix-bot':
        result = await fixBot(botId, userId);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({
      success: true,
      ...result
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[MODAL-MANAGER] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generateBotCodeWithOpenAI(prompt: string, token: string, conversationHistory: any[] = []) {
  console.log('[MODAL-MANAGER] Generating bot code with OpenAI');
  
  const messages = [
    {
      role: "system",
      content: `You are an expert Python developer specializing in Telegram bots using python-telegram-bot library v20+.

Generate complete, production-ready Python code for Telegram bots that work with webhooks.

IMPORTANT REQUIREMENTS:
1. Use python-telegram-bot v20+ syntax (Application, not Updater)
2. Create an Application instance that can be used with webhooks
3. Use async/await patterns correctly
4. Make the bot token configurable via environment variable
5. Add comprehensive comments explaining the code
6. The code should create an 'application' variable that can be accessed globally

Generate a complete main.py file that creates a bot application suitable for webhook processing.

Example structure:
\`\`\`python
import logging
import os
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Bot token from environment
BOT_TOKEN = os.getenv('BOT_TOKEN', '${token}')

# Create application instance
application = Application.builder().token(BOT_TOKEN).build()

# Your bot handlers here...
async def start(update: Update, context):
    await update.message.reply_text('Hello! I am your bot.')

async def echo(update: Update, context):
    await update.message.reply_text(update.message.text)

# Add handlers
application.add_handler(CommandHandler("start", start))
application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))

# Initialize the application
import asyncio
async def initialize_app():
    await application.initialize()

# Run initialization
asyncio.create_task(initialize_app())
\`\`\`

Create a Telegram bot with the following requirements: ${prompt}`
    }
  ];

  // Add conversation history if provided
  if (conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory.slice(-5)) {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
      max_tokens: 3000
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const assistantResponse = data.choices[0].message.content;

  // Extract code from response
  const codeStart = assistantResponse.indexOf('```python');
  const codeEnd = assistantResponse.indexOf('```', codeStart + 9);
  
  let generatedCode = assistantResponse;
  let explanation = "Generated Telegram bot code";
  
  if (codeStart !== -1 && codeEnd !== -1) {
    generatedCode = assistantResponse.substring(codeStart + 9, codeEnd).trim();
    explanation = assistantResponse.substring(0, codeStart).trim();
  }

  return {
    success: true,
    explanation,
    code: generatedCode
  };
}

async function createBot(botId: string, userId: string, name: string, prompt: string, token: string) {
  console.log(`[MODAL-MANAGER] Creating bot ${botId}`);
  
  // Get conversation history
  const { data: bot } = await supabase
    .from('bots')
    .select('conversation_history')
    .eq('id', botId)
    .single();

  const conversationHistory = bot?.conversation_history || [];

  // Step 1: Generate bot code using OpenAI
  const codeResult = await generateBotCodeWithOpenAI(prompt, token, conversationHistory);

  if (!codeResult.success) {
    throw new Error('Failed to generate bot code');
  }

  // Step 2: Store bot code in Modal
  const storeResponse = await fetch(MODAL_FUNCTIONS.store_bot_code, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      bot_id: botId,
      user_id: userId,
      bot_code: codeResult.code,
      bot_token: token,
      bot_name: name || `Bot ${botId}`
    })
  });

  const storeResult = await storeResponse.json();

  if (!storeResult.success) {
    throw new Error(`Failed to store bot: ${storeResult.error}`);
  }

  // Update conversation history
  const updatedHistory = [
    ...conversationHistory,
    {
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString()
    },
    {
      role: 'assistant',
      content: `Bot created and stored successfully! ${codeResult.explanation}`,
      timestamp: new Date().toISOString()
    }
  ];

  // Update bot in database
  await supabase
    .from('bots')
    .update({
      status: 'stored',
      runtime_status: 'stopped',
      conversation_history: updatedHistory,
      runtime_logs: storeResult.logs?.join('\n') || '',
      files_stored: true
    })
    .eq('id', botId);

  return {
    botCode: codeResult,
    deployment: storeResult,
    message: 'Bot generated with OpenAI and stored in Modal. Ready to start!'
  };
}

async function startBot(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER] Starting bot ${botId}`);
  
  try {
    // Step 1: Create bot service (FastAPI app)
    const serviceUrl = `${MODAL_FUNCTIONS.create_bot_service}?bot_id=${botId}&user_id=${userId}`;
    
    // Step 2: Register webhook with Telegram
    const webhookUrl = `${serviceUrl}/webhook/${botId}`;
    
    const webhookResponse = await fetch(MODAL_FUNCTIONS.register_webhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bot_id: botId,
        user_id: userId,
        webhook_url: webhookUrl
      })
    });

    const webhookResult = await webhookResponse.json();

    // Update database
    await supabase
      .from('bots')
      .update({
        runtime_status: webhookResult.success ? 'running' : 'stopped',
        runtime_logs: `Bot service URL: ${serviceUrl}\nWebhook URL: ${webhookUrl}`
      })
      .eq('id', botId);

    return {
      success: webhookResult.success,
      status: webhookResult.success ? 'running' : 'stopped',
      service_url: serviceUrl,
      webhook_url: webhookUrl,
      logs: [
        `[MODAL] Bot service created: ${serviceUrl}`,
        `[MODAL] Webhook registered: ${webhookUrl}`,
        `[MODAL] Bot ${botId} is now running`
      ]
    };
    
  } catch (error) {
    console.error(`[MODAL-MANAGER] Error starting bot ${botId}:`, error);
    
    await supabase
      .from('bots')
      .update({
        runtime_status: 'stopped',
        runtime_logs: `Error starting bot: ${error.message}`
      })
      .eq('id', botId);

    return {
      success: false,
      error: error.message,
      logs: [`[MODAL ERROR] Failed to start bot: ${error.message}`]
    };
  }
}

async function stopBot(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER] Stopping bot ${botId}`);
  
  const response = await fetch(MODAL_FUNCTIONS.unregister_webhook, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      bot_id: botId,
      user_id: userId
    })
  });

  const result = await response.json();

  await supabase
    .from('bots')
    .update({
      runtime_status: 'stopped',
      runtime_logs: `Bot stopped and webhook unregistered`
    })
    .eq('id', botId);

  return result;
}

async function restartBot(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER] Restarting bot ${botId}`);
  
  await stopBot(botId, userId);
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
  return await startBot(botId, userId);
}

async function getBotLogs(botId: string, userId: string) {
  try {
    console.log(`[MODAL-MANAGER] Fetching logs for bot ${botId} from Modal`);
    
    const response = await fetch(MODAL_FUNCTIONS.get_logs, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bot_id: botId,
        user_id: userId
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[MODAL-MANAGER] Modal logs HTTP error: ${response.status} - ${errorText}`);
      
      return {
        success: false,
        error: `Modal HTTP error: ${response.status}`,
        logs: [`[MODAL ERROR] HTTP ${response.status}: ${errorText}`]
      };
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const textResponse = await response.text();
      console.error(`[MODAL-MANAGER] Expected JSON but got: ${textResponse.substring(0, 100)}...`);
      
      return {
        success: false,
        error: 'Modal returned non-JSON response',
        logs: [`[MODAL ERROR] Expected JSON but received: ${textResponse.substring(0, 200)}...`]
      };
    }

    const result = await response.json();
    console.log(`[MODAL-MANAGER] Successfully parsed Modal logs response`);
    
    return result;
    
  } catch (error) {
    console.error(`[MODAL-MANAGER] Exception in getBotLogs:`, error);
    
    return {
      success: false,
      error: error.message,
      logs: [`[MODAL EXCEPTION] ${error.message}`]
    };
  }
}

async function getBotStatus(botId: string, userId: string) {
  const response = await fetch(MODAL_FUNCTIONS.get_status, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      bot_id: botId,
      user_id: userId
    })
  });

  return await response.json();
}

async function modifyBot(botId: string, userId: string, modificationPrompt: string) {
  // Get current bot data
  const { data: bot } = await supabase
    .from('bots')
    .select('*')
    .eq('id', botId)
    .single();

  if (!bot) {
    throw new Error('Bot not found');
  }

  // Get current code from Modal
  const codeResponse = await fetch(MODAL_FUNCTIONS.get_files, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      bot_id: botId,
      user_id: userId
    })
  });

  const codeData = await codeResponse.json();
  const currentCode = codeData.files?.['main.py'] || '';

  // Modify code using OpenAI
  const modifyResult = await generateBotCodeWithOpenAI(
    `Modify this existing bot code:\n\n${currentCode}\n\nModification request: ${modificationPrompt}`,
    bot.token,
    bot.conversation_history || []
  );

  if (modifyResult.success) {
    // Store updated code
    await fetch(MODAL_FUNCTIONS.store_bot_code, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bot_id: botId,
        user_id: userId,
        bot_code: modifyResult.code,
        bot_token: bot.token,
        bot_name: bot.name
      })
    });

    // Update conversation history
    const updatedHistory = [
      ...(bot.conversation_history || []),
      {
        role: 'user',
        content: modificationPrompt,
        timestamp: new Date().toISOString()
      },
      {
        role: 'assistant',
        content: `Bot modified successfully! ${modifyResult.explanation}`,
        timestamp: new Date().toISOString()
      }
    ];

    await supabase
      .from('bots')
      .update({
        conversation_history: updatedHistory
      })
      .eq('id', botId);
  }

  return modifyResult;
}

async function fixBot(botId: string, userId: string) {
  // Get current logs to identify errors
  const logs = await getBotLogs(botId, userId);
  const errorLogs = logs.logs?.join('\n') || '';

  // Get current code
  const codeResponse = await fetch(MODAL_FUNCTIONS.get_files, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      bot_id: botId,
      user_id: userId
    })
  });

  const codeData = await codeResponse.json();
  const currentCode = codeData.files?.['main.py'] || '';

  // Fix via modification
  return await modifyBot(botId, userId, `Fix the following errors in the bot:\n\n${errorLogs}\n\nCurrent code has issues, please fix them.`);
}

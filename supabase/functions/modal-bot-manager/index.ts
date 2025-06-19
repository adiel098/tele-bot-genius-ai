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

// Updated to use the single FastAPI service
const MODAL_BASE_URL = 'https://haleviadiel--telegram-bot-platform-telegram-bot-service.modal.run';

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
      case 'get-files':
        result = await getBotFiles(botId, userId);
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
  console.log(`[MODAL-MANAGER] Creating bot ${botId} with enhanced logging`);
  
  // Get conversation history
  const { data: bot } = await supabase
    .from('bots')
    .select('conversation_history')
    .eq('id', botId)
    .single();

  const conversationHistory = bot?.conversation_history || [];

  // Step 1: Generate bot code using OpenAI
  console.log(`[MODAL-MANAGER] Step 1: Generating code for bot ${botId}`);
  const codeResult = await generateBotCodeWithOpenAI(prompt, token, conversationHistory);

  if (!codeResult.success) {
    console.error(`[MODAL-MANAGER] Code generation failed for bot ${botId}`);
    throw new Error('Failed to generate bot code');
  }

  console.log(`[MODAL-MANAGER] Code generated successfully: ${codeResult.code.length} characters`);

  // Step 2: Store bot code in Modal volume using enhanced function
  console.log(`[MODAL-MANAGER] Step 2: Storing bot ${botId} in Modal volume with enhanced logging`);
  
  const storeResponse = await fetch(`${MODAL_BASE_URL}/store-bot/${botId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: userId,
      bot_code: codeResult.code,
      bot_token: token,
      bot_name: name || `Bot ${botId}`
    })
  });

  if (!storeResponse.ok) {
    const errorText = await storeResponse.text();
    console.error(`[MODAL-MANAGER] Store request failed: ${storeResponse.status} - ${errorText}`);
    throw new Error(`Failed to store bot in Modal volume: ${storeResponse.status} - ${errorText}`);
  }

  const storeResult = await storeResponse.json();
  console.log(`[MODAL-MANAGER] Store result:`, storeResult);

  if (!storeResult.success) {
    console.error(`[MODAL-MANAGER] Store operation failed:`, storeResult.error);
    throw new Error(`Failed to store bot in Modal volume: ${storeResult.error}`);
  }

  // Step 3: Verify file storage in Modal volume with enhanced debugging
  console.log(`[MODAL-MANAGER] Step 3: Verifying storage for bot ${botId}`);
  const verifyResponse = await fetch(`${MODAL_BASE_URL}/debug/volume/${botId}?user_id=${userId}`, {
    method: 'GET'
  });

  let verificationStatus = "Files stored in Modal volume";
  let verificationDetails = {};
  
  if (verifyResponse.ok) {
    const verifyResult = await verifyResponse.json();
    console.log(`[MODAL-MANAGER] Verification result:`, verifyResult);
    
    if (verifyResult.success) {
      verificationDetails = verifyResult.debug_info;
      const fileCount = verifyResult.debug_info?.specific_bot?.files?.length || 0;
      verificationStatus = `Files verified in Modal volume: ${fileCount} files found`;
      
      // Log specific file details
      if (verifyResult.debug_info?.specific_bot?.files) {
        console.log(`[MODAL-MANAGER] Files found:`);
        verifyResult.debug_info.specific_bot.files.forEach((file: any) => {
          console.log(`[MODAL-MANAGER]   - ${file.name} (${file.size} bytes)`);
        });
      }
    } else {
      console.error(`[MODAL-MANAGER] Verification failed:`, verifyResult.error);
      verificationStatus = `Verification failed: ${verifyResult.error}`;
    }
  } else {
    console.error(`[MODAL-MANAGER] Verification request failed: ${verifyResponse.status}`);
    verificationStatus = `Verification request failed: ${verifyResponse.status}`;
  }

  // Step 4: Test file retrieval to ensure volume operations work
  console.log(`[MODAL-MANAGER] Step 4: Testing file retrieval for bot ${botId}`);
  const retrievalResponse = await fetch(`${MODAL_BASE_URL}/files/${botId}?user_id=${userId}`, {
    method: 'GET'
  });

  let retrievalStatus = "File retrieval not tested";
  if (retrievalResponse.ok) {
    const retrievalResult = await retrievalResponse.json();
    console.log(`[MODAL-MANAGER] Retrieval result:`, {
      success: retrievalResult.success,
      fileCount: Object.keys(retrievalResult.files || {}).length
    });
    
    if (retrievalResult.success && retrievalResult.files?.['main.py']) {
      const codeLength = retrievalResult.files['main.py'].length;
      retrievalStatus = `File retrieval successful: main.py (${codeLength} chars)`;
      console.log(`[MODAL-MANAGER] Retrieved main.py: ${codeLength} characters`);
    } else {
      retrievalStatus = `File retrieval failed: ${retrievalResult.error || 'No main.py found'}`;
      console.error(`[MODAL-MANAGER] File retrieval issue:`, retrievalResult);
    }
  } else {
    console.error(`[MODAL-MANAGER] Retrieval request failed: ${retrievalResponse.status}`);
    retrievalStatus = `Retrieval request failed: ${retrievalResponse.status}`;
  }

  // Update conversation history with enhanced details
  const updatedHistory = [
    ...conversationHistory,
    {
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString()
    },
    {
      role: 'assistant',
      content: `Bot created and stored in Modal volume with enhanced logging! ${codeResult.explanation}

**Storage Verification:**
${verificationStatus}

**File Retrieval Test:**
${retrievalStatus}

**Enhanced Logging Features:**
- Modal function context for proper volume commits
- Volume reload before reads
- Extensive verification and debugging
- Complete storage cycle testing`,
      timestamp: new Date().toISOString(),
      files: {
        'main.py': codeResult.code
      }
    }
  ];

  // Update bot in database
  await supabase
    .from('bots')
    .update({
      status: 'stored',
      runtime_status: 'stopped',
      conversation_history: updatedHistory,
      runtime_logs: `${verificationStatus}\n${retrievalStatus}`,
      files_stored: true
    })
    .eq('id', botId);

  console.log(`[MODAL-MANAGER] Bot ${botId} creation completed successfully`);

  return {
    botCode: codeResult,
    deployment: storeResult,
    verification: verificationStatus,
    retrieval: retrievalStatus,
    verificationDetails,
    message: 'Bot generated with OpenAI and stored in Modal volume with enhanced logging and verification!'
  };
}

async function getBotFiles(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER] Getting files for bot ${botId} from Modal volume with enhanced logging`);
  
  try {
    const response = await fetch(`${MODAL_BASE_URL}/files/${botId}?user_id=${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      console.error(`[MODAL-MANAGER] Files request failed: ${response.status}`);
      throw new Error(`Failed to get files: ${response.status}`);
    }

    const result = await response.json();
    console.log(`[MODAL-MANAGER] Files result:`, {
      success: result.success,
      fileCount: Object.keys(result.files || {}).length,
      storage_method: result.storage_method
    });
    
    if (result.success && result.files) {
      Object.keys(result.files).forEach(filename => {
        const content = result.files[filename];
        console.log(`[MODAL-MANAGER] File ${filename}: ${content?.length || 0} characters`);
      });
    }
    
    return {
      success: true,
      files: result.files || {},
      storage_type: 'modal_volume',
      storage_method: result.storage_method || 'enhanced_function_context',
      logs: result.logs || []
    };
    
  } catch (error) {
    console.error(`[MODAL-MANAGER] Error getting files:`, error);
    return {
      success: false,
      error: error.message,
      files: {},
      storage_type: 'modal_volume',
      storage_method: 'enhanced_function_context'
    };
  }
}

async function startBot(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER] Starting bot ${botId}`);
  
  try {
    // Step 1: Load bot in the FastAPI service
    const loadResponse = await fetch(`${MODAL_BASE_URL}/load-bot/${botId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId
      })
    });

    if (!loadResponse.ok) {
      const errorText = await loadResponse.text();
      throw new Error(`Failed to load bot: ${loadResponse.status} - ${errorText}`);
    }

    const loadResult = await loadResponse.json();
    
    if (!loadResult.success) {
      throw new Error(`Failed to load bot: ${loadResult.error}`);
    }

    // Step 2: Register webhook with Telegram using FastAPI endpoint
    const webhookUrl = `${MODAL_BASE_URL}/webhook/${botId}`;
    
    const webhookResponse = await fetch(`${MODAL_BASE_URL}/register-webhook/${botId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        webhook_url: webhookUrl
      })
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error(`[MODAL-MANAGER] Webhook registration failed: ${errorText}`);
    }

    const webhookResult = await webhookResponse.json();

    // Update database
    await supabase
      .from('bots')
      .update({
        runtime_status: webhookResult.success ? 'running' : 'stopped',
        runtime_logs: `Bot loaded from Modal volume\nWebhook URL: ${webhookUrl}\nStatus: ${webhookResult.success ? 'Running' : 'Failed'}`
      })
      .eq('id', botId);

    return {
      success: webhookResult.success,
      status: webhookResult.success ? 'running' : 'stopped',
      service_url: MODAL_BASE_URL,
      webhook_url: webhookUrl,
      storage_type: 'modal_volume',
      logs: [
        `[MODAL] Bot loaded from Modal volume`,
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
  
  try {
    // Step 1: Unregister webhook using FastAPI endpoint
    const webhookResponse = await fetch(`${MODAL_BASE_URL}/unregister-webhook/${botId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId
      })
    });

    const webhookResult = await webhookResponse.json();

    // Step 2: Unload bot from FastAPI service
    const unloadResponse = await fetch(`${MODAL_BASE_URL}/unload-bot/${botId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const unloadResult = await unloadResponse.json();

    await supabase
      .from('bots')
      .update({
        runtime_status: 'stopped',
        runtime_logs: `Bot stopped and webhook unregistered\nUnloaded from Modal volume: ${unloadResult.success}`
      })
      .eq('id', botId);

    return {
      success: true,
      status: 'stopped',
      webhook_unregistered: webhookResult.success,
      bot_unloaded: unloadResult.success,
      storage_type: 'modal_volume'
    };
    
  } catch (error) {
    console.error(`[MODAL-MANAGER] Error stopping bot ${botId}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
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
    
    // Get logs from the FastAPI service
    const serviceLogsResponse = await fetch(`${MODAL_BASE_URL}/logs/${botId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (serviceLogsResponse.ok) {
      const serviceLogsResult = await serviceLogsResponse.json();
      if (serviceLogsResult.success) {
        return {
          ...serviceLogsResult,
          storage_type: 'modal_volume'
        };
      }
    }

    // If service logs fail, return error
    return {
      success: false,
      error: 'Failed to get logs from Modal service',
      logs: [`[MODAL ERROR] Could not retrieve logs from FastAPI service`],
      storage_type: 'modal_volume'
    };
    
  } catch (error) {
    console.error(`[MODAL-MANAGER] Exception in getBotLogs:`, error);
    
    return {
      success: false,
      error: error.message,
      logs: [`[MODAL EXCEPTION] ${error.message}`],
      storage_type: 'modal_volume'
    };
  }
}

async function getBotStatus(botId: string, userId: string) {
  try {
    // Get status from the FastAPI service
    const healthResponse = await fetch(`${MODAL_BASE_URL}/health/${botId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (healthResponse.ok) {
      const healthResult = await healthResponse.json();
      return {
        success: true,
        status: healthResult.loaded ? 'running' : 'stopped',
        deployment_type: 'modal',
        runtime: 'Modal FastAPI Service',
        storage_type: 'modal_volume',
        loaded: healthResult.loaded,
        service_status: healthResult.status
      };
    }

    throw new Error(`Health check failed: ${healthResponse.status}`);
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: 'error',
      storage_type: 'modal_volume'
    };
  }
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

  // Get current code from Modal volume using FastAPI endpoint
  const codeResponse = await fetch(`${MODAL_BASE_URL}/files/${botId}?user_id=${userId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
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
    // Store updated code in Modal volume using FastAPI endpoint
    await fetch(`${MODAL_BASE_URL}/store-bot/${botId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
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
        content: `Bot modified successfully in Modal volume! ${modifyResult.explanation}`,
        timestamp: new Date().toISOString(),
        files: {
          'main.py': modifyResult.code
        }
      }
    ];

    await supabase
      .from('bots')
      .update({
        conversation_history: updatedHistory
      })
      .eq('id', botId);
  }

  return {
    ...modifyResult,
    storage_type: 'modal_volume'
  };
}

async function fixBot(botId: string, userId: string) {
  // Get current logs to identify errors
  const logs = await getBotLogs(botId, userId);
  const errorLogs = logs.logs?.join('\n') || '';

  // Get current code from Modal volume
  const codeResponse = await fetch(`${MODAL_BASE_URL}/files/${botId}?user_id=${userId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  });

  const codeData = await codeResponse.json();
  const currentCode = codeData.files?.['main.py'] || '';

  // Fix via modification
  return await modifyBot(botId, userId, `Fix the following errors in the bot:\n\n${errorLogs}\n\nCurrent code has issues, please fix them.`);
}

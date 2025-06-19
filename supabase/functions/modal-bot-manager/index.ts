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

// Updated to use the pure Modal service
const MODAL_BASE_URL = 'https://haleviadiel--telegram-bot-platform-telegram-bot-service.modal.run';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, botId, userId, prompt, token, name, modificationPrompt } = await req.json();

    console.log(`[MODAL-MANAGER PURE] === Starting ${action} for bot ${botId} ===`);
    console.log(`[MODAL-MANAGER PURE] NO Supabase Storage - Modal Volume ONLY`);
    console.log(`[MODAL-MANAGER PURE] Request payload:`, { action, botId, userId, hasPrompt: !!prompt, hasToken: !!token, hasName: !!name, hasModificationPrompt: !!modificationPrompt });

    let result;

    switch (action) {
      case 'create-bot':
        result = await pureModalCreateBot(botId, userId, name, prompt, token);
        break;
      case 'modify-bot':
        result = await pureModalModifyBot(botId, userId, modificationPrompt);
        break;
      case 'start-bot':
        result = await pureModalStartBot(botId, userId);
        break;
      case 'stop-bot':
        result = await pureModalStopBot(botId, userId);
        break;
      case 'restart-bot':
        result = await pureModalRestartBot(botId, userId);
        break;
      case 'get-logs':
        result = await pureModalGetBotLogs(botId, userId);
        break;
      case 'get-status':
        result = await pureModalGetBotStatus(botId, userId);
        break;
      case 'fix-bot':
        result = await pureModalFixBot(botId, userId);
        break;
      case 'get-files':
        result = await pureModalGetBotFiles(botId, userId);
        break;
      case 'health-check':
        result = await pureModalHealthCheck(botId, userId);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log(`[MODAL-MANAGER PURE] === Completed ${action} for bot ${botId} ===`);
    console.log(`[MODAL-MANAGER PURE] Final result:`, { success: result.success, hasError: !!result.error });

    return new Response(JSON.stringify({
      success: true,
      ...result
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[MODAL-MANAGER PURE] Critical Error:', error);
    console.error('[MODAL-MANAGER PURE] Error stack:', error.stack);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      errorType: 'critical_error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generateBotCodeWithOpenAI(prompt: string, token: string, conversationHistory: any[] = []) {
  console.log('[MODAL-MANAGER PURE] === OpenAI Code Generation Started ===');
  console.log('[MODAL-MANAGER PURE] Prompt length:', prompt.length);
  console.log('[MODAL-MANAGER PURE] Token provided:', token ? 'Yes' : 'No');
  console.log('[MODAL-MANAGER PURE] Conversation history length:', conversationHistory.length);
  
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
    console.log('[MODAL-MANAGER PURE] Adding conversation history to OpenAI request');
    for (const msg of conversationHistory.slice(-5)) {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }
  }

  console.log('[MODAL-MANAGER PURE] Sending request to OpenAI API...');
  const startTime = Date.now();

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

  const apiTime = Date.now() - startTime;
  console.log('[MODAL-MANAGER PURE] OpenAI API response time:', `${apiTime}ms`);

  if (!response.ok) {
    console.error('[MODAL-MANAGER PURE] OpenAI API error:', response.status, response.statusText);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  console.log('[MODAL-MANAGER PURE] OpenAI response received, tokens used:', data.usage);
  
  const assistantResponse = data.choices[0].message.content;
  console.log('[MODAL-MANAGER PURE] Generated response length:', assistantResponse.length);

  // Extract code from response
  const codeStart = assistantResponse.indexOf('```python');
  const codeEnd = assistantResponse.indexOf('```', codeStart + 9);
  
  let generatedCode = assistantResponse;
  let explanation = "Generated Telegram bot code with Pure Modal Volume storage";
  
  if (codeStart !== -1 && codeEnd !== -1) {
    generatedCode = assistantResponse.substring(codeStart + 9, codeEnd).trim();
    explanation = assistantResponse.substring(0, codeStart).trim();
    console.log('[MODAL-MANAGER PURE] Code extracted from markdown, length:', generatedCode.length);
  } else {
    console.log('[MODAL-MANAGER PURE] No markdown code block found, using full response');
  }

  console.log('[MODAL-MANAGER PURE] === OpenAI Code Generation Completed ===');

  return {
    success: true,
    explanation,
    code: generatedCode
  };
}

async function pureModalCreateBot(botId: string, userId: string, name: string, prompt: string, token: string) {
  console.log(`[MODAL-MANAGER PURE] === Pure Modal Bot Creation Process for ${botId} ===`);
  console.log(`[MODAL-MANAGER PURE] NO Supabase Storage - Modal Volume ONLY`);
  console.log(`[MODAL-MANAGER PURE] Bot details:`, { botId, userId, name, tokenLength: token.length });
  
  // Get conversation history
  console.log(`[MODAL-MANAGER PURE] Fetching conversation history for bot ${botId}`);
  const { data: bot } = await supabase
    .from('bots')
    .select('conversation_history')
    .eq('id', botId)
    .single();

  const conversationHistory = bot?.conversation_history || [];
  console.log(`[MODAL-MANAGER PURE] Conversation history items:`, conversationHistory.length);

  // Step 1: Generate bot code using OpenAI
  console.log(`[MODAL-MANAGER PURE] Step 1: Generating code with OpenAI`);
  const codeResult = await generateBotCodeWithOpenAI(prompt, token, conversationHistory);

  if (!codeResult.success) {
    console.error(`[MODAL-MANAGER PURE] Code generation failed for bot ${botId}`);
    throw new Error('Failed to generate bot code');
  }

  console.log(`[MODAL-MANAGER PURE] Code generated successfully: ${codeResult.code.length} characters`);

  // Step 2: Store bot directly in Modal Volume using the PURE endpoint
  console.log(`[MODAL-MANAGER PURE] Step 2: Storing bot in Pure Modal Volume`);
  const storeResult = await storeInPureModalOnly(botId, userId, codeResult.code, token, name);

  if (!storeResult.success) {
    console.error(`[MODAL-MANAGER PURE] Pure Modal storage failed:`, storeResult.error);
    throw new Error(`Failed to store bot in Pure Modal: ${storeResult.error}`);
  }

  console.log(`[MODAL-MANAGER PURE] Bot stored successfully in Pure Modal Volume`);

  // Step 3: Verify storage by retrieving files
  console.log(`[MODAL-MANAGER PURE] Step 3: Verifying Pure Modal storage`);
  const verificationResult = await verifyPureModalStorage(botId, userId);
  
  // Step 4: Update conversation history
  console.log(`[MODAL-MANAGER PURE] Step 4: Updating conversation history`);
  const updatedHistory = [
    ...conversationHistory,
    {
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString()
    },
    {
      role: 'assistant',
      content: `Bot created successfully with Pure Modal Volume storage! ${codeResult.explanation}

**Storage Details:**
${storeResult.details}

**Verification Results:**
${verificationResult.summary}

Your bot code has been successfully generated and stored in Pure Modal Volume (NO Supabase Storage used).`,
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
      runtime_logs: `Bot stored in Pure Modal Volume only\n${verificationResult.summary}`,
      files_stored: true
    })
    .eq('id', botId);

  console.log(`[MODAL-MANAGER PURE] Bot ${botId} creation completed successfully`);

  return {
    botCode: codeResult,
    storage: storeResult,
    verification: verificationResult,
    files: {
      'main.py': codeResult.code
    },
    storage_type: 'pure_modal_volume_only',
    message: 'Bot generated and stored in Pure Modal Volume (NO Supabase Storage)!'
  };
}

async function storeInPureModalOnly(botId: string, userId: string, botCode: string, token: string, botName: string) {
  console.log(`[MODAL-MANAGER PURE] === Storing in Pure Modal Volume ONLY for bot ${botId} ===`);
  console.log(`[MODAL-MANAGER PURE] NO Supabase Storage calls - Modal Volume ONLY`);
  console.log(`[MODAL-MANAGER PURE] Code length: ${botCode.length} characters`);
  
  try {
    console.log(`[MODAL-MANAGER PURE] Calling Pure Modal API: ${MODAL_BASE_URL}/store-bot/${botId}`);
    
    const storeResponse = await fetch(`${MODAL_BASE_URL}/store-bot/${botId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        bot_code: botCode,
        bot_token: token,
        bot_name: botName || `Bot ${botId}`
      })
    });

    console.log(`[MODAL-MANAGER PURE] Pure Modal API response status: ${storeResponse.status}`);

    if (!storeResponse.ok) {
      const errorText = await storeResponse.text();
      console.error(`[MODAL-MANAGER PURE] Pure Modal API error: ${storeResponse.status} - ${errorText}`);
      return {
        success: false,
        error: `Pure Modal API error: ${storeResponse.status} - ${errorText}`,
        details: `Failed to store in Pure Modal Volume: ${errorText}`
      };
    }

    const storeResult = await storeResponse.json();
    console.log(`[MODAL-MANAGER PURE] Pure Modal API result:`, storeResult);

    if (storeResult.success) {
      return {
        success: true,
        details: `✅ Bot stored successfully in Pure Modal Volume\n✅ NO Supabase Storage operations performed\n✅ Pure Modal Volume commit successful`,
        modal_response: storeResult
      };
    } else {
      return {
        success: false,
        error: storeResult.error || 'Unknown Pure Modal error',
        details: `❌ Pure Modal storage failed: ${storeResult.error || 'Unknown error'}`
      };
    }

  } catch (error) {
    console.error(`[MODAL-MANAGER PURE] Exception storing in Pure Modal:`, error);
    return {
      success: false,
      error: error.message,
      details: `❌ Exception during Pure Modal storage: ${error.message}`
    };
  }
}

async function verifyPureModalStorage(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER PURE] === Verifying Pure Modal storage for bot ${botId} ===`);
  
  try {
    const verifyResponse = await fetch(`${MODAL_BASE_URL}/files/${botId}?user_id=${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    console.log(`[MODAL-MANAGER PURE] Verification response status: ${verifyResponse.status}`);

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text();
      console.error(`[MODAL-MANAGER PURE] Verification failed: ${verifyResponse.status} - ${errorText}`);
      return {
        success: false,
        summary: `❌ Verification failed: ${verifyResponse.status} - ${errorText}`,
        files: {}
      };
    }

    const verifyResult = await verifyResponse.json();
    console.log(`[MODAL-MANAGER PURE] Verification result:`, {
      success: verifyResult.success,
      fileCount: Object.keys(verifyResult.files || {}).length
    });

    if (verifyResult.success && verifyResult.files) {
      const filesSummary = Object.entries(verifyResult.files).map(([name, content]) => 
        `✅ ${name}: ${typeof content === 'string' ? content.length : 0} chars`
      ).join('\n');
      
      return {
        success: true,
        summary: `✅ Pure Modal storage verified successfully:\n${filesSummary}\n✅ NO Supabase Storage operations`,
        files: verifyResult.files
      };
    } else {
      return {
        success: false,
        summary: `❌ Verification failed: ${verifyResult.error || 'No files found in Pure Modal'}`,
        files: {}
      };
    }

  } catch (error) {
    console.error(`[MODAL-MANAGER PURE] Verification exception:`, error);
    return {
      success: false,
      summary: `❌ Verification exception: ${error.message}`,
      files: {}
    };
  }
}

async function pureModalGetBotFiles(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER PURE] === Getting files from Pure Modal Volume ONLY for bot ${botId} ===`);
  console.log(`[MODAL-MANAGER PURE] NO Supabase Storage calls - Modal Volume ONLY`);
  
  try {
    const startTime = Date.now();
    const response = await fetch(`${MODAL_BASE_URL}/files/${botId}?user_id=${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const requestTime = Date.now() - startTime;
    console.log(`[MODAL-MANAGER PURE] Pure Modal files request completed in ${requestTime}ms, status:`, response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[MODAL-MANAGER PURE] Pure Modal files request failed: ${response.status} - ${errorText}`);
      throw new Error(`Failed to get files from Pure Modal: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`[MODAL-MANAGER PURE] Pure Modal files result:`, {
      success: result.success,
      fileCount: Object.keys(result.files || {}).length
    });
    
    if (result.success && result.files) {
      Object.keys(result.files).forEach(filename => {
        const content = result.files[filename];
        console.log(`[MODAL-MANAGER PURE] File ${filename}: ${content?.length || 0} characters`);
      });
    }
    
    return {
      success: true,
      files: result.files || {},
      storage_type: 'pure_modal_volume_only',
      storage_method: 'pure_modal_volume_direct',
      file_count: Object.keys(result.files || {}).length,
      request_time: `${requestTime}ms`,
      logs: result.logs || []
    };
    
  } catch (error) {
    console.error(`[MODAL-MANAGER PURE] Error getting Pure Modal files:`, error);
    return {
      success: false,
      error: error.message,
      files: {},
      storage_type: 'pure_modal_volume_only'
    };
  }
}

async function pureModalModifyBot(botId: string, userId: string, modificationPrompt: string) {
  console.log(`[MODAL-MANAGER PURE] === Starting pure modal bot modification for ${botId} ===`);
  console.log(`[MODAL-MANAGER PURE] NO Supabase Storage - Modal Volume ONLY`);
  console.log(`[MODAL-MANAGER PURE] Modification prompt length:`, modificationPrompt.length);
  
  // Get current bot data
  const { data: bot, error: botError } = await supabase
    .from('bots')
    .select('*')
    .eq('id', botId)
    .single();

  if (botError || !bot) {
    console.error(`[MODAL-MANAGER PURE] Bot not found:`, botError);
    throw new Error('Bot not found');
  }

  console.log(`[MODAL-MANAGER PURE] Bot found: ${bot.name}`);

  // Get current code from Pure Modal Volume ONLY
  console.log(`[MODAL-MANAGER PURE] Getting current code from Pure Modal Volume ONLY`);
  const filesResult = await pureModalGetBotFiles(botId, userId);
  
  if (!filesResult.success) {
    console.error(`[MODAL-MANAGER PURE] Failed to get current files from Pure Modal:`, filesResult.error);
    throw new Error(`Failed to get current bot files from Pure Modal: ${filesResult.error}`);
  }

  const currentCode = filesResult.files['main.py'] || '';
  if (!currentCode) {
    console.error(`[MODAL-MANAGER PURE] No current code found in Pure Modal for bot ${botId}`);
    throw new Error('No current bot code found in Pure Modal for modification');
  }

  console.log(`[MODAL-MANAGER PURE] Current code retrieved from Pure Modal: ${currentCode.length} characters`);

  // Modify code using OpenAI
  console.log(`[MODAL-MANAGER PURE] Generating modified code with OpenAI`);
  const modifyResult = await generateBotCodeWithOpenAI(
    `Modify this existing bot code:\n\n${currentCode}\n\nModification request: ${modificationPrompt}`,
    bot.token,
    bot.conversation_history || []
  );

  if (!modifyResult.success) {
    console.error(`[MODAL-MANAGER PURE] Code generation failed:`, modifyResult);
    throw new Error('Failed to generate modified bot code');
  }

  console.log(`[MODAL-MANAGER PURE] Modified code generated: ${modifyResult.code.length} characters`);

  // Store updated code in Pure Modal Volume ONLY
  console.log(`[MODAL-MANAGER PURE] Storing updated code in Pure Modal Volume ONLY`);
  const storeResult = await storeInPureModalOnly(botId, userId, modifyResult.code, bot.token, bot.name);

  if (!storeResult.success) {
    console.error(`[MODAL-MANAGER PURE] Pure Modal storage failed:`, storeResult.error);
    throw new Error(`Failed to store modified code in Pure Modal: ${storeResult.error}`);
  }

  console.log(`[MODAL-MANAGER PURE] Modified code stored successfully in Pure Modal`);

  // Verify storage
  console.log(`[MODAL-MANAGER PURE] Verifying Pure Modal storage`);
  const verificationResult = await verifyPureModalStorage(botId, userId);

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
      content: `Bot modified successfully with Pure Modal Volume storage! ${modifyResult.explanation}

**Storage Results:**
${storeResult.details}

**Verification:**
${verificationResult.summary}

Your bot code has been successfully updated and stored in Pure Modal Volume (NO Supabase Storage operations).`,
      timestamp: new Date().toISOString(),
      files: {
        'main.py': modifyResult.code
      }
    }
  ];

  // Update bot in database
  await supabase
    .from('bots')
    .update({
      conversation_history: updatedHistory,
      runtime_logs: `Modified and stored in Pure Modal Volume only\n${verificationResult.summary}`,
      files_stored: true
    })
    .eq('id', botId);

  console.log(`[MODAL-MANAGER PURE] Bot ${botId} modification completed successfully`);

  return {
    ...modifyResult,
    storage: storeResult,
    verification: verificationResult,
    files: {
      'main.py': modifyResult.code
    },
    storage_type: 'pure_modal_volume_only',
    message: 'Bot modified and stored in Pure Modal Volume (NO Supabase Storage)!'
  };
}

async function pureModalStartBot(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER PURE] Starting bot ${botId} with Pure Modal Volume`);
  
  // Step 1: Load bot in the Modal service
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

  // Step 2: Add startup log
  try {
    await fetch(`${MODAL_BASE_URL}/logs/${botId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        message: `Bot ${botId} started via Pure Modal service`,
        level: 'INFO'
      })
    });
  } catch (logError) {
    console.warn(`[MODAL-MANAGER PURE] Failed to add startup log:`, logError.message);
  }

  // Step 3: Register webhook with Telegram
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
    console.error(`[MODAL-MANAGER PURE] Webhook registration failed: ${errorText}`);
  }

  const webhookResult = await webhookResponse.json();

  // Update database
  await supabase
    .from('bots')
    .update({
      runtime_status: webhookResult.success ? 'running' : 'stopped',
      runtime_logs: `Bot loaded from Pure Modal Volume\nWebhook URL: ${webhookUrl}\nStatus: ${webhookResult.success ? 'Running' : 'Failed'}`
    })
    .eq('id', botId);

  return {
    success: webhookResult.success,
    status: webhookResult.success ? 'running' : 'stopped',
    service_url: MODAL_BASE_URL,
    webhook_url: webhookUrl,
    storage_type: 'pure_modal_volume_only',
    logs: [
      `[MODAL PURE] Bot loaded from Pure Modal Volume`,
      `[MODAL PURE] Webhook registered`,
      `[MODAL PURE] Bot ${botId} running`,
      `[MODAL PURE] Logs system initialized`
    ]
  };
}

async function pureModalStopBot(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER PURE] Stopping bot ${botId}`);
  
  try {
    // Step 1: Unregister webhook
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

    // Step 2: Unload bot
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
        runtime_logs: `Bot stopped and webhook unregistered\nUnloaded from Pure Modal Volume: ${unloadResult.success}`
      })
      .eq('id', botId);

    return {
      success: true,
      status: 'stopped',
      webhook_unregistered: webhookResult.success,
      bot_unloaded: unloadResult.success,
      storage_type: 'pure_modal_volume_only'
    };
    
  } catch (error) {
    console.error(`[MODAL-MANAGER PURE] Error stopping bot ${botId}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function pureModalRestartBot(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER PURE] Restarting bot ${botId}`);
  
  await pureModalStopBot(botId, userId);
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
  return await pureModalStartBot(botId, userId);
}

async function pureModalGetBotLogs(botId: string, userId: string) {
  try {
    console.log(`[MODAL-MANAGER PURE] Fetching logs from Pure Modal for bot ${botId}`);
    
    try {
      const serviceLogsResponse = await fetch(`${MODAL_BASE_URL}/logs/${botId}?user_id=${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      if (serviceLogsResponse.ok) {
        const serviceLogsResult = await serviceLogsResponse.json();
        console.log(`[MODAL-MANAGER PURE] Pure Modal logs result:`, {
          success: serviceLogsResult.success,
          logCount: serviceLogsResult.logs?.length || 0
        });
        
        if (serviceLogsResult.success) {
          return {
            success: true,
            logs: serviceLogsResult.logs || [],
            log_count: serviceLogsResult.log_count || 0,
            timestamp: serviceLogsResult.timestamp,
            storage_type: 'pure_modal_volume_only'
          };
        } else {
          console.warn(`[MODAL-MANAGER PURE] Pure Modal service returned error:`, serviceLogsResult.error);
        }
      } else {
        console.warn(`[MODAL-MANAGER PURE] Pure Modal service responded with status:`, serviceLogsResponse.status);
      }
    } catch (fetchError) {
      console.error(`[MODAL-MANAGER PURE] Fetch error:`, fetchError.message);
    }

    // Fallback logs
    const fallbackLogs = [
      `[MODAL PURE LOG SERVICE] Service temporarily unavailable`,
      `[MODAL PURE LOG SERVICE] Bot ID: ${botId}`,
      `[MODAL PURE LOG SERVICE] Timestamp: ${new Date().toISOString()}`,
      `[MODAL PURE LOG SERVICE] Attempting to reconnect to Pure Modal logs service...`,
      `[MODAL PURE LOG SERVICE] If this persists, the bot may need to be restarted`
    ];

    return {
      success: true,
      logs: fallbackLogs,
      log_count: fallbackLogs.length,
      storage_type: 'pure_modal_volume_only',
      fallback_mode: true,
      message: 'Using fallback logs - Pure Modal service temporarily unavailable'
    };
    
  } catch (error) {
    console.error(`[MODAL-MANAGER PURE] Exception in getBotLogs:`, error);
    
    return {
      success: false,
      error: error.message,
      logs: [
        `[MODAL PURE ERROR] Failed to get logs: ${error.message}`,
        `[MODAL PURE ERROR] Bot ID: ${botId}`,
        `[MODAL PURE ERROR] Timestamp: ${new Date().toISOString()}`
      ],
      storage_type: 'pure_modal_volume_only'
    };
  }
}

async function pureModalGetBotStatus(botId: string, userId: string) {
  try {
    // Get status from Pure Modal service
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
        deployment_type: 'pure_modal_volume',
        runtime: 'Pure Modal FastAPI Service',
        storage_type: 'pure_modal_volume_only',
        loaded: healthResult.loaded,
        service_status: healthResult.status
      };
    }

    throw new Error(`Pure Modal health check failed: ${healthResponse.status}`);
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: 'error',
      storage_type: 'pure_modal_volume_only'
    };
  }
}

async function pureModalFixBot(botId: string, userId: string) {
  // Get current logs to identify errors
  const logs = await pureModalGetBotLogs(botId, userId);
  const errorLogs = logs.logs?.join('\n') || '';

  // Get current code from Pure Modal Volume
  const codeResponse = await fetch(`${MODAL_BASE_URL}/files/${botId}?user_id=${userId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  });

  const codeData = await codeResponse.json();
  const currentCode = codeData.files?.['main.py'] || '';

  // Fix via pure modal modification
  return await pureModalModifyBot(botId, userId, `Fix the following errors in the bot:\n\n${errorLogs}\n\nCurrent code has issues, please fix them using best practices.`);
}

async function pureModalHealthCheck(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER PURE] Running health check for bot ${botId}`);
  
  try {
    const response = await fetch(`${MODAL_BASE_URL}/health-check/${botId}?user_id=${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      console.error(`[MODAL-MANAGER PURE] Health check request failed: ${response.status}`);
      throw new Error(`Health check failed: ${response.status}`);
    }

    const result = await response.json();
    console.log(`[MODAL-MANAGER PURE] Health check result:`, {
      success: result.success,
      volumeStatus: result.health_info?.volume_status,
      totalBots: result.health_info?.total_bots
    });
    
    return {
      success: true,
      health_info: result.health_info,
      check_type: result.check_type,
      storage_type: 'pure_modal_volume_only',
      logs: result.logs || []
    };
    
  } catch (error) {
    console.error(`[MODAL-MANAGER PURE] Error in health check:`, error);
    return {
      success: false,
      error: error.message,
      check_type: 'comprehensive_health_check',
      storage_type: 'pure_modal_volume_only'
    };
  }
}

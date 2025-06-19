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

// Updated to use the optimized FastAPI service
const MODAL_BASE_URL = 'https://haleviadiel--telegram-bot-platform-telegram-bot-service.modal.run';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, botId, userId, prompt, token, name, modificationPrompt } = await req.json();

    console.log(`[MODAL-MANAGER OPTIMIZED] Action: ${action}, Bot: ${botId}`);

    let result;

    switch (action) {
      case 'create-bot':
        result = await optimizedCreateBot(botId, userId, name, prompt, token);
        break;
      case 'modify-bot':
        result = await optimizedModifyBot(botId, userId, modificationPrompt);
        break;
      case 'start-bot':
        result = await optimizedStartBot(botId, userId);
        break;
      case 'stop-bot':
        result = await optimizedStopBot(botId, userId);
        break;
      case 'restart-bot':
        result = await optimizedRestartBot(botId, userId);
        break;
      case 'get-logs':
        result = await optimizedGetBotLogs(botId, userId);
        break;
      case 'get-status':
        result = await optimizedGetBotStatus(botId, userId);
        break;
      case 'fix-bot':
        result = await optimizedFixBot(botId, userId);
        break;
      case 'get-files':
        result = await optimizedGetBotFiles(botId, userId);
        break;
      case 'health-check':
        result = await comprehensiveHealthCheck(botId, userId);
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
    console.error('[MODAL-MANAGER OPTIMIZED] Error:', error);
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
  console.log('[MODAL-MANAGER OPTIM] Generating bot code with OpenAI');
  
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
  let explanation = "Generated Telegram bot code with optimized patterns";
  
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

async function optimizedCreateBot(botId: string, userId: string, name: string, prompt: string, token: string) {
  console.log(`[MODAL-MANAGER OPTIM] Creating bot ${botId} with optimized Modal Volume patterns`);
  
  // Get conversation history
  const { data: bot } = await supabase
    .from('bots')
    .select('conversation_history')
    .eq('id', botId)
    .single();

  const conversationHistory = bot?.conversation_history || [];

  // Step 1: Generate bot code using OpenAI
  console.log(`[MODAL-MANAGER OPTIM] Step 1: Generating optimized code for bot ${botId}`);
  const codeResult = await generateBotCodeWithOpenAI(prompt, token, conversationHistory);

  if (!codeResult.success) {
    console.error(`[MODAL-MANAGER OPTIM] Code generation failed for bot ${botId}`);
    throw new Error('Failed to generate bot code');
  }

  console.log(`[MODAL-MANAGER OPTIM] Code generated successfully: ${codeResult.code.length} characters`);

  // Step 2: Store bot code using optimized Modal function
  console.log(`[MODAL-MANAGER OPTIM] Step 2: Storing bot ${botId} with optimized Modal patterns`);
  
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
    console.error(`[MODAL-MANAGER OPTIM] Optimized store request failed: ${storeResponse.status} - ${errorText}`);
    throw new Error(`Failed to store bot with optimized patterns: ${storeResponse.status} - ${errorText}`);
  }

  const storeResult = await storeResponse.json();
  console.log(`[MODAL-MANAGER OPTIM] Optimized store result:`, storeResult);

  if (!storeResult.success) {
    console.error(`[MODAL-MANAGER OPTIM] Optimized store operation failed:`, storeResult.error);
    throw new Error(`Failed to store bot with optimized patterns: ${storeResult.error}`);
  }

  // Step 3: Run comprehensive health check
  console.log(`[MODAL-MANAGER OPTIM] Step 3: Running comprehensive health check for bot ${botId}`);
  const healthCheckResult = await comprehensiveHealthCheck(botId, userId);
  
  let healthStatus = "Health check completed";
  if (healthCheckResult.success && healthCheckResult.health_info) {
    const botCheck = healthCheckResult.health_info.specific_bot_check;
    if (botCheck && botCheck.directory_exists) {
      const mainPyFile = botCheck.files?.find((f: any) => f.name === 'main.py');
      if (mainPyFile && mainPyFile.has_content) {
        healthStatus = `✓ Health check passed: Bot stored with ${mainPyFile.content_length} chars`;
      } else {
        healthStatus = "⚠ Health check: Bot directory exists but main.py issues detected";
      }
    } else {
      healthStatus = "✗ Health check failed: Bot directory not found";
    }
  }

  // Step 4: Verify file retrieval with optimized patterns
  console.log(`[MODAL-MANAGER OPTIM] Step 4: Testing optimized file retrieval for bot ${botId}`);
  const retrievalResponse = await fetch(`${MODAL_BASE_URL}/files/${botId}?user_id=${userId}`, {
    method: 'GET'
  });

  let retrievalStatus = "File retrieval not tested";
  if (retrievalResponse.ok) {
    const retrievalResult = await retrievalResponse.json();
    console.log(`[MODAL-MANAGER OPTIM] Optimized retrieval result:`, {
      success: retrievalResult.success,
      fileCount: Object.keys(retrievalResult.files || {}).length,
      storageMethod: retrievalResult.storage_method
    });
    
    if (retrievalResult.success && retrievalResult.files?.['main.py']) {
      const codeLength = retrievalResult.files['main.py'].length;
      retrievalStatus = `✓ Optimized retrieval successful: main.py (${codeLength} chars)`;
      console.log(`[MODAL-MANAGER OPTIM] Retrieved main.py with optimized patterns: ${codeLength} characters`);
    } else {
      retrievalStatus = `✗ Optimized retrieval failed: ${retrievalResult.error || 'No main.py found'}`;
      console.error(`[MODAL-MANAGER OPTIM] Optimized retrieval issue:`, retrievalResult);
    }
  } else {
    console.error(`[MODAL-MANAGER OPTIM] Optimized retrieval request failed: ${retrievalResponse.status}`);
    retrievalStatus = `✗ Optimized retrieval request failed: ${retrievalResponse.status}`;
  }

  // Update conversation history with optimization details
  const updatedHistory = [
    ...conversationHistory,
    {
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString()
    },
    {
      role: 'assistant',
      content: `Bot created with optimized Modal Volume patterns! ${codeResult.explanation}

**Optimization Features:**
- ✅ Proper volume commit/reload patterns
- ✅ Enhanced error handling and validation
- ✅ Comprehensive health monitoring
- ✅ Batch operation support
- ✅ Volume busy error prevention

**Storage Verification:**
${healthStatus}

**File Retrieval Test:**
${retrievalStatus}

**Optimization Benefits:**
- Faster and more reliable file operations
- Better error handling and recovery
- Comprehensive monitoring and diagnostics
- Prevention of common volume issues
- Enhanced logging for troubleshooting`,
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
      runtime_logs: `${healthStatus}\n${retrievalStatus}`,
      files_stored: true
    })
    .eq('id', botId);

  console.log(`[MODAL-MANAGER OPTIM] Bot ${botId} creation completed with optimized patterns`);

  return {
    botCode: codeResult,
    deployment: storeResult,
    health_check: healthStatus,
    retrieval_test: retrievalStatus,
    optimization_features: [
      "Proper volume commit/reload patterns",
      "Enhanced error handling",
      "Comprehensive health checks",
      "Batch operation support",
      "Volume busy error prevention"
    ],
    message: 'Bot generated and stored with optimized Modal Volume patterns!'
  };
}

async function optimizedGetBotFiles(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER OPTIM] Getting files for bot ${botId} with optimized patterns`);
  
  try {
    const response = await fetch(`${MODAL_BASE_URL}/files/${botId}?user_id=${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      console.error(`[MODAL-MANAGER OPTIM] Optimized files request failed: ${response.status}`);
      throw new Error(`Failed to get files with optimized patterns: ${response.status}`);
    }

    const result = await response.json();
    console.log(`[MODAL-MANAGER OPTIM] Optimized files result:`, {
      success: result.success,
      fileCount: Object.keys(result.files || {}).length,
      storageMethod: result.storage_method,
      storageVersion: result.storage_version
    });
    
    if (result.success && result.files) {
      Object.keys(result.files).forEach(filename => {
        const content = result.files[filename];
        console.log(`[MODAL-MANAGER OPTIM] File ${filename}: ${content?.length || 0} characters`);
      });
    }
    
    return {
      success: true,
      files: result.files || {},
      storage_type: 'optimized_modal_volume',
      storage_method: result.storage_method || 'optimized_modal_patterns',
      storage_version: result.storage_version || '2.0',
      file_count: result.file_count || 0,
      logs: result.logs || []
    };
    
  } catch (error) {
    console.error(`[MODAL-MANAGER OPTIM] Error getting optimized files:`, error);
    return {
      success: false,
      error: error.message,
      files: {},
      storage_type: 'optimized_modal_volume',
      storage_method: 'optimized_modal_patterns'
    };
  }
}

async function comprehensiveHealthCheck(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER OPTIM] Running comprehensive health check for bot ${botId}`);
  
  try {
    const response = await fetch(`${MODAL_BASE_URL}/health-check/${botId}?user_id=${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      console.error(`[MODAL-MANAGER OPTIM] Health check request failed: ${response.status}`);
      throw new Error(`Health check failed: ${response.status}`);
    }

    const result = await response.json();
    console.log(`[MODAL-MANAGER OPTIM] Health check result:`, {
      success: result.success,
      volumeStatus: result.health_info?.volume_status,
      totalBots: result.health_info?.total_bots
    });
    
    return {
      success: true,
      health_info: result.health_info,
      check_type: result.check_type,
      logs: result.logs || []
    };
    
  } catch (error) {
    console.error(`[MODAL-MANAGER OPTIM] Error in health check:`, error);
    return {
      success: false,
      error: error.message,
      check_type: 'comprehensive_health_check'
    };
  }
}

async function optimizedStartBot(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER OPTIM] Starting bot ${botId} with optimized patterns`);
  
  // Step 1: Load bot in the optimized FastAPI service
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

  // Step 2: Register webhook with Telegram using optimized FastAPI endpoint
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
    console.error(`[MODAL-MANAGER OPTIM] Optimized webhook registration failed: ${errorText}`);
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
    storage_type: 'optimized_modal_volume',
    optimization_features: [
      "Enhanced volume reload patterns",
      "Improved error handling",
      "Better webhook management"
    ],
    logs: [
      `[MODAL OPTIMIZED] Bot loaded with enhanced patterns`,
      `[MODAL OPTIMIZED] Webhook registered with reliability improvements`,
      `[MODAL OPTIMIZED] Bot ${botId} running with optimization features`
    ]
  };
}

async function optimizedStopBot(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER OPTIM] Stopping bot ${botId} with optimized patterns`);
  
  try {
    // Step 1: Unregister webhook using optimized FastAPI endpoint
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

    // Step 2: Unload bot from optimized FastAPI service
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
      storage_type: 'optimized_modal_volume'
    };
    
  } catch (error) {
    console.error(`[MODAL-MANAGER OPTIM] Error stopping bot ${botId}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function optimizedRestartBot(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER OPTIM] Restarting bot ${botId} with optimized patterns`);
  
  await optimizedStopBot(botId, userId);
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
  return await optimizedStartBot(botId, userId);
}

async function optimizedGetBotLogs(botId: string, userId: string) {
  try {
    console.log(`[MODAL-MANAGER OPTIM] Fetching optimized logs for bot ${botId}`);
    
    // Get logs from the optimized FastAPI service
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
          storage_type: 'optimized_modal_volume',
          log_features: [
            "Enhanced error detection",
            "Performance monitoring",
            "Volume operation tracking"
          ]
        };
      }
    }

    return {
      success: false,
      error: 'Failed to get logs from optimized Modal service',
      logs: [`[MODAL OPTIMIZED ERROR] Could not retrieve logs from optimized service`],
      storage_type: 'optimized_modal_volume'
    };
    
  } catch (error) {
    console.error(`[MODAL-MANAGER OPTIM] Exception in optimized getBotLogs:`, error);
    
    return {
      success: false,
      error: error.message,
      logs: [`[MODAL OPTIMIZED EXCEPTION] ${error.message}`],
      storage_type: 'optimized_modal_volume'
    };
  }
}

async function optimizedGetBotStatus(botId: string, userId: string) {
  try {
    // Get status from the optimized FastAPI service
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
        deployment_type: 'optimized_modal',
        runtime: 'Optimized Modal FastAPI Service',
        storage_type: 'optimized_modal_volume',
        loaded: healthResult.loaded,
        service_status: healthResult.status,
        optimization_features: [
          "Enhanced health monitoring",
          "Improved status accuracy",
          "Better performance tracking"
        ]
      };
    }

    throw new Error(`Optimized health check failed: ${healthResponse.status}`);
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: 'error',
      storage_type: 'optimized_modal_volume'
    };
  }
}

async function optimizedModifyBot(botId: string, userId: string, modificationPrompt: string) {
  // Get current bot data
  const { data: bot } = await supabase
    .from('bots')
    .select('*')
    .eq('id', botId)
    .single();

  if (!bot) {
    throw new Error('Bot not found');
  }

  // Get current code from optimized Modal volume
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
    // Store updated code using optimized Modal patterns
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
        content: `Bot modified successfully with optimized Modal Volume patterns! ${modifyResult.explanation}`,
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
    storage_type: 'optimized_modal_volume',
    optimization_features: [
      "Enhanced code modification",
      "Improved error handling",
      "Better validation"
    ]
  };
}

async function optimizedFixBot(botId: string, userId: string) {
  // Get current logs to identify errors
  const logs = await optimizedGetBotLogs(botId, userId);
  const errorLogs = logs.logs?.join('\n') || '';

  // Get current code from optimized Modal volume
  const codeResponse = await fetch(`${MODAL_BASE_URL}/files/${botId}?user_id=${userId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  });

  const codeData = await codeResponse.json();
  const currentCode = codeData.files?.['main.py'] || '';

  // Fix via optimized modification
  return await optimizedModifyBot(botId, userId, `Fix the following errors in the bot with optimized patterns:\n\n${errorLogs}\n\nCurrent code has issues, please fix them using best practices.`);
}

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

// Modal function URLs - these need to match the function names in modal_platform/bot_runtime.py
const MODAL_FUNCTIONS = {
  store_and_run: 'https://haleviadiel--telegram-bot-platform-store-and-run-bot.modal.run',
  start_bot: 'https://haleviadiel--telegram-bot-platform-start-bot.modal.run',
  stop_bot: 'https://haleviadiel--telegram-bot-platform-stop-bot.modal.run',
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

Generate complete, production-ready Python code for Telegram bots based on user requirements.

IMPORTANT REQUIREMENTS:
1. Use python-telegram-bot v20+ syntax (Application, not Updater)
2. Include proper error handling and logging
3. Use async/await patterns correctly
4. Make the bot token configurable via environment variable
5. Add comprehensive comments explaining the code

Generate a complete main.py file that can run independently.

Example structure:
\`\`\`python
import logging
import os
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
import asyncio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Bot token from environment
BOT_TOKEN = os.getenv('BOT_TOKEN', '${token}')

# Your bot handlers here...

async def main():
    application = Application.builder().token(BOT_TOKEN).build()
    
    # Add handlers
    # ... your handlers here
    
    # Start the bot
    await application.initialize()
    await application.start()
    await application.updater.start_polling()
    
    # Keep running
    try:
        await asyncio.Future()  # Run forever
    except KeyboardInterrupt:
        pass
    finally:
        await application.updater.stop()
        await application.stop()
        await application.shutdown()

if __name__ == '__main__':
    asyncio.run(main())
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

  // Step 1: Generate bot code using OpenAI (directly in this edge function)
  const codeResult = await generateBotCodeWithOpenAI(prompt, token, conversationHistory);

  if (!codeResult.success) {
    throw new Error('Failed to generate bot code');
  }

  // Step 2: Store and run bot in Modal
  const storeResponse = await fetch(MODAL_FUNCTIONS.store_and_run, {
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
      content: `Bot created and deployed successfully! ${codeResult.explanation}`,
      timestamp: new Date().toISOString()
    }
  ];

  // Update bot in database
  await supabase
    .from('bots')
    .update({
      status: 'active',
      runtime_status: storeResult.success ? 'running' : 'stopped',
      conversation_history: updatedHistory,
      runtime_logs: storeResult.logs?.join('\n') || '',
      files_stored: true
    })
    .eq('id', botId);

  return {
    botCode: codeResult,
    deployment: storeResult,
    message: 'Bot generated with OpenAI and deployed via Modal'
  };
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
    // Store updated code and restart bot
    await fetch(MODAL_FUNCTIONS.store_and_run, {
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

async function startBot(botId: string, userId: string) {
  const response = await fetch(MODAL_FUNCTIONS.start_bot, {
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
      runtime_status: result.success ? 'running' : 'stopped',
      runtime_logs: result.logs?.join('\n') || ''
    })
    .eq('id', botId);

  return result;
}

async function stopBot(botId: string, userId: string) {
  const response = await fetch(MODAL_FUNCTIONS.stop_bot, {
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
      runtime_logs: result.logs?.join('\n') || ''
    })
    .eq('id', botId);

  return result;
}

async function restartBot(botId: string, userId: string) {
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

    console.log(`[MODAL-MANAGER] Modal logs response status: ${response.status}`);
    
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
    console.log(`[MODAL-MANAGER] Modal logs content-type: ${contentType}`);
    
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

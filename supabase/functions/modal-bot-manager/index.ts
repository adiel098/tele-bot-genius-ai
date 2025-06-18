
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

// These will be the actual Modal function URLs after deployment
// You'll need to update these with the real URLs from `modal deploy`
const MODAL_FUNCTIONS = {
  generate_code: 'https://haleviadiel--bot-code-generator-generate-telegram-bot-code.modal.run',
  modify_code: 'https://haleviadiel--bot-code-generator-modify-bot-code.modal.run',
  create_deploy: 'https://haleviadiel--telegram-bot-platform-create-and-deploy-bot.modal.run',
  start_bot: 'https://haleviadiel--telegram-bot-platform-start-telegram-bot.modal.run',
  stop_bot: 'https://haleviadiel--telegram-bot-platform-stop-telegram-bot.modal.run',
  get_logs: 'https://haleviadiel--telegram-bot-platform-get-bot-logs.modal.run',
  get_status: 'https://haleviadiel--telegram-bot-platform-get-bot-status.modal.run',
  get_files: 'https://haleviadiel--telegram-bot-platform-get-bot-files.modal.run'
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

async function createBot(botId: string, userId: string, name: string, prompt: string, token: string) {
  console.log(`[MODAL-MANAGER] Creating bot via Modal`);
  
  // Get conversation history
  const { data: bot } = await supabase
    .from('bots')
    .select('conversation_history')
    .eq('id', botId)
    .single();

  const conversationHistory = bot?.conversation_history || [];

  // Step 1: Generate bot code using Modal
  const codeResponse = await fetch(MODAL_FUNCTIONS.generate_code, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      bot_token: token,
      conversation_history: conversationHistory
    })
  });

  if (!codeResponse.ok) {
    throw new Error(`Modal code generation failed: ${codeResponse.status}`);
  }

  const botCodeResult = await codeResponse.json();

  if (!botCodeResult.success) {
    throw new Error(botCodeResult.error || 'Failed to generate bot code');
  }

  // Step 2: Create and deploy bot in Modal
  const deployResponse = await fetch(MODAL_FUNCTIONS.create_deploy, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      bot_id: botId,
      user_id: userId,
      bot_code: botCodeResult.code,
      bot_token: token,
      bot_name: name || `Bot ${botId}`
    })
  });

  const deployResult = await deployResponse.json();

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
      content: `Bot created and deployed successfully! ${botCodeResult.explanation}`,
      timestamp: new Date().toISOString()
    }
  ];

  // Update bot in database
  await supabase
    .from('bots')
    .update({
      status: 'active',
      runtime_status: deployResult.success ? 'running' : 'stopped',
      conversation_history: updatedHistory,
      container_id: deployResult.bot_id,
      runtime_logs: deployResult.logs?.join('\n') || '',
      files_stored: true
    })
    .eq('id', botId);

  return {
    botCode: botCodeResult,
    deployment: deployResult,
    message: 'Bot generated and deployed via Modal'
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

  // Modify code via Modal
  const modifyResponse = await fetch(MODAL_FUNCTIONS.modify_code, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      bot_id: botId,
      user_id: userId,
      modification_prompt: modificationPrompt,
      current_code: currentCode,
      conversation_history: bot.conversation_history || []
    })
  });

  const modifyResult = await modifyResponse.json();

  if (modifyResult.success) {
    // Restart bot with new code
    await restartBot(botId, userId);

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

  return await response.json();
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

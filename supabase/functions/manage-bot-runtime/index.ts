
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { startTelegramBot, stopTelegramBot, getBotLogs } from './bot-executor.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function startBot(botId: string, userId: string) {
  try {
    // Get bot data and files
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('*')
      .eq('id', botId)
      .single();

    if (botError || !bot) {
      throw new Error('Bot not found');
    }

    // Get bot files from storage
    const { data: filesList, error: filesError } = await supabase.storage
      .from('bot-files')
      .list(`${userId}/${botId}`);

    if (filesError) {
      console.error('Failed to list bot files:', filesError);
      throw new Error('Failed to retrieve bot files');
    }

    // Get main.py content
    const { data: mainFileData, error: mainFileError } = await supabase.storage
      .from('bot-files')
      .download(`${userId}/${botId}/main.py`);

    if (mainFileError || !mainFileData) {
      throw new Error('Bot main.py file not found');
    }

    const botCode = await mainFileData.text();

    // Create new execution record
    const { data: execution, error: execError } = await supabase
      .from('bot_executions')
      .insert({
        bot_id: botId,
        user_id: userId,
        status: 'starting'
      })
      .select()
      .single();

    if (execError) throw execError;

    // Update bot status to starting
    await supabase
      .from('bots')
      .update({
        runtime_status: 'starting',
        runtime_logs: `[${new Date().toISOString()}] Starting Telegram bot...\n`,
        last_restart: new Date().toISOString()
      })
      .eq('id', botId);

    // Start the actual Telegram bot
    const result = await startTelegramBot(botId, bot.token, botCode);
    
    const logsText = result.logs.join('\n') + '\n';
    
    if (result.success) {
      // Update bot status to running
      await supabase
        .from('bots')
        .update({
          runtime_status: 'running',
          runtime_logs: logsText,
          container_id: `telegram-bot-${botId}` // Use a logical container ID
        })
        .eq('id', botId);

      await supabase
        .from('bot_executions')
        .update({
          status: 'running'
        })
        .eq('id', execution.id);

      return { success: true, executionId: execution.id, logs: result.logs };
    } else {
      // Update bot status to error
      await supabase
        .from('bots')
        .update({
          runtime_status: 'error',
          runtime_logs: logsText
        })
        .eq('id', botId);

      throw new Error(result.logs.join('\n'));
    }

  } catch (error) {
    console.error('Failed to start bot:', error);
    
    await supabase
      .from('bots')
      .update({
        runtime_status: 'error',
        runtime_logs: `[${new Date().toISOString()}] Failed to start: ${error.message}\n`
      })
      .eq('id', botId);

    throw error;
  }
}

async function stopBot(botId: string) {
  try {
    // Get current execution
    const { data: execution } = await supabase
      .from('bot_executions')
      .select('id')
      .eq('bot_id', botId)
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Stop the bot
    const result = stopTelegramBot(botId);
    const logsText = result.logs.join('\n') + '\n';
    
    await supabase
      .from('bots')
      .update({
        runtime_status: 'stopped',
        runtime_logs: logsText,
        container_id: null
      })
      .eq('id', botId);

    // Update execution record
    if (execution) {
      await supabase
        .from('bot_executions')
        .update({
          status: 'stopped',
          stopped_at: new Date().toISOString(),
          exit_code: 0
        })
        .eq('id', execution.id);
    }

    return { stopped: true, logs: result.logs };

  } catch (error) {
    console.error('Failed to stop bot:', error);
    const errorLogs = `[${new Date().toISOString()}] Error stopping bot: ${error.message}\n`;
    
    await supabase
      .from('bots')
      .update({
        runtime_status: 'error',
        runtime_logs: errorLogs
      })
      .eq('id', botId);
    
    throw error;
  }
}

async function restartBot(botId: string, userId: string) {
  await stopBot(botId);
  // Wait a moment before restarting
  setTimeout(async () => {
    await startBot(botId, userId);
  }, 2000);
  return { restarting: true };
}

async function streamLogs(botId: string) {
  try {
    const logs = getBotLogs(botId);
    const logsText = logs.join('\n') + '\n';
    
    await supabase
      .from('bots')
      .update({
        runtime_logs: logsText
      })
      .eq('id', botId);

    return { logs: logsText };
  } catch (error) {
    console.error('Failed to stream logs:', error);
    return { error: error.message };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, botId, userId } = await req.json();

    if (!action || !botId) {
      throw new Error('Missing required parameters: action and botId are required');
    }

    let result;
    switch (action) {
      case 'start':
        if (!userId) throw new Error('userId is required for start action');
        result = await startBot(botId, userId);
        break;
      case 'stop':
        result = await stopBot(botId);
        break;
      case 'restart':
        if (!userId) throw new Error('userId is required for restart action');
        result = await restartBot(botId, userId);
        break;
      case 'logs':
        result = await streamLogs(botId);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({
      success: true,
      action,
      result
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in manage-bot-runtime function:', error);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

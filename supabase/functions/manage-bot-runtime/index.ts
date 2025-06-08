
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function startBot(botId: string, userId: string) {
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

  // Generate new container ID
  const containerId = `bot_${botId}_${Date.now()}`;
  
  // Update bot status
  const { error: updateError } = await supabase
    .from('bots')
    .update({
      container_id: containerId,
      runtime_status: 'starting',
      runtime_logs: `[${new Date().toISOString()}] Starting bot...\n`,
      last_restart: new Date().toISOString()
    })
    .eq('id', botId);

  if (updateError) throw updateError;

  // Simulate startup process
  setTimeout(async () => {
    const logs = `[${new Date().toISOString()}] Bot started successfully\n[${new Date().toISOString()}] Container ID: ${containerId}\n[${new Date().toISOString()}] Bot is now running\n`;
    
    await supabase
      .from('bots')
      .update({
        runtime_status: 'running',
        runtime_logs: logs
      })
      .eq('id', botId);

    await supabase
      .from('bot_executions')
      .update({
        status: 'running'
      })
      .eq('id', execution.id);
  }, 2000);

  return { containerId, executionId: execution.id };
}

async function stopBot(botId: string) {
  // Get current execution
  const { data: execution } = await supabase
    .from('bot_executions')
    .select('id')
    .eq('bot_id', botId)
    .eq('status', 'running')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Update bot status
  const logs = `[${new Date().toISOString()}] Stopping bot...\n[${new Date().toISOString()}] Bot stopped successfully\n`;
  
  const { error: updateError } = await supabase
    .from('bots')
    .update({
      runtime_status: 'stopped',
      runtime_logs: logs,
      container_id: null
    })
    .eq('id', botId);

  if (updateError) throw updateError;

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

  return { stopped: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, botId, userId } = await req.json();

    if (!action || !botId || !userId) {
      throw new Error('Missing required parameters: action, botId, and userId are required');
    }

    let result;
    switch (action) {
      case 'start':
        result = await startBot(botId, userId);
        break;
      case 'stop':
        result = await stopBot(botId);
        break;
      case 'restart':
        await stopBot(botId);
        // Wait a moment before restarting
        setTimeout(async () => {
          await startBot(botId, userId);
        }, 1000);
        result = { restarting: true };
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


import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function getBotData(botId: string, userId: string) {
  const { data: bot, error: botError } = await supabase
    .from('bots')
    .select('*')
    .eq('id', botId)
    .eq('user_id', userId)
    .single();

  if (botError || !bot) {
    throw new Error('Bot not found or access denied');
  }

  return bot;
}

export async function getBotFiles(userId: string, botId: string): Promise<string> {
  // Get files from Modal volume instead of Supabase storage
  try {
    const modalUrl = 'https://efhwjkhqbbucvedgznba--telegram-bot-service.modal.run';
    const response = await fetch(`${modalUrl}/files/${botId}?user_id=${userId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch files from Modal');
    }
    
    const data = await response.json();
    
    if (!data.success || !data.files || !data.files['main.py']) {
      throw new Error('No main.py file found in Modal volume');
    }

    return data.files['main.py'];
  } catch (error) {
    throw new Error('Failed to load bot code from Modal: ' + error.message);
  }
}

export async function updateBotStatus(botId: string, status: string, logs: string[], containerId?: string) {
  console.log(`[${new Date().toISOString()}] ========== UPDATE BOT STATUS BEGIN ==========`);
  console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);
  console.log(`[${new Date().toISOString()}] New Status: ${status}`);
  console.log(`[${new Date().toISOString()}] Container ID: ${containerId || 'undefined'}`);
  console.log(`[${new Date().toISOString()}] Logs count: ${logs.length}`);
  
  const updateData: any = {
    runtime_status: status,
    runtime_logs: logs.join('\n'),
    last_restart: new Date().toISOString()
  };

  // Only set container_id when actually running
  if (status === 'running' && containerId) {
    updateData.container_id = containerId;
    console.log(`[${new Date().toISOString()}] Setting container_id: ${containerId}`);
  } else if (status === 'stopped' || status === 'error') {
    // Clear container_id when not running
    updateData.container_id = null;
    console.log(`[${new Date().toISOString()}] Clearing container_id (status: ${status})`);
  }

  console.log(`[${new Date().toISOString()}] Update data prepared:`, JSON.stringify(updateData, null, 2));

  const { error } = await supabase
    .from('bots')
    .update(updateData)
    .eq('id', botId);

  if (error) {
    console.error(`[${new Date().toISOString()}] Error updating bot status:`, error);
    throw error;
  }
  
  console.log(`[${new Date().toISOString()}] Bot status updated successfully in database`);
  
  // Verify the update by reading back the data
  const { data: verifyData, error: verifyError } = await supabase
    .from('bots')
    .select('runtime_status, container_id, last_restart')
    .eq('id', botId)
    .single();
    
  if (verifyError) {
    console.error(`[${new Date().toISOString()}] Error verifying update:`, verifyError);
  } else {
    console.log(`[${new Date().toISOString()}] Verification - Current DB state:`, JSON.stringify(verifyData, null, 2));
  }
  
  console.log(`[${new Date().toISOString()}] ========== UPDATE BOT STATUS COMPLETE ==========`);
}

export async function createBotExecution(botId: string, userId: string, status: string, logs: string[]) {
  const { error } = await supabase
    .from('bot_executions')
    .insert({
      bot_id: botId,
      user_id: userId,
      status: status,
      logs: logs.join('\n'),
      started_at: new Date().toISOString()
    });

  if (error) {
    console.error('Error creating bot execution:', error);
    throw error;
  }
}

export async function getRunningExecution(botId: string) {
  const { data: execution } = await supabase
    .from('bot_executions')
    .select('*')
    .eq('bot_id', botId)
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return execution;
}

export async function updateExecutionStatus(executionId: string, status: string, logs: string[]) {
  const { error } = await supabase
    .from('bot_executions')
    .update({
      status: status,
      logs: logs.join('\n'),
      stopped_at: new Date().toISOString()
    })
    .eq('id', executionId);

  if (error) {
    console.error('Error updating execution status:', error);
    throw error;
  }
}

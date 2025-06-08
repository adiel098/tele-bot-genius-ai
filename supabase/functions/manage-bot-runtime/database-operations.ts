
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
  const { data: files } = await supabase.storage
    .from('bot-files')
    .list(`${userId}/${botId}`);

  let mainCode = '';
  if (files && files.length > 0) {
    // Look for main.py or bot.py
    const mainFile = files.find(f => f.name === 'main.py' || f.name === 'bot.py') || files[0];
    
    const { data: fileData } = await supabase.storage
      .from('bot-files')
      .download(`${userId}/${botId}/${mainFile.name}`);

    if (fileData) {
      mainCode = await fileData.text();
    }
  }

  if (!mainCode) {
    throw new Error('No code found for bot');
  }

  return mainCode;
}

export async function updateBotStatus(botId: string, status: string, logs: string[], containerId?: string) {
  const updateData: any = {
    runtime_status: status,
    runtime_logs: logs.join('\n')
  };

  if (status === 'running') {
    updateData.last_restart = new Date().toISOString();
    if (containerId) {
      updateData.container_id = containerId;
    }
  } else if (status === 'stopped') {
    // Clear container_id when bot is stopped
    updateData.container_id = null;
  }

  const { error } = await supabase
    .from('bots')
    .update(updateData)
    .eq('id', botId);

  if (error) {
    console.error('Error updating bot status:', error);
    throw error;
  }
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

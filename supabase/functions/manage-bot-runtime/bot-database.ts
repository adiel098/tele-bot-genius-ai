
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { BotLogger } from './logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function getBotFromDatabase(botId: string, userId: string): Promise<{ success: boolean; bot?: any; logs: string[] }> {
  const logs: string[] = [];
  
  try {
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('*')
      .eq('id', botId)
      .eq('user_id', userId)
      .single();

    if (botError || !bot) {
      logs.push(BotLogger.logError('Bot not found: ' + (botError?.message || 'Unknown error')));
      return { success: false, logs };
    }

    return { success: true, bot, logs };
  } catch (error) {
    logs.push(BotLogger.logError('Database error: ' + error.message));
    return { success: false, logs };
  }
}

export async function updateBotDatabaseStatus(botId: string, status: string, containerId?: string, logs?: string[]): Promise<void> {
  const updateData: any = {
    runtime_status: status,
    runtime_logs: logs ? logs.join('\n') : '',
    last_restart: new Date().toISOString()
  };

  if (status === 'running' && containerId) {
    updateData.container_id = containerId;
  } else if (status === 'stopped' || status === 'error') {
    updateData.container_id = null;
  }

  const { error: updateError } = await supabase
    .from('bots')
    .update(updateData)
    .eq('id', botId);

  if (updateError) {
    throw new Error('Database update failed: ' + updateError.message);
  }
}


import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function storeContainerReference(botId: string, containerId: string): Promise<void> {
  try {
    console.log(`[${new Date().toISOString()}] Storing REAL container reference: ${botId} -> ${containerId}`);
    
    const { error } = await supabase
      .from('bots')
      .update({ 
        container_id: containerId,
        runtime_status: 'running',
        last_restart: new Date().toISOString()
      })
      .eq('id', botId);
    
    if (error) {
      console.error(`[${new Date().toISOString()}] Error storing real container reference:`, error);
      throw error;
    }
    
    console.log(`[${new Date().toISOString()}] Real container reference stored: ${containerId}`);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to store real container reference:`, error);
    throw error;
  }
}

export async function removeContainerReference(botId: string): Promise<void> {
  try {
    console.log(`[${new Date().toISOString()}] Removing real container reference for: ${botId}`);
    
    const { error } = await supabase
      .from('bots')
      .update({ 
        container_id: null,
        runtime_status: 'stopped'
      })
      .eq('id', botId);
    
    if (error) {
      console.error(`[${new Date().toISOString()}] Error removing real container reference:`, error);
      throw error;
    }
    
    console.log(`[${new Date().toISOString()}] Real container reference removed`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to remove real container reference:`, error);
    throw error;
  }
}

export async function getContainerReference(botId: string): Promise<string | null> {
  try {
    const { data: bot, error } = await supabase
      .from('bots')
      .select('container_id, runtime_status')
      .eq('id', botId)
      .single();
    
    if (error || !bot) {
      console.log(`[${new Date().toISOString()}] No real container found for bot: ${botId}`);
      return null;
    }
    
    // Only return container ID if status is running
    if (bot.runtime_status === 'running' && bot.container_id) {
      console.log(`[${new Date().toISOString()}] Found real running container: ${bot.container_id}`);
      return bot.container_id;
    }
    
    return null;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error getting real container reference:`, error);
    return null;
  }
}

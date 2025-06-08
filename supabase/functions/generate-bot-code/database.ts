
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import type { ConversationMessage } from './types.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function getBotData(botId: string) {
  const { data: existingBot, error: fetchError } = await supabase
    .from('bots')
    .select('conversation_history, user_id')
    .eq('id', botId)
    .single();

  if (fetchError) {
    console.error('Error fetching bot:', fetchError);
    throw new Error(`Failed to fetch bot: ${fetchError.message}`);
  }

  return existingBot;
}

export async function updateBotWithResults(
  botId: string, 
  conversationHistory: ConversationMessage[], 
  allFilesUploaded: boolean
) {
  const { error: updateError } = await supabase
    .from('bots')
    .update({
      status: 'active',
      conversation_history: conversationHistory,
      files_stored: allFilesUploaded
    })
    .eq('id', botId);

  if (updateError) {
    console.error('Database update error:', updateError);
    throw new Error(`Database update error: ${updateError.message}`);
  }
}

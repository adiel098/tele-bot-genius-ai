
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { BotLogger } from './logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function loadBotCodeFromStorage(userId: string, botId: string): Promise<{ success: boolean; code?: string; logs: string[] }> {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.log(botId, 'Loading user\'s main.py from bot-files storage...'));
    logs.push(BotLogger.log(botId, `Storage path: ${userId}/${botId}/main.py`));
    
    const { data: mainFile, error: mainError } = await supabase.storage
      .from('bot-files')
      .download(`${userId}/${botId}/main.py`);
      
    if (mainError || !mainFile) {
      logs.push(BotLogger.logError('CRITICAL: Cannot find user\'s main.py file!'));
      logs.push(BotLogger.logError('Storage error: ' + (mainError?.message || 'File not found')));
      
      // Debug: List all files in the user's bot directory
      const { data: filesList, error: listError } = await supabase.storage
        .from('bot-files')
        .list(`${userId}/${botId}`);
        
      if (listError) {
        logs.push(BotLogger.logError('Cannot list files: ' + listError.message));
      } else if (filesList && filesList.length > 0) {
        logs.push(BotLogger.log(botId, `Files in storage: ${filesList.map(f => f.name).join(', ')}`));
      } else {
        logs.push(BotLogger.logError('NO FILES FOUND in bot directory!'));
      }
      
      return { success: false, logs };
    }

    const actualBotCode = await mainFile.text();
    logs.push(BotLogger.log(botId, 'SUCCESS: Loaded user\'s main.py: ' + actualBotCode.length + ' characters'));
    
    // Show code preview to verify we're using the right code
    const codePreview = actualBotCode.substring(0, 300);
    logs.push(BotLogger.log(botId, `Code preview: ${codePreview}...`));

    // Validate that we have real user code (not empty or fallback)
    if (!actualBotCode || actualBotCode.trim().length === 0) {
      logs.push(BotLogger.logError('User\'s main.py file is empty!'));
      return { success: false, logs };
    }

    // Check if this looks like user code vs template code
    if (actualBotCode.includes('PLACEHOLDER_TOKEN') || actualBotCode.includes('fallback template')) {
      logs.push(BotLogger.logError('WARNING: Code appears to be template, not user code!'));
    } else {
      logs.push(BotLogger.logSuccess('Code appears to be genuine user code'));
    }

    return { success: true, code: actualBotCode, logs };
    
  } catch (error) {
    logs.push(BotLogger.logError('Error loading bot code: ' + error.message));
    return { success: false, logs };
  }
}

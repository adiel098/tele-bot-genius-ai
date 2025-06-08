
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function deployAndStartBot(botId: string, userId: string, files: any[]): Promise<{ deployed: boolean; started: boolean; logs: string[] }> {
  console.log('=== DEPLOYMENT AND START PROCESS ===');
  console.log(`Bot ID: ${botId}`);
  console.log(`User ID: ${userId}`);
  console.log(`Files count: ${files.length}`);

  const logs: string[] = [];
  
  try {
    // Step 1: Update bot status to indicate deployment starting
    console.log('Step 1: Updating bot status to ready...');
    await supabase
      .from('bots')
      .update({ 
        status: 'ready',
        files_stored: true 
      })
      .eq('id', botId);
    
    logs.push('[DEPLOY] Bot marked as ready with files stored');

    // Step 2: Auto-start the bot after successful deployment
    console.log('Step 2: Auto-starting bot after deployment...');
    
    const startResponse = await supabase.functions.invoke('manage-bot-runtime', {
      body: {
        action: 'start',
        botId: botId,
        userId: userId
      }
    });

    console.log('Start response:', startResponse);
    
    if (startResponse.error) {
      console.error('Error starting bot:', startResponse.error);
      logs.push(`[START ERROR] ${startResponse.error.message}`);
      return { deployed: true, started: false, logs };
    }

    if (startResponse.data?.success) {
      logs.push('[START SUCCESS] Bot started automatically after deployment');
      console.log('Bot started successfully after deployment');
      return { deployed: true, started: true, logs };
    } else {
      logs.push('[START FAILED] Failed to start bot after deployment');
      console.log('Failed to start bot after deployment');
      return { deployed: true, started: false, logs };
    }

  } catch (error) {
    console.error('Deployment/start error:', error);
    logs.push(`[DEPLOY ERROR] ${error.message}`);
    return { deployed: false, started: false, logs };
  }
}

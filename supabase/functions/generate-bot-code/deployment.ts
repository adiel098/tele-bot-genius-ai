
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import type { DeploymentInfo } from './types.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function deployAndStartBot(botId: string, userId: string, files: Record<string, string>): Promise<DeploymentInfo> {
  try {
    // Create execution record
    const { data: execution, error: execError } = await supabase
      .from('bot_executions')
      .insert({
        bot_id: botId,
        user_id: userId,
        status: 'starting'
      })
      .select()
      .single();

    if (execError) {
      console.error('Failed to create execution record:', execError);
      throw execError;
    }

    // Update bot status to indicate deployment is starting
    const { error: updateError } = await supabase
      .from('bots')
      .update({
        runtime_status: 'starting',
        runtime_logs: `[${new Date().toISOString()}] Preparing bot deployment...\n[${new Date().toISOString()}] Files uploaded to storage\n[${new Date().toISOString()}] Ready for Docker container creation\n`,
        last_restart: new Date().toISOString()
      })
      .eq('id', botId);

    if (updateError) {
      console.error('Failed to update bot:', updateError);
      throw updateError;
    }

    // Auto-start the bot using the runtime management function
    setTimeout(async () => {
      try {
        console.log(`Auto-starting bot ${botId} after deployment`);
        
        // Call the runtime management function to start the bot
        const { data: runtimeData, error: runtimeError } = await supabase.functions.invoke('manage-bot-runtime', {
          body: {
            action: 'start',
            botId,
            userId
          }
        });

        if (runtimeError) {
          console.error('Failed to auto-start bot:', runtimeError);
          await supabase
            .from('bots')
            .update({
              runtime_status: 'error',
              runtime_logs: `[${new Date().toISOString()}] Deployment completed but failed to start: ${runtimeError.message}\n`
            })
            .eq('id', botId);
        } else if (runtimeData?.success) {
          console.log('Bot auto-start initiated successfully');
        }

      } catch (error) {
        console.error('Failed to auto-start bot:', error);
        await supabase
          .from('bots')
          .update({
            runtime_status: 'error',
            runtime_logs: `[${new Date().toISOString()}] Deployment completed but failed to start: ${error.message}\n`
          })
          .eq('id', botId);
      }
    }, 2000); // Start the bot 2 seconds after deployment

    return { executionId: execution.id, autoStartInitiated: true };
  } catch (error) {
    console.error('Deployment failed:', error);
    
    // Update status to error
    await supabase
      .from('bots')
      .update({
        runtime_status: 'error',
        runtime_logs: `[${new Date().toISOString()}] Deployment failed: ${error.message}\n`
      })
      .eq('id', botId);

    throw error;
  }
}

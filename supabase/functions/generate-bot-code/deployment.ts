
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

    // Get bot data
    const { data: bot } = await supabase
      .from('bots')
      .select('name, runtime_status')
      .eq('id', botId)
      .single();

    const botName = bot?.name || 'AI Bot';
    const currentRuntimeStatus = bot?.runtime_status;

    console.log(`Deploying bot ${botId} using Deno runtime`);
    
    // Update bot status to preparing
    await supabase
      .from('bots')
      .update({
        runtime_status: 'preparing',
        runtime_logs: `[${new Date().toISOString()}] Preparing bot deployment...\n[${new Date().toISOString()}] Files uploaded to storage\n[${new Date().toISOString()}] Generated code ready for execution\n[${new Date().toISOString()}] Code validation: ${Object.keys(files).join(', ')}\n`,
        last_restart: new Date().toISOString(),
        deployment_config: {
          type: 'deno',
          runtime: 'edge-function'
        }
      })
      .eq('id', botId);

    // Start bot asynchronously to avoid timeout issues
    console.log(`Scheduling bot ${botId} for auto-start with generated code...`);
    
    // Use a very short timeout to avoid gateway timeout
    setTimeout(async () => {
      try {
        console.log(`Auto-starting bot ${botId} with generated code`);
        
        // First stop any existing instance
        if (currentRuntimeStatus === 'running' || currentRuntimeStatus === 'starting') {
          console.log(`Stopping existing bot ${botId} before restart...`);
          
          try {
            const { error: stopError } = await Promise.race([
              supabase.functions.invoke('manage-bot-runtime', {
                body: {
                  action: 'stop',
                  botId
                }
              }),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Stop timeout')), 8000)
              )
            ]) as any;

            if (stopError) {
              console.error('Failed to stop bot before restart:', stopError);
            } else {
              console.log(`Bot ${botId} stopped successfully`);
            }
          } catch (stopError) {
            console.error('Stop operation timed out:', stopError);
            // Continue with start anyway
          }

          // Wait for stop to complete
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Start the bot with timeout protection
        console.log(`Starting bot ${botId} with generated code...`);
        
        try {
          const { data: runtimeData, error: runtimeError } = await Promise.race([
            supabase.functions.invoke('manage-bot-runtime', {
              body: {
                action: 'start',
                botId,
                userId
              }
            }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Start timeout')), 20000)
            )
          ]) as any;

          if (runtimeError) {
            console.error('Failed to start bot with generated code:', runtimeError);
            await supabase
              .from('bots')
              .update({
                runtime_status: 'error',
                runtime_logs: `[${new Date().toISOString()}] Deployment completed but failed to start bot with generated code\n[${new Date().toISOString()}] Error: ${runtimeError.message}\n[${new Date().toISOString()}] This usually means there's a syntax error in the generated code\n`
              })
              .eq('id', botId);
          } else if (runtimeData?.success) {
            console.log('Bot started successfully with generated code');
            await supabase
              .from('bots')
              .update({
                runtime_logs: `[${new Date().toISOString()}] Bot restarted successfully with generated code\n[${new Date().toISOString()}] Bot is now running with the latest AI-generated functionality\n`
              })
              .eq('id', botId);
          } else {
            console.log('Bot start completed but with issues');
            await supabase
              .from('bots')
              .update({
                runtime_logs: `[${new Date().toISOString()}] Bot start completed with warnings\n[${new Date().toISOString()}] Check logs for more details\n`
              })
              .eq('id', botId);
          }

        } catch (startError) {
          console.error('Start operation timed out or failed:', startError);
          await supabase
            .from('bots')
            .update({
              runtime_status: 'error',
              runtime_logs: `[${new Date().toISOString()}] Failed to start bot with generated code: ${startError.message}\n[${new Date().toISOString()}] Common causes: Syntax errors in generated code, invalid token, or network issues\n`
            })
            .eq('id', botId);
        }

      } catch (error) {
        console.error('Failed in auto-start process:', error);
        await supabase
          .from('bots')
          .update({
            runtime_status: 'error',
            runtime_logs: `[${new Date().toISOString()}] Auto-start failed: ${error.message}\n`
          })
          .eq('id', botId);
      }
    }, 500); // Very short delay to return response quickly

    return { 
      executionId: execution.id, 
      deploymentType: 'deno',
      autoStartScheduled: true 
    };

  } catch (error) {
    console.error('Deployment failed:', error);
    
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


import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { deployToKubernetes } from './kubernetes.ts';
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
      .select('name, deployment_type, runtime_status')
      .eq('id', botId)
      .single();

    const botName = bot?.name || 'AI Bot';
    const currentRuntimeStatus = bot?.runtime_status;

    // Check deployment type preference
    const deploymentType = bot?.deployment_type || 'kubernetes';

    if (deploymentType === 'kubernetes') {
      console.log(`Deploying bot ${botId} to Kubernetes with Helm`);
      
      // Deploy to Kubernetes using Helm
      const kubernetesResult = await deployToKubernetes(botId, userId, botName, files);
      
      await supabase
        .from('bots')
        .update({
          runtime_status: 'k8s-deployed',
          runtime_logs: `[${new Date().toISOString()}] Kubernetes deployment completed successfully\n[${new Date().toISOString()}] Helm chart deployed: ${kubernetesResult.helmChartPath}\n[${new Date().toISOString()}] Namespace: ${kubernetesResult.namespace}\n[${new Date().toISOString()}] Ready for scaling and production use\n`,
          last_restart: new Date().toISOString(),
          deployment_config: {
            type: 'kubernetes',
            namespace: kubernetesResult.namespace,
            helm_chart_path: kubernetesResult.helmChartPath,
            deployment_command: kubernetesResult.deploymentCommand
          }
        })
        .eq('id', botId);

      return { 
        executionId: execution.id, 
        deploymentType: 'kubernetes',
        kubernetesConfig: kubernetesResult
      };
    } else {
      console.log(`Deploying bot ${botId} using simple Deno runtime`);
      
      // Simple Deno deployment for development/testing
      await supabase
        .from('bots')
        .update({
          runtime_status: 'preparing',
          runtime_logs: `[${new Date().toISOString()}] Preparing Deno runtime deployment...\n[${new Date().toISOString()}] Files uploaded to storage\n[${new Date().toISOString()}] Bot ready for Deno execution\n`,
          last_restart: new Date().toISOString(),
          deployment_config: {
            type: 'deno',
            runtime: 'edge-function'
          }
        })
        .eq('id', botId);

      // If bot was running before, restart it with new code
      if (currentRuntimeStatus === 'running' || currentRuntimeStatus === 'starting') {
        console.log(`Bot was running, initiating restart with new code...`);
        
        setTimeout(async () => {
          try {
            // First stop the existing bot
            console.log(`Stopping existing bot ${botId} before restart...`);
            const { error: stopError } = await supabase.functions.invoke('manage-bot-runtime', {
              body: {
                action: 'stop',
                botId
              }
            });

            if (stopError) {
              console.error('Failed to stop bot before restart:', stopError);
            }

            // Wait for stop to complete
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Then start with new code
            console.log(`Starting bot ${botId} with updated code...`);
            const { data: runtimeData, error: runtimeError } = await supabase.functions.invoke('manage-bot-runtime', {
              body: {
                action: 'start',
                botId,
                userId
              }
            });

            if (runtimeError) {
              console.error('Failed to restart bot with new code:', runtimeError);
              await supabase
                .from('bots')
                .update({
                  runtime_status: 'error',
                  runtime_logs: `[${new Date().toISOString()}] Deployment completed but failed to restart: ${runtimeError.message}\n`
                })
                .eq('id', botId);
            } else if (runtimeData?.success) {
              console.log('Bot restarted successfully with new code');
              await supabase
                .from('bots')
                .update({
                  runtime_logs: `[${new Date().toISOString()}] Bot restarted successfully with updated code\n`
                })
                .eq('id', botId);
            }

          } catch (error) {
            console.error('Failed to restart bot with new code:', error);
            await supabase
              .from('bots')
              .update({
                runtime_status: 'error',
                runtime_logs: `[${new Date().toISOString()}] Deployment completed but failed to restart: ${error.message}\n`
              })
              .eq('id', botId);
          }
        }, 2000);

        return { 
          executionId: execution.id, 
          deploymentType: 'deno',
          restartInitiated: true 
        };
      } else {
        // Bot wasn't running, just auto-start it
        setTimeout(async () => {
          try {
            console.log(`Auto-starting bot ${botId} with new code`);
            
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
        }, 2000);

        return { 
          executionId: execution.id, 
          deploymentType: 'deno',
          autoStartInitiated: true 
        };
      }
    }

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

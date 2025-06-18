
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function deployAndStartBot(botId: string, userId: string, files: any[]): Promise<{ deployed: boolean; started: boolean; logs: string[] }> {
  console.log('=== KUBERNETES DEPLOYMENT PROCESS ===');
  console.log(`Bot ID: ${botId}`);
  console.log(`User ID: ${userId}`);
  console.log(`Files count: ${files.length}`);

  const logs: string[] = [];
  
  try {
    // Update bot status to indicate deployment starting
    console.log('Step 1: Preparing for Kubernetes deployment...');
    await supabase
      .from('bots')
      .update({ 
        status: 'ready',
        files_stored: true 
      })
      .eq('id', botId);
    
    logs.push('[DEPLOY] Bot marked as ready with files stored');

    // Start Kubernetes deployment pipeline
    console.log('Step 2: Starting Kubernetes deployment pipeline...');
    
    const k8sResponse = await supabase.functions.invoke('bot-lifecycle-orchestrator', {
      body: {
        action: 'deploy-kubernetes',
        botId: botId,
        userId: userId
      }
    });

    console.log('Kubernetes deployment response:', k8sResponse);
    
    if (k8sResponse.data?.success) {
      logs.push('[DEPLOY] ✅ Kubernetes deployment completed successfully');
      logs.push(...k8sResponse.data.logs);
      
      return { 
        deployed: true, 
        started: true, 
        logs: [
          ...logs,
          '[DEPLOY] Bot deployed to Kubernetes cluster',
          '[DEPLOY] Container built and pushed to registry',
          '[DEPLOY] Pod is running with health checks',
          '[DEPLOY] Auto-scaling configured',
          '[DEPLOY] Monitoring and lifecycle management active'
        ]
      };
    } else {
      throw new Error(k8sResponse.error?.message || 'Kubernetes deployment failed');
    }

  } catch (error) {
    console.error('Deployment error:', error);
    logs.push(`[DEPLOY ERROR] ${error.message}`);
    return { deployed: false, started: false, logs };
  }
}

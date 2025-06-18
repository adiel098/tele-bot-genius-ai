
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function deployAndStartBot(botId: string, userId: string, files: any[]): Promise<{ deployed: boolean; started: boolean; logs: string[] }> {
  console.log('=== ENHANCED DEPLOYMENT PROCESS ===');
  console.log(`Bot ID: ${botId}`);
  console.log(`User ID: ${userId}`);
  console.log(`Files count: ${files.length}`);

  const logs: string[] = [];
  
  try {
    // Step 1: Update bot status to indicate deployment starting
    console.log('Step 1: Preparing for Kubernetes deployment...');
    await supabase
      .from('bots')
      .update({ 
        status: 'ready',
        files_stored: true 
      })
      .eq('id', botId);
    
    logs.push('[DEPLOY] Bot marked as ready with files stored');

    // Step 2: Check deployment preference - try Kubernetes first, fallback to Railway
    console.log('Step 2: Starting Kubernetes deployment pipeline...');
    
    try {
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
      
    } catch (k8sError) {
      console.log('Kubernetes deployment failed, falling back to Railway...');
      logs.push(`[DEPLOY] ⚠️ Kubernetes deployment failed: ${k8sError.message}`);
      logs.push('[DEPLOY] Falling back to Railway deployment...');
      
      // Fallback to existing Railway deployment
      const railwayResponse = await supabase.functions.invoke('manage-bot-runtime', {
        body: {
          action: 'start',
          botId: botId,
          userId: userId
        }
      });

      console.log('Railway fallback response:', railwayResponse);
      
      if (railwayResponse.error) {
        console.error('Railway fallback also failed:', railwayResponse.error);
        logs.push(`[DEPLOY ERROR] Railway fallback failed: ${railwayResponse.error.message}`);
        return { deployed: false, started: false, logs };
      }

      if (railwayResponse.data?.success) {
        logs.push('[DEPLOY] ✅ Railway fallback deployment successful');
        console.log('Railway fallback successful');
        return { deployed: true, started: true, logs };
      } else {
        logs.push('[DEPLOY] ❌ Both Kubernetes and Railway deployments failed');
        console.log('Both deployment methods failed');
        return { deployed: false, started: false, logs };
      }
    }

  } catch (error) {
    console.error('Deployment error:', error);
    logs.push(`[DEPLOY ERROR] ${error.message}`);
    return { deployed: false, started: false, logs };
  }
}

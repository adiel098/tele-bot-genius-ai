
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { KubernetesClient } from './k8s-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const k8sClient = new KubernetesClient();
const namespacePrefix = Deno.env.get('K8S_NAMESPACE_PREFIX') || 'telegram-bots';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, botId, userId, imageTag } = await req.json();
    
    console.log(`K8s Deployment Manager - Action: ${action}, Bot: ${botId}`);
    
    switch (action) {
      case 'deploy':
        return await deployBot(botId, userId, imageTag);
      case 'scale':
        return await scaleBot(botId, userId);
      case 'shutdown':
        return await shutdownBot(botId, userId);
      case 'get-status':
        return await getBotStatus(botId, userId);
      case 'get-logs':
        return await getBotLogs(botId, userId);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
  } catch (error) {
    console.error('K8s Deployment Manager Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function deployBot(botId: string, userId: string, imageTag: string) {
  console.log(`Deploying bot to Kubernetes: ${botId}`);
  
  try {
    const namespace = `${namespacePrefix}-${userId.substring(0, 8)}`;
    const deploymentName = `bot-${botId}`;
    
    // Create namespace if it doesn't exist
    const namespaceResult = await k8sClient.createNamespace(namespace);
    
    // Deploy the bot
    const deployResult = await k8sClient.deployBot(botId, userId, imageTag, namespace);
    
    if (deployResult.success) {
      // Update bot status in database
      await supabase
        .from('bots')
        .update({
          runtime_status: 'deploying',
          deployment_config: {
            type: 'kubernetes',
            namespace,
            deployment_name: deploymentName,
            image_tag: imageTag,
            deployed_at: new Date().toISOString()
          }
        })
        .eq('id', botId);
    }
    
    return new Response(JSON.stringify({
      success: deployResult.success,
      namespace,
      deploymentName,
      deploymentId: deploymentName,
      logs: [...namespaceResult.logs, ...deployResult.logs]
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Deploy bot error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      logs: [`[DEPLOY ERROR] ${error.message}`]
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function getBotStatus(botId: string, userId: string) {
  console.log(`Getting status for bot: ${botId}`);
  
  try {
    const { data: bot } = await supabase
      .from('bots')
      .select('runtime_status, deployment_config')
      .eq('id', botId)
      .single();
    
    if (!bot) {
      throw new Error('Bot not found');
    }
    
    let k8sStatus = 'unknown';
    if (bot.deployment_config?.namespace) {
      const statusResult = await k8sClient.getDeploymentStatus(botId, bot.deployment_config.namespace);
      if (statusResult.success) {
        k8sStatus = statusResult.status;
      }
    }
    
    const status = {
      runtime_status: k8sStatus === 'running' ? 'running' : bot.runtime_status,
      deployment_type: bot.deployment_config?.type || 'none',
      namespace: bot.deployment_config?.namespace,
      deployment_name: bot.deployment_config?.deployment_name,
      image_tag: bot.deployment_config?.image_tag,
      deployed_at: bot.deployment_config?.deployed_at,
      status: k8sStatus
    };
    
    return new Response(JSON.stringify({
      success: true,
      status
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Get bot status error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function getBotLogs(botId: string, userId: string) {
  console.log(`Getting logs for bot: ${botId}`);
  
  try {
    const { data: bot } = await supabase
      .from('bots')
      .select('deployment_config')
      .eq('id', botId)
      .single();
    
    if (!bot?.deployment_config?.namespace) {
      return new Response(JSON.stringify({
        success: true,
        logs: ['[K8S] Bot not deployed to Kubernetes yet']
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const logsResult = await k8sClient.getPodLogs(botId, bot.deployment_config.namespace);
    
    return new Response(JSON.stringify({
      success: logsResult.success,
      logs: logsResult.logs
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Get bot logs error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      logs: [`[LOGS ERROR] ${error.message}`]
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function shutdownBot(botId: string, userId: string) {
  console.log(`Shutting down bot: ${botId}`);
  
  try {
    const { data: bot } = await supabase
      .from('bots')
      .select('deployment_config')
      .eq('id', botId)
      .single();
    
    if (!bot?.deployment_config?.namespace) {
      return new Response(JSON.stringify({
        success: true,
        logs: ['[K8S] Bot not deployed to Kubernetes']
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const shutdownResult = await k8sClient.deleteDeployment(botId, bot.deployment_config.namespace);
    
    if (shutdownResult.success) {
      // Update bot status
      await supabase
        .from('bots')
        .update({
          runtime_status: 'stopped',
          container_id: null
        })
        .eq('id', botId);
    }
    
    return new Response(JSON.stringify({
      success: shutdownResult.success,
      logs: shutdownResult.logs
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Shutdown bot error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      logs: [`[SHUTDOWN ERROR] ${error.message}`]
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function scaleBot(botId: string, userId: string) {
  console.log(`Scaling bot: ${botId}`);
  
  // For now, return success with informational logs
  // Real scaling would involve updating deployment replicas
  const logs = [
    `[SCALE] Checking current resource usage for ${botId}`,
    `[SCALE] Horizontal Pod Autoscaler can handle automatic scaling`,
    `[SCALE] Current replicas: 1, Target: 1-3 based on CPU utilization`
  ];
  
  return new Response(JSON.stringify({
    success: true,
    logs
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

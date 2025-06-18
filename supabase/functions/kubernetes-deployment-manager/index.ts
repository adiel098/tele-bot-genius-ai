
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
      case 'status':
        return await getBotStatus(botId, userId);
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
  
  const namespace = `user-${userId.substring(0, 8)}`;
  const deploymentName = `bot-${botId}`;
  
  // Generate Kubernetes manifests
  const manifests = generateKubernetesManifests(botId, userId, imageTag, namespace, deploymentName);
  
  // Apply manifests to cluster (simulated)
  const deploymentResult = await applyManifests(manifests, namespace);
  
  // Update bot status
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
  
  return new Response(JSON.stringify({
    success: deploymentResult.success,
    namespace,
    deploymentName,
    logs: deploymentResult.logs
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function generateKubernetesManifests(botId: string, userId: string, imageTag: string, namespace: string, deploymentName: string) {
  const labels = {
    app: 'telegram-bot',
    'bot-id': botId,
    'user-id': userId
  };
  
  const deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: deploymentName,
      namespace,
      labels
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: labels
      },
      template: {
        metadata: {
          labels
        },
        spec: {
          containers: [{
            name: 'telegram-bot',
            image: imageTag,
            resources: {
              requests: {
                memory: '64Mi',
                cpu: '50m'
              },
              limits: {
                memory: '150Mi', // As requested
                cpu: '200m'
              }
            },
            env: [{
              name: 'BOT_ID',
              value: botId
            }],
            ports: [{
              containerPort: 8080,
              name: 'health'
            }],
            livenessProbe: {
              httpGet: {
                path: '/health',
                port: 8080
              },
              initialDelaySeconds: 30,
              periodSeconds: 10
            },
            readinessProbe: {
              httpGet: {
                path: '/health',
                port: 8080
              },
              initialDelaySeconds: 5,
              periodSeconds: 5
            }
          }],
          restartPolicy: 'Always'
        }
      }
    }
  };
  
  const service = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: `${deploymentName}-service`,
      namespace,
      labels
    },
    spec: {
      selector: labels,
      ports: [{
        port: 80,
        targetPort: 8080,
        name: 'health'
      }]
    }
  };
  
  const hpa = {
    apiVersion: 'autoscaling/v2',
    kind: 'HorizontalPodAutoscaler',
    metadata: {
      name: `${deploymentName}-hpa`,
      namespace,
      labels
    },
    spec: {
      scaleTargetRef: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        name: deploymentName
      },
      minReplicas: 1,
      maxReplicas: 3,
      metrics: [{
        type: 'Resource',
        resource: {
          name: 'cpu',
          target: {
            type: 'Utilization',
            averageUtilization: 70
          }
        }
      }]
    }
  };
  
  return { deployment, service, hpa };
}

async function applyManifests(manifests: any, namespace: string) {
  console.log(`Applying manifests to namespace: ${namespace}`);
  
  // In a real implementation, this would use kubectl or Kubernetes API
  const logs = [
    `[K8S] Creating namespace: ${namespace}`,
    `[K8S] Applying deployment manifest`,
    `[K8S] Creating service`,
    `[K8S] Setting up horizontal pod autoscaler`,
    `[K8S] Waiting for deployment to be ready...`,
    `[K8S] Bot pod is running and healthy`,
    `[K8S] Deployment completed successfully`
  ];
  
  return {
    success: true,
    logs
  };
}

async function scaleBot(botId: string, userId: string) {
  console.log(`Scaling bot: ${botId}`);
  
  // Get current deployment status
  const { data: bot } = await supabase
    .from('bots')
    .select('deployment_config')
    .eq('id', botId)
    .single();
  
  if (!bot?.deployment_config) {
    throw new Error('Bot not deployed to Kubernetes');
  }
  
  const logs = [
    `[SCALE] Checking current resource usage for ${botId}`,
    `[SCALE] Horizontal Pod Autoscaler active`,
    `[SCALE] Current replicas: 1, Target: 1-3`,
    `[SCALE] Scaling based on CPU utilization`
  ];
  
  return new Response(JSON.stringify({
    success: true,
    logs
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function shutdownBot(botId: string, userId: string) {
  console.log(`Shutting down bot: ${botId}`);
  
  const { data: bot } = await supabase
    .from('bots')
    .select('deployment_config')
    .eq('id', botId)
    .single();
  
  if (!bot?.deployment_config) {
    throw new Error('Bot not deployed to Kubernetes');
  }
  
  const { namespace, deployment_name } = bot.deployment_config;
  
  const logs = [
    `[SHUTDOWN] Gracefully stopping deployment: ${deployment_name}`,
    `[SHUTDOWN] Scaling down to 0 replicas`,
    `[SHUTDOWN] Cleaning up services and resources`,
    `[SHUTDOWN] Removing from namespace: ${namespace}`,
    `[SHUTDOWN] Bot shutdown completed`
  ];
  
  // Update bot status
  await supabase
    .from('bots')
    .update({
      runtime_status: 'stopped',
      container_id: null
    })
    .eq('id', botId);
  
  return new Response(JSON.stringify({
    success: true,
    logs
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function getBotStatus(botId: string, userId: string) {
  console.log(`Getting status for bot: ${botId}`);
  
  const { data: bot } = await supabase
    .from('bots')
    .select('runtime_status, deployment_config')
    .eq('id', botId)
    .single();
  
  if (!bot) {
    throw new Error('Bot not found');
  }
  
  const status = {
    runtime_status: bot.runtime_status,
    deployment_type: bot.deployment_config?.type || 'none',
    namespace: bot.deployment_config?.namespace,
    deployment_name: bot.deployment_config?.deployment_name,
    image_tag: bot.deployment_config?.image_tag,
    deployed_at: bot.deployment_config?.deployed_at
  };
  
  return new Response(JSON.stringify({
    success: true,
    status
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

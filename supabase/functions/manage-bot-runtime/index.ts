
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Docker API helper functions
async function dockerRequest(method: string, endpoint: string, body?: any) {
  const dockerHost = Deno.env.get('DOCKER_HOST') || 'unix:///var/run/docker.sock';
  
  // For development, we'll simulate Docker API calls
  // In production, this would connect to actual Docker daemon
  if (dockerHost.startsWith('unix://')) {
    return simulateDockerOperation(method, endpoint, body);
  }
  
  const url = `${dockerHost}${endpoint}`;
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  
  return await response.json();
}

// Simulate Docker operations for development
async function simulateDockerOperation(method: string, endpoint: string, body?: any) {
  console.log(`Docker ${method} ${endpoint}:`, body);
  
  if (endpoint.includes('/containers/create')) {
    return { Id: `container_${Date.now()}` };
  }
  
  if (endpoint.includes('/start')) {
    return { success: true };
  }
  
  if (endpoint.includes('/stop')) {
    return { success: true };
  }
  
  if (endpoint.includes('/logs')) {
    return { logs: 'Simulated container logs...' };
  }
  
  return { success: true };
}

async function createDockerContainer(botId: string, botToken: string, files: Record<string, string>) {
  const containerName = `telegram-bot-${botId}`;
  
  // Create Dockerfile content
  const dockerfile = `
FROM python:3.11-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy bot files
COPY . .

# Set environment variable for bot token
ENV BOT_TOKEN=${botToken}

# Run the bot
CMD ["python", "main.py"]
`;

  // Create container configuration
  const containerConfig = {
    Image: 'python:3.11-slim',
    Name: containerName,
    Env: [`BOT_TOKEN=${botToken}`],
    WorkingDir: '/app',
    Cmd: ['python', 'main.py'],
    HostConfig: {
      RestartPolicy: { Name: 'unless-stopped' },
      Memory: 128 * 1024 * 1024, // 128MB limit
    },
    NetworkMode: 'bridge',
  };

  try {
    const result = await dockerRequest('POST', '/containers/create', containerConfig);
    return result.Id;
  } catch (error) {
    console.error('Failed to create Docker container:', error);
    throw error;
  }
}

async function startContainer(containerId: string) {
  try {
    await dockerRequest('POST', `/containers/${containerId}/start`);
    return true;
  } catch (error) {
    console.error('Failed to start container:', error);
    throw error;
  }
}

async function stopContainer(containerId: string) {
  try {
    await dockerRequest('POST', `/containers/${containerId}/stop`);
    return true;
  } catch (error) {
    console.error('Failed to stop container:', error);
    throw error;
  }
}

async function getContainerLogs(containerId: string) {
  try {
    const result = await dockerRequest('GET', `/containers/${containerId}/logs?stdout=1&stderr=1&timestamps=1&tail=100`);
    return result.logs || 'No logs available';
  } catch (error) {
    console.error('Failed to get container logs:', error);
    return 'Error retrieving logs';
  }
}

async function removeContainer(containerId: string) {
  try {
    await dockerRequest('DELETE', `/containers/${containerId}?force=1`);
    return true;
  } catch (error) {
    console.error('Failed to remove container:', error);
    return false;
  }
}

async function startBot(botId: string, userId: string) {
  // Get bot data and files
  const { data: bot, error: botError } = await supabase
    .from('bots')
    .select('*')
    .eq('id', botId)
    .single();

  if (botError || !bot) {
    throw new Error('Bot not found');
  }

  // Get bot files from storage
  const { data: filesList, error: filesError } = await supabase.storage
    .from('bot-files')
    .list(`${userId}/${botId}`);

  if (filesError) {
    console.error('Failed to list bot files:', filesError);
    throw new Error('Failed to retrieve bot files');
  }

  const files: Record<string, string> = {};
  for (const file of filesList || []) {
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('bot-files')
      .download(`${userId}/${botId}/${file.name}`);

    if (!downloadError && fileData) {
      files[file.name] = await fileData.text();
    }
  }

  // Create new execution record
  const { data: execution, error: execError } = await supabase
    .from('bot_executions')
    .insert({
      bot_id: botId,
      user_id: userId,
      status: 'starting'
    })
    .select()
    .single();

  if (execError) throw execError;

  try {
    // Create and start Docker container
    const containerId = await createDockerContainer(botId, bot.token, files);
    await startContainer(containerId);

    // Update bot status
    const startLogs = `[${new Date().toISOString()}] Creating Docker container...\n[${new Date().toISOString()}] Container ID: ${containerId}\n[${new Date().toISOString()}] Starting container...\n`;
    
    const { error: updateError } = await supabase
      .from('bots')
      .update({
        container_id: containerId,
        runtime_status: 'starting',
        runtime_logs: startLogs,
        last_restart: new Date().toISOString()
      })
      .eq('id', botId);

    if (updateError) throw updateError;

    // Start log streaming in background
    setTimeout(async () => {
      try {
        const logs = await getContainerLogs(containerId);
        const runningLogs = `${startLogs}[${new Date().toISOString()}] Container started successfully\n[${new Date().toISOString()}] Bot is now running\n${logs}`;
        
        await supabase
          .from('bots')
          .update({
            runtime_status: 'running',
            runtime_logs: runningLogs
          })
          .eq('id', botId);

        await supabase
          .from('bot_executions')
          .update({
            status: 'running'
          })
          .eq('id', execution.id);

      } catch (error) {
        console.error('Failed to start container:', error);
        await supabase
          .from('bots')
          .update({
            runtime_status: 'error',
            runtime_logs: `${startLogs}[${new Date().toISOString()}] Error: ${error.message}\n`
          })
          .eq('id', botId);
      }
    }, 3000);

    return { containerId, executionId: execution.id };

  } catch (error) {
    console.error('Failed to start bot:', error);
    
    await supabase
      .from('bots')
      .update({
        runtime_status: 'error',
        runtime_logs: `[${new Date().toISOString()}] Failed to start: ${error.message}\n`
      })
      .eq('id', botId);

    throw error;
  }
}

async function stopBot(botId: string) {
  // Get current execution and container info
  const { data: bot } = await supabase
    .from('bots')
    .select('container_id')
    .eq('id', botId)
    .single();

  const { data: execution } = await supabase
    .from('bot_executions')
    .select('id')
    .eq('bot_id', botId)
    .eq('status', 'running')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (bot?.container_id) {
    try {
      // Stop and remove Docker container
      await stopContainer(bot.container_id);
      await removeContainer(bot.container_id);
      
      const logs = `[${new Date().toISOString()}] Stopping container ${bot.container_id}...\n[${new Date().toISOString()}] Container stopped successfully\n[${new Date().toISOString()}] Container removed\n`;
      
      await supabase
        .from('bots')
        .update({
          runtime_status: 'stopped',
          runtime_logs: logs,
          container_id: null
        })
        .eq('id', botId);

    } catch (error) {
      console.error('Failed to stop container:', error);
      const errorLogs = `[${new Date().toISOString()}] Error stopping container: ${error.message}\n`;
      
      await supabase
        .from('bots')
        .update({
          runtime_status: 'error',
          runtime_logs: errorLogs
        })
        .eq('id', botId);
    }
  }

  // Update execution record
  if (execution) {
    await supabase
      .from('bot_executions')
      .update({
        status: 'stopped',
        stopped_at: new Date().toISOString(),
        exit_code: 0
      })
      .eq('id', execution.id);
  }

  return { stopped: true };
}

async function restartBot(botId: string, userId: string) {
  await stopBot(botId);
  // Wait a moment before restarting
  setTimeout(async () => {
    await startBot(botId, userId);
  }, 2000);
  return { restarting: true };
}

async function streamLogs(botId: string) {
  const { data: bot } = await supabase
    .from('bots')
    .select('container_id')
    .eq('id', botId)
    .single();

  if (bot?.container_id) {
    try {
      const logs = await getContainerLogs(bot.container_id);
      
      await supabase
        .from('bots')
        .update({
          runtime_logs: logs
        })
        .eq('id', botId);

      return { logs };
    } catch (error) {
      console.error('Failed to stream logs:', error);
      return { error: error.message };
    }
  }

  return { error: 'No container found' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, botId, userId } = await req.json();

    if (!action || !botId) {
      throw new Error('Missing required parameters: action and botId are required');
    }

    let result;
    switch (action) {
      case 'start':
        if (!userId) throw new Error('userId is required for start action');
        result = await startBot(botId, userId);
        break;
      case 'stop':
        result = await stopBot(botId);
        break;
      case 'restart':
        if (!userId) throw new Error('userId is required for restart action');
        result = await restartBot(botId, userId);
        break;
      case 'logs':
        result = await streamLogs(botId);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({
      success: true,
      action,
      result
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in manage-bot-runtime function:', error);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

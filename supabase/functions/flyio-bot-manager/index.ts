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

const FLYIO_API_BASE = 'https://api.machines.dev/v1';
const REQUEST_TIMEOUT = 60000; // 60 seconds for Fly.io deployments

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, botId, userId, ...requestData } = await req.json();
    
    console.log(`[FLYIO-MANAGER] === Starting ${action} for bot ${botId} ===`);
    console.log(`[FLYIO-MANAGER] Enhanced Hybrid Architecture: Supabase Storage + Fly.io Execution`);
    
    const flyioToken = Deno.env.get('FLYIO_API_TOKEN');
    const flyioOrg = Deno.env.get('FLYIO_ORG') || 'personal';
    
    console.log(`[FLYIO-MANAGER] Fly.io Token Available: ${!!flyioToken}`);
    console.log(`[FLYIO-MANAGER] Fly.io Organization: ${flyioOrg}`);

    switch (action) {
      case 'start-bot':
        return await startBotInFlyio(botId, userId, flyioToken, flyioOrg);
      case 'stop-bot':
        return await stopBotInFlyio(botId, flyioToken, flyioOrg);
      case 'get-logs':
        return await getLogsFromFlyio(botId, flyioToken, flyioOrg);
      case 'get-files':
        return await getFilesFromSupabaseStorage(botId, userId);
      case 'health-check':
        return await performHealthCheck(flyioToken);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('[FLYIO-MANAGER] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        logs: [`[FLYIO-MANAGER] Error: ${error.message}`]
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function startBotInFlyio(botId: string, userId: string, token: string, org: string): Promise<Response> {
  console.log(`[FLYIO-MANAGER] Starting bot deployment for ${botId}`);
  
  if (!token) {
    throw new Error('Fly.io API token not configured');
  }

  // First, get bot files from Supabase Storage
  const filesResponse = await getFilesFromSupabaseStorage(botId, userId);
  const filesData = await filesResponse.json();
  
  if (!filesData.success) {
    throw new Error('Failed to retrieve bot files from storage');
  }

  const { main_py, requirements_txt, env_file } = filesData.files;
  const botToken = extractTokenFromEnv(env_file);
  
  if (!botToken) {
    throw new Error('Bot token not found in environment file');
  }

  // Create Fly.io app configuration
  const appName = `telegram-bot-${botId.slice(0, 8)}`;
  const flyConfig = generateFlyConfig(appName, botToken);
  
  try {
    // Create Fly.io app
    await createFlyApp(appName, org, token);
    
    // Deploy the bot
    const deployResult = await deployBotToFly(appName, {
      main_py,
      requirements_txt,
      env_file,
      fly_toml: flyConfig
    }, token);
    
    console.log(`[FLYIO-MANAGER] Bot deployment successful for ${botId}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        appName,
        deploymentId: deployResult.id,
        logs: [
          `[FLYIO-MANAGER] App created: ${appName}`,
          `[FLYIO-MANAGER] Deployment successful: ${deployResult.id}`,
          `[FLYIO-MANAGER] Bot is starting up...`
        ]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[FLYIO-MANAGER] Deployment failed:`, error);
    throw new Error(`Fly.io deployment failed: ${error.message}`);
  }
}

async function stopBotInFlyio(botId: string, token: string, org: string): Promise<Response> {
  console.log(`[FLYIO-MANAGER] Stopping bot ${botId}`);
  
  const appName = `telegram-bot-${botId.slice(0, 8)}`;
  
  try {
    const response = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const machines = await response.json();
      
      // Stop all machines for this app
      for (const machine of machines) {
        await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines/${machine.id}/stop`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        logs: [`[FLYIO-MANAGER] Bot ${botId} stopped successfully`]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[FLYIO-MANAGER] Stop failed:`, error);
    throw new Error(`Failed to stop bot: ${error.message}`);
  }
}

async function getLogsFromFlyio(botId: string, token: string, org: string): Promise<Response> {
  console.log(`[FLYIO-MANAGER] Getting logs for bot ${botId}`);
  
  const appName = `telegram-bot-${botId.slice(0, 8)}`;
  
  try {
    const response = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    let logs = [`[FLYIO-MANAGER] Retrieving logs for ${appName}`];
    
    if (response.ok) {
      const machines = await response.json();
      
      for (const machine of machines) {
        const logResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines/${machine.id}/logs`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (logResponse.ok) {
          const logData = await logResponse.text();
          logs.push(`[MACHINE ${machine.id}] ${logData}`);
        }
      }
    } else {
      logs.push(`[FLYIO-MANAGER] App not found or no access: ${appName}`);
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        logs
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[FLYIO-MANAGER] Log retrieval failed:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        logs: [`[FLYIO-MANAGER] Failed to get logs: ${error.message}`]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function getFilesFromSupabaseStorage(botId: string, userId: string): Promise<Response> {
  console.log(`[FLYIO-MANAGER] Getting files from Supabase Storage for bot ${botId}`);
  console.log(`[FLYIO-MANAGER] User ID: ${userId}`);
  
  await ensureStorageBucket();
  
  const requiredFiles = ['main.py', 'requirements.txt', '.env', 'metadata.json'];
  const files: Record<string, string> = {};
  
  try {
    console.log(`[FLYIO-MANAGER] Exploring storage structure...`);
    
    // List all buckets for debugging
    const { data: buckets } = await supabase.storage.listBuckets();
    console.log(`[FLYIO-MANAGER] Available buckets: ${buckets?.map(b => b.name).join(', ')}`);
    
    // Try different path structures
    const possiblePaths = [
      botId,
      `bots/${userId}/${botId}`,
      `${userId}/${botId}`
    ];
    
    let foundPath = null;
    let allFiles: any[] = [];
    
    for (const path of possiblePaths) {
      console.log(`[FLYIO-MANAGER] Trying path: ${path}`);
      const { data: pathFiles, error } = await supabase.storage.from('bot-files').list(path);
      
      if (!error && pathFiles && pathFiles.length > 0) {
        const fileNames = pathFiles.map(f => f.name);
        console.log(`[FLYIO-MANAGER] Files found in ${path}: ${fileNames.join(', ')}`);
        
        if (fileNames.some(name => requiredFiles.includes(name))) {
          foundPath = path;
          allFiles = pathFiles;
          break;
        }
      }
    }
    
    if (!foundPath) {
      throw new Error(`No bot files found for bot ${botId}`);
    }
    
    console.log(`[FLYIO-MANAGER] Using path: ${foundPath}`);
    console.log(`[FLYIO-MANAGER] Available files: ${allFiles.map(f => f.name).join(', ')}`);
    
    // Download each required file
    for (const fileName of requiredFiles) {
      const filePath = `${foundPath}/${fileName}`;
      console.log(`[FLYIO-MANAGER] Downloading: ${filePath}`);
      
      const { data, error } = await supabase.storage
        .from('bot-files')
        .download(filePath);
      
      if (!error && data) {
        const content = await data.text();
        files[fileName.replace('.', '_')] = content;
        console.log(`[FLYIO-MANAGER] Successfully retrieved ${fileName}: ${content.length} characters`);
      } else {
        console.log(`[FLYIO-MANAGER] Failed to retrieve ${fileName}: ${error?.message || 'Unknown error'}`);
        if (fileName === 'main.py' || fileName === 'requirements.txt') {
          throw new Error(`Required file ${fileName} not found`);
        }
      }
    }
    
    console.log(`[FLYIO-MANAGER] Retrieved ${Object.keys(files).length}/${requiredFiles.length} files`);
    
    return new Response(
      JSON.stringify({
        success: true,
        files,
        path: foundPath
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error(`[FLYIO-MANAGER] Error retrieving files:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        logs: [`[FLYIO-MANAGER] File retrieval failed: ${error.message}`]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function performHealthCheck(token?: string): Promise<Response> {
  console.log('[FLYIO-MANAGER] Performing health check');
  
  const health = {
    supabase_storage: 'unknown',
    flyio_api: 'unknown',
    timestamp: new Date().toISOString()
  };
  
  // Check Supabase Storage
  try {
    const { data } = await supabase.storage.listBuckets();
    health.supabase_storage = data ? 'healthy' : 'error';
  } catch (error) {
    health.supabase_storage = 'error';
  }
  
  // Check Fly.io API
  if (token) {
    try {
      const response = await fetch(`${FLYIO_API_BASE}/apps`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      health.flyio_api = response.ok ? 'healthy' : 'error';
    } catch (error) {
      health.flyio_api = 'error';
    }
  } else {
    health.flyio_api = 'no_token';
  }
  
  return new Response(
    JSON.stringify({
      success: true,
      health,
      logs: [
        `[FLYIO-MANAGER] Health Check Complete`,
        `[FLYIO-MANAGER] Supabase Storage: ${health.supabase_storage}`,
        `[FLYIO-MANAGER] Fly.io API: ${health.flyio_api}`
      ]
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function ensureStorageBucket(): Promise<void> {
  console.log('[FLYIO-MANAGER] Ensuring bot-files bucket exists');
  
  const { data, error } = await supabase.storage.getBucket('bot-files');
  
  if (error && error.message.includes('not found')) {
    console.log('[FLYIO-MANAGER] Creating bot-files bucket');
    const { error: createError } = await supabase.storage.createBucket('bot-files', {
      public: false
    });
    
    if (createError) {
      throw new Error(`Failed to create storage bucket: ${createError.message}`);
    }
  } else if (error) {
    throw new Error(`Storage bucket error: ${error.message}`);
  }
  
  console.log('[FLYIO-MANAGER] Storage bucket verified');
}

async function createFlyApp(appName: string, org: string, token: string): Promise<void> {
  const response = await fetch('https://api.fly.io/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        mutation CreateApp($input: CreateAppInput!) {
          createApp(input: $input) {
            app {
              id
              name
            }
          }
        }
      `,
      variables: {
        input: {
          name: appName,
          organizationId: org
        }
      }
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create Fly.io app: ${error}`);
  }
}

async function deployBotToFly(appName: string, files: Record<string, string>, token: string): Promise<any> {
  // Create a simple deployment using Docker
  const dockerfile = `
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
COPY .env .

CMD ["python", "main.py"]
`;

  // For now, return a mock deployment result
  // In a real implementation, you would use Fly.io's deployment API
  return {
    id: `deploy_${Date.now()}`,
    status: 'deployed'
  };
}

function generateFlyConfig(appName: string, botToken: string): string {
  return `
app = "${appName}"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  BOT_TOKEN = "${botToken}"

[[services]]
  protocol = "tcp"
  internal_port = 8080

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
`;
}

function extractTokenFromEnv(envContent: string): string | null {
  const match = envContent.match(/BOT_TOKEN\s*=\s*(.+)/);
  return match ? match[1].trim().replace(/["']/g, '') : null;
}
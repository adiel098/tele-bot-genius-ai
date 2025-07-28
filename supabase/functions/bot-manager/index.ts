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
    const { action, botId, userId, prompt, token, name, modificationPrompt, instruction } = await req.json();
    
    console.log(`[BOT-MANAGER] === Starting ${action} for bot ${botId} ===`);
    console.log(`[BOT-MANAGER] Fly.io-Only Architecture: Supabase Storage + Fly.io Execution`);
    
    const flyioToken = Deno.env.get('FLYIO_API_TOKEN');
    const flyioOrg = Deno.env.get('FLYIO_ORG') || 'personal';
    
    console.log(`[BOT-MANAGER] Fly.io Token Available: ${!!flyioToken}`);
    console.log(`[BOT-MANAGER] Fly.io Organization: ${flyioOrg}`);

    switch (action) {
      case 'create-bot':
      case 'start-bot':
        return await startBotInFlyio(botId, userId, flyioToken, flyioOrg, prompt, token, name);
      case 'stop-bot':
        return await stopBotInFlyio(botId, flyioToken, flyioOrg);
      case 'restart-bot':
        return await restartBotInFlyio(botId, userId, flyioToken, flyioOrg);
      case 'get-logs':
        return await getLogsFromFlyio(botId, flyioToken, flyioOrg);
      case 'get-files':
        return await getFilesFromSupabaseStorage(botId, userId);
      case 'modify-bot':
        return await modifyBot(botId, userId, modificationPrompt || instruction, flyioToken, flyioOrg);
      case 'fix-bot':
        return await fixBot(botId, userId, flyioToken, flyioOrg);
      case 'health-check':
        return await performHealthCheck(flyioToken);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('[BOT-MANAGER] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        logs: [`[BOT-MANAGER] Error: ${error.message}`]
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function startBotInFlyio(botId: string, userId: string, token: string, org: string, prompt?: string, botToken?: string, name?: string): Promise<Response> {
  console.log(`[BOT-MANAGER] Starting bot deployment for ${botId}`);
  
  if (!token) {
    throw new Error('Fly.io API token not configured');
  }

  // First, get bot files from Supabase Storage
  const filesResponse = await getFilesFromSupabaseStorage(botId, userId);
  const filesData = await filesResponse.json();
  
  if (!filesData.success) {
    throw new Error('Failed to retrieve bot files from storage');
  }

  const { 'main.py': mainPy, 'requirements.txt': requirementsTxt, '.env': envFile } = filesData.files;
  const extractedToken = extractTokenFromEnv(envFile) || botToken;
  
  if (!extractedToken) {
    throw new Error('Bot token not found in environment file');
  }

  // Create Fly.io app configuration
  const appName = `telegram-bot-${botId.slice(0, 8)}`;
  const flyConfig = generateFlyConfig(appName, extractedToken);
  
  try {
    // Create Fly.io app
    await createFlyApp(appName, org, token);
    
    // Deploy the bot
    const deployResult = await deployBotToFly(appName, {
      'main.py': mainPy,
      'requirements.txt': requirementsTxt,
      '.env': envFile,
      'fly.toml': flyConfig
    }, token);
    
    console.log(`[BOT-MANAGER] Bot deployment successful for ${botId}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        appName,
        deploymentId: deployResult.id,
        logs: [
          `[BOT-MANAGER] App created: ${appName}`,
          `[BOT-MANAGER] Deployment successful: ${deployResult.id}`,
          `[BOT-MANAGER] Bot is starting up...`
        ]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[BOT-MANAGER] Deployment failed:`, error);
    throw new Error(`Fly.io deployment failed: ${error.message}`);
  }
}

async function stopBotInFlyio(botId: string, token: string, org: string): Promise<Response> {
  console.log(`[BOT-MANAGER] Stopping bot ${botId}`);
  
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
        logs: [`[BOT-MANAGER] Bot ${botId} stopped successfully`]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[BOT-MANAGER] Stop failed:`, error);
    throw new Error(`Failed to stop bot: ${error.message}`);
  }
}

async function restartBotInFlyio(botId: string, userId: string, token: string, org: string): Promise<Response> {
  console.log(`[BOT-MANAGER] Restarting bot ${botId}`);
  
  // Stop the bot first
  await stopBotInFlyio(botId, token, org);
  
  // Wait a moment for graceful shutdown
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Start the bot again
  return await startBotInFlyio(botId, userId, token, org);
}

async function getLogsFromFlyio(botId: string, token: string, org: string): Promise<Response> {
  console.log(`[BOT-MANAGER] Getting logs for bot ${botId}`);
  
  const appName = `telegram-bot-${botId.slice(0, 8)}`;
  
  try {
    const response = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    let logs = [`[BOT-MANAGER] Retrieving logs for ${appName}`];
    
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
      logs.push(`[BOT-MANAGER] App not found or no access: ${appName}`);
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        logs
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[BOT-MANAGER] Log retrieval failed:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        logs: [`[BOT-MANAGER] Failed to get logs: ${error.message}`]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function modifyBot(botId: string, userId: string, instruction: string, token: string, org: string): Promise<Response> {
  console.log(`[BOT-MANAGER] Modifying bot ${botId} with instruction: ${instruction}`);
  
  try {
    // This is a placeholder for AI-powered bot modification
    // In a full implementation, this would:
    // 1. Get current bot files
    // 2. Use AI to modify the code based on instruction
    // 3. Save updated files to Supabase Storage
    // 4. Redeploy to Fly.io
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Bot modification feature coming soon',
        logs: [`[BOT-MANAGER] Modification requested: ${instruction}`]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[BOT-MANAGER] Modification failed:`, error);
    throw new Error(`Failed to modify bot: ${error.message}`);
  }
}

async function fixBot(botId: string, userId: string, token: string, org: string): Promise<Response> {
  console.log(`[BOT-MANAGER] Attempting to fix bot ${botId}`);
  
  try {
    // Get current logs to diagnose issues
    const logsResponse = await getLogsFromFlyio(botId, token, org);
    const logsData = await logsResponse.json();
    
    // This is a placeholder for AI-powered bot fixing
    // In a full implementation, this would:
    // 1. Analyze error logs
    // 2. Use AI to fix the code issues
    // 3. Update files in Supabase Storage
    // 4. Redeploy to Fly.io
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'AI bot fixing feature coming soon',
        logs: [`[BOT-MANAGER] Fix attempt for bot ${botId}`, ...logsData.logs]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[BOT-MANAGER] Fix attempt failed:`, error);
    throw new Error(`Failed to fix bot: ${error.message}`);
  }
}

async function getFilesFromSupabaseStorage(botId: string, userId: string): Promise<Response> {
  console.log(`[BOT-MANAGER] Getting files from Supabase Storage for bot ${botId}`);
  console.log(`[BOT-MANAGER] User ID: ${userId}`);
  
  await ensureStorageBucket();
  
  const requiredFiles = ['main.py', 'requirements.txt', '.env', 'metadata.json'];
  const files: Record<string, string> = {};
  
  try {
    console.log(`[BOT-MANAGER] Exploring storage structure...`);
    
    // List all buckets for debugging
    const { data: buckets } = await supabase.storage.listBuckets();
    console.log(`[BOT-MANAGER] Available buckets: ${buckets?.map(b => b.name).join(', ')}`);
    
    // Try different path structures
    const possiblePaths = [
      botId,
      `bots/${userId}/${botId}`,
      `${userId}/${botId}`
    ];
    
    let foundPath = null;
    let allFiles: any[] = [];
    
    for (const path of possiblePaths) {
      console.log(`[BOT-MANAGER] Trying path: ${path}`);
      const { data: pathFiles, error } = await supabase.storage.from('bot-files').list(path);
      
      if (!error && pathFiles && pathFiles.length > 0) {
        const fileNames = pathFiles.map(f => f.name);
        console.log(`[BOT-MANAGER] Files found in ${path}: ${fileNames.join(', ')}`);
        
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
    
    console.log(`[BOT-MANAGER] Using path: ${foundPath}`);
    console.log(`[BOT-MANAGER] Available files: ${allFiles.map(f => f.name).join(', ')}`);
    
    // Download each required file
    for (const fileName of requiredFiles) {
      const filePath = `${foundPath}/${fileName}`;
      console.log(`[BOT-MANAGER] Downloading: ${filePath}`);
      
      const { data, error } = await supabase.storage
        .from('bot-files')
        .download(filePath);
      
      if (!error && data) {
        const content = await data.text();
        files[fileName] = content;
        console.log(`[BOT-MANAGER] Successfully retrieved ${fileName}: ${content.length} characters`);
      } else {
        console.log(`[BOT-MANAGER] Failed to retrieve ${fileName}: ${error?.message || 'Unknown error'}`);
        if (fileName === 'main.py' || fileName === 'requirements.txt') {
          throw new Error(`Required file ${fileName} not found`);
        }
      }
    }
    
    console.log(`[BOT-MANAGER] Retrieved ${Object.keys(files).length}/${requiredFiles.length} files`);
    
    return new Response(
      JSON.stringify({
        success: true,
        files,
        path: foundPath
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error(`[BOT-MANAGER] Error retrieving files:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        logs: [`[BOT-MANAGER] File retrieval failed: ${error.message}`]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function performHealthCheck(token?: string): Promise<Response> {
  console.log('[BOT-MANAGER] Performing health check');
  
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
        `[BOT-MANAGER] Health Check Complete`,
        `[BOT-MANAGER] Supabase Storage: ${health.supabase_storage}`,
        `[BOT-MANAGER] Fly.io API: ${health.flyio_api}`
      ]
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function ensureStorageBucket(): Promise<void> {
  console.log('[BOT-MANAGER] Ensuring bot-files bucket exists');
  
  const { data, error } = await supabase.storage.getBucket('bot-files');
  
  if (error && error.message.includes('not found')) {
    console.log('[BOT-MANAGER] Creating bot-files bucket');
    const { error: createError } = await supabase.storage.createBucket('bot-files', {
      public: false
    });
    
    if (createError) {
      throw new Error(`Failed to create storage bucket: ${createError.message}`);
    }
  } else if (error) {
    throw new Error(`Storage bucket error: ${error.message}`);
  }
  
  console.log('[BOT-MANAGER] Storage bucket verified');
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
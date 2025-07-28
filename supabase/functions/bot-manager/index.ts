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

  const logs: string[] = [`[BOT-MANAGER] Deployment initiated for bot ${botId}`];

  try {
    // First, get bot files from Supabase Storage
    logs.push(`[BOT-MANAGER] Retrieving bot files from Supabase Storage`);
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

    logs.push(`[BOT-MANAGER] Bot files retrieved successfully`);
    logs.push(`[BOT-MANAGER] Files: ${Object.keys(filesData.files).join(', ')}`);

    // Create Fly.io app configuration
    const appName = `telegram-bot-${botId.slice(0, 8)}`;
    logs.push(`[BOT-MANAGER] App name: ${appName}`);
    
    // Create Fly.io app
    logs.push(`[BOT-MANAGER] Creating Fly.io app...`);
    await createFlyApp(appName, org, token);
    logs.push(`[BOT-MANAGER] App created successfully`);
    
    // Deploy the bot
    logs.push(`[BOT-MANAGER] Starting deployment process...`);
    const deployResult = await deployBotToFly(appName, {
      'main.py': mainPy,
      'requirements.txt': requirementsTxt,
      '.env': envFile
    }, token);
    
    logs.push(`[BOT-MANAGER] Deployment completed successfully`);
    logs.push(`[BOT-MANAGER] Machine ID: ${deployResult.id}`);
    
    // Wait for machine to be fully started
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check machine status
    const statusResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines/${deployResult.id}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    let machineStatus = 'unknown';
    if (statusResponse.ok) {
      const machineData = await statusResponse.json();
      machineStatus = machineData.state || 'unknown';
      logs.push(`[BOT-MANAGER] Machine status: ${machineStatus}`);
    }
    
    console.log(`[BOT-MANAGER] Bot deployment successful for ${botId}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        appName,
        deploymentId: deployResult.id,
        machineId: deployResult.id,
        status: machineStatus,
        logs
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[BOT-MANAGER] Deployment failed:`, error);
    logs.push(`[BOT-MANAGER] Deployment failed: ${error.message}`);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        logs
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
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
    let hasErrors = false;
    
    if (response.ok) {
      const machines = await response.json();
      logs.push(`[BOT-MANAGER] Found ${machines.length} machine(s)`);
      
      for (const machine of machines) {
        logs.push(`[BOT-MANAGER] Machine ${machine.id} state: ${machine.state || 'unknown'}`);
        
        // Get machine logs
        const logResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines/${machine.id}/logs`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (logResponse.ok) {
          const logData = await logResponse.text();
          if (logData) {
            const logLines = logData.split('\n').filter(line => line.trim());
            logLines.forEach(line => {
              logs.push(`[${machine.id}] ${line}`);
              if (line.includes('ERROR') || line.includes('error') || line.includes('Exception')) {
                hasErrors = true;
              }
            });
          } else {
            logs.push(`[${machine.id}] No logs available yet`);
          }
        } else {
          logs.push(`[${machine.id}] Failed to retrieve logs: ${logResponse.status}`);
        }
        
        // Get machine events for additional debugging
        const eventsResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines/${machine.id}/events`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (eventsResponse.ok) {
          const events = await eventsResponse.json();
          if (events && events.length > 0) {
            logs.push(`[${machine.id}] Recent events:`);
            events.slice(-5).forEach((event: any) => {
              logs.push(`[${machine.id}] ${event.timestamp}: ${event.type} - ${event.status || 'no status'}`);
            });
          }
        }
      }
    } else if (response.status === 404) {
      logs.push(`[BOT-MANAGER] App not found: ${appName} (this may be normal if bot was never deployed)`);
    } else {
      logs.push(`[BOT-MANAGER] API error: ${response.status} - ${await response.text()}`);
      hasErrors = true;
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        logs,
        hasErrors
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[BOT-MANAGER] Log retrieval failed:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        logs: [`[BOT-MANAGER] Failed to get logs: ${error.message}`],
        hasErrors: true
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
        path: foundPath,
        storage_method: 'Enhanced Supabase Storage v2',
        architecture: 'Hybrid Supabase + Fly.io',
        bucket_status: 'active',
        bucket_name: 'bot-files',
        file_count: Object.keys(files).length,
        retrieval_results: requiredFiles.map(fileName => ({
          filename: fileName,
          success: !!files[fileName],
          size: files[fileName]?.length || 0
        }))
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
  console.log(`[BOT-MANAGER] Creating Fly.io app: ${appName}`);
  
  // First check if app already exists
  const checkResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (checkResponse.ok) {
    console.log(`[BOT-MANAGER] App ${appName} already exists`);
    return;
  }

  // Get the user's personal organization ID first
  console.log(`[BOT-MANAGER] Retrieving user organizations...`);
  const orgsResponse = await fetch('https://api.fly.io/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        query {
          viewer {
            organizations(first: 10) {
              nodes {
                id
                slug
                name
                type
              }
            }
          }
        }
      `
    })
  });

  if (!orgsResponse.ok) {
    throw new Error(`Failed to get organizations: ${await orgsResponse.text()}`);
  }

  const orgsResult = await orgsResponse.json();
  if (orgsResult.errors) {
    throw new Error(`GraphQL error getting orgs: ${orgsResult.errors[0]?.message}`);
  }

  const organizations = orgsResult.data?.viewer?.organizations?.nodes || [];
  console.log(`[BOT-MANAGER] Found ${organizations.length} organizations`);
  
  // Find personal organization or use the first available
  let targetOrg = organizations.find((o: any) => o.type === 'PERSONAL' || o.slug === 'personal');
  if (!targetOrg && organizations.length > 0) {
    targetOrg = organizations[0];
  }
  
  if (!targetOrg) {
    throw new Error('No organizations found for this user');
  }

  console.log(`[BOT-MANAGER] Using organization: ${targetOrg.slug} (${targetOrg.id})`);

  // Use GraphQL API to create the app
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
              organization {
                id
                slug
              }
            }
          }
        }
      `,
      variables: {
        input: {
          name: appName,
          organizationId: targetOrg.id
        }
      }
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[BOT-MANAGER] App creation failed: ${errorText}`);
    throw new Error(`Failed to create Fly.io app: ${errorText}`);
  }

  const result = await response.json();
  if (result.errors) {
    console.error(`[BOT-MANAGER] GraphQL errors:`, result.errors);
    throw new Error(`GraphQL error: ${result.errors[0]?.message || 'Unknown error'}`);
  }

  console.log(`[BOT-MANAGER] App created successfully: ${appName} in org ${targetOrg.slug}`);
}

async function deployBotToFly(appName: string, files: Record<string, string>, token: string): Promise<any> {
  console.log(`[BOT-MANAGER] Starting real deployment for ${appName}`);
  
  try {
    // First, cleanup any existing machines for this app
    console.log(`[BOT-MANAGER] Checking for existing machines in app ${appName}`);
    await cleanupExistingMachines(appName, token);
    
    // Create machine config with embedded setup script
    console.log(`[BOT-MANAGER] Creating machine with bot setup for ${appName}`);
    
    // Extract bot token from .env file
    const botToken = extractTokenFromEnv(files['.env']) || '';
    
    // Create setup script that installs dependencies and sets up the bot
    const setupScript = `#!/bin/bash
set -e

echo "Installing Python dependencies..."
pip install python-telegram-bot python-dotenv requests aiohttp

echo "Creating bot directory and files..."
mkdir -p /app
cd /app

# Create main.py
cat > main.py << 'EOF'
${files['main.py'] || ''}
EOF

# Create .env
cat > .env << 'EOF'
${files['.env'] || ''}
EOF

# Create requirements.txt if it exists
${files['requirements.txt'] ? `cat > requirements.txt << 'EOF'
${files['requirements.txt']}
EOF` : ''}

echo "Bot setup complete, starting bot..."
exec python main.py
`;

    const machineConfig = {
      config: {
        image: 'python:3.11-slim',
        init: {
          cmd: ['/bin/bash', '-c', setupScript]
        },
        env: {
          PYTHONUNBUFFERED: '1',
          BOT_TOKEN: botToken
        },
        guest: {
          cpu_kind: 'shared',
          cpus: 1,
          memory_mb: 256
        },
        restart: {
          policy: 'always'
        },
        auto_destroy: false
      },
      region: 'iad'
    };

    // Create machine
    const createResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(machineConfig)
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error(`[BOT-MANAGER] Machine creation failed: ${errorText}`);
      throw new Error(`Failed to create machine: ${errorText}`);
    }

    const machine = await createResponse.json();
    console.log(`[BOT-MANAGER] Machine created: ${machine.id}`);

    // Wait for machine to be ready
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check machine status
    const statusResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines/${machine.id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (statusResponse.ok) {
      const status = await statusResponse.json();
      console.log(`[BOT-MANAGER] Machine ${machine.id} current state: ${status.state}`);
      
      // Only try to start if the machine is stopped or created
      if (status.state === 'stopped' || status.state === 'created') {
        console.log(`[BOT-MANAGER] Starting machine ${machine.id}...`);
        
        const startResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines/${machine.id}/start`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!startResponse.ok) {
          const errorText = await startResponse.text();
          console.log(`[BOT-MANAGER] Start attempt result: ${errorText}`);
          // Don't throw error here, the machine might start on its own
        } else {
          console.log(`[BOT-MANAGER] Machine ${machine.id} start command sent successfully`);
        }
      } else {
        console.log(`[BOT-MANAGER] Machine ${machine.id} is in ${status.state} state - no start needed`);
      }
    }

    console.log(`[BOT-MANAGER] Deployment process completed for machine: ${machine.id}`);
    
    return {
      id: machine.id,
      appName,
      status: 'deployed',
      machine: machine
    };
    
  } catch (error) {
    console.error(`[BOT-MANAGER] Deployment failed:`, error);
    throw error;
  }
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

async function cleanupExistingMachines(appName: string, token: string): Promise<void> {
  console.log(`[BOT-MANAGER] Cleaning up existing machines for app ${appName}`);
  
  try {
    // Get all machines for this app
    const machinesResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!machinesResponse.ok) {
      if (machinesResponse.status === 404) {
        console.log(`[BOT-MANAGER] App ${appName} not found, no cleanup needed`);
        return;
      }
      throw new Error(`Failed to list machines: ${machinesResponse.status}`);
    }

    const machines = await machinesResponse.json();
    console.log(`[BOT-MANAGER] Found ${machines.length} existing machines to cleanup`);

    // Stop and destroy all existing machines
    for (const machine of machines) {
      console.log(`[BOT-MANAGER] Cleaning up machine ${machine.id} (state: ${machine.state})`);
      
      // Stop the machine first if it's running
      if (machine.state === 'started' || machine.state === 'starting') {
        try {
          await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines/${machine.id}/stop`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          console.log(`[BOT-MANAGER] Stopped machine ${machine.id}`);
          
          // Wait for machine to stop
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.log(`[BOT-MANAGER] Failed to stop machine ${machine.id}: ${error.message}`);
        }
      }

      // Destroy the machine
      try {
        const destroyResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines/${machine.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (destroyResponse.ok) {
          console.log(`[BOT-MANAGER] Destroyed machine ${machine.id}`);
        } else {
          console.log(`[BOT-MANAGER] Failed to destroy machine ${machine.id}: ${destroyResponse.status}`);
        }
      } catch (error) {
        console.log(`[BOT-MANAGER] Failed to destroy machine ${machine.id}: ${error.message}`);
      }
    }

    console.log(`[BOT-MANAGER] Machine cleanup completed for app ${appName}`);
  } catch (error) {
    console.error(`[BOT-MANAGER] Machine cleanup failed:`, error);
    // Don't throw the error, just log it - we still want to proceed with deployment
  }
}

function extractTokenFromEnv(envContent: string): string | null {
  const match = envContent.match(/BOT_TOKEN\s*=\s*(.+)/);
  return match ? match[1].trim().replace(/["']/g, '') : null;
}
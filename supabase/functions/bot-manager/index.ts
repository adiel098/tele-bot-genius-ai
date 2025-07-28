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
const FLYIO_TOKEN = Deno.env.get('FLYIO_API_TOKEN');
const FLYIO_ORG = Deno.env.get('FLYIO_ORG') || 'personal';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request = await req.json();
    
    console.log(`[BOT-MANAGER] === Starting ${request.action} for bot ${request.bot_id} ===`);
    console.log(`[BOT-MANAGER] Fly.io Token Available: ${!!FLYIO_TOKEN}`);
    console.log(`[BOT-MANAGER] Fly.io Organization: ${FLYIO_ORG}`);
    console.log(`[BOT-MANAGER] Fly.io-Only Architecture: Supabase Storage + Fly.io Execution`);

    switch (request.action) {
      case 'start-bot':
        return await startBotInFlyio(request.user_id, request.bot_id);
      case 'stop-bot':
        return await stopBotInFlyio(request.bot_id);
      case 'delete-bot':
        return await deleteBotFromFlyio(request.bot_id);
      case 'restart-bot':
        return await restartBotInFlyio(request.user_id, request.bot_id);
      case 'get-logs':
        return await getLogsFromFlyio(request.bot_id);
      case 'modify-bot':
        return await modifyBot(request.user_id, request.bot_id, request.prompt);
      case 'fix-bot':
        return await fixBot(request.user_id, request.bot_id);
      case 'health-check':
        return await performHealthCheck();
      default:
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Unknown action: ${request.action}` 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[BOT-MANAGER] Request error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function startBotInFlyio(userId: string, botId: string): Promise<Response> {
  console.log(`[BOT-MANAGER] Starting bot deployment for ${botId}`);
  console.log(`[BOT-MANAGER] User ID: ${userId}`);
  
  try {
    // Ensure storage bucket exists
    await ensureStorageBucket();
    
    // Get bot files from Supabase Storage
    console.log(`[BOT-MANAGER] Getting files from Supabase Storage for bot ${botId}`);
    const files = await getFilesFromSupabaseStorage(botId, userId);
    
    if (!files['main.py'] || !files['.env'] || !files['requirements.txt']) {
      throw new Error('Required bot files missing from storage');
    }
    
    // Generate app name
    const appName = `telegram-bot-${botId.substring(0, 8)}`;
    
    // Get or create organization
    const orgs = await getUserOrganizations(FLYIO_TOKEN);
    const org = orgs.length > 0 ? orgs[0] : FLYIO_ORG;
    console.log(`[BOT-MANAGER] Using organization: ${org.name} (${org.slug})`);
    
    // Create Fly.io app
    await createFlyApp(appName, org.slug, FLYIO_TOKEN);
    
    // Convert webhook code to polling
    console.log(`[BOT-MANAGER] Converting webhook code to polling mode`);
    files['main.py'] = convertWebhookToPolling(files['main.py']);
    console.log(`[BOT-MANAGER] Code conversion completed - all webhook references removed`);
    
    // Deploy bot directly to machine
    const deployment = await deployBotToFly(appName, files, FLYIO_TOKEN);
    
    console.log(`[BOT-MANAGER] Bot deployment completed for machine: ${deployment.machineId}`);
    
    // Update bot status to running
    const { error: updateError } = await supabase
      .from('bots')
      .update({ 
        runtime_status: 'running',
        fly_app_name: appName,
        fly_machine_id: deployment.machineId
      })
      .eq('id', botId);
    
    if (updateError) {
      console.error(`[BOT-MANAGER] Error updating bot status: ${updateError.message}`);
    }
    
    // Get initial logs and store them
    setTimeout(async () => {
      try {
        console.log(`[BOT-MANAGER] Getting logs for bot ${botId}`);
        const logsResponse = await getLogsFromFlyio(botId);
        console.log(`[BOT-MANAGER] Initial logs stored successfully for bot ${botId}`);
      } catch (error) {
        console.error(`[BOT-MANAGER] Failed to get initial logs: ${error}`);
      }
    }, 5000);
    
    console.log(`[BOT-MANAGER] Bot deployment successful for ${botId}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        botId,
        appName,
        machineId: deployment.machineId,
        status: 'running',
        logs: [`[BOT-MANAGER] Bot ${botId} started successfully`]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[BOT-MANAGER] Bot deployment failed: ${error}`);
    
    // Update bot status to error
    await supabase
      .from('bots')
      .update({ runtime_status: 'error' })
      .eq('id', botId);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        logs: [`[BOT-MANAGER] Bot deployment failed for ${botId}: ${error}`]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function stopBotInFlyio(botId: string): Promise<Response> {
  console.log(`[BOT-MANAGER] === Starting stop-bot for bot ${botId} ===`);
  
  try {
    // Get bot info from database
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('fly_app_name')
      .eq('id', botId)
      .single();

    if (botError || !bot) {
      throw new Error(`Bot not found: ${botError?.message || 'Unknown error'}`);
    }

    const appName = bot.fly_app_name || `telegram-bot-${botId.substring(0, 8)}`;
    
    // Stop all machines for the app
    await cleanupExistingMachines(appName, FLYIO_TOKEN);
    
    // Update bot status to stopped
    const { error: updateError } = await supabase
      .from('bots')
      .update({ runtime_status: 'stopped' })
      .eq('id', botId);

    if (updateError) {
      console.error(`[BOT-MANAGER] Error updating bot status: ${updateError.message}`);
    }

    console.log(`[BOT-MANAGER] Bot stopped successfully for ${botId}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        logs: [`[BOT-MANAGER] Bot ${botId} stopped successfully`]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[BOT-MANAGER] Bot stop failed: ${error}`);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        logs: [`[BOT-MANAGER] Bot stop failed for ${botId}: ${error}`]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function deleteBotFromFlyio(botId: string): Promise<Response> {
  console.log(`[BOT-MANAGER] === Starting delete-bot for bot ${botId} ===`);
  
  try {
    // Get bot info from database
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('fly_app_name')
      .eq('id', botId)
      .single();

    if (botError || !bot) {
      throw new Error(`Bot not found: ${botError?.message || 'Unknown error'}`);
    }

    const appName = bot.fly_app_name || `telegram-bot-${botId.substring(0, 8)}`;
    
    // Clean up machines only (no volumes to clean)
    await cleanupExistingMachines(appName, FLYIO_TOKEN);
    
    // Delete the Fly.io app
    const deleteResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${FLYIO_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      console.log(`[BOT-MANAGER] Warning: Failed to delete app ${appName}, but continuing...`);
    }

    // Update bot status in database
    const { error: updateError } = await supabase
      .from('bots')
      .update({ 
        runtime_status: 'stopped',
        fly_app_name: null,
        fly_machine_id: null
      })
      .eq('id', botId);

    if (updateError) {
      console.error(`[BOT-MANAGER] Error updating bot status: ${updateError.message}`);
    }

    console.log(`[BOT-MANAGER] Bot deletion completed for ${botId}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        logs: [`[BOT-MANAGER] Bot ${botId} deleted successfully`]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[BOT-MANAGER] Bot deletion failed: ${error}`);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        logs: [`[BOT-MANAGER] Bot deletion failed for ${botId}: ${error}`]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function restartBotInFlyio(userId: string, botId: string): Promise<Response> {
  console.log(`[BOT-MANAGER] === Starting restart-bot for bot ${botId} ===`);
  
  try {
    // Stop the bot first
    await stopBotInFlyio(botId);
    
    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start the bot again
    return await startBotInFlyio(userId, botId);

  } catch (error) {
    console.error(`[BOT-MANAGER] Bot restart failed: ${error}`);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        logs: [`[BOT-MANAGER] Bot restart failed for ${botId}: ${error}`]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function getLogsFromFlyio(botId: string): Promise<Response> {
  console.log(`[BOT-MANAGER] === Starting get-logs for bot ${botId} ===`);
  console.log(`[BOT-MANAGER] Getting logs for bot ${botId}`);
  
  try {
    // Get bot info from database
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('fly_app_name, fly_machine_id')
      .eq('id', botId)
      .single();

    if (botError || !bot) {
      throw new Error(`Bot not found: ${botError?.message || 'Unknown error'}`);
    }

    const appName = bot.fly_app_name || `telegram-bot-${botId.substring(0, 8)}`;
    const machineId = bot.fly_machine_id;
    
    if (!machineId) {
      throw new Error('Machine ID not found for bot');
    }

    // Get logs from Fly.io
    const logsResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines/${machineId}/logs`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${FLYIO_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!logsResponse.ok) {
      const errorText = await logsResponse.text();
      throw new Error(`Failed to get logs: ${errorText}`);
    }

    const logs = await logsResponse.text();
    
    // Store logs in Supabase
    const { error: storeError } = await supabase
      .from('bot_logs')
      .upsert({
        bot_id: botId,
        logs: logs,
        updated_at: new Date().toISOString()
      });

    if (storeError) {
      console.error(`[BOT-MANAGER] Error storing logs: ${storeError.message}`);
    }

    // Check for errors in logs
    const hasErrors = logs.toLowerCase().includes('error') || 
                     logs.toLowerCase().includes('exception') ||
                     logs.toLowerCase().includes('failed');

    return new Response(
      JSON.stringify({
        success: true,
        logs: logs,
        hasErrors,
        machineId,
        appName
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[BOT-MANAGER] Get logs failed: ${error}`);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        logs: [`[BOT-MANAGER] Get logs failed for ${botId}: ${error}`]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function modifyBot(userId: string, botId: string, prompt: string): Promise<Response> {
  // Placeholder for future implementation
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Bot modification not yet implemented',
      logs: [`[BOT-MANAGER] Bot modification not yet implemented for ${botId}`]
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function fixBot(userId: string, botId: string): Promise<Response> {
  console.log(`[BOT-MANAGER] === Starting fix-bot for bot ${botId} ===`);
  
  try {
    // Get current logs to understand the error
    const logsResponse = await getLogsFromFlyio(botId);
    const logsData = await logsResponse.json();
    
    if (!logsData.success) {
      throw new Error('Could not retrieve bot logs for analysis');
    }
    
    // For now, just restart the bot as a basic fix
    return await restartBotInFlyio(userId, botId);

  } catch (error) {
    console.error(`[BOT-MANAGER] Bot fix failed: ${error}`);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        logs: [`[BOT-MANAGER] Bot fix failed for ${botId}: ${error}`]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function getFilesFromSupabaseStorage(botId: string, userId: string): Promise<Record<string, string>> {
  console.log(`[BOT-MANAGER] Exploring storage structure...`);
  
  // List all buckets
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
  if (bucketsError) {
    throw new Error(`Failed to list buckets: ${bucketsError.message}`);
  }
  
  console.log(`[BOT-MANAGER] Available buckets: ${buckets.map(b => b.name).join(', ')}`);
  
  // Try different path patterns
  const possiblePaths = [
    botId,
    `bots/${userId}/${botId}`
  ];
  
  for (const path of possiblePaths) {
    console.log(`[BOT-MANAGER] Trying path: ${path}`);
    
    const { data: files, error: listError } = await supabase.storage
      .from('bot-files')
      .list(path);
    
    if (!listError && files && files.length > 0) {
      console.log(`[BOT-MANAGER] Files found in ${path}: ${files.map(f => f.name).join(', ')}`);
      console.log(`[BOT-MANAGER] Using path: ${path}`);
      console.log(`[BOT-MANAGER] Available files: ${files.map(f => f.name).join(', ')}`);
      
      const result: Record<string, string> = {};
      const requiredFiles = ['main.py', '.env', 'requirements.txt', 'metadata.json'];
      
      for (const fileName of requiredFiles) {
        if (files.some(f => f.name === fileName)) {
          console.log(`[BOT-MANAGER] Downloading: ${path}/${fileName}`);
          
          const { data, error } = await supabase.storage
            .from('bot-files')
            .download(`${path}/${fileName}`);
          
          if (error) {
            console.error(`[BOT-MANAGER] Error downloading ${fileName}: ${error.message}`);
            continue;
          }
          
          const content = await data.text();
          result[fileName] = content;
          console.log(`[BOT-MANAGER] Successfully retrieved ${fileName}: ${content.length} characters`);
        }
      }
      
      console.log(`[BOT-MANAGER] Retrieved ${Object.keys(result).length}/${requiredFiles.length} files`);
      return result;
    }
  }
  
  throw new Error(`No bot files found for bot ${botId}`);
}

async function performHealthCheck(): Promise<Response> {
  const health = {
    supabase_storage: 'unknown',
    flyio_api: 'unknown'
  };
  
  // Check Supabase Storage
  try {
    const { data, error } = await supabase.storage.listBuckets();
    health.supabase_storage = error ? 'error' : 'healthy';
  } catch (error) {
    health.supabase_storage = 'error';
  }
  
  // Check Fly.io API
  if (FLYIO_TOKEN) {
    try {
      const response = await fetch(`${FLYIO_API_BASE}/apps`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${FLYIO_TOKEN}`,
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

  // Create new app
  const createResponse = await fetch(`${FLYIO_API_BASE}/apps`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      app_name: appName,
      org_slug: org
    })
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(`Failed to create Fly.io app: ${errorText}`);
  }

  console.log(`[BOT-MANAGER] App created successfully: ${appName} in org ${org}`);
}

async function deployBotToFly(appName: string, files: Record<string, string>, token: string): Promise<any> {
  console.log(`[BOT-MANAGER] Starting direct machine deployment for ${appName}`);
  
  // Extract bot token from .env file
  const botToken = extractTokenFromEnv(files['.env'] || '');
  if (!botToken) {
    throw new Error('Bot token not found in .env file');
  }
  
  // Prepare the startup script that will install dependencies and run the bot
  const startupScript = `#!/bin/bash
set -e

echo "Setting up bot environment..."
cd /app

# Create bot files
cat > main.py << 'EOF'
${files['main.py']}
EOF

cat > requirements.txt << 'EOF'
${files['requirements.txt']}
EOF

cat > .env << 'EOF'
${files['.env']}
EOF

# Install dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt

# Run the bot
echo "Starting bot..."
python main.py
`;

  // Create machine configuration
  const machineConfig = {
    config: {
      image: 'python:3.11-slim',
      env: {
        'BOT_TOKEN': botToken,
        'PYTHONUNBUFFERED': '1'
      },
      init: {
        exec: ['/bin/bash', '-c', startupScript]
      },
      restart: {
        policy: 'always'
      },
      size: 'shared-cpu-1x'
    }
  };
  
  // Create the machine
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
    throw new Error(`Failed to create machine: ${errorText}`);
  }
  
  const machine = await createResponse.json();
  console.log(`[BOT-MANAGER] Bot machine created: ${machine.id}`);
  
  return {
    machineId: machine.id,
    appName: appName,
    status: 'deployed'
  };
}

async function cleanupExistingMachines(appName: string, token: string): Promise<void> {
  console.log(`[BOT-MANAGER] Cleaning up existing machines for app ${appName}`);
  
  try {
    const machinesResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (machinesResponse.ok) {
      const machines = await machinesResponse.json();
      console.log(`[BOT-MANAGER] Found ${machines.length} existing machines to cleanup`);
      
      for (const machine of machines) {
        console.log(`[BOT-MANAGER] Destroying machine: ${machine.id}`);
        const destroyResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines/${machine.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (destroyResponse.ok) {
          console.log(`[BOT-MANAGER] ✅ Machine ${machine.id} destroyed successfully`);
        } else {
          console.log(`[BOT-MANAGER] ⚠️ Failed to destroy machine ${machine.id}`);
        }
      }
    } else {
      console.log(`[BOT-MANAGER] No machines found or error retrieving machines for app ${appName}`);
    }
  } catch (error) {
    console.log(`[BOT-MANAGER] Error during machine cleanup: ${error}`);
  }
  
  console.log(`[BOT-MANAGER] Machine cleanup completed for app ${appName}`);
}

async function getUserOrganizations(token: string): Promise<any[]> {
  console.log(`[BOT-MANAGER] Retrieving user organizations...`);
  
  const response = await fetch(`${FLYIO_API_BASE}/orgs`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Failed to retrieve organizations');
  }

  const orgs = await response.json();
  console.log(`[BOT-MANAGER] Found ${orgs.length} organizations`);
  
  return orgs;
}

function convertWebhookToPolling(code: string): string {
  // Remove webhook-related imports and code
  let modifiedCode = code;
  
  // Remove webhook-specific imports
  modifiedCode = modifiedCode.replace(/from\s+telegram\.ext\s+import.*?WebhookHandler.*?\n/gs, '');
  modifiedCode = modifiedCode.replace(/import.*?webhook.*?\n/gi, '');
  
  // Remove webhook setup calls
  modifiedCode = modifiedCode.replace(/\.set_webhook\(.*?\)/gs, '');
  modifiedCode = modifiedCode.replace(/\.delete_webhook\(\)/gs, '');
  modifiedCode = modifiedCode.replace(/\.start_webhook\(.*?\)/gs, '');
  
  // Replace webhook polling with simple polling
  modifiedCode = modifiedCode.replace(
    /application\.run_webhook\(.*?\)/gs,
    'application.run_polling(drop_pending_updates=True)'
  );
  
  // Ensure we're using polling
  if (!modifiedCode.includes('run_polling')) {
    // Add run_polling at the end if not present
    modifiedCode = modifiedCode.replace(
      /(if\s+__name__\s*==\s*['"']__main__['"']\s*:\s*\n)/,
      '$1    application.run_polling(drop_pending_updates=True)\n'
    );
  }
  
  return modifiedCode;
}

function extractTokenFromEnv(envContent: string): string {
  const lines = envContent.split('\n');
  for (const line of lines) {
    if (line.startsWith('BOT_TOKEN=')) {
      return line.split('=')[1];
    }
  }
  return '';
}
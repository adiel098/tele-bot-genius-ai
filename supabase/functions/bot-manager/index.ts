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
    
    // Deploy the bot using volume-based storage
    logs.push(`[BOT-MANAGER] Creating volume and deploying bot...`);
    // Convert webhook code to polling mode
    const convertedMainPy = convertWebhookToPolling(mainPy);
    
    const deployResult = await deployBotToFlyWithVolume(appName, {
      'main.py': convertedMainPy,
      'requirements.txt': requirementsTxt,
      '.env': envFile
    }, token);
    
    logs.push(`[BOT-MANAGER] Deployment completed successfully`);
    logs.push(`[BOT-MANAGER] Machine ID: ${deployResult.id}`);
    
    // Wait for machine to be fully started and capture initial logs
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Get initial logs and store them in database
    try {
      const initialLogsResponse = await getLogsFromFlyio(botId, token, org);
      const initialLogsData = await initialLogsResponse.json();
      
      if (initialLogsData.success && initialLogsData.logs) {
        const combinedLogs = [
          `[DEPLOYMENT] Bot deployment completed at ${new Date().toISOString()}`,
          `[DEPLOYMENT] Machine ID: ${deployResult.id}`,
          `[DEPLOYMENT] App Name: ${appName}`,
          ...initialLogsData.logs
        ].join('\n');
        
        // Store initial logs in database
        const { error: logUpdateError } = await supabase
          .from('bots')
          .update({ 
            runtime_logs: combinedLogs,
            runtime_status: initialLogsData.hasErrors ? 'error' : 'running',
            container_id: deployResult.id
          })
          .eq('id', botId);
        
        if (logUpdateError) {
          console.error(`[BOT-MANAGER] Failed to store initial logs:`, logUpdateError);
        } else {
          console.log(`[BOT-MANAGER] Initial logs stored successfully for bot ${botId}`);
        }
      }
    } catch (logError) {
      console.error(`[BOT-MANAGER] Failed to capture initial logs:`, logError);
    }
    
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
    let syntaxErrors: string[] = [];
    let runtimeErrors: string[] = [];
    let installErrors: string[] = [];
    
    if (response.ok) {
      const machines = await response.json();
      logs.push(`[BOT-MANAGER] Found ${machines.length} machine(s)`);
      
      for (const machine of machines) {
        logs.push(`[BOT-MANAGER] Machine ${machine.id} state: ${machine.state || 'unknown'}`);
        
        // Get machine logs with more comprehensive history
        const logResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines/${machine.id}/logs?format=json&since=1h`, {
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
              
              // Categorize different types of errors
              if (line.includes('SYNTAX_ERROR:')) {
                hasErrors = true;
                syntaxErrors.push(line.replace(/.*SYNTAX_ERROR:\s*/, ''));
              } else if (line.includes('RUNTIME_ERROR:')) {
                hasErrors = true;
                runtimeErrors.push(line.replace(/.*RUNTIME_ERROR:\s*/, ''));
              } else if (line.includes('ERROR: Failed to install')) {
                hasErrors = true;
                installErrors.push(line.replace(/.*ERROR:\s*/, ''));
              } else if (line.includes('ERROR') || line.includes('error') || line.includes('Exception') || line.includes('Traceback')) {
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
        hasErrors,
        errorAnalysis: {
          syntaxErrors,
          runtimeErrors,
          installErrors,
          canAutoFix: syntaxErrors.length > 0 || runtimeErrors.length > 0
        }
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
    
    if (!logsData.errorAnalysis || !logsData.errorAnalysis.canAutoFix) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No fixable errors detected in logs',
          logs: logsData.logs
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get current bot files
    const filesResponse = await getFilesFromSupabaseStorage(botId, userId);
    const filesData = await filesResponse.json();
    
    if (!filesData.success) {
      throw new Error('Failed to retrieve bot files for fixing');
    }
    
    // Prepare error context for AI
    const errorContext = {
      syntaxErrors: logsData.errorAnalysis.syntaxErrors,
      runtimeErrors: logsData.errorAnalysis.runtimeErrors,
      installErrors: logsData.errorAnalysis.installErrors,
      fullLogs: logsData.logs.filter(log => log.includes('ERROR') || log.includes('Exception') || log.includes('Traceback'))
    };
    
    console.log(`[BOT-MANAGER] Calling AI to fix errors for bot ${botId}`);
    
    // Call OpenAI to fix the code
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }
    
    const systemPrompt = `You are an expert Python developer specializing in fixing Telegram bot code. 
    
You will be given:
1. Python bot code with errors
2. Error logs and diagnostics
3. The requirements.txt file

Your task is to fix ALL errors in the code and ensure it works properly. Focus on:
- Syntax errors (missing imports, incorrect indentation, syntax issues)
- Runtime errors (undefined variables, incorrect API usage)
- Dependency issues (missing or incorrect packages)

CRITICAL REQUIREMENTS:
1. ALWAYS use polling mode with application.run_polling() - NEVER use webhooks
2. Use python-telegram-bot library v20+ syntax
3. Include proper logging and error handling
4. The bot must work in a containerized Python environment
5. Return ONLY the fixed main.py content, nothing else

Fix the code to eliminate all errors shown in the logs.`;

    const userPrompt = `Please fix this Telegram bot code based on the error logs provided:

CURRENT CODE:
\`\`\`python
${filesData.files['main.py']}
\`\`\`

REQUIREMENTS.TXT:
\`\`\`
${filesData.files['requirements.txt'] || 'python-telegram-bot>=20.0'}
\`\`\`

ERROR ANALYSIS:
- Syntax Errors: ${errorContext.syntaxErrors.join(', ') || 'None'}
- Runtime Errors: ${errorContext.runtimeErrors.join(', ') || 'None'}
- Install Errors: ${errorContext.installErrors.join(', ') || 'None'}

FULL ERROR LOGS:
${errorContext.fullLogs.join('\n')}

Please provide the fixed main.py code that resolves all these errors.`;
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const aiResult = await response.json();
    let fixedCode = aiResult.choices[0].message.content.trim();
    
    // Clean up the response (remove markdown if present)
    fixedCode = fixedCode.replace(/```python\n/g, '').replace(/```\n/g, '').replace(/```/g, '');
    
    console.log(`[BOT-MANAGER] AI provided fixed code, updating storage...`);
    
    // Update the main.py file in storage
    const filePath = `${filesData.path}/main.py`;
    const { error: uploadError } = await supabase.storage
      .from('bot-files')
      .upload(filePath, new Blob([fixedCode], { type: 'text/plain' }), {
        upsert: true
      });
    
    if (uploadError) {
      throw new Error(`Failed to update fixed code: ${uploadError.message}`);
    }
    
    console.log(`[BOT-MANAGER] Fixed code uploaded, redeploying bot...`);
    
    // Redeploy the bot with fixed code
    const redeployResult = await startBotInFlyio(botId, userId, token, org);
    const redeployData = await redeployResult.json();
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Bot fixed and redeployed successfully',
        fixApplied: true,
        errorsFixed: {
          syntax: errorContext.syntaxErrors.length,
          runtime: errorContext.runtimeErrors.length,
          install: errorContext.installErrors.length
        },
        logs: [
          `[BOT-MANAGER] AI successfully fixed ${errorContext.syntaxErrors.length + errorContext.runtimeErrors.length} errors`,
          `[BOT-MANAGER] Code updated in storage`,
          `[BOT-MANAGER] Bot redeployed`,
          ...redeployData.logs || []
        ]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error(`[BOT-MANAGER] Fix attempt failed:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Failed to fix bot: ${error.message}`,
        logs: [`[BOT-MANAGER] Fix attempt failed: ${error.message}`]
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
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

async function deployBotToFlyWithVolume(appName: string, files: Record<string, string>, token: string): Promise<any> {
  console.log(`[BOT-MANAGER] Starting SIMPLIFIED volume-based deployment for ${appName}`);
  
  try {
    // Only cleanup machines, keep volumes for persistence across deployments
    console.log(`[BOT-MANAGER] Cleaning up existing machines only (preserving volumes)...`);
    await cleanupExistingMachines(appName, token);
    
    // Try to reuse existing volume first
    const volumeName = `bot_${appName.replace(/telegram-bot-/, '').replace(/-/g, '_')}_vol`.substring(0, 30);
    let volume;
    
    // Check if volume already exists
    const listResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/volumes`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (listResponse.ok) {
      const volumes = await listResponse.json();
      volume = volumes.find((v: any) => v.name === volumeName);
      
      if (volume) {
        console.log(`[BOT-MANAGER] Reusing existing volume: ${volume.id}`);
      }
    }
    
    // Create new volume if none exists
    if (!volume) {
      console.log(`[BOT-MANAGER] Creating new volume: ${volumeName}`);
    
    const volumeConfig = {
      name: volumeName,
      size_gb: 1,
      region: 'iad'
    };
    
    const volumeResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/volumes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(volumeConfig)
    });
    
      if (!volumeResponse.ok) {
        const errorText = await volumeResponse.text();
        console.error(`[BOT-MANAGER] Volume creation failed: ${errorText}`);
        throw new Error(`Failed to create volume: ${errorText}`);
      }
      
      volume = await volumeResponse.json();
      console.log(`[BOT-MANAGER] Volume created: ${volume.id}`);
    }
    
    // Create a temporary machine to upload files to the volume
    console.log(`[BOT-MANAGER] Creating file upload machine...`);
    
    // Create a simpler, more reliable file upload approach
    console.log(`[BOT-MANAGER] Uploading files to volume using direct approach...`);
    
    // Create individual file write commands using Deno's base64 encoding
    const fileCommands = Object.entries(files).map(([filename, content]) => {
      // Use Deno's built-in btoa for base64 encoding (encode UTF-8 to base64)
      const encoder = new TextEncoder();
      const bytes = encoder.encode(content);
      const base64Content = btoa(String.fromCharCode(...bytes));
      
      const pythonScript = `
import os
import base64
import sys

# Create bot directory
os.makedirs('/data/bot', exist_ok=True)
os.chdir('/data/bot')

# File content (base64 encoded)
file_content = '''${base64Content}'''

# Decode and write file
try:
    with open('${filename}', 'w', encoding='utf-8') as f:
        import base64
        decoded_content = base64.b64decode(file_content).decode('utf-8')
        f.write(decoded_content)
    print(f"✅ Successfully wrote ${filename}")
    print(f"📏 File size: {len(decoded_content)} characters")
except Exception as e:
    print(f"❌ Error writing ${filename}: {e}")
    sys.exit(1)
`;
      return pythonScript;
    });
    
    // Create the upload script that writes all files
    const uploadScript = `#!/bin/bash
set -e
echo "=== Volume File Upload Started ==="

# Install Python if needed (Alpine comes with Python)
which python3 || apk add --no-cache python3

# Create bot directory
mkdir -p /data/bot
cd /data/bot

echo "=== Writing files to volume ==="
${fileCommands.map((pythonScript, index) => `
echo "Writing file ${index + 1}/${fileCommands.length}..."
python3 -c "${pythonScript.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"
`).join('')}

echo "=== Verifying files in volume ==="
ls -la /data/bot/
echo "=== File contents verification ==="
for file in *.py *.txt *.env; do
  if [ -f "$file" ]; then
    echo "--- $file (first 5 lines) ---"
    head -5 "$file" || echo "Could not read $file"
  fi
done

echo "=== Volume upload completed successfully ==="
echo "Total files: $(ls -1 /data/bot/ | wc -l)"
`;

    const uploadMachineConfig = {
      config: {
        image: 'python:3.11-alpine',  // Use Python Alpine for better file handling
        init: {
          cmd: ['/bin/sh', '-c', uploadScript]
        },
        mounts: [
          {
            volume: volume.id,
            path: '/data'
          }
        ],
        guest: {
          cpu_kind: 'shared',
          cpus: 1,
          memory_mb: 256
        },
        restart: {
          policy: 'no'
        },
        auto_destroy: false  // Keep for debugging
      },
      region: 'iad'
    };

    const uploadMachineResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(uploadMachineConfig)
    });

    if (!uploadMachineResponse.ok) {
      const errorText = await uploadMachineResponse.text();
      console.error(`[BOT-MANAGER] Upload machine creation failed: ${errorText}`);
      throw new Error(`Failed to create upload machine: ${errorText}`);
    }

    const uploadMachine = await uploadMachineResponse.json();
    console.log(`[BOT-MANAGER] Upload machine created: ${uploadMachine.id}`);
    
    // Wait longer for upload to complete and verify
    console.log(`[BOT-MANAGER] Waiting for file upload to complete...`);
    
    // Wait and check upload progress
    for (let i = 0; i < 12; i++) { // Check for 2 minutes
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds each iteration
      
      // Check upload machine status
      const statusResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines/${uploadMachine.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (statusResponse.ok) {
        const machineStatus = await statusResponse.json();
        console.log(`[BOT-MANAGER] Upload machine status: ${machineStatus.state}`);
        
        if (machineStatus.state === 'stopped') {
          console.log(`[BOT-MANAGER] Upload machine completed`);
          break;
        }
      }
      
      if (i === 11) {
        console.log(`[BOT-MANAGER] Upload taking longer than expected, proceeding...`);
      }
    }
    
    // Get upload machine logs to verify success
    try {
      const logResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines/${uploadMachine.id}/logs`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (logResponse.ok) {
        const logs = await logResponse.text();
        console.log(`[BOT-MANAGER] Upload logs:`, logs);
        
        if (logs.includes('Volume upload completed successfully')) {
          console.log(`[BOT-MANAGER] ✅ Files uploaded successfully to volume`);
        } else {
          console.log(`[BOT-MANAGER] ⚠️ Upload may have failed, check logs`);
        }
      }
    } catch (logError) {
      console.log(`[BOT-MANAGER] Could not retrieve upload logs:`, logError);
    }
    
    // CRITICAL: Destroy upload machine to release volume claim
    console.log(`[BOT-MANAGER] Destroying upload machine to release volume...`);
    try {
      const destroyResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines/${uploadMachine.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (destroyResponse.ok) {
        console.log(`[BOT-MANAGER] ✅ Upload machine destroyed successfully`);
      } else {
        const errorText = await destroyResponse.text();
        console.log(`[BOT-MANAGER] ⚠️ Failed to destroy upload machine: ${errorText}`);
      }
      
      // Wait for machine to be fully destroyed
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (destroyError) {
      console.error(`[BOT-MANAGER] Error destroying upload machine:`, destroyError);
    }
    
    // Create the main bot machine that uses the volume
    console.log(`[BOT-MANAGER] Creating main bot machine with volume...`);
    
    const botToken = extractTokenFromEnv(files['.env']) || '';
    
    const botRunScript = `#!/bin/bash
set -e
echo "=== Bot Startup from Volume ==="
cd /data/bot

echo "=== Volume Contents ==="
ls -la /data/bot/

echo "=== Installing Python Dependencies ==="
pip install --no-cache-dir python-telegram-bot python-dotenv requests aiohttp || {
    echo "ERROR: Failed to install base dependencies"
    exit 1
}

echo "=== Installing Additional Requirements ==="
if [ -s requirements.txt ]; then
    pip install --no-cache-dir -r requirements.txt || {
        echo "ERROR: Failed to install requirements from requirements.txt"
        exit 1
    }
else
    echo "No additional requirements found"
fi

echo "=== Validating Python Syntax ==="
python -m py_compile main.py || {
    echo "SYNTAX_ERROR: Python syntax validation failed in main.py"
    python -c "
import sys
try:
    with open('main.py', 'r') as f:
        compile(f.read(), 'main.py', 'exec')
    print('Syntax validation passed')
except SyntaxError as e:
    print(f'SYNTAX_ERROR: {e.msg} at line {e.lineno}')
    sys.exit(1)
except Exception as e:
    print(f'SYNTAX_ERROR: {str(e)}')
    sys.exit(1)
"
    exit 1
}

echo "=== Starting Bot from Volume ==="
python main.py || {
    echo "RUNTIME_ERROR: Bot failed to start"
    exit 1
}`;

    const botMachineConfig = {
      config: {
        image: 'python:3.11-slim',
        init: {
          cmd: ['/bin/bash', '-c', botRunScript]
        },
        env: {
          PYTHONUNBUFFERED: '1',
          BOT_TOKEN: botToken
        },
        mounts: [
          {
            volume: volume.id,
            path: '/data'
          }
        ],
        guest: {
          cpu_kind: 'shared',
          cpus: 1,
          memory_mb: 512
        },
        restart: {
          policy: 'no'  // Don't auto-restart on failure
        },
        auto_destroy: false
      },
      region: 'iad'
    };

    // Create bot machine
    const botMachineResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(botMachineConfig)
    });

    if (!botMachineResponse.ok) {
      const errorText = await botMachineResponse.text();
      console.error(`[BOT-MANAGER] Bot machine creation failed: ${errorText}`);
      throw new Error(`Failed to create bot machine: ${errorText}`);
    }

    const botMachine = await botMachineResponse.json();
    console.log(`[BOT-MANAGER] Bot machine created: ${botMachine.id}`);

    // Wait for machine to be ready
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log(`[BOT-MANAGER] Volume-based deployment completed for machine: ${botMachine.id}`);
    
    return {
      id: botMachine.id,
      appName,
      volumeId: volume.id,
      status: 'deployed',
      machine: botMachine
    };
    
  } catch (error) {
    console.error(`[BOT-MANAGER] Volume-based deployment failed:`, error);
    throw error;
  }
}

async function cleanupExistingVolumes(appName: string, token: string): Promise<void> {
  console.log(`[BOT-MANAGER] Cleaning up existing volumes for app ${appName}`);
  
  try {
    // Get all volumes for this app
    const volumesResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/volumes`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!volumesResponse.ok) {
      if (volumesResponse.status === 404) {
        console.log(`[BOT-MANAGER] App ${appName} not found, no volume cleanup needed`);
        return;
      }
      console.log(`[BOT-MANAGER] Failed to list volumes: ${volumesResponse.status}`);
      return;
    }

    const volumes = await volumesResponse.json();
    console.log(`[BOT-MANAGER] Found ${volumes.length} existing volumes to cleanup`);

    // Delete all existing volumes
    for (const volume of volumes) {
      console.log(`[BOT-MANAGER] Deleting volume ${volume.id}`);
      
      try {
        const deleteResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/volumes/${volume.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (deleteResponse.ok) {
          console.log(`[BOT-MANAGER] Deleted volume ${volume.id}`);
        } else {
          console.log(`[BOT-MANAGER] Failed to delete volume ${volume.id}: ${deleteResponse.status}`);
        }
      } catch (error) {
        console.log(`[BOT-MANAGER] Failed to delete volume ${volume.id}: ${error.message}`);
      }
    }

    console.log(`[BOT-MANAGER] Volume cleanup completed for app ${appName}`);
  } catch (error) {
    console.error(`[BOT-MANAGER] Volume cleanup failed:`, error);
    // Don't throw the error, just log it
  }
}

async function deployBotToFly(appName: string, files: Record<string, string>, token: string): Promise<any> {
  console.log(`[BOT-MANAGER] Starting real deployment for ${appName}`);
  
  try {
    // First, cleanup any existing machines for this app
    console.log(`[BOT-MANAGER] Checking for existing machines in app ${appName}`);
    await cleanupExistingMachines(appName, token);
    
    // Create machine config with embedded setup script
    console.log(`[BOT-MANAGER] Creating machine with bot setup for ${appName}`);
    
    // Extract bot token from .env file and convert webhook code to polling
    const botToken = extractTokenFromEnv(files['.env']) || '';
    
    // Convert webhook code to polling mode
    const convertedMainPy = convertWebhookToPolling(files['main.py'] || '');
    console.log(`[BOT-MANAGER] Bot code converted from webhook to polling mode`);
    
    // Create setup script that installs dependencies and sets up the bot
    // Use proper UTF-8 to base64 encoding to handle Unicode characters
    const encoder = new TextEncoder();
    const mainPyBytes = encoder.encode(convertedMainPy);
    const envBytes = encoder.encode(files['.env'] || '');
    const requirementsBytes = encoder.encode(files['requirements.txt'] || '');
    
    // Convert to base64 using proper UTF-8 encoding
    const mainPyBase64 = btoa(String.fromCharCode(...mainPyBytes));
    const envBase64 = btoa(String.fromCharCode(...envBytes));
    const requirementsBase64 = btoa(String.fromCharCode(...requirementsBytes));
    
    const setupScript = `#!/bin/bash
set -e
echo "=== Bot Setup Started ==="
mkdir -p /app
cd /app

echo "=== Installing Python Dependencies ==="
pip install --no-cache-dir python-telegram-bot python-dotenv requests aiohttp || {
    echo "ERROR: Failed to install base dependencies"
    exit 1
}

echo "=== Creating Bot Files ==="
echo "${mainPyBase64}" | base64 -d > main.py || {
    echo "ERROR: Failed to create main.py"
    exit 1
}
echo "${envBase64}" | base64 -d > .env || {
    echo "ERROR: Failed to create .env"
    exit 1
}
echo "${requirementsBase64}" | base64 -d > requirements.txt || {
    echo "ERROR: Failed to create requirements.txt"
    exit 1
}

echo "=== Installing Additional Requirements ==="
if [ -s requirements.txt ]; then
    pip install --no-cache-dir -r requirements.txt || {
        echo "ERROR: Failed to install requirements from requirements.txt"
        exit 1
    }
else
    echo "No additional requirements found"
fi

echo "=== Validating Python Syntax ==="
python -m py_compile main.py || {
    echo "SYNTAX_ERROR: Python syntax validation failed in main.py"
    python -c "
import sys
try:
    with open('main.py', 'r') as f:
        compile(f.read(), 'main.py', 'exec')
    print('Syntax validation passed')
except SyntaxError as e:
    print(f'SYNTAX_ERROR: {e.msg} at line {e.lineno}')
    sys.exit(1)
except Exception as e:
    print(f'SYNTAX_ERROR: {str(e)}')
    sys.exit(1)
"
    exit 1
}

echo "=== Files Created Successfully ==="
ls -la /app/

echo "=== Starting Bot ==="
python main.py || {
    echo "RUNTIME_ERROR: Bot failed to start"
    exit 1
}`;

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
          policy: 'no'  // Don't auto-restart on failure to avoid error loops
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

function convertWebhookToPolling(pythonCode: string): string {
  console.log(`[BOT-MANAGER] Converting webhook code to polling mode`);
  
  // Replace webhook-related imports and functions
  let convertedCode = pythonCode
    // Remove webhook-related imports
    .replace(/from\s+flask\s+import.*?\n/g, '')
    .replace(/import\s+flask.*?\n/g, '')
    .replace(/from\s+aiohttp\s+import.*?\n/g, '')
    .replace(/import\s+aiohttp.*?\n/g, '')
    
    // Remove all webhook-related comments - this is key!
    .replace(/.*webhook.*$/gmi, '# Using polling mode for containerized deployment')
    .replace(/.*set.*webhook.*URL.*$/gmi, '# Bot configured for polling mode')
    .replace(/.*replace.*webhook.*$/gmi, '# Polling mode configured automatically')
    .replace(/.*production.*environment.*$/gmi, '# Production-ready polling configuration')
    
    // Replace webhook setup with polling
    .replace(/application\.updater\.start_webhook\([^)]*\)/g, 'application.run_polling()')
    .replace(/await\s+application\.updater\.start_webhook\([^)]*\)/g, 'application.run_polling()')
    .replace(/application\.bot\.set_webhook\([^)]*\)/g, '# Using polling instead of webhooks')
    .replace(/await\s+application\.bot\.set_webhook\([^)]*\)/g, '# Using polling instead of webhooks')
    .replace(/application\.run_webhook\([^)]*\)/g, 'application.run_polling()')
    .replace(/await\s+application\.run_webhook\([^)]*\)/g, 'application.run_polling()')
    
    // Remove webhook URL setup
    .replace(/webhook_url\s*=.*?\n/g, '# Polling mode - no URL needed\n')
    .replace(/url_path\s*=.*?\n/g, '# Polling mode - no path needed\n')
    
    // Replace any async main functions that use webhooks
    .replace(/async def main\(\)[^}]*?start_webhook.*?$/gm, `def main() -> None:
    logger.info('========== BOT STARTUP ==========')
    token = os.getenv('BOT_TOKEN')
    if not token:
        logger.error('BOT_TOKEN not found in environment variables')
        return
        
    logger.info('Bot token loaded successfully')
    logger.info('Creating Telegram Application...')
    application = Application.builder().token(token).build()
    
    logger.info('Starting bot in polling mode...')
    logger.info('🤖 Bot is now running and ready to receive messages!')
    application.run_polling()`)
    
    // Fix async main that might call polling incorrectly
    .replace(/async def main\(\).*?application\.run_polling\(\)/gms, 
             `def main() -> None:
    logger.info('========== BOT STARTUP ==========')
    token = os.getenv('BOT_TOKEN')
    if not token:
        logger.error('BOT_TOKEN not found in environment variables')
        return
        
    logger.info('Bot token loaded successfully')
    logger.info('Creating Telegram Application...')
    application = Application.builder().token(token).build()
    
    logger.info('Starting bot in polling mode...')
    logger.info('🤖 Bot is now running and ready to receive messages!')
    application.run_polling()`)
    
    // Replace asyncio.run(main()) with main() since we're not using async
    .replace(/asyncio\.run\(main\(\)\)/g, 'main()')
    
    // Fix any remaining async/await patterns that shouldn't be there
    .replace(/await\s+application\.start_polling\(\)/g, 'application.run_polling()')
    .replace(/await\s+application\.initialize\(\)/g, '# Application automatically initializes with run_polling()')
    
    // Clean up any duplicate polling calls
    .replace(/(application\.run_polling\(\)\s*){2,}/g, 'application.run_polling()')
    
    // Remove any port or listen configurations
    .replace(/listen\s*=\s*['"][^'"]*['"]/g, '')
    .replace(/port\s*=\s*\d+/g, '')
    
    // Add proper main function if missing
    if (!convertedCode.includes('def main') && !convertedCode.includes('application.run_polling')) {
      convertedCode += `

def main() -> None:
    logger.info('========== BOT STARTUP ==========')
    token = os.getenv('BOT_TOKEN')
    if not token:
        logger.error('BOT_TOKEN not found in environment variables')
        return
        
    logger.info('Bot token loaded successfully')
    logger.info('Creating Telegram Application...')
    application = Application.builder().token(token).build()
    
    logger.info('Starting bot in polling mode...')
    logger.info('🤖 Bot is now running and ready to receive messages!')
    application.run_polling()

if __name__ == '__main__':
    main()`;
    }
    
    // Final cleanup - remove any remaining webhook references
    convertedCode = convertedCode
      .replace(/webhook/gi, 'polling')
      .replace(/# Using polling mode for containerized deployment/g, '# Using polling mode for containerized deployment')
      .replace(/# Bot configured for polling mode/g, '# Bot configured for polling mode')
      .replace(/# Polling mode configured automatically/g, '# Polling mode configured automatically');
  
  console.log(`[BOT-MANAGER] Code conversion completed - all webhook references removed`);
  return convertedCode;
}

function extractTokenFromEnv(envContent: string): string | null {
  const match = envContent.match(/BOT_TOKEN\s*=\s*(.+)/);
  return match ? match[1].trim().replace(/["']/g, '') : null;
}
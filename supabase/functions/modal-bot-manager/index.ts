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

// Updated Modal service URL - this should match your deployed Modal app
const MODAL_BASE_URL = 'https://haleviadiel--telegram-bot-platform.modal.run';
const REQUEST_TIMEOUT = 30000; // 30 seconds

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, botId, userId, prompt, token, name, modificationPrompt } = await req.json();
    
    console.log(`[MODAL-MANAGER] === Starting ${action} for bot ${botId} ===`);
    console.log(`[MODAL-MANAGER] Modal URL: ${MODAL_BASE_URL}`);

    switch (action) {
      case 'get-files':
        return await getFilesFromSupabaseStorage(botId, userId);
      
      case 'get-logs':
        return await getLogsFromModal(botId, userId);
      
      case 'start-bot':
        return await startBotInModal(botId, userId, prompt, token, name);
      
      case 'stop-bot':
        return await stopBotInModal(botId);
      
      case 'modify-bot':
        return await modifyBotHybrid(botId, userId, modificationPrompt);
      
      case 'health-check':
        return await performHealthCheck();
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error('[MODAL-MANAGER] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function makeModalRequestWithTimeout(url: string, options: any, timeoutMs: number = REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

async function startBotInModal(botId: string, userId: string, prompt?: string, token?: string, name?: string) {
  console.log(`[MODAL-MANAGER] Starting bot in Modal: ${botId}`);
  
  try {
    // First get files from Supabase Storage
    const filesResponse = await getFilesFromSupabaseStorage(botId, userId);
    const filesData = await filesResponse.json();
    
    if (!filesData.success) {
      throw new Error(`Failed to fetch files from Supabase: ${filesData.error}`);
    }

    // Deploy to Modal using the correct endpoint
    const deployEndpoint = `${MODAL_BASE_URL}/api/deploy-bot`;
    console.log(`[MODAL-MANAGER] Modal deploy endpoint: ${deployEndpoint}`);
    
    const deployPayload = {
      bot_id: botId,
      user_id: userId,
      bot_code: filesData.files['main.py'] || '',
      bot_token: extractTokenFromEnv(filesData.files['.env'] || ''),
      bot_name: name || `Bot ${botId}`,
      files: filesData.files
    };

    console.log(`[MODAL-MANAGER] Sending payload to Modal:`, {
      bot_id: deployPayload.bot_id,
      user_id: deployPayload.user_id,
      code_length: deployPayload.bot_code.length,
      has_token: !!deployPayload.bot_token
    });

    const deployResponse = await makeModalRequestWithTimeout(deployEndpoint, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(deployPayload)
    });

    console.log(`[MODAL-MANAGER] Modal deploy response status: ${deployResponse.status}`);
    
    if (!deployResponse.ok) {
      const errorText = await deployResponse.text();
      console.error(`[MODAL-MANAGER] Modal Deploy API Error:`, errorText);
      throw new Error(`Modal deployment failed: ${deployResponse.status} - ${errorText}`);
    }

    const deployResult = await deployResponse.json();
    console.log(`[MODAL-MANAGER] Bot deployed successfully to Modal:`, deployResult.success);

    return new Response(JSON.stringify({
      success: true,
      modal_result: deployResult,
      deployment_timestamp: new Date().toISOString(),
      message: 'Bot started successfully in Modal'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[MODAL-MANAGER] Error starting bot:`, error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      modal_url_used: MODAL_BASE_URL,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function getLogsFromModal(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER] Getting logs from Modal for bot ${botId}`);
  
  const logsEndpoint = `${MODAL_BASE_URL}/api/logs/${botId}`;
  console.log(`[MODAL-MANAGER] Modal logs endpoint: ${logsEndpoint}`);
  
  try {
    const response = await makeModalRequestWithTimeout(logsEndpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    console.log(`[MODAL-MANAGER] Modal logs response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[MODAL-MANAGER] Modal logs API Error:`, errorText);
      
      if (response.status === 404) {
        return new Response(JSON.stringify({
          success: true,
          logs: [
            `[MODAL] No logs available for bot ${botId}`,
            `[MODAL] Bot may not have been started yet or deployed to Modal`,
            `[MODAL] Try starting the bot first to begin execution`
          ],
          status: 'no_logs_available'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`Modal logs request failed: ${response.status} - ${errorText}`);
    }

    const logsData = await response.json();
    
    return new Response(JSON.stringify({
      success: true,
      logs: logsData.logs || ['[MODAL] No logs available'],
      retrieval_timestamp: new Date().toISOString(),
      message: 'Logs retrieved from Modal execution environment'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[MODAL-MANAGER] Error fetching logs:`, error);
    return new Response(JSON.stringify({
      success: true,
      logs: [
        `[MODAL] No logs available for bot ${botId}`,
        `[MODAL] Error: ${error.message}`,
        `[MODAL] Please try starting the bot or check Modal service status`
      ],
      error_handled: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function stopBotInModal(botId: string) {
  console.log(`[MODAL-MANAGER] Stopping bot in Modal: ${botId}`);
  
  try {
    const stopEndpoint = `${MODAL_BASE_URL}/api/stop-bot/${botId}`;
    const response = await makeModalRequestWithTimeout(stopEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const result = await response.json();
      return new Response(JSON.stringify({
        success: true,
        result: result,
        message: 'Bot stopped successfully in Modal'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      console.log(`[MODAL-MANAGER] Stop endpoint returned ${response.status}, using graceful handling`);
    }
  } catch (error) {
    console.log(`[MODAL-MANAGER] Stop request failed, using graceful handling:`, error.message);
  }
  
  return new Response(JSON.stringify({
    success: true,
    message: 'Bot stop requested (graceful handling)'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function performHealthCheck() {
  console.log('[MODAL-MANAGER] Performing health check');
  
  const healthData = {
    supabase_storage: 'unknown',
    modal_service: 'unknown',
    timestamp: new Date().toISOString()
  };

  // Check Supabase Storage
  try {
    const bucketReady = await ensureStorageBucket();
    healthData.supabase_storage = bucketReady ? 'healthy' : 'degraded';
  } catch (error) {
    healthData.supabase_storage = 'error';
    console.error('[MODAL-MANAGER] Storage health check failed:', error);
  }

  // Check Modal Service
  try {
    const healthEndpoint = `${MODAL_BASE_URL}/health`;
    const response = await makeModalRequestWithTimeout(healthEndpoint, {
      method: 'GET'
    }, 10000);

    healthData.modal_service = response.ok ? 'healthy' : 'degraded';
  } catch (error) {
    healthData.modal_service = 'error';
    console.error('[MODAL-MANAGER] Modal health check failed:', error);
  }

  const overallStatus = 
    healthData.supabase_storage === 'healthy' && healthData.modal_service === 'healthy' 
      ? 'healthy' 
      : 'degraded';

  return new Response(JSON.stringify({
    success: true,
    overall_status: overallStatus,
    components: healthData,
    message: 'Health check completed'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function ensureStorageBucket() {
  console.log('[MODAL-MANAGER] Ensuring bot-files bucket exists');
  
  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('[MODAL-MANAGER] Error listing buckets:', listError);
      return false;
    }

    const bucketExists = buckets?.some(bucket => bucket.name === 'bot-files');
    
    if (!bucketExists) {
      console.log('[MODAL-MANAGER] Creating bot-files bucket');
      const { error: createError } = await supabase.storage.createBucket('bot-files', {
        public: false,
        allowedMimeTypes: ['text/plain', 'application/json', 'text/x-python'],
        fileSizeLimit: 10485760
      });

      if (createError) {
        console.error('[MODAL-MANAGER] Error creating bucket:', createError);
        return false;
      }
    }

    console.log('[MODAL-MANAGER] Storage bucket ready');
    return true;
  } catch (error) {
    console.error('[MODAL-MANAGER] Exception ensuring bucket:', error);
    return false;
  }
}

async function getFilesFromSupabaseStorage(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER] Getting files from Supabase Storage for bot ${botId}`);
  
  try {
    const bucketReady = await ensureStorageBucket();
    if (!bucketReady) {
      throw new Error('Failed to ensure storage bucket is ready');
    }

    const botPath = `bots/${userId}/${botId}`;
    const fileNames = ['main.py', 'requirements.txt', '.env', 'metadata.json', 'Dockerfile'];
    const files: Record<string, string> = {};
    const retrievalResults = [];

    for (const fileName of fileNames) {
      try {
        const { data, error } = await supabase.storage
          .from('bot-files')
          .download(`${botPath}/${fileName}`);

        if (error) {
          console.warn(`[MODAL-MANAGER] Failed to download ${fileName}:`, error.message);
          retrievalResults.push({ fileName, success: false, error: error.message });
        } else {
          const content = await data.text();
          files[fileName] = content;
          retrievalResults.push({ fileName, success: true, size: content.length });
          console.log(`[MODAL-MANAGER] Successfully retrieved ${fileName}: ${content.length} characters`);
        }
      } catch (fileError) {
        console.warn(`[MODAL-MANAGER] Exception downloading ${fileName}:`, fileError);
        retrievalResults.push({ fileName, success: false, error: fileError.message });
      }
    }

    const successfulFiles = retrievalResults.filter(r => r.success);
    console.log(`[MODAL-MANAGER] Retrieved ${successfulFiles.length}/${fileNames.length} files`);

    return new Response(JSON.stringify({
      success: true,
      files,
      storage_type: 'supabase_storage',
      retrieval_results: retrievalResults,
      bucket_status: 'verified',
      message: 'Files retrieved from Supabase Storage'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[MODAL-MANAGER] Error retrieving files:`, error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      storage_status: 'error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function modifyBotHybrid(botId: string, userId: string, modificationPrompt: string) {
  console.log(`[MODAL-MANAGER] Modifying bot: ${botId}`);
  
  try {
    return new Response(JSON.stringify({
      success: false,
      error: 'Bot modification not yet implemented - coming in next iteration',
      planned_features: [
        'AI-powered code modification',
        'File versioning in Supabase Storage',
        'Rollback capability',
        'Enhanced Modal deployment'
      ]
    }), {
      status: 501,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[MODAL-MANAGER] Error modifying bot:`, error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

function extractTokenFromEnv(envContent: string): string {
  const lines = envContent.split('\n');
  for (const line of lines) {
    if (line.startsWith('BOT_TOKEN=')) {
      return line.split('=')[1]?.trim() || '';
    }
  }
  return '';
}

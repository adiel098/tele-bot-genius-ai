
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

// Updated Modal service URL - using correct format
const MODAL_BASE_URL = 'https://haleviadiel--telegram-bot-platform-web.modal.run';
const REQUEST_TIMEOUT = 30000; // 30 seconds

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, botId, userId, prompt, token, name, modificationPrompt } = await req.json();
    
    console.log(`[MODAL-MANAGER ENHANCED] === Starting ${action} for bot ${botId} ===`);
    console.log(`[MODAL-MANAGER ENHANCED] Enhanced Hybrid Architecture: Supabase Storage + Modal Execution`);
    console.log(`[MODAL-MANAGER ENHANCED] Modal URL: ${MODAL_BASE_URL}`);

    switch (action) {
      case 'get-files':
        return await getFilesFromSupabaseStorage(botId, userId);
      
      case 'get-logs':
        return await getLogsFromModal(botId, userId);
      
      case 'start-bot':
        return await startBotWithEnhancedHybridArchitecture(botId, userId);
      
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
    console.error('[MODAL-MANAGER ENHANCED] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      architecture: 'enhanced_hybrid',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function ensureStorageBucket() {
  console.log('[MODAL-MANAGER ENHANCED] Ensuring bot-files bucket exists');
  
  try {
    // Check if bucket exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('[MODAL-MANAGER ENHANCED] Error listing buckets:', listError);
      return false;
    }

    const bucketExists = buckets?.some(bucket => bucket.name === 'bot-files');
    
    if (!bucketExists) {
      console.log('[MODAL-MANAGER ENHANCED] Creating bot-files bucket');
      const { error: createError } = await supabase.storage.createBucket('bot-files', {
        public: false,
        allowedMimeTypes: ['text/plain', 'application/json', 'text/x-python'],
        fileSizeLimit: 10485760 // 10MB
      });

      if (createError) {
        console.error('[MODAL-MANAGER ENHANCED] Error creating bucket:', createError);
        return false;
      }
    }

    console.log('[MODAL-MANAGER ENHANCED] Storage bucket ready');
    return true;
  } catch (error) {
    console.error('[MODAL-MANAGER ENHANCED] Exception ensuring bucket:', error);
    return false;
  }
}

async function getFilesFromSupabaseStorage(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER ENHANCED] Getting files from Supabase Storage for bot ${botId}`);
  
  try {
    // Ensure bucket exists
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
          console.warn(`[MODAL-MANAGER ENHANCED] Failed to download ${fileName}:`, error.message);
          retrievalResults.push({ fileName, success: false, error: error.message });
        } else {
          const content = await data.text();
          files[fileName] = content;
          retrievalResults.push({ fileName, success: true, size: content.length });
          console.log(`[MODAL-MANAGER ENHANCED] Successfully retrieved ${fileName}: ${content.length} characters`);
        }
      } catch (fileError) {
        console.warn(`[MODAL-MANAGER ENHANCED] Exception downloading ${fileName}:`, fileError);
        retrievalResults.push({ fileName, success: false, error: fileError.message });
      }
    }

    const successfulFiles = retrievalResults.filter(r => r.success);
    console.log(`[MODAL-MANAGER ENHANCED] Retrieved ${successfulFiles.length}/${fileNames.length} files`);

    return new Response(JSON.stringify({
      success: true,
      files,
      storage_type: 'enhanced_hybrid_supabase_modal',
      architecture: 'enhanced_hybrid',
      storage_method: 'supabase_storage_v2',
      retrieval_results: retrievalResults,
      bucket_status: 'verified',
      message: 'Files retrieved from enhanced Supabase Storage'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[MODAL-MANAGER ENHANCED] Error retrieving files:`, error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      architecture: 'enhanced_hybrid',
      storage_status: 'error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

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

async function startBotWithEnhancedHybridArchitecture(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER ENHANCED] Starting bot with enhanced hybrid architecture: ${botId}`);
  
  try {
    // Step 1: Ensure storage is ready and fetch files
    const filesResponse = await getFilesFromSupabaseStorage(botId, userId);
    const filesData = await filesResponse.json();
    
    if (!filesData.success) {
      throw new Error(`Failed to fetch files from Supabase: ${filesData.error}`);
    }

    console.log(`[MODAL-MANAGER ENHANCED] Files prepared, deploying to Modal execution environment`);
    
    // Step 2: Deploy to Modal with enhanced error handling and timeout
    const deployEndpoint = `${MODAL_BASE_URL}/api/deploy-bot`;
    console.log(`[MODAL-MANAGER ENHANCED] Modal deploy endpoint: ${deployEndpoint}`);
    
    const deployPayload = {
      bot_id: botId,
      user_id: userId,
      bot_code: filesData.files['main.py'] || '',
      bot_token: extractTokenFromEnv(filesData.files['.env'] || ''),
      bot_name: `Bot ${botId}`,
      files: filesData.files,
      architecture: 'enhanced_hybrid',
      timestamp: new Date().toISOString()
    };

    let deployResponse;
    try {
      deployResponse = await makeModalRequestWithTimeout(deployEndpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'BotFactory-Enhanced-Hybrid/1.0'
        },
        body: JSON.stringify(deployPayload)
      });
    } catch (networkError) {
      console.error(`[MODAL-MANAGER ENHANCED] Network error connecting to Modal:`, networkError);
      
      return new Response(JSON.stringify({
        success: false,
        error: 'Unable to connect to Modal execution service. Please check your Modal service status.',
        errorType: 'network_connectivity',
        architecture: 'enhanced_hybrid',
        modal_url_attempted: MODAL_BASE_URL,
        troubleshooting: {
          suggestion: 'Verify Modal service is running and accessible',
          endpoint_tested: deployEndpoint,
          timeout_used: `${REQUEST_TIMEOUT}ms`
        }
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[MODAL-MANAGER ENHANCED] Modal deploy response status: ${deployResponse.status}`);
    
    if (!deployResponse.ok) {
      const errorText = await deployResponse.text();
      console.error(`[MODAL-MANAGER ENHANCED] Modal Deploy API Error Response:`, errorText);
      
      if (deployResponse.status === 404) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Modal deployment endpoint not found. Service may not be properly configured.',
          errorType: 'service_endpoint_missing',
          architecture: 'enhanced_hybrid',
          modal_url_used: MODAL_BASE_URL,
          endpoint_attempted: deployEndpoint
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`Modal deployment failed: ${deployResponse.status} - ${errorText}`);
    }

    const deployResult = await deployResponse.json();
    console.log(`[MODAL-MANAGER ENHANCED] Bot deployed successfully to Modal:`, deployResult.success);

    return new Response(JSON.stringify({
      success: true,
      architecture: 'enhanced_hybrid',
      storage_source: 'supabase_storage_v2',
      execution_environment: 'modal_enhanced',
      modal_result: deployResult,
      deployment_timestamp: new Date().toISOString(),
      message: 'Bot started with enhanced hybrid architecture - optimized Modal execution environment'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[MODAL-MANAGER ENHANCED] Error starting bot:`, error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      architecture: 'enhanced_hybrid',
      modal_url_used: MODAL_BASE_URL,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function getLogsFromModal(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER ENHANCED] Getting logs from Modal for bot ${botId}`);
  
  const logsEndpoint = `${MODAL_BASE_URL}/api/logs/${botId}?user_id=${userId}`;
  console.log(`[MODAL-MANAGER ENHANCED] Modal logs endpoint: ${logsEndpoint}`);
  
  try {
    const response = await makeModalRequestWithTimeout(logsEndpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'BotFactory-Enhanced-Hybrid/1.0'
      }
    });

    console.log(`[MODAL-MANAGER ENHANCED] Modal logs response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[MODAL-MANAGER ENHANCED] Modal logs API Error:`, errorText);
      
      if (response.status === 404) {
        return new Response(JSON.stringify({
          success: true,
          logs: [
            '[MODAL ENHANCED] No logs available for bot ' + botId,
            '[MODAL ENHANCED] Bot may not have been started yet or deployed to Modal',
            '[MODAL ENHANCED] Try starting the bot first to begin execution',
            '[MODAL ENHANCED] Enhanced hybrid architecture ready'
          ],
          architecture: 'enhanced_hybrid',
          source: 'modal_enhanced_execution',
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
      logs: logsData.logs || ['[MODAL ENHANCED] No logs available'],
      architecture: 'enhanced_hybrid',
      source: 'modal_enhanced_execution',
      retrieval_timestamp: new Date().toISOString(),
      message: 'Logs retrieved from enhanced Modal execution environment'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[MODAL-MANAGER ENHANCED] Error fetching logs:`, error);
    return new Response(JSON.stringify({
      success: true,
      logs: [
        `[MODAL ENHANCED] No logs available for bot ${botId}`,
        `[MODAL ENHANCED] Bot may not have been started yet or deployed to Modal`,
        `[MODAL ENHANCED] Enhanced hybrid architecture - Error: ${error.message}`,
        `[MODAL ENHANCED] Please try starting the bot or check Modal service status`
      ],
      architecture: 'enhanced_hybrid',
      error_handled: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function stopBotInModal(botId: string) {
  console.log(`[MODAL-MANAGER ENHANCED] Stopping bot in Modal: ${botId}`);
  
  try {
    const stopEndpoint = `${MODAL_BASE_URL}/api/stop-bot/${botId}`;
    const response = await makeModalRequestWithTimeout(stopEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BotFactory-Enhanced-Hybrid/1.0'
      }
    });

    if (response.ok) {
      const result = await response.json();
      return new Response(JSON.stringify({
        success: true,
        architecture: 'enhanced_hybrid',
        result: result,
        message: 'Bot stopped successfully in Modal execution environment'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      console.log(`[MODAL-MANAGER ENHANCED] Stop endpoint returned ${response.status}, using graceful handling`);
    }
  } catch (error) {
    console.log(`[MODAL-MANAGER ENHANCED] Stop request failed, using graceful handling:`, error.message);
  }
  
  return new Response(JSON.stringify({
    success: true,
    architecture: 'enhanced_hybrid',
    message: 'Bot stop requested (Modal enhanced stop with graceful handling)'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function modifyBotHybrid(botId: string, userId: string, modificationPrompt: string) {
  console.log(`[MODAL-MANAGER ENHANCED] Modifying bot with enhanced hybrid architecture: ${botId}`);
  
  try {
    // Enhanced modification would involve:
    // 1. Get current files from Supabase Storage
    // 2. Send to AI for modification with enhanced prompts
    // 3. Store updated files back to Supabase Storage with versioning
    // 4. Deploy updated bot to Modal with rollback capability
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Enhanced bot modification not yet implemented - coming in next iteration',
      architecture: 'enhanced_hybrid',
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
    console.error(`[MODAL-MANAGER ENHANCED] Error modifying bot:`, error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      architecture: 'enhanced_hybrid'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function performHealthCheck() {
  console.log('[MODAL-MANAGER ENHANCED] Performing health check');
  
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
    console.error('[MODAL-MANAGER ENHANCED] Storage health check failed:', error);
  }

  // Check Modal Service
  try {
    const healthEndpoint = `${MODAL_BASE_URL}/health`;
    const response = await makeModalRequestWithTimeout(healthEndpoint, {
      method: 'GET',
      headers: { 'User-Agent': 'BotFactory-Enhanced-Hybrid/1.0' }
    }, 10000); // 10 second timeout for health check

    healthData.modal_service = response.ok ? 'healthy' : 'degraded';
  } catch (error) {
    healthData.modal_service = 'error';
    console.error('[MODAL-MANAGER ENHANCED] Modal health check failed:', error);
  }

  const overallStatus = 
    healthData.supabase_storage === 'healthy' && healthData.modal_service === 'healthy' 
      ? 'healthy' 
      : 'degraded';

  return new Response(JSON.stringify({
    success: true,
    architecture: 'enhanced_hybrid',
    overall_status: overallStatus,
    components: healthData,
    message: 'Enhanced hybrid architecture health check completed'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

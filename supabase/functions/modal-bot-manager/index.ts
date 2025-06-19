
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

// Updated Modal service URL with correct endpoints
const MODAL_BASE_URL = 'https://haleviadiel--telegram-bot-platform-enhanced-telegram-bot-service.modal.run';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, botId, userId, prompt, token, name, modificationPrompt } = await req.json();
    
    console.log(`[MODAL-MANAGER HYBRID] === Starting ${action} for bot ${botId} ===`);
    console.log(`[MODAL-MANAGER HYBRID] Hybrid Architecture: Supabase Storage + Modal Execution`);
    console.log(`[MODAL-MANAGER HYBRID] Using Modal URL: ${MODAL_BASE_URL}`);

    switch (action) {
      case 'get-files':
        return await getFilesFromSupabaseStorage(botId, userId);
      
      case 'get-logs':
        return await getLogsFromModal(botId, userId);
      
      case 'start-bot':
        return await startBotWithHybridArchitecture(botId, userId);
      
      case 'stop-bot':
        return await stopBotInModal(botId);
      
      case 'modify-bot':
        return await modifyBotHybrid(botId, userId, modificationPrompt);
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error('[MODAL-MANAGER HYBRID] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      architecture: 'hybrid'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function getFilesFromSupabaseStorage(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER HYBRID] Getting files from Supabase Storage for bot ${botId}`);
  
  try {
    const botPath = `bots/${userId}/${botId}`;
    const fileNames = ['main.py', 'requirements.txt', '.env', 'metadata.json', 'Dockerfile'];
    const files: Record<string, string> = {};
    const retrievalResults = [];

    for (const fileName of fileNames) {
      const { data, error } = await supabase.storage
        .from('bot-files')
        .download(`${botPath}/${fileName}`);

      if (error) {
        console.warn(`[MODAL-MANAGER HYBRID] Failed to download ${fileName}:`, error.message);
        retrievalResults.push({ fileName, success: false, error: error.message });
      } else {
        const content = await data.text();
        files[fileName] = content;
        retrievalResults.push({ fileName, success: true, size: content.length });
        console.log(`[MODAL-MANAGER HYBRID] Successfully retrieved ${fileName}: ${content.length} characters`);
      }
    }

    const successfulFiles = retrievalResults.filter(r => r.success);
    console.log(`[MODAL-MANAGER HYBRID] Retrieved ${successfulFiles.length}/${fileNames.length} files`);

    return new Response(JSON.stringify({
      success: true,
      files,
      storage_type: 'hybrid_supabase_modal',
      architecture: 'hybrid',
      storage_method: 'supabase_storage',
      retrieval_results: retrievalResults,
      message: 'Files retrieved from Supabase Storage'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[MODAL-MANAGER HYBRID] Error retrieving files:`, error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      architecture: 'hybrid'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function startBotWithHybridArchitecture(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER HYBRID] Starting bot with hybrid architecture: ${botId}`);
  
  try {
    // Step 1: Fetch files from Supabase Storage
    const filesResponse = await getFilesFromSupabaseStorage(botId, userId);
    const filesData = await filesResponse.json();
    
    if (!filesData.success) {
      throw new Error(`Failed to fetch files from Supabase: ${filesData.error}`);
    }

    // Step 2: Send files to Modal for storage using correct endpoint
    console.log(`[MODAL-MANAGER HYBRID] Sending files to Modal for storage`);
    console.log(`[MODAL-MANAGER HYBRID] Modal store endpoint: ${MODAL_BASE_URL}/store-bot/${botId}`);
    
    const storeResponse = await fetch(`${MODAL_BASE_URL}/store-bot/${botId}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId,
        bot_code: filesData.files['main.py'] || '',
        bot_token: extractTokenFromEnv(filesData.files['.env'] || ''),
        bot_name: `Bot ${botId}`
      })
    });

    console.log(`[MODAL-MANAGER HYBRID] Modal store response status: ${storeResponse.status}`);
    
    if (!storeResponse.ok) {
      const errorText = await storeResponse.text();
      console.error(`[MODAL-MANAGER HYBRID] Modal Store API Error Response:`, errorText);
      throw new Error(`Modal storage failed: ${storeResponse.status} - ${errorText}`);
    }

    const storeResult = await storeResponse.json();
    console.log(`[MODAL-MANAGER HYBRID] Bot stored successfully in Modal:`, storeResult.success);

    return new Response(JSON.stringify({
      success: true,
      architecture: 'hybrid',
      storage_source: 'supabase',
      execution_environment: 'modal',
      modal_result: storeResult,
      message: 'Bot started with hybrid architecture - files stored in Modal Volume'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[MODAL-MANAGER HYBRID] Error starting bot:`, error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      architecture: 'hybrid',
      modal_url_used: MODAL_BASE_URL
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function getLogsFromModal(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER HYBRID] Getting logs from Modal for bot ${botId}`);
  console.log(`[MODAL-MANAGER HYBRID] Modal logs endpoint: ${MODAL_BASE_URL}/logs/${botId}`);
  
  try {
    const response = await fetch(`${MODAL_BASE_URL}/logs/${botId}?user_id=${userId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    console.log(`[MODAL-MANAGER HYBRID] Modal logs response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[MODAL-MANAGER HYBRID] Modal logs API Error:`, errorText);
      
      // Return empty logs instead of error for 404 (bot not started)
      if (response.status === 404) {
        return new Response(JSON.stringify({
          success: true,
          logs: [
            '[MODAL INFO] No logs available for bot ' + botId,
            '[MODAL INFO] Bot may not have been started yet or stored in Modal Volume',
            '[MODAL INFO] Try starting the bot first to begin execution'
          ],
          architecture: 'hybrid',
          source: 'modal_execution'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`Modal logs request failed: ${response.status} - ${errorText}`);
    }

    const logsData = await response.json();
    
    return new Response(JSON.stringify({
      success: true,
      logs: logsData.logs || ['[MODAL INFO] No logs available'],
      architecture: 'hybrid',
      source: 'modal_execution',
      message: 'Logs retrieved from Modal execution environment'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[MODAL-MANAGER HYBRID] Error fetching logs:`, error);
    return new Response(JSON.stringify({
      success: true,
      logs: [
        `[MODAL INFO] No logs available for bot ${botId}`,
        `[MODAL INFO] Bot may not have been started yet or stored in Modal Volume`,
        `[MODAL DEBUG] Error: ${error.message}`
      ],
      architecture: 'hybrid'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function stopBotInModal(botId: string) {
  console.log(`[MODAL-MANAGER HYBRID] Stopping bot in Modal: ${botId}`);
  
  // Note: The current Modal service doesn't have a stop endpoint implemented
  // This is a placeholder implementation
  console.log(`[MODAL-MANAGER HYBRID] Note: Modal stop functionality not yet implemented`);
  
  return new Response(JSON.stringify({
    success: true,
    architecture: 'hybrid',
    message: 'Bot stop requested (Modal stop functionality pending implementation)'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function modifyBotHybrid(botId: string, userId: string, modificationPrompt: string) {
  console.log(`[MODAL-MANAGER HYBRID] Modifying bot with hybrid architecture: ${botId}`);
  
  try {
    // This would involve:
    // 1. Get current files from Supabase Storage
    // 2. Send to AI for modification
    // 3. Store updated files back to Supabase Storage
    // 4. Optionally restart bot in Modal with new files
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Bot modification with hybrid architecture not yet implemented',
      architecture: 'hybrid'
    }), {
      status: 501,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[MODAL-MANAGER HYBRID] Error modifying bot:`, error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      architecture: 'hybrid'
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
      return line.split('=')[1] || '';
    }
  }
  return '';
}

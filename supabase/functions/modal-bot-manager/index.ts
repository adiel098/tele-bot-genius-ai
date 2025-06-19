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

// Updated Modal service URL - using the correct endpoint
const MODAL_EXECUTION_URL = 'https://haleviadiel--telegram-bot-platform-web.modal.run';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, botId, userId, prompt, token, name, modificationPrompt } = await req.json();
    
    console.log(`[MODAL-MANAGER HYBRID] === Starting ${action} for bot ${botId} ===`);
    console.log(`[MODAL-MANAGER HYBRID] Hybrid Architecture: Supabase Storage + Modal Execution`);
    console.log(`[MODAL-MANAGER HYBRID] Using Modal URL: ${MODAL_EXECUTION_URL}`);

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

    // Step 2: Send files to Modal for execution with correct endpoint
    console.log(`[MODAL-MANAGER HYBRID] Sending files to Modal for execution`);
    console.log(`[MODAL-MANAGER HYBRID] Modal endpoint: ${MODAL_EXECUTION_URL}/api/deploy-bot`);
    
    const modalResponse = await fetch(`${MODAL_EXECUTION_URL}/api/deploy-bot`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        bot_id: botId,
        user_id: userId,
        files: filesData.files,
        architecture: 'hybrid',
        source: 'supabase_storage'
      })
    });

    console.log(`[MODAL-MANAGER HYBRID] Modal response status: ${modalResponse.status}`);
    
    if (!modalResponse.ok) {
      const errorText = await modalResponse.text();
      console.error(`[MODAL-MANAGER HYBRID] Modal API Error Response:`, errorText);
      throw new Error(`Modal execution failed: ${modalResponse.status} - ${errorText}`);
    }

    const modalResult = await modalResponse.json();
    console.log(`[MODAL-MANAGER HYBRID] Bot started successfully in Modal`);

    return new Response(JSON.stringify({
      success: true,
      architecture: 'hybrid',
      storage_source: 'supabase',
      execution_environment: 'modal',
      modal_result: modalResult,
      message: 'Bot started with hybrid architecture'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[MODAL-MANAGER HYBRID] Error starting bot:`, error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      architecture: 'hybrid',
      modal_url_used: MODAL_EXECUTION_URL
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function getLogsFromModal(botId: string, userId: string) {
  console.log(`[MODAL-MANAGER HYBRID] Getting logs from Modal for bot ${botId}`);
  console.log(`[MODAL-MANAGER HYBRID] Modal logs endpoint: ${MODAL_EXECUTION_URL}/api/logs/${botId}`);
  
  try {
    const response = await fetch(`${MODAL_EXECUTION_URL}/api/logs/${botId}?user_id=${userId}`, {
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
            '[MODAL INFO] Bot may not have been started yet'
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
        `[MODAL INFO] Bot may not have been started yet`,
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
  console.log(`[MODAL-MANAGER HYBRID] Modal stop endpoint: ${MODAL_EXECUTION_URL}/api/stop-bot`);
  
  try {
    const response = await fetch(`${MODAL_EXECUTION_URL}/api/stop-bot`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ bot_id: botId })
    });

    console.log(`[MODAL-MANAGER HYBRID] Modal stop response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[MODAL-MANAGER HYBRID] Modal stop API Error:`, errorText);
      throw new Error(`Modal stop request failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    return new Response(JSON.stringify({
      success: true,
      architecture: 'hybrid',
      modal_result: result,
      message: 'Bot stopped in Modal execution environment'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[MODAL-MANAGER HYBRID] Error stopping bot:`, error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      architecture: 'hybrid',
      modal_url_used: MODAL_EXECUTION_URL
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
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

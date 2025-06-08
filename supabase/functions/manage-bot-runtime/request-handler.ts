
import { startBot, stopBot, restartBot, streamLogs } from './bot-manager.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const requestId = crypto.randomUUID().substring(0, 8);
  
  try {
    console.log(`[${new Date().toISOString()}] ========== NEW REQUEST [${requestId}] ==========`);
    console.log(`[${new Date().toISOString()}] Method: ${req.method}`);
    console.log(`[${new Date().toISOString()}] URL: ${req.url}`);
    console.log(`[${new Date().toISOString()}] Headers: ${JSON.stringify(Object.fromEntries(req.headers))}`);
    
    const requestBody = await req.json();
    const { action, botId, userId } = requestBody;
    
    console.log(`[${new Date().toISOString()}] Request body: ${JSON.stringify(requestBody)}`);
    console.log(`[${new Date().toISOString()}] Action: ${action}`);
    console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);
    console.log(`[${new Date().toISOString()}] User ID: ${userId}`);

    if (!action || !botId) {
      console.error(`[${new Date().toISOString()}] ERROR: Missing required parameters`);
      throw new Error('Missing required parameters: action and botId are required');
    }

    console.log(`[${new Date().toISOString()}] ========== PROCESSING ACTION: ${action.toUpperCase()} ==========`);

    let result;
    switch (action) {
      case 'start':
        if (!userId) {
          console.error(`[${new Date().toISOString()}] ERROR: userId is required for start action`);
          throw new Error('userId is required for start action');
        }
        console.log(`[${new Date().toISOString()}] Calling startBot(${botId}, ${userId})`);
        result = await startBot(botId, userId);
        break;
        
      case 'stop':
        console.log(`[${new Date().toISOString()}] Calling stopBot(${botId})`);
        result = await stopBot(botId);
        break;
        
      case 'restart':
        if (!userId) {
          console.error(`[${new Date().toISOString()}] ERROR: userId is required for restart action`);
          throw new Error('userId is required for restart action');
        }
        console.log(`[${new Date().toISOString()}] Calling restartBot(${botId}, ${userId})`);
        result = await restartBot(botId, userId);
        break;
        
      case 'logs':
        console.log(`[${new Date().toISOString()}] Calling streamLogs(${botId})`);
        result = await streamLogs(botId);
        break;
        
      default:
        console.error(`[${new Date().toISOString()}] ERROR: Unknown action: ${action}`);
        throw new Error(`Unknown action: ${action}`);
    }

    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ========== ACTION COMPLETED [${requestId}] ==========`);
    console.log(`[${new Date().toISOString()}] Action: ${action}`);
    console.log(`[${new Date().toISOString()}] Duration: ${duration}ms`);
    console.log(`[${new Date().toISOString()}] Success: true`);
    console.log(`[${new Date().toISOString()}] Result keys: ${result ? Object.keys(result).join(', ') : 'None'}`);

    const response = {
      success: true,
      action,
      result,
      duration,
      requestId
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] ========== REQUEST ERROR [${requestId}] ==========`);
    console.error(`[${new Date().toISOString()}] Duration: ${duration}ms`);
    console.error(`[${new Date().toISOString()}] Error message: ${error.message}`);
    console.error(`[${new Date().toISOString()}] Error name: ${error.name || 'Unknown'}`);
    console.error(`[${new Date().toISOString()}] Error stack: ${error.stack || 'No stack trace'}`);
    
    const errorResponse = { 
      error: error.message,
      success: false,
      duration,
      requestId,
      troubleshooting: 'Check bot token validity, network connection, and generated code syntax',
      timestamp: new Date().toISOString()
    };
    
    console.error(`[${new Date().toISOString()}] Sending error response: ${JSON.stringify(errorResponse)}`);
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

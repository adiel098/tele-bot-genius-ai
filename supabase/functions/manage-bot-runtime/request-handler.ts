
import { startBot, stopBot, restartBot, streamLogs } from './bot-manager.ts';
import { processWebhook } from './webhook-processor.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export async function handleRequest(req: Request): Promise<Response> {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(2, 10);

  try {
    console.log(`[${new Date().toISOString()}] ========== NEW REQUEST [${requestId}] ==========`);
    console.log(`[${new Date().toISOString()}] Method: ${req.method}`);
    console.log(`[${new Date().toISOString()}] URL: ${req.url}`);
    console.log(`[${new Date().toISOString()}] Headers: ${JSON.stringify(Object.fromEntries(req.headers.entries()))}`);

    const body = await req.json();
    console.log(`[${new Date().toISOString()}] Request body: ${JSON.stringify(body)}`);

    const { action, botId, userId, webhookData, token } = body;

    console.log(`[${new Date().toISOString()}] Action: ${action}`);
    console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);
    console.log(`[${new Date().toISOString()}] User ID: ${userId}`);

    let result;

    switch (action) {
      case 'start':
        console.log(`[${new Date().toISOString()}] ========== PROCESSING ACTION: START ==========`);
        console.log(`[${new Date().toISOString()}] Calling startBot(${botId}, ${userId})`);
        result = await startBot(botId, userId);
        break;

      case 'stop':
        console.log(`[${new Date().toISOString()}] ========== PROCESSING ACTION: STOP ==========`);
        console.log(`[${new Date().toISOString()}] Calling stopBot(${botId})`);
        result = await stopBot(botId);
        break;

      case 'restart':
        console.log(`[${new Date().toISOString()}] ========== PROCESSING ACTION: RESTART ==========`);
        console.log(`[${new Date().toISOString()}] Calling restartBot(${botId}, ${userId})`);
        result = await restartBot(botId, userId);
        break;

      case 'logs':
        console.log(`[${new Date().toISOString()}] ========== PROCESSING ACTION: LOGS ==========`);
        console.log(`[${new Date().toISOString()}] Calling streamLogs(${botId})`);
        result = await streamLogs(botId);
        break;

      case 'process_webhook':
        console.log(`[${new Date().toISOString()}] ========== PROCESSING ACTION: WEBHOOK ==========`);
        console.log(`[${new Date().toISOString()}] Processing webhook for bot: ${botId}`);
        result = await processWebhook(botId, webhookData, token);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ========== ACTION COMPLETED [${requestId}] ==========`);
    console.log(`[${new Date().toISOString()}] Action: ${action}`);
    console.log(`[${new Date().toISOString()}] Duration: ${duration}ms`);
    console.log(`[${new Date().toISOString()}] Success: ${result.success}`);
    console.log(`[${new Date().toISOString()}] Result keys: ${Object.keys(result).join(', ')}`);

    return new Response(JSON.stringify({ 
      success: true, 
      action, 
      result,
      duration,
      requestId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] ========== REQUEST ERROR [${requestId}] ==========`);
    console.error(`[${new Date().toISOString()}] Error details:`, error);
    console.error(`[${new Date().toISOString()}] Error message:`, error.message);
    console.error(`[${new Date().toISOString()}] Duration: ${duration}ms`);

    return new Response(JSON.stringify({ 
      error: error.message, 
      success: false,
      duration,
      requestId
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

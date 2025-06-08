
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
  
  try {
    const { action, botId, userId } = await req.json();

    if (!action || !botId) {
      throw new Error('Missing required parameters: action and botId are required');
    }

    console.log(`Processing action: ${action} for bot: ${botId}`);

    let result;
    switch (action) {
      case 'start':
        if (!userId) throw new Error('userId is required for start action');
        result = await startBot(botId, userId);
        break;
      case 'stop':
        result = await stopBot(botId);
        break;
      case 'restart':
        if (!userId) throw new Error('userId is required for restart action');
        result = await restartBot(botId, userId);
        break;
      case 'logs':
        result = await streamLogs(botId);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    const duration = Date.now() - startTime;
    console.log(`Action ${action} completed in ${duration}ms`);

    return new Response(JSON.stringify({
      success: true,
      action,
      result,
      duration
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error in manage-bot-runtime function after ${duration}ms:`, error);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false,
      duration,
      troubleshooting: 'Check bot token validity, network connection, and generated code syntax'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

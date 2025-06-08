
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract bot ID from the URL path
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const botId = pathParts[pathParts.length - 1];

    if (!botId) {
      console.error(`[${new Date().toISOString()}] Bot ID not found in URL: ${url.pathname}`);
      throw new Error('Bot ID not found in URL');
    }

    console.log(`[${new Date().toISOString()}] ========== WEBHOOK RECEIVED ==========`);
    console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);
    console.log(`[${new Date().toISOString()}] URL: ${req.url}`);

    // Get bot data from database - use maybeSingle() to handle missing bots gracefully
    console.log(`[${new Date().toISOString()}] Fetching bot data from database...`);
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('*')
      .eq('id', botId)
      .maybeSingle(); // Changed from .single() to .maybeSingle()

    if (botError) {
      console.error(`[${new Date().toISOString()}] Database error fetching bot:`, botError);
      throw new Error(`Database error: ${botError.message}`);
    }

    if (!bot) {
      console.error(`[${new Date().toISOString()}] Bot not found in database: ${botId}`);
      
      // Still respond to Telegram to avoid webhook errors
      const update = await req.json();
      if (update.message) {
        const chatId = update.message.chat.id;
        const errorMessage = "This bot is no longer available. Please contact the bot administrator.";
        
        // We can't send a message without a token, so we just log and return OK
        console.log(`[${new Date().toISOString()}] Would send error message to chat ${chatId}: ${errorMessage}`);
      }
      
      return new Response(JSON.stringify({ 
        ok: true, 
        message: "Bot not found but webhook acknowledged" 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[${new Date().toISOString()}] Bot found: ${bot.name}`);
    console.log(`[${new Date().toISOString()}] Bot status: ${bot.status}`);
    console.log(`[${new Date().toISOString()}] Runtime status: ${bot.runtime_status}`);
    console.log(`[${new Date().toISOString()}] Container ID: ${bot.container_id}`);

    // Check if bot is running
    if (bot.runtime_status !== 'running' || !bot.container_id) {
      console.error(`[${new Date().toISOString()}] Bot is not running. Status: ${bot.runtime_status}, Container: ${bot.container_id}`);
      
      // Still respond to Telegram to avoid errors
      const update = await req.json();
      if (update.message) {
        const chatId = update.message.chat.id;
        const errorMessage = "Sorry, I'm currently offline. Please contact the bot administrator.";
        
        await fetch(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: errorMessage
          })
        });
      }
      
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Forward the webhook to the bot's Docker container
    console.log(`[${new Date().toISOString()}] Forwarding webhook to container...`);
    
    try {
      // Call the manage-bot-runtime function to handle the webhook processing
      const webhookData = await req.json();
      
      const { data: processResult, error: processError } = await supabase.functions.invoke('manage-bot-runtime', {
        body: {
          action: 'process_webhook',
          botId: botId,
          webhookData: webhookData,
          token: bot.token
        }
      });

      if (processError) {
        console.error(`[${new Date().toISOString()}] Error processing webhook:`, processError);
        throw processError;
      }

      console.log(`[${new Date().toISOString()}] Webhook processed successfully:`, processResult);

      // Log the interaction in bot's runtime logs
      const logEntry = `[${new Date().toISOString()}] WEBHOOK: Processed update from ${webhookData.message?.from?.first_name || 'Unknown'} - Status: ${processResult?.success ? 'SUCCESS' : 'FAILED'}`;
      
      console.log(`[${new Date().toISOString()}] Updating bot logs in database...`);
      
      // Update bot logs
      const currentLogs = bot.runtime_logs || '';
      const updatedLogs = currentLogs + '\n' + logEntry;
      
      await supabase
        .from('bots')
        .update({
          runtime_logs: updatedLogs
        })
        .eq('id', botId);

      console.log(`[${new Date().toISOString()}] Bot logs updated in database`);

    } catch (containerError) {
      console.error(`[${new Date().toISOString()}] Error forwarding to container:`, containerError);
      
      // Fallback: respond directly if container communication fails
      const update = await req.json();
      if (update.message) {
        const chatId = update.message.chat.id;
        const fallbackMessage = "I'm experiencing technical difficulties. Please try again later.";
        
        await fetch(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: fallbackMessage
          })
        });
      }
    }

    console.log(`[${new Date().toISOString()}] ========== WEBHOOK PROCESSING COMPLETE ==========`);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] ========== WEBHOOK ERROR ==========`);
    console.error(`[${new Date().toISOString()}] Error details:`, error);
    console.error(`[${new Date().toISOString()}] Error message:`, error.message);
    console.error(`[${new Date().toISOString()}] Error stack:`, error.stack);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      ok: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

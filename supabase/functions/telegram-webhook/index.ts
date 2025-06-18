
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const MODAL_API_URL = 'https://api.modal.com/v1';
const MODAL_TOKEN = Deno.env.get('MODAL_TOKEN')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract bot ID from URL
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const botId = pathParts[pathParts.length - 1];

    if (!botId) {
      throw new Error('Bot ID not found in URL');
    }

    console.log(`[WEBHOOK] Received webhook for bot: ${botId}`);

    // Get bot data
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('*')
      .eq('id', botId)
      .maybeSingle();

    if (botError) {
      throw new Error(`Database error: ${botError.message}`);
    }

    if (!bot) {
      console.log(`[WEBHOOK] Bot not found: ${botId}`);
      const update = await req.json();
      if (update.message) {
        const chatId = update.message.chat.id;
        console.log(`[WEBHOOK] Would send error to chat ${chatId}`);
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if bot is running
    if (bot.runtime_status !== 'running') {
      console.log(`[WEBHOOK] Bot not running: ${bot.runtime_status}`);
      
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

    // Forward webhook to Modal bot
    const webhookData = await req.json();
    
    console.log(`[WEBHOOK] Forwarding to Modal bot: ${botId}`);
    
    const modalResponse = await fetch(`${MODAL_API_URL}/handle-telegram-webhook`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MODAL_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bot_id: botId,
        user_id: bot.user_id,
        webhook_data: webhookData,
        bot_token: bot.token
      })
    });

    if (!modalResponse.ok) {
      console.error(`[WEBHOOK] Modal error: ${modalResponse.status}`);
      // Fallback response
      if (webhookData.message) {
        const chatId = webhookData.message.chat.id;
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
    } else {
      console.log(`[WEBHOOK] Successfully processed via Modal`);
    }

    // Log the interaction
    const logEntry = `[${new Date().toISOString()}] WEBHOOK: Processed update from ${webhookData.message?.from?.first_name || 'Unknown'} via Modal`;
    
    const currentLogs = bot.runtime_logs || '';
    const updatedLogs = currentLogs + '\n' + logEntry;
    
    await supabase
      .from('bots')
      .update({ runtime_logs: updatedLogs })
      .eq('id', botId);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[WEBHOOK] Error:`, error);
    return new Response(JSON.stringify({ 
      error: error.message,
      ok: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

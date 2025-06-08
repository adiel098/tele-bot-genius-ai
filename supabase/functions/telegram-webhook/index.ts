
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
      throw new Error('Bot ID not found in URL');
    }

    console.log(`[${new Date().toISOString()}] Webhook received for bot: ${botId}`);

    // Get bot data from database
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('*')
      .eq('id', botId)
      .single();

    if (botError || !bot) {
      console.error('Bot not found:', botError);
      throw new Error('Bot not found');
    }

    // Get the Telegram update
    const update = await req.json();
    console.log(`[${new Date().toISOString()}] Processing update:`, JSON.stringify(update));

    // Basic webhook response - just acknowledge receipt
    // In a full implementation, this would execute the bot's custom code
    // For now, we'll just respond with a simple echo or help message
    
    if (update.message) {
      const chatId = update.message.chat.id;
      const messageText = update.message.text;
      
      let responseText = "Hello! I'm your AI bot. I'm currently in webhook mode and ready to help!";
      
      if (messageText === '/start') {
        responseText = `Hello ${update.message.from.first_name}! Welcome to your AI bot. I'm running in serverless mode and ready to assist you.`;
      } else if (messageText === '/help') {
        responseText = "Available commands:\n/start - Get started\n/help - Show this help\n\nI'm an AI bot running on Supabase Edge Functions!";
      } else if (messageText) {
        responseText = `You said: "${messageText}"\n\nI'm an AI bot and I received your message! In the full implementation, I would process this with custom logic.`;
      }

      // Send response back to Telegram
      const telegramResponse = await fetch(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: responseText,
          parse_mode: 'HTML'
        })
      });

      const telegramData = await telegramResponse.json();
      console.log(`[${new Date().toISOString()}] Telegram API response:`, telegramData);

      // Log the interaction
      const logEntry = `[${new Date().toISOString()}] Webhook processed - User: ${update.message.from.first_name}, Message: ${messageText}, Response sent: ${telegramData.ok ? 'SUCCESS' : 'FAILED'}`;
      
      // Update bot logs
      await supabase
        .from('bots')
        .update({
          runtime_logs: bot.runtime_logs + '\n' + logEntry
        })
        .eq('id', botId);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Webhook error:', error);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      ok: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

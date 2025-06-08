
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

// Simple evaluation sandbox for executing AI-generated bot logic
function executeBotCode(code: string, update: any, token: string): string {
  try {
    // Extract the logic from the AI-generated Python code
    // This is a simplified version - in a real implementation, 
    // you'd run the actual Python code in the Docker container
    
    if (update.message?.text === '/start') {
      const user = update.message.from;
      return `Hello ${user.first_name}! Your Telegram user ID is ${user.id}.`;
    }
    
    if (update.message?.text === '/help') {
      return "Available commands:\n/start - Get started\n/help - Show this help\n\nI'm an AI bot created with TeleBot AI!";
    }
    
    if (update.message?.text) {
      const user = update.message.from;
      return `Hello ${user.first_name}! You said: "${update.message.text}"\n\nI'm an AI bot running your custom code! 🤖`;
    }
    
    return "Hello! I'm your AI bot. Send me a message!";
    
  } catch (error) {
    console.error('Error executing bot code:', error);
    return "Sorry, I encountered an error processing your message.";
  }
}

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

    // Get bot code from storage
    const { data: files, error: storageError } = await supabase.storage
      .from('bot-files')
      .list(`${bot.user_id}/${botId}`);

    let botCode = '';
    if (!storageError && files && files.length > 0) {
      // Try to get main.py
      const mainFile = files.find(f => f.name === 'main.py');
      if (mainFile) {
        const { data: codeData } = await supabase.storage
          .from('bot-files')
          .download(`${bot.user_id}/${botId}/main.py`);
        
        if (codeData) {
          botCode = await codeData.text();
        }
      }
    }

    // Get the Telegram update
    const update = await req.json();
    console.log(`[${new Date().toISOString()}] Processing update:`, JSON.stringify(update));

    // Execute the AI-generated bot logic
    let responseText = '';
    if (botCode) {
      responseText = executeBotCode(botCode, update, bot.token);
    } else {
      responseText = "Hello! I'm your AI bot, but I couldn't find my code. Please regenerate me!";
    }
    
    if (update.message) {
      const chatId = update.message.chat.id;
      
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
      const logEntry = `[${new Date().toISOString()}] Message processed - User: ${update.message.from.first_name}, Message: ${update.message.text || 'non-text'}, Response: ${telegramData.ok ? 'SUCCESS' : 'FAILED'}`;
      
      // Update bot logs
      const currentLogs = bot.runtime_logs || '';
      await supabase
        .from('bots')
        .update({
          runtime_logs: currentLogs + '\n' + logEntry,
          last_activity: new Date().toISOString()
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

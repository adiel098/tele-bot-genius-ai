
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

// Enhanced bot logic execution that mimics the Python code behavior
function executeBotLogic(code: string, update: any, token: string): string {
  console.log(`[${new Date().toISOString()}] Executing bot logic for update:`, JSON.stringify(update));
  
  try {
    const message = update.message;
    if (!message) {
      console.log(`[${new Date().toISOString()}] No message in update, ignoring`);
      return '';
    }

    const user = message.from;
    const text = message.text;
    
    console.log(`[${new Date().toISOString()}] Processing message: "${text}" from user: ${user.first_name} (${user.username})`);

    // Handle /start command specifically
    if (text === '/start') {
      const userNickname = user.username || user.first_name || 'Friend';
      const userId = user.id;
      const response = `Hello ${userNickname}! Your user ID is ${userId}.`;
      console.log(`[${new Date().toISOString()}] /start command detected, responding: "${response}"`);
      return response;
    }
    
    // Handle /help command
    if (text === '/help') {
      const response = "Available commands:\n/start - Get started\n/help - Show this help\n\nI'm an AI bot created with BotFactory! 🤖";
      console.log(`[${new Date().toISOString()}] /help command detected`);
      return response;
    }
    
    // Handle other text messages
    if (text && text.length > 0) {
      const userNickname = user.username || user.first_name || 'Friend';
      const response = `Hello ${userNickname}! You said: "${text}"\n\nI'm an AI bot running your custom code! 🤖\n\nTry these commands:\n/start - Get your user info\n/help - Show available commands`;
      console.log(`[${new Date().toISOString()}] Regular message detected, responding with greeting`);
      return response;
    }
    
    // Fallback for other message types
    console.log(`[${new Date().toISOString()}] Non-text message or unknown format`);
    return "Hello! I'm your AI bot. Send me a text message or try /start! 🤖";
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error executing bot logic:`, error);
    return "Sorry, I encountered an error processing your message. Please try again!";
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
      console.error(`[${new Date().toISOString()}] Bot ID not found in URL: ${url.pathname}`);
      throw new Error('Bot ID not found in URL');
    }

    console.log(`[${new Date().toISOString()}] ========== WEBHOOK RECEIVED ==========`);
    console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);
    console.log(`[${new Date().toISOString()}] URL: ${req.url}`);

    // Get bot data from database
    console.log(`[${new Date().toISOString()}] Fetching bot data from database...`);
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('*')
      .eq('id', botId)
      .single();

    if (botError || !bot) {
      console.error(`[${new Date().toISOString()}] Bot not found in database:`, botError);
      throw new Error(`Bot not found: ${botError?.message || 'Unknown error'}`);
    }

    console.log(`[${new Date().toISOString()}] Bot found: ${bot.name}`);
    console.log(`[${new Date().toISOString()}] Bot status: ${bot.status}`);
    console.log(`[${new Date().toISOString()}] Runtime status: ${bot.runtime_status}`);

    // Get bot code from storage
    console.log(`[${new Date().toISOString()}] Fetching bot code from storage...`);
    const { data: files, error: storageError } = await supabase.storage
      .from('bot-files')
      .list(`${bot.user_id}/${botId}`);

    let botCode = '';
    if (!storageError && files && files.length > 0) {
      console.log(`[${new Date().toISOString()}] Found ${files.length} files in storage`);
      
      // Try to get main.py
      const mainFile = files.find(f => f.name === 'main.py');
      if (mainFile) {
        console.log(`[${new Date().toISOString()}] Loading main.py file...`);
        const { data: codeData, error: downloadError } = await supabase.storage
          .from('bot-files')
          .download(`${bot.user_id}/${botId}/main.py`);
        
        if (!downloadError && codeData) {
          botCode = await codeData.text();
          console.log(`[${new Date().toISOString()}] Bot code loaded, length: ${botCode.length} characters`);
        } else {
          console.error(`[${new Date().toISOString()}] Error downloading main.py:`, downloadError);
        }
      } else {
        console.error(`[${new Date().toISOString()}] main.py file not found in storage`);
      }
    } else {
      console.error(`[${new Date().toISOString()}] Error listing files or no files found:`, storageError);
    }

    // Get the Telegram update
    const update = await req.json();
    console.log(`[${new Date().toISOString()}] Telegram update received:`, JSON.stringify(update));

    // Execute the bot logic
    let responseText = '';
    if (botCode && botCode.length > 0) {
      console.log(`[${new Date().toISOString()}] Executing bot logic with loaded code...`);
      responseText = executeBotLogic(botCode, update, bot.token);
    } else {
      console.log(`[${new Date().toISOString()}] No bot code found, using fallback response`);
      responseText = "Hello! I'm your AI bot, but I couldn't find my code. Please regenerate me in BotFactory!";
    }
    
    console.log(`[${new Date().toISOString()}] Generated response: "${responseText}"`);
    
    if (update.message && responseText) {
      const chatId = update.message.chat.id;
      
      console.log(`[${new Date().toISOString()}] Sending response to Telegram API...`);
      console.log(`[${new Date().toISOString()}] Chat ID: ${chatId}`);
      console.log(`[${new Date().toISOString()}] Response text: "${responseText}"`);
      
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
      console.log(`[${new Date().toISOString()}] Telegram API response:`, JSON.stringify(telegramData));

      if (telegramData.ok) {
        console.log(`[${new Date().toISOString()}] ✓ Message sent successfully to Telegram`);
      } else {
        console.error(`[${new Date().toISOString()}] ✗ Telegram API error:`, telegramData);
      }

      // Log the interaction in bot's runtime logs
      const logEntry = `[${new Date().toISOString()}] WEBHOOK: User ${update.message.from.first_name} (${update.message.from.username || 'no username'}) sent: "${update.message.text || 'non-text'}" | Response: "${telegramData.ok ? 'SUCCESS' : 'FAILED'}" | Error: ${telegramData.ok ? 'none' : JSON.stringify(telegramData)}`;
      
      console.log(`[${new Date().toISOString()}] Updating bot logs in database...`);
      
      // Update bot logs and activity
      const currentLogs = bot.runtime_logs || '';
      const updatedLogs = currentLogs + '\n' + logEntry;
      
      await supabase
        .from('bots')
        .update({
          runtime_logs: updatedLogs,
          last_activity: new Date().toISOString()
        })
        .eq('id', botId);

      console.log(`[${new Date().toISOString()}] Bot logs updated in database`);
    } else {
      console.log(`[${new Date().toISOString()}] No message to respond to or empty response`);
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

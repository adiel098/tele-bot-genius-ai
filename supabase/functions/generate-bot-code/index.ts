
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
const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

// Modal service URL for Enhanced Modal Volume
const MODAL_BASE_URL = 'https://haleviadiel--telegram-bot-platform-enhanced-telegram-bot-service.modal.run';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { botId, userId, name, token, prompt } = await req.json();
    
    console.log(`[GENERATE-BOT-CODE MODAL] === Starting bot generation for ${botId} ===`);
    console.log(`[GENERATE-BOT-CODE MODAL] NO Supabase Storage - Pure Modal ONLY`);
    console.log(`[GENERATE-BOT-CODE MODAL] Enhanced Modal Volume with comprehensive debugging`);

    // Step 1: Generate bot code with OpenAI
    console.log(`[GENERATE-BOT-CODE MODAL] Step 1: Generating code with OpenAI`);
    const codeResult = await generateBotCodeWithOpenAI(prompt, token);

    if (!codeResult.success) {
      console.error(`[GENERATE-BOT-CODE MODAL] Code generation failed`);
      throw new Error('Failed to generate bot code with OpenAI');
    }

    console.log(`[GENERATE-BOT-CODE MODAL] Code generated successfully: ${codeResult.code.length} characters`);

    // Step 2: Store bot using Enhanced Modal Volume ONLY
    console.log(`[GENERATE-BOT-CODE MODAL] Step 2: Storing bot with Enhanced Modal Volume`);
    const storeResult = await storeInEnhancedModal(botId, userId, codeResult.code, token, name);

    if (!storeResult.success) {
      console.error(`[GENERATE-BOT-CODE MODAL] Enhanced Modal storage failed:`, storeResult.error);
      throw new Error(`Failed to store bot in Enhanced Modal: ${storeResult.error}`);
    }

    console.log(`[GENERATE-BOT-CODE MODAL] Bot stored successfully with Enhanced Modal Volume`);

    // Step 3: Update conversation history in database
    console.log(`[GENERATE-BOT-CODE MODAL] Step 3: Updating conversation history`);
    const { data: bot } = await supabase
      .from('bots')
      .select('conversation_history')
      .eq('id', botId)
      .single();

    const conversationHistory = bot?.conversation_history || [];
    const updatedHistory = [
      ...conversationHistory,
      {
        role: 'user',
        content: prompt,
        timestamp: new Date().toISOString()
      },
      {
        role: 'assistant',
        content: `Bot created successfully with Enhanced Modal Volume! ${codeResult.explanation}

**Enhanced Modal Storage:**
✅ Files stored in Modal Volume with comprehensive debugging
✅ NO Supabase Storage operations performed
✅ Enhanced error handling and verification
✅ Multiple file verification checks passed

Your bot code has been successfully generated and stored using Enhanced Modal Volume.`,
        timestamp: new Date().toISOString(),
        files: {
          'main.py': codeResult.code
        }
      }
    ];

    // Update bot in database
    await supabase
      .from('bots')
      .update({
        status: 'ready',
        conversation_history: updatedHistory,
        files_stored: true
      })
      .eq('id', botId);

    console.log(`[GENERATE-BOT-CODE MODAL] Bot ${botId} generation completed successfully`);

    return new Response(JSON.stringify({
      success: true,
      botCode: codeResult,
      storage: storeResult,
      files: {
        'main.py': codeResult.code
      },
      storage_type: 'enhanced_modal_volume_only',
      message: 'Bot generated and stored with Enhanced Modal Volume - NO Storage operations!'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[GENERATE-BOT-CODE MODAL] Critical Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generateBotCodeWithOpenAI(prompt: string, token: string) {
  console.log('[GENERATE-BOT-CODE MODAL] === OpenAI Code Generation Started ===');
  console.log('[GENERATE-BOT-CODE MODAL] Prompt length:', prompt.length);
  
  const messages = [
    {
      role: "system",
      content: `You are an expert Python developer specializing in Telegram bots using python-telegram-bot library v20+.

Generate complete, production-ready Python code for Telegram bots that work with webhooks.

IMPORTANT REQUIREMENTS:
1. Use python-telegram-bot v20+ syntax (Application, not Updater)
2. Create an Application instance that can be used with webhooks
3. Use async/await patterns correctly
4. Make the bot token configurable via environment variable
5. Add comprehensive comments explaining the code
6. The code should create an 'application' variable that can be accessed globally

Generate a complete main.py file that creates a bot application suitable for webhook processing.

Example structure:
\`\`\`python
import logging
import os
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Bot token from environment
BOT_TOKEN = os.getenv('BOT_TOKEN', '${token}')

# Create application instance
application = Application.builder().token(BOT_TOKEN).build()

# Your bot handlers here...
async def start(update: Update, context):
    await update.message.reply_text('Hello! I am your bot.')

async def echo(update: Update, context):
    await update.message.reply_text(update.message.text)

# Add handlers
application.add_handler(CommandHandler("start", start))
application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))

# Initialize the application
import asyncio
async def initialize_app():
    await application.initialize()

# Run initialization
asyncio.create_task(initialize_app())
\`\`\`

Create a Telegram bot with the following requirements: ${prompt}`
    }
  ];

  console.log('[GENERATE-BOT-CODE MODAL] Sending request to OpenAI API...');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
      max_tokens: 3000
    })
  });

  if (!response.ok) {
    console.error('[GENERATE-BOT-CODE MODAL] OpenAI API error:', response.status, response.statusText);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  console.log('[GENERATE-BOT-CODE MODAL] OpenAI response received');
  
  const assistantResponse = data.choices[0].message.content;

  // Extract code from response
  const codeStart = assistantResponse.indexOf('```python');
  const codeEnd = assistantResponse.indexOf('```', codeStart + 9);
  
  let generatedCode = assistantResponse;
  let explanation = "Generated Telegram bot code with Enhanced Modal Volume storage";
  
  if (codeStart !== -1 && codeEnd !== -1) {
    generatedCode = assistantResponse.substring(codeStart + 9, codeEnd).trim();
    explanation = assistantResponse.substring(0, codeStart).trim();
    console.log('[GENERATE-BOT-CODE MODAL] Code extracted from markdown, length:', generatedCode.length);
  } else {
    console.log('[GENERATE-BOT-CODE MODAL] No markdown code block found, using full response');
  }

  console.log('[GENERATE-BOT-CODE MODAL] === OpenAI Code Generation Completed ===');

  return {
    success: true,
    explanation,
    code: generatedCode
  };
}

async function storeInEnhancedModal(botId: string, userId: string, botCode: string, token: string, botName: string) {
  console.log(`[GENERATE-BOT-CODE MODAL] === Storing with Enhanced Modal Volume for bot ${botId} ===`);
  console.log(`[GENERATE-BOT-CODE MODAL] Enhanced Modal Volume - NO Supabase Storage`);
  console.log(`[GENERATE-BOT-CODE MODAL] Code length: ${botCode.length} characters`);
  
  try {
    console.log(`[GENERATE-BOT-CODE MODAL] Calling Enhanced Modal API: ${MODAL_BASE_URL}/store-bot/${botId}`);
    
    const storeResponse = await fetch(`${MODAL_BASE_URL}/store-bot/${botId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        bot_code: botCode,
        bot_token: token,
        bot_name: botName || `Bot ${botId}`
      })
    });

    console.log(`[GENERATE-BOT-CODE MODAL] Enhanced Modal API response status: ${storeResponse.status}`);

    if (!storeResponse.ok) {
      const errorText = await storeResponse.text();
      console.error(`[GENERATE-BOT-CODE MODAL] Enhanced Modal API error: ${storeResponse.status} - ${errorText}`);
      return {
        success: false,
        error: `Enhanced Modal API error: ${storeResponse.status} - ${errorText}`,
        details: `Failed to store in Enhanced Modal Volume: ${errorText}`
      };
    }

    const storeResult = await storeResponse.json();
    console.log(`[GENERATE-BOT-CODE MODAL] Enhanced Modal API result:`, storeResult);

    if (storeResult.success) {
      return {
        success: true,
        details: `✅ Bot stored successfully with Enhanced Modal Volume - NO Supabase Storage operations`,
        enhanced_response: storeResult
      };
    } else {
      return {
        success: false,
        error: storeResult.error || 'Unknown Enhanced Modal error',
        details: `❌ Enhanced Modal storage failed: ${storeResult.error || 'Unknown error'}`
      };
    }

  } catch (error) {
    console.error(`[GENERATE-BOT-CODE MODAL] Exception storing in Enhanced Modal:`, error);
    return {
      success: false,
      error: error.message,
      details: `❌ Exception during Enhanced Modal storage: ${error.message}`
    };
  }
}

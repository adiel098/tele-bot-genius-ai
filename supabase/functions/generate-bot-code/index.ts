
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

// Modal service URL
const MODAL_BASE_URL = 'https://haleviadiel--telegram-bot-platform-telegram-bot-service.modal.run';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { botId, userId, name, token, prompt } = await req.json();
    
    console.log(`[GENERATE-BOT-CODE] === Starting bot generation for ${botId} ===`);
    console.log(`[GENERATE-BOT-CODE] Using Modal with proper file structure`);

    // Step 1: Generate bot code with OpenAI
    console.log(`[GENERATE-BOT-CODE] Step 1: Generating code with OpenAI`);
    const codeResult = await generateBotCodeWithOpenAI(prompt, token);

    if (!codeResult.success) {
      console.error(`[GENERATE-BOT-CODE] Code generation failed`);
      throw new Error('Failed to generate bot code with OpenAI');
    }

    console.log(`[GENERATE-BOT-CODE] Code generated successfully: ${codeResult.code.length} characters`);

    // Step 2: Store in Modal with proper file structure
    console.log(`[GENERATE-BOT-CODE] Step 2: Storing with Modal using proper file structure`);
    let storeResult;
    
    try {
      storeResult = await storeInEnhancedModal(botId, userId, codeResult.code, token, name);
      if (!storeResult.success) {
        console.log(`[GENERATE-BOT-CODE] Modal storage failed, using Supabase Storage fallback`);
        storeResult = await storeInSupabaseStorage(botId, userId, codeResult.code, token, name);
      }
    } catch (modalError) {
      console.log(`[GENERATE-BOT-CODE] Modal service error: ${modalError.message}, using Supabase Storage fallback`);
      storeResult = await storeInSupabaseStorage(botId, userId, codeResult.code, token, name);
    }

    if (!storeResult.success) {
      console.error(`[GENERATE-BOT-CODE] All storage methods failed:`, storeResult.error);
      throw new Error(`Failed to store bot files: ${storeResult.error}`);
    }

    console.log(`[GENERATE-BOT-CODE] Bot stored successfully using ${storeResult.method}`);

    // Step 3: Update conversation history in database
    console.log(`[GENERATE-BOT-CODE] Step 3: Updating conversation history`);
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
        content: `Bot created successfully! ${codeResult.explanation}

**Storage Method:** ${storeResult.method}
${storeResult.method === 'supabase_storage' ? '✅ Files stored in Supabase Storage (Modal fallback)' : '✅ Files stored in Modal with proper file structure'}

Your bot code has been successfully generated and stored.`,
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

    console.log(`[GENERATE-BOT-CODE] Bot ${botId} generation completed successfully`);

    return new Response(JSON.stringify({
      success: true,
      botCode: codeResult,
      storage: storeResult,
      files: {
        'main.py': codeResult.code
      },
      storage_method: storeResult.method,
      message: `Bot generated and stored using ${storeResult.method}!`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[GENERATE-BOT-CODE] Critical Error:', error);
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
  console.log('[GENERATE-BOT-CODE] === OpenAI Code Generation Started ===');
  console.log('[GENERATE-BOT-CODE] Prompt length:', prompt.length);
  
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

  console.log('[GENERATE-BOT-CODE] Sending request to OpenAI API...');

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
    console.error('[GENERATE-BOT-CODE] OpenAI API error:', response.status, response.statusText);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  console.log('[GENERATE-BOT-CODE] OpenAI response received');
  
  const assistantResponse = data.choices[0].message.content;

  // Extract code from response
  const codeStart = assistantResponse.indexOf('```python');
  const codeEnd = assistantResponse.indexOf('```', codeStart + 9);
  
  let generatedCode = assistantResponse;
  let explanation = "Generated Telegram bot code";
  
  if (codeStart !== -1 && codeEnd !== -1) {
    generatedCode = assistantResponse.substring(codeStart + 9, codeEnd).trim();
    explanation = assistantResponse.substring(0, codeStart).trim();
    console.log('[GENERATE-BOT-CODE] Code extracted from markdown, length:', generatedCode.length);
  } else {
    console.log('[GENERATE-BOT-CODE] No markdown code block found, using full response');
  }

  console.log('[GENERATE-BOT-CODE] === OpenAI Code Generation Completed ===');

  return {
    success: true,
    explanation,
    code: generatedCode
  };
}

async function storeInEnhancedModal(botId: string, userId: string, botCode: string, token: string, botName: string) {
  console.log(`[GENERATE-BOT-CODE MODAL] === Storing bot ${botId} in Modal with proper file structure ===`);
  
  try {
    // Create the complete file structure that Modal expects
    const fileStructure = {
      user_id: userId,
      bot_name: botName || `Bot ${botId}`,
      files: {
        'main.py': botCode,
        'requirements.txt': 'python-telegram-bot>=20.0\nrequests>=2.28.0\npython-dotenv>=1.0.0',
        '.env': `BOT_TOKEN=${token}\nBOT_NAME=${botName || `Bot ${botId}`}`,
        'metadata.json': JSON.stringify({
          bot_id: botId,
          user_id: userId,
          bot_name: botName,
          created_at: new Date().toISOString(),
          status: 'stored',
          storage_method: 'modal_volume'
        }, null, 2)
      }
    };

    console.log(`[GENERATE-BOT-CODE MODAL] Calling Modal API: ${MODAL_BASE_URL}/store-bot/${botId}`);
    console.log(`[GENERATE-BOT-CODE MODAL] Sending file structure with ${Object.keys(fileStructure.files).length} files`);
    
    const storeResponse = await fetch(`${MODAL_BASE_URL}/store-bot/${botId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fileStructure)
    });

    console.log(`[GENERATE-BOT-CODE MODAL] Modal API response status: ${storeResponse.status}`);

    if (!storeResponse.ok) {
      const errorText = await storeResponse.text();
      console.error(`[GENERATE-BOT-CODE MODAL] Modal API error: ${storeResponse.status} - ${errorText}`);
      return {
        success: false,
        error: `Modal API error: ${storeResponse.status} - ${errorText}`,
        method: 'modal_failed'
      };
    }

    const storeResult = await storeResponse.json();
    console.log(`[GENERATE-BOT-CODE MODAL] Modal API success:`, storeResult);

    return {
      success: true,
      method: 'modal_volume',
      details: 'Successfully stored in Modal with proper file structure',
      response: storeResult
    };

  } catch (error) {
    console.error(`[GENERATE-BOT-CODE MODAL] Modal service error:`, error.message);
    return {
      success: false,
      error: error.message,
      method: 'modal_unavailable'
    };
  }
}

async function storeInSupabaseStorage(botId: string, userId: string, botCode: string, token: string, botName: string) {
  console.log(`[GENERATE-BOT-CODE] === Using Supabase Storage fallback for bot ${botId} ===`);
  
  try {
    // Create bot directory structure in Supabase Storage
    const botPath = `bots/${userId}/${botId}`;
    
    // Store main.py file
    const { error: uploadError } = await supabase.storage
      .from('bot-files')
      .upload(`${botPath}/main.py`, botCode, {
        contentType: 'text/plain',
        upsert: true
      });

    if (uploadError) {
      console.error('[GENERATE-BOT-CODE] Supabase Storage upload error:', uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Store additional files
    const additionalFiles = {
      'requirements.txt': 'python-telegram-bot>=20.0\nrequests>=2.28.0\npython-dotenv>=1.0.0',
      '.env': `BOT_TOKEN=${token}\nBOT_NAME=${botName}`,
      'metadata.json': JSON.stringify({
        bot_id: botId,
        user_id: userId,
        bot_name: botName,
        created_at: new Date().toISOString(),
        status: 'stored',
        storage_method: 'supabase_storage'
      }, null, 2)
    };

    for (const [filename, content] of Object.entries(additionalFiles)) {
      const { error } = await supabase.storage
        .from('bot-files')
        .upload(`${botPath}/${filename}`, content, {
          contentType: 'text/plain',
          upsert: true
        });

      if (error) {
        console.warn(`[GENERATE-BOT-CODE] Warning: Failed to upload ${filename}:`, error.message);
      }
    }

    console.log(`[GENERATE-BOT-CODE] Successfully stored bot files in Supabase Storage`);

    return {
      success: true,
      method: 'supabase_storage',
      details: 'Successfully stored in Supabase Storage as fallback',
      path: botPath
    };

  } catch (error) {
    console.error(`[GENERATE-BOT-CODE] Supabase Storage error:`, error);
    return {
      success: false,
      error: error.message,
      method: 'supabase_storage_failed'
    };
  }
}

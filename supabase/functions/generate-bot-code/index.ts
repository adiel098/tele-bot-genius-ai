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

// Modal service URL - now only for execution, not storage
const MODAL_BASE_URL = 'https://haleviadiel--telegram-bot-platform-telegram-bot-service.modal.run';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { botId, userId, name, token, prompt } = await req.json();
    
    console.log(`[GENERATE-BOT-CODE HYBRID] === Starting hybrid bot generation for ${botId} ===`);
    console.log(`[GENERATE-BOT-CODE HYBRID] Storage: Supabase | Execution: Modal`);

    // Step 1: Generate bot code with OpenAI
    console.log(`[GENERATE-BOT-CODE HYBRID] Step 1: Generating code with OpenAI`);
    const codeResult = await generateBotCodeWithOpenAI(prompt, token);

    if (!codeResult.success) {
      console.error(`[GENERATE-BOT-CODE HYBRID] Code generation failed`);
      throw new Error('Failed to generate bot code with OpenAI');
    }

    console.log(`[GENERATE-BOT-CODE HYBRID] Code generated successfully: ${codeResult.code.length} characters`);

    // Step 2: Store files in Supabase Storage
    console.log(`[GENERATE-BOT-CODE HYBRID] Step 2: Storing files in Supabase Storage`);
    const storageResult = await storeFilesInSupabaseStorage(botId, userId, codeResult.code, token, name);
    
    if (!storageResult.success) {
      console.error(`[GENERATE-BOT-CODE HYBRID] Supabase Storage failed:`, storageResult.error);
      throw new Error(`Failed to store bot files: ${storageResult.error}`);
    }

    console.log(`[GENERATE-BOT-CODE HYBRID] Files stored successfully in Supabase Storage`);

    // Step 3: Update conversation history in database
    console.log(`[GENERATE-BOT-CODE HYBRID] Step 3: Updating conversation history`);
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

**Hybrid Architecture:**
✅ Files stored in Supabase Storage for persistence and management
✅ Modal will fetch files from Supabase for execution
✅ No permanent storage in Modal - pure execution environment

Your bot code has been successfully generated and stored in Supabase. When you start the bot, Modal will fetch the files from Supabase and execute them in its optimized container environment.`,
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

    console.log(`[GENERATE-BOT-CODE HYBRID] Bot ${botId} generation completed successfully`);

    return new Response(JSON.stringify({
      success: true,
      botCode: codeResult,
      storage: storageResult,
      files: {
        'main.py': codeResult.code
      },
      storage_method: 'hybrid_supabase_modal',
      architecture: 'hybrid',
      message: `Bot generated with hybrid architecture! Files stored in Supabase, execution in Modal.`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[GENERATE-BOT-CODE HYBRID] Critical Error:', error);
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

async function storeFilesInSupabaseStorage(botId: string, userId: string, botCode: string, token: string, botName: string) {
  console.log(`[GENERATE-BOT-CODE HYBRID STORAGE] === Storing bot ${botId} in Supabase Storage ===`);
  
  try {
    // Create bot directory structure in Supabase Storage
    const botPath = `bots/${userId}/${botId}`;
    
    // Prepare all bot files
    const files = {
      'main.py': botCode,
      'requirements.txt': 'python-telegram-bot>=20.0\nrequests>=2.28.0\npython-dotenv>=1.0.0',
      '.env': `BOT_TOKEN=${token}\nBOT_NAME=${botName || `Bot ${botId}`}`,
      'metadata.json': JSON.stringify({
        bot_id: botId,
        user_id: userId,
        bot_name: botName,
        created_at: new Date().toISOString(),
        storage_method: 'hybrid_supabase_modal',
        architecture: 'hybrid',
        description: 'Files stored in Supabase, executed in Modal'
      }, null, 2),
      'Dockerfile': `FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

CMD ["python", "main.py"]`
    };

    // Store all files in Supabase Storage
    const uploadResults = [];
    for (const [filename, content] of Object.entries(files)) {
      const { data, error } = await supabase.storage
        .from('bot-files')
        .upload(`${botPath}/${filename}`, content, {
          contentType: 'text/plain',
          upsert: true
        });

      if (error) {
        console.error(`[GENERATE-BOT-CODE HYBRID STORAGE] Failed to upload ${filename}:`, error);
        uploadResults.push({ filename, success: false, error: error.message });
      } else {
        console.log(`[GENERATE-BOT-CODE HYBRID STORAGE] Successfully uploaded ${filename}`);
        uploadResults.push({ filename, success: true, path: data.path });
      }
    }

    // Check if all files were uploaded successfully
    const failedUploads = uploadResults.filter(result => !result.success);
    if (failedUploads.length > 0) {
      console.error(`[GENERATE-BOT-CODE HYBRID STORAGE] Some files failed to upload:`, failedUploads);
      return {
        success: false,
        error: `Failed to upload files: ${failedUploads.map(f => f.filename).join(', ')}`,
        method: 'hybrid_supabase_modal_failed'
      };
    }

    console.log(`[GENERATE-BOT-CODE HYBRID STORAGE] All files stored successfully in Supabase Storage`);

    return {
      success: true,
      method: 'hybrid_supabase_modal',
      architecture: 'hybrid',
      details: 'Successfully stored all files in Supabase Storage for Modal execution',
      path: botPath,
      files: Object.keys(files),
      uploadResults
    };

  } catch (error) {
    console.error(`[GENERATE-BOT-CODE HYBRID STORAGE] Storage error:`, error);
    return {
      success: false,
      error: error.message,
      method: 'hybrid_supabase_modal_failed'
    };
  }
}

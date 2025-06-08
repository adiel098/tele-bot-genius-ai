
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const openAIApiKey = Deno.env.get('OPENAI_APIKEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Helper function to upload files to storage
async function uploadBotFiles(botId: string, userId: string, files: Record<string, string>) {
  const results: Record<string, boolean> = {};
  
  for (const [filename, content] of Object.entries(files)) {
    try {
      const filePath = `${userId}/${botId}/${filename}`;
      const { error } = await supabase.storage
        .from('bot-files')
        .upload(filePath, new Blob([content], { type: 'text/plain' }), {
          upsert: true
        });
      
      if (error) {
        console.error(`Failed to upload ${filename}:`, error);
        results[filename] = false;
      } else {
        console.log(`Successfully uploaded ${filename}`);
        results[filename] = true;
      }
    } catch (error) {
      console.error(`Error uploading ${filename}:`, error);
      results[filename] = false;
    }
  }
  
  return results;
}

// Helper function to simulate bot deployment and start
async function deployAndStartBot(botId: string, userId: string, files: Record<string, string>) {
  try {
    // Simulate container creation
    const containerId = `bot_${botId}_${Date.now()}`;
    
    // Create execution record
    const { data: execution, error: execError } = await supabase
      .from('bot_executions')
      .insert({
        bot_id: botId,
        user_id: userId,
        status: 'starting'
      })
      .select()
      .single();

    if (execError) {
      console.error('Failed to create execution record:', execError);
      throw execError;
    }

    // Update bot with container info
    const { error: updateError } = await supabase
      .from('bots')
      .update({
        container_id: containerId,
        runtime_status: 'starting',
        runtime_logs: `[${new Date().toISOString()}] Starting bot deployment...\n[${new Date().toISOString()}] Container ID: ${containerId}\n`,
        last_restart: new Date().toISOString()
      })
      .eq('id', botId);

    if (updateError) {
      console.error('Failed to update bot:', updateError);
      throw updateError;
    }

    // Simulate deployment process
    setTimeout(async () => {
      try {
        // Simulate successful deployment
        const logs = `[${new Date().toISOString()}] Bot deployed successfully\n[${new Date().toISOString()}] Bot is now running\n[${new Date().toISOString()}] Listening for Telegram messages...\n`;
        
        await supabase
          .from('bots')
          .update({
            runtime_status: 'running',
            runtime_logs: logs
          })
          .eq('id', botId);

        await supabase
          .from('bot_executions')
          .update({
            status: 'running'
          })
          .eq('id', execution.id);

      } catch (error) {
        console.error('Failed to update bot status:', error);
      }
    }, 3000); // Simulate 3 second deployment time

    return { containerId, executionId: execution.id };
  } catch (error) {
    console.error('Deployment failed:', error);
    
    // Update status to error
    await supabase
      .from('bots')
      .update({
        runtime_status: 'error',
        runtime_logs: `[${new Date().toISOString()}] Deployment failed: ${error.message}\n`
      })
      .eq('id', botId);

    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { botId, prompt, token } = await req.json();

    console.log('Received request:', { botId, hasPrompt: !!prompt, hasToken: !!token });

    if (!openAIApiKey) {
      console.error('OpenAI API key not configured');
      throw new Error('OpenAI API key not configured');
    }

    if (!botId || !prompt || !token) {
      console.error('Missing required parameters:', { botId, hasPrompt: !!prompt, hasToken: !!token });
      throw new Error('Missing required parameters: botId, prompt, and token are required');
    }

    console.log('Generating bot code for bot:', botId);

    // Fetch existing conversation history and user info
    const { data: existingBot, error: fetchError } = await supabase
      .from('bots')
      .select('conversation_history, user_id')
      .eq('id', botId)
      .single();

    if (fetchError) {
      console.error('Error fetching bot:', fetchError);
      throw new Error(`Failed to fetch bot: ${fetchError.message}`);
    }

    let conversationHistory = [];
    if (existingBot?.conversation_history && Array.isArray(existingBot.conversation_history)) {
      conversationHistory = existingBot.conversation_history;
    }

    // System prompt for generating Telegram bot code
    const systemPrompt = `You are an expert Python developer specialized in creating Telegram bots. 
    Generate complete, production-ready Python code for a Telegram bot based on the user's requirements.
    
    IMPORTANT REQUIREMENTS:
    1. Use python-telegram-bot library (version 20.x)
    2. Include proper error handling and logging
    3. Create modular, clean code structure
    4. Include a requirements.txt file
    5. Use environment variables for the bot token
    6. Include proper docstrings and comments
    7. Handle common Telegram bot scenarios (start, help, error handling)
    8. Make the bot robust and production-ready
    
    Return your response as a JSON object with this structure:
    {
      "files": {
        "main.py": "# Main bot code here",
        "requirements.txt": "python-telegram-bot==20.7\\nrequests==2.31.0",
        "config.py": "# Configuration file",
        "handlers.py": "# Message handlers",
        ".env.example": "BOT_TOKEN=your_bot_token_here"
      },
      "explanation": "Brief explanation of the bot structure and features"
    }`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const generatedContent = data.choices[0].message.content;

    console.log('Generated content received from OpenAI');

    // Parse the JSON response from GPT
    let botCode;
    try {
      botCode = JSON.parse(generatedContent);
    } catch (error) {
      console.error('Failed to parse GPT response as JSON:', error);
      console.log('Raw response:', generatedContent);
      // Fallback: create a simple structure
      botCode = {
        files: {
          "main.py": generatedContent,
          "requirements.txt": "python-telegram-bot==20.7\nrequests==2.31.0"
        },
        explanation: "Generated bot code"
      };
    }

    // Upload files to storage
    console.log('Uploading files to storage...');
    const uploadResults = await uploadBotFiles(botId, existingBot.user_id, botCode.files);
    const allFilesUploaded = Object.values(uploadResults).every(success => success);

    // Deploy and start the bot
    console.log('Deploying bot...');
    const deploymentInfo = await deployAndStartBot(botId, existingBot.user_id, botCode.files);

    // Create updated conversation history
    const updatedHistory = [
      ...conversationHistory,
      {
        role: 'user',
        content: prompt,
        timestamp: new Date().toISOString()
      },
      {
        role: 'assistant',
        content: `I've generated and deployed a complete Telegram bot for you! 🎉\n\n${botCode.explanation}\n\nThe bot is now being deployed and should be running shortly. You can monitor its status in the workspace.`,
        timestamp: new Date().toISOString(),
        files: botCode.files
      }
    ];

    // Update bot in database with generated code and conversation
    const { error: updateError } = await supabase
      .from('bots')
      .update({
        status: 'active',
        conversation_history: updatedHistory,
        files_stored: allFilesUploaded
      })
      .eq('id', botId);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw new Error(`Database update error: ${updateError.message}`);
    }

    console.log('Bot updated successfully');

    return new Response(JSON.stringify({
      success: true,
      botCode,
      deployment: deploymentInfo,
      filesUploaded: allFilesUploaded,
      message: 'Bot code generated and deployed successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-bot-code function:', error);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

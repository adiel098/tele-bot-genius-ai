
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateBotCode } from './openai.ts';
import { uploadBotFiles } from './storage.ts';
import { deployAndStartBot } from './deployment.ts';
import { getBotData, updateBotWithResults } from './database.ts';
import type { ConversationMessage } from './types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { botId, prompt, token } = await req.json();

    console.log('=== GENERATE BOT CODE PROCESS START ===');
    console.log('Received request:', { botId, hasPrompt: !!prompt, hasToken: !!token });

    if (!botId || !prompt || !token) {
      console.error('Missing required parameters:', { botId, hasPrompt: !!prompt, hasToken: !!token });
      throw new Error('Missing required parameters: botId, prompt, and token are required');
    }

    console.log('Step 1: Generating bot code for bot:', botId);

    // Fetch existing conversation history and user info
    const existingBot = await getBotData(botId);

    let conversationHistory: ConversationMessage[] = [];
    if (existingBot?.conversation_history && Array.isArray(existingBot.conversation_history)) {
      conversationHistory = existingBot.conversation_history;
    }

    // Generate bot code using OpenAI with the bot token and conversation history
    const botCode = await generateBotCode(prompt, token, conversationHistory);

    console.log('Step 2: Uploading files to storage...');
    // Upload files to storage (this will overwrite existing files)
    const uploadResults = await uploadBotFiles(botId, existingBot.user_id, botCode.files);
    const allFilesUploaded = Object.values(uploadResults).every(success => success);

    console.log('Step 3: Deploying and starting bot...');
    // Deploy and start the bot with new code - THIS IS THE KEY CHANGE
    const deploymentInfo = await deployAndStartBot(botId, existingBot.user_id, botCode.files);

    // Create updated conversation history
    const updatedHistory: ConversationMessage[] = [
      ...conversationHistory,
      {
        role: 'user',
        content: prompt,
        timestamp: new Date().toISOString()
      },
      {
        role: 'assistant',
        content: `I've ${conversationHistory.length > 0 ? 'updated and redeployed' : 'created and deployed'} your Telegram bot! 🚀\n\n${botCode.explanation}\n\nThe bot has been automatically ${deploymentInfo.started ? 'started and is now running' : 'deployed but failed to start automatically'}. You can monitor its status in the workspace.`,
        timestamp: new Date().toISOString(),
        files: botCode.files
      }
    ];

    // Update bot in database with generated code and conversation
    await updateBotWithResults(botId, updatedHistory, allFilesUploaded);

    console.log('=== PROCESS COMPLETE ===');
    console.log('Bot created/updated successfully');
    console.log('Deployment info:', deploymentInfo);

    return new Response(JSON.stringify({
      success: true,
      botCode,
      deployment: deploymentInfo,
      filesUploaded: allFilesUploaded,
      message: `Bot code generated, deployed ${deploymentInfo.started ? 'and started' : '(start failed)'} successfully`
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

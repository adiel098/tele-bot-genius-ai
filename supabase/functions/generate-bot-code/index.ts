
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

    // Fetch existing conversation history
    const { data: existingBot, error: fetchError } = await supabase
      .from('bots')
      .select('conversation_history')
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
        content: `I've generated a complete Telegram bot for you! Here's what I created:\n\n${botCode.explanation}`,
        timestamp: new Date().toISOString(),
        files: botCode.files
      }
    ];

    // Update bot in database with generated code and conversation
    const { error: updateError } = await supabase
      .from('bots')
      .update({
        status: 'active',
        conversation_history: updatedHistory
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
      message: 'Bot code generated successfully'
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

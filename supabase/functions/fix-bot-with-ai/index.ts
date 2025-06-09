
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOCAL_BOT_SERVER_URL = Deno.env.get('LOCAL_BOT_SERVER_URL') || 'http://localhost:3000';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { botId, errorLogs, userId } = await req.json();

    console.log('Fix bot request:', { botId, userId, hasErrorLogs: !!errorLogs });

    // Get bot data and current code
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('*')
      .eq('id', botId)
      .eq('user_id', userId)
      .single();

    if (botError || !bot) {
      throw new Error('Bot not found');
    }

    // Get current bot files
    const { data: files } = await supabase.storage
      .from('bot-files')
      .list(`${userId}/${botId}`);

    let currentCode = '';
    if (files && files.length > 0) {
      const mainFile = files.find(f => f.name === 'main.py');
      if (mainFile) {
        const { data: fileData } = await supabase.storage
          .from('bot-files')
          .download(`${userId}/${botId}/main.py`);
        
        if (fileData) {
          currentCode = await fileData.text();
        }
      }
    }

    // Create AI prompt to fix the bot
    const fixPrompt = `You are a Python Telegram bot expert. A user's bot has encountered errors and needs to be fixed.

CURRENT BOT CODE:
\`\`\`python
${currentCode}
\`\`\`

ERROR LOGS:
\`\`\`
${errorLogs}
\`\`\`

Common issues to check for:
1. python-telegram-bot v20+ uses \`from telegram.constants import ParseMode\` instead of \`from telegram import ParseMode\`
2. Make sure all imports are correct for the latest version
3. Check for syntax errors and typos
4. Ensure proper async/await usage
5. Fix any deprecated method calls

Please provide the corrected Python code that fixes these errors. Return ONLY the corrected Python code, no explanations or markdown formatting.`;

    // Call OpenAI to fix the code
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a Python expert specializing in Telegram bots. Fix the provided code to resolve the errors.' },
          { role: 'user', content: fixPrompt }
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    let fixedCode = aiResponse.choices[0].message.content.trim();

    // Clean up the response (remove markdown if present)
    if (fixedCode.startsWith('```python')) {
      fixedCode = fixedCode.replace(/^```python\n/, '').replace(/\n```$/, '');
    } else if (fixedCode.startsWith('```')) {
      fixedCode = fixedCode.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    console.log('AI generated fixed code, length:', fixedCode.length);

    // Update the bot files in storage
    await supabase.storage
      .from('bot-files')
      .update(`${userId}/${botId}/main.py`, fixedCode, {
        contentType: 'text/plain'
      });

    // Send the fixed code to the local bot server
    const updateResponse = await fetch(`${LOCAL_BOT_SERVER_URL}/update_bot_code`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify({
        botId: botId,
        newCode: fixedCode,
        token: bot.token
      })
    });

    const updateResult = await updateResponse.json();

    if (updateResult.success) {
      // Update bot status and logs
      await supabase
        .from('bots')
        .update({
          runtime_status: 'running',
          runtime_logs: `Bot fixed by AI and restarted successfully!\n\nFixed issues:\n${errorLogs}\n\nBot is now running with corrected code.`
        })
        .eq('id', botId);

      console.log('Bot fixed and restarted successfully');

      return new Response(JSON.stringify({
        success: true,
        message: 'Bot fixed by AI and restarted successfully!',
        fixedCode: fixedCode
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      throw new Error(updateResult.error || 'Failed to update bot code');
    }

  } catch (error) {
    console.error('Error fixing bot:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

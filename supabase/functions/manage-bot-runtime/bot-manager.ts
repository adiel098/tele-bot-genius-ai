
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { startTelegramBot, stopTelegramBot, getBotLogs } from './bot-executor.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function startBot(botId: string, userId: string) {
  try {
    console.log(`Starting bot process for ${botId}`);
    
    // Get bot data and files with longer timeout
    const botPromise = supabase
      .from('bots')
      .select('*')
      .eq('id', botId)
      .single();

    const { data: bot, error: botError } = await Promise.race([
      botPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Bot fetch timeout')), 8000)
      )
    ]) as any;

    if (botError || !bot) {
      throw new Error('Bot not found or fetch timeout');
    }

    console.log(`Bot found: ${bot.name}, validating token...`);

    // Validate bot token format before proceeding
    if (!bot.token || !bot.token.match(/^\d+:[A-Za-z0-9_-]+$/)) {
      throw new Error('Invalid bot token format');
    }

    // Get bot files from storage with timeout
    const filesPromise = supabase.storage
      .from('bot-files')
      .list(`${userId}/${botId}`);

    const { data: filesList, error: filesError } = await Promise.race([
      filesPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Files list timeout')), 8000)
      )
    ]) as any;

    if (filesError) {
      console.error('Failed to list bot files:', filesError);
      throw new Error('Failed to retrieve bot files');
    }

    // Get main.py content with timeout
    const mainFilePromise = supabase.storage
      .from('bot-files')
      .download(`${userId}/${botId}/main.py`);

    const { data: mainFileData, error: mainFileError } = await Promise.race([
      mainFilePromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Main file download timeout')), 8000)
      )
    ]) as any;

    if (mainFileError || !mainFileData) {
      throw new Error('Bot main.py file not found');
    }

    const botCode = await mainFileData.text();
    console.log(`Bot code loaded, length: ${botCode.length}`);

    // Create new execution record (non-blocking)
    const executionPromise = supabase
      .from('bot_executions')
      .insert({
        bot_id: botId,
        user_id: userId,
        status: 'starting'
      })
      .select()
      .single();

    // Update bot status to starting (non-blocking)
    const statusUpdatePromise = supabase
      .from('bots')
      .update({
        runtime_status: 'starting',
        runtime_logs: `[${new Date().toISOString()}] Starting Telegram bot...\n[${new Date().toISOString()}] Validating bot token...\n`,
        last_restart: new Date().toISOString()
      })
      .eq('id', botId);

    // Wait for both operations with timeout
    const [{ data: execution, error: execError }] = await Promise.race([
      Promise.all([executionPromise, statusUpdatePromise]),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database operations timeout')), 8000)
      )
    ]) as any;

    if (execError) {
      console.error('Failed to create execution record:', execError);
      throw execError;
    }

    console.log(`Starting actual Telegram bot for ${botId}`);

    // Start the actual Telegram bot with longer timeout
    const botStartPromise = startTelegramBot(botId, bot.token, botCode);
    const result = await Promise.race([
      botStartPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Bot start timeout - Check if token is valid or if there are network issues')), 30000)
      )
    ]) as any;
    
    const logsText = result.logs.join('\n') + '\n';
    
    if (result.success) {
      // Update bot status to running (fire and forget)
      supabase
        .from('bots')
        .update({
          runtime_status: 'running',
          runtime_logs: logsText,
          container_id: `telegram-bot-${botId}`
        })
        .eq('id', botId)
        .then(() => console.log(`Bot ${botId} marked as running`))
        .catch(e => console.error(`Failed to update bot status:`, e));

      supabase
        .from('bot_executions')
        .update({
          status: 'running'
        })
        .eq('id', execution.id)
        .then(() => console.log(`Execution ${execution.id} marked as running`))
        .catch(e => console.error(`Failed to update execution:`, e));

      return { success: true, executionId: execution.id, logs: result.logs };
    } else {
      // Update bot status to error (fire and forget)
      supabase
        .from('bots')
        .update({
          runtime_status: 'error',
          runtime_logs: logsText
        })
        .eq('id', botId)
        .then(() => console.log(`Bot ${botId} marked as error`))
        .catch(e => console.error(`Failed to update bot error status:`, e));

      throw new Error(result.logs.join('\n'));
    }

  } catch (error) {
    console.error('Failed to start bot:', error);
    
    // Update bot status to error (fire and forget)
    supabase
      .from('bots')
      .update({
        runtime_status: 'error',
        runtime_logs: `[${new Date().toISOString()}] Failed to start: ${error.message}\n[${new Date().toISOString()}] Common causes: Invalid bot token, network issues, or code errors\n`
      })
      .eq('id', botId)
      .then(() => console.log(`Bot ${botId} marked as error due to failure`))
      .catch(e => console.error(`Failed to update bot error status:`, e));

    throw error;
  }
}

export async function stopBot(botId: string) {
  try {
    console.log(`Stopping bot ${botId}`);

    // Get current execution with timeout
    const executionPromise = supabase
      .from('bot_executions')
      .select('id')
      .eq('bot_id', botId)
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const { data: execution } = await Promise.race([
      executionPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Execution fetch timeout')), 3000)
      )
    ]) as any;

    // Stop the bot
    const result = stopTelegramBot(botId);
    const logsText = result.logs.join('\n') + '\n';
    
    // Update bot status (fire and forget)
    supabase
      .from('bots')
      .update({
        runtime_status: 'stopped',
        runtime_logs: logsText,
        container_id: null
      })
      .eq('id', botId)
      .then(() => console.log(`Bot ${botId} marked as stopped`))
      .catch(e => console.error(`Failed to update bot stop status:`, e));

    // Update execution record (fire and forget)
    if (execution) {
      supabase
        .from('bot_executions')
        .update({
          status: 'stopped',
          stopped_at: new Date().toISOString(),
          exit_code: 0
        })
        .eq('id', execution.id)
        .then(() => console.log(`Execution ${execution.id} marked as stopped`))
        .catch(e => console.error(`Failed to update execution stop:`, e));
    }

    return { stopped: true, logs: result.logs };

  } catch (error) {
    console.error('Failed to stop bot:', error);
    const errorLogs = `[${new Date().toISOString()}] Error stopping bot: ${error.message}\n`;
    
    // Update bot status to error (fire and forget)
    supabase
      .from('bots')
      .update({
        runtime_status: 'error',
        runtime_logs: errorLogs
      })
      .eq('id', botId)
      .then(() => console.log(`Bot ${botId} marked as error during stop`))
      .catch(e => console.error(`Failed to update bot error status:`, e));
    
    throw error;
  }
}

export async function restartBot(botId: string, userId: string) {
  console.log(`Restarting bot ${botId}`);
  await stopBot(botId);
  // Small delay before restart
  await new Promise(resolve => setTimeout(resolve, 1000));
  return await startBot(botId, userId);
}

export async function streamLogs(botId: string) {
  try {
    const logs = getBotLogs(botId);
    const logsText = logs.join('\n') + '\n';
    
    // Update logs (fire and forget)
    supabase
      .from('bots')
      .update({
        runtime_logs: logsText
      })
      .eq('id', botId)
      .then(() => console.log(`Logs updated for bot ${botId}`))
      .catch(e => console.error(`Failed to update logs:`, e));

    return { logs: logsText };
  } catch (error) {
    console.error('Failed to stream logs:', error);
    return { error: error.message };
  }
}

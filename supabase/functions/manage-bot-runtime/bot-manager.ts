
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { startTelegramBot, stopTelegramBot, getBotLogs } from './bot-executor.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function startBot(botId: string, userId: string) {
  const startTime = Date.now();
  
  try {
    console.log(`[${new Date().toISOString()}] ========== START BOT REQUEST ==========`);
    console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);
    console.log(`[${new Date().toISOString()}] User ID: ${userId}`);
    console.log(`[${new Date().toISOString()}] Timestamp: ${new Date().toISOString()}`);
    
    // Get bot data and files with longer timeout
    console.log(`[${new Date().toISOString()}] Fetching bot data from database...`);
    const botPromise = supabase
      .from('bots')
      .select('*')
      .eq('id', botId)
      .single();

    const { data: bot, error: botError } = await Promise.race([
      botPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Bot fetch timeout after 8 seconds')), 8000)
      )
    ]) as any;

    if (botError || !bot) {
      console.error(`[${new Date().toISOString()}] ERROR: Failed to fetch bot data:`, botError);
      throw new Error('Bot not found or fetch timeout');
    }

    console.log(`[${new Date().toISOString()}] ✓ Bot data fetched successfully`);
    console.log(`[${new Date().toISOString()}] Bot name: ${bot.name}`);
    console.log(`[${new Date().toISOString()}] Bot status: ${bot.runtime_status}`);
    console.log(`[${new Date().toISOString()}] Has token: ${bot.token ? 'YES' : 'NO'}`);
    console.log(`[${new Date().toISOString()}] Token preview: ${bot.token ? bot.token.substring(0, 15) + '...' : 'None'}`);

    // Validate bot token format before proceeding
    if (!bot.token || !bot.token.match(/^\d+:[A-Za-z0-9_-]+$/)) {
      console.error(`[${new Date().toISOString()}] ERROR: Invalid bot token format`);
      throw new Error('Invalid bot token format');
    }
    console.log(`[${new Date().toISOString()}] ✓ Token format validation passed`);

    // Get bot files from storage with timeout
    console.log(`[${new Date().toISOString()}] Fetching bot files from storage...`);
    console.log(`[${new Date().toISOString()}] Storage path: ${userId}/${botId}`);
    
    const filesPromise = supabase.storage
      .from('bot-files')
      .list(`${userId}/${botId}`);

    const { data: filesList, error: filesError } = await Promise.race([
      filesPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Files list timeout after 8 seconds')), 8000)
      )
    ]) as any;

    if (filesError) {
      console.error(`[${new Date().toISOString()}] ERROR: Failed to list bot files:`, filesError);
      throw new Error('Failed to retrieve bot files');
    }

    console.log(`[${new Date().toISOString()}] ✓ Files list retrieved`);
    console.log(`[${new Date().toISOString()}] Files found: ${filesList?.length || 0}`);
    if (filesList && filesList.length > 0) {
      filesList.forEach((file: any) => {
        console.log(`[${new Date().toISOString()}] - ${file.name} (${file.metadata?.size || 'unknown size'})`);
      });
    }

    // Get main.py content with timeout
    console.log(`[${new Date().toISOString()}] Downloading main.py file...`);
    const mainFilePromise = supabase.storage
      .from('bot-files')
      .download(`${userId}/${botId}/main.py`);

    const { data: mainFileData, error: mainFileError } = await Promise.race([
      mainFilePromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Main file download timeout after 8 seconds')), 8000)
      )
    ]) as any;

    if (mainFileError || !mainFileData) {
      console.error(`[${new Date().toISOString()}] ERROR: Failed to download main.py:`, mainFileError);
      throw new Error('Bot main.py file not found');
    }

    const botCode = await mainFileData.text();
    console.log(`[${new Date().toISOString()}] ✓ Bot code loaded from main.py`);
    console.log(`[${new Date().toISOString()}] Code length: ${botCode.length} characters`);
    console.log(`[${new Date().toISOString()}] Code preview (first 200 chars): ${botCode.substring(0, 200)}...`);

    // Create new execution record (non-blocking)
    console.log(`[${new Date().toISOString()}] Creating execution record...`);
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
    const initialLogs = `[${new Date().toISOString()}] Starting Telegram bot...\n[${new Date().toISOString()}] Validating bot token...\n[${new Date().toISOString()}] Preparing bot runtime environment...\n`;
    const statusUpdatePromise = supabase
      .from('bots')
      .update({
        runtime_status: 'starting',
        runtime_logs: initialLogs,
        last_restart: new Date().toISOString()
      })
      .eq('id', botId);

    // Wait for both operations with timeout
    console.log(`[${new Date().toISOString()}] Updating database records...`);
    const [{ data: execution, error: execError }] = await Promise.race([
      Promise.all([executionPromise, statusUpdatePromise]),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database operations timeout after 8 seconds')), 8000)
      )
    ]) as any;

    if (execError) {
      console.error(`[${new Date().toISOString()}] ERROR: Failed to create execution record:`, execError);
      throw execError;
    }

    console.log(`[${new Date().toISOString()}] ✓ Database records updated`);
    console.log(`[${new Date().toISOString()}] Execution ID: ${execution?.id}`);

    console.log(`[${new Date().toISOString()}] ========== STARTING TELEGRAM BOT ==========`);

    // Start the actual Telegram bot with longer timeout
    const botStartPromise = startTelegramBot(botId, bot.token, botCode);
    const result = await Promise.race([
      botStartPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Bot start timeout after 30 seconds - Check if token is valid or if there are network issues')), 30000)
      )
    ]) as any;
    
    const logsText = result.logs.join('\n') + '\n';
    const duration = Date.now() - startTime;
    
    console.log(`[${new Date().toISOString()}] Bot start operation completed in ${duration}ms`);
    console.log(`[${new Date().toISOString()}] Success: ${result.success}`);
    console.log(`[${new Date().toISOString()}] Error type: ${result.errorType || 'None'}`);
    console.log(`[${new Date().toISOString()}] Logs length: ${logsText.length} characters`);
    
    if (result.success) {
      console.log(`[${new Date().toISOString()}] ✓ Bot started successfully - updating status to running`);
      
      // Update bot status to running (fire and forget)
      supabase
        .from('bots')
        .update({
          runtime_status: 'running',
          runtime_logs: logsText,
          container_id: `telegram-bot-${botId}`
        })
        .eq('id', botId)
        .then(() => console.log(`[${new Date().toISOString()}] ✓ Bot ${botId} marked as running in database`))
        .catch(e => console.error(`[${new Date().toISOString()}] ERROR: Failed to update bot status:`, e));

      supabase
        .from('bot_executions')
        .update({
          status: 'running'
        })
        .eq('id', execution.id)
        .then(() => console.log(`[${new Date().toISOString()}] ✓ Execution ${execution.id} marked as running`))
        .catch(e => console.error(`[${new Date().toISOString()}] ERROR: Failed to update execution:`, e));

      console.log(`[${new Date().toISOString()}] ========== BOT START SUCCESS ==========`);
      return { success: true, executionId: execution.id, logs: result.logs };
    } else {
      console.log(`[${new Date().toISOString()}] ✗ Bot failed to start - updating status to error`);
      console.log(`[${new Date().toISOString()}] Error: ${result.error}`);
      
      // Update bot status to error (fire and forget)
      supabase
        .from('bots')
        .update({
          runtime_status: 'error',
          runtime_logs: logsText,
          error_type: result.errorType
        })
        .eq('id', botId)
        .then(() => console.log(`[${new Date().toISOString()}] Bot ${botId} marked as error in database`))
        .catch(e => console.error(`[${new Date().toISOString()}] ERROR: Failed to update bot error status:`, e));

      console.log(`[${new Date().toISOString()}] ========== BOT START FAILURE ==========`);
      throw new Error(result.logs.join('\n'));
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] ========== BOT START EXCEPTION ==========`);
    console.error(`[${new Date().toISOString()}] Failed to start bot after ${duration}ms:`, error);
    console.error(`[${new Date().toISOString()}] Error message: ${error.message}`);
    console.error(`[${new Date().toISOString()}] Error stack: ${error.stack || 'No stack trace'}`);
    
    // Update bot status to error (fire and forget)
    const errorLogs = `[${new Date().toISOString()}] Failed to start: ${error.message}\n[${new Date().toISOString()}] Common causes: Invalid bot token, network issues, or code errors\n[${new Date().toISOString()}] Duration: ${duration}ms\n`;
    supabase
      .from('bots')
      .update({
        runtime_status: 'error',
        runtime_logs: errorLogs
      })
      .eq('id', botId)
      .then(() => console.log(`[${new Date().toISOString()}] Bot ${botId} marked as error due to failure`))
      .catch(e => console.error(`[${new Date().toISOString()}] ERROR: Failed to update bot error status:`, e));

    throw error;
  }
}

export async function stopBot(botId: string) {
  const startTime = Date.now();
  
  try {
    console.log(`[${new Date().toISOString()}] ========== STOP BOT REQUEST ==========`);
    console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);

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
        setTimeout(() => reject(new Error('Execution fetch timeout after 3 seconds')), 3000)
      )
    ]) as any;

    if (execution) {
      console.log(`[${new Date().toISOString()}] Found running execution: ${execution.id}`);
    } else {
      console.log(`[${new Date().toISOString()}] No running execution found`);
    }

    // Stop the bot
    console.log(`[${new Date().toISOString()}] Calling stopTelegramBot...`);
    const result = stopTelegramBot(botId);
    const logsText = result.logs.join('\n') + '\n';
    const duration = Date.now() - startTime;
    
    console.log(`[${new Date().toISOString()}] Stop operation completed in ${duration}ms`);
    console.log(`[${new Date().toISOString()}] Success: ${result.success}`);
    
    // Update bot status (fire and forget)
    supabase
      .from('bots')
      .update({
        runtime_status: 'stopped',
        runtime_logs: logsText,
        container_id: null
      })
      .eq('id', botId)
      .then(() => console.log(`[${new Date().toISOString()}] ✓ Bot ${botId} marked as stopped in database`))
      .catch(e => console.error(`[${new Date().toISOString()}] ERROR: Failed to update bot stop status:`, e));

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
        .then(() => console.log(`[${new Date().toISOString()}] ✓ Execution ${execution.id} marked as stopped`))
        .catch(e => console.error(`[${new Date().toISOString()}] ERROR: Failed to update execution stop:`, e));
    }

    console.log(`[${new Date().toISOString()}] ========== BOT STOP SUCCESS ==========`);
    return { stopped: true, logs: result.logs };

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] ========== BOT STOP ERROR ==========`);
    console.error(`[${new Date().toISOString()}] Failed to stop bot after ${duration}ms:`, error);
    
    const errorLogs = `[${new Date().toISOString()}] Error stopping bot: ${error.message}\n[${new Date().toISOString()}] Duration: ${duration}ms\n`;
    
    // Update bot status to error (fire and forget)
    supabase
      .from('bots')
      .update({
        runtime_status: 'error',
        runtime_logs: errorLogs
      })
      .eq('id', botId)
      .then(() => console.log(`[${new Date().toISOString()}] Bot ${botId} marked as error during stop`))
      .catch(e => console.error(`[${new Date().toISOString()}] ERROR: Failed to update bot error status:`, e));
    
    throw error;
  }
}

export async function restartBot(botId: string, userId: string) {
  console.log(`[${new Date().toISOString()}] ========== RESTART BOT REQUEST ==========`);
  console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);
  console.log(`[${new Date().toISOString()}] User ID: ${userId}`);
  
  await stopBot(botId);
  console.log(`[${new Date().toISOString()}] Stop phase completed, waiting 1 second...`);
  
  // Small delay before restart
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log(`[${new Date().toISOString()}] Starting restart phase...`);
  return await startBot(botId, userId);
}

export async function streamLogs(botId: string) {
  const startTime = Date.now();
  
  try {
    console.log(`[${new Date().toISOString()}] ========== LOGS REQUEST ==========`);
    console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);
    
    const logs = getBotLogs(botId);
    const logsText = logs.join('\n') + '\n';
    const duration = Date.now() - startTime;
    
    console.log(`[${new Date().toISOString()}] Logs retrieved in ${duration}ms`);
    console.log(`[${new Date().toISOString()}] Logs length: ${logsText.length} characters`);
    
    // Update logs (fire and forget)
    supabase
      .from('bots')
      .update({
        runtime_logs: logsText
      })
      .eq('id', botId)
      .then(() => console.log(`[${new Date().toISOString()}] ✓ Logs updated for bot ${botId}`))
      .catch(e => console.error(`[${new Date().toISOString()}] ERROR: Failed to update logs:`, e));

    console.log(`[${new Date().toISOString()}] ========== LOGS SUCCESS ==========`);
    return { logs: logsText };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] ========== LOGS ERROR ==========`);
    console.error(`[${new Date().toISOString()}] Failed to stream logs after ${duration}ms:`, error);
    return { error: error.message };
  }
}

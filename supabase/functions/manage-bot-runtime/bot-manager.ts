
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { startTelegramBot, stopTelegramBot, getBotLogs } from './bot-executor.ts';
import { ProcessManager } from './process-manager.ts';
import { BotLogger } from './logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function startBot(botId: string, userId: string): Promise<{ success: boolean; logs: string[]; containerId?: string }> {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] ========== START BOT REQUEST ==========`);
  console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);
  console.log(`[${new Date().toISOString()}] User ID: ${userId}`);
  
  try {
    // Get bot data
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('*')
      .eq('id', botId)
      .eq('user_id', userId)
      .single();

    if (botError || !bot) {
      console.error(`[${new Date().toISOString()}] Bot not found or access denied`);
      throw new Error('Bot not found or access denied');
    }

    console.log(`[${new Date().toISOString()}] Bot found: ${bot.name}`);
    console.log(`[${new Date().toISOString()}] Token available: ${bot.telegram_token ? 'YES' : 'NO'}`);

    // Get latest files
    const { data: files } = await supabase.storage
      .from('bot-files')
      .list(`${userId}/${botId}`);

    let mainCode = '';
    if (files && files.length > 0) {
      // Look for main.py or bot.py
      const mainFile = files.find(f => f.name === 'main.py' || f.name === 'bot.py') || files[0];
      
      const { data: fileData } = await supabase.storage
        .from('bot-files')
        .download(`${userId}/${botId}/${mainFile.name}`);

      if (fileData) {
        mainCode = await fileData.text();
        console.log(`[${new Date().toISOString()}] Loaded code from: ${mainFile.name}`);
      }
    }

    if (!mainCode) {
      console.error(`[${new Date().toISOString()}] No code found for bot`);
      throw new Error('No code found for bot');
    }

    console.log(`[${new Date().toISOString()}] Calling startTelegramBot...`);
    
    // Start the bot using Docker containers
    const result = await startTelegramBot(botId, bot.telegram_token, mainCode);
    
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ========== BOT START COMPLETED ==========`);
    console.log(`[${new Date().toISOString()}] Duration: ${duration}ms`);
    console.log(`[${new Date().toISOString()}] Success: ${result.success}`);

    if (result.success) {
      // Update bot status
      await supabase
        .from('bots')
        .update({
          runtime_status: 'running',
          runtime_logs: (result.logs || []).join('\n'),
          last_restart: new Date().toISOString(),
          container_id: result.containerId
        })
        .eq('id', botId);

      // Create execution record
      await supabase
        .from('bot_executions')
        .insert({
          bot_id: botId,
          user_id: userId,
          status: 'running',
          logs: (result.logs || []).join('\n'),
          started_at: new Date().toISOString()
        });

      console.log(`[${new Date().toISOString()}] Bot marked as running`);
    } else {
      // Update bot status to error
      await supabase
        .from('bots')
        .update({
          runtime_status: 'error',
          runtime_logs: (result.logs || []).join('\n')
        })
        .eq('id', botId);

      console.log(`[${new Date().toISOString()}] Bot marked as error`);
    }

    return result;

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] ========== BOT START ERROR ==========`);
    console.error(`[${new Date().toISOString()}] Failed to start bot after ${duration}ms: ${error.message}`);
    
    // Update bot status to error
    await supabase
      .from('bots')
      .update({
        runtime_status: 'error',
        runtime_logs: `Error starting bot: ${error.message}`
      })
      .eq('id', botId);

    throw error;
  }
}

export async function stopBot(botId: string): Promise<{ success: boolean; logs: string[] }> {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] ========== STOP BOT REQUEST ==========`);
  console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);
  
  try {
    // Get running execution
    const { data: execution } = await supabase
      .from('bot_executions')
      .select('*')
      .eq('bot_id', botId)
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (execution) {
      console.log(`[${new Date().toISOString()}] Found running execution: ${execution.id}`);
    }

    console.log(`[${new Date().toISOString()}] Calling stopTelegramBot...`);
    
    // Stop the bot
    const result = await stopTelegramBot(botId);
    
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ========== BOT STOP COMPLETED ==========`);
    console.log(`[${new Date().toISOString()}] Duration: ${duration}ms`);
    console.log(`[${new Date().toISOString()}] Success: ${result.success}`);

    // Update bot status
    await supabase
      .from('bots')
      .update({
        runtime_status: 'stopped',
        runtime_logs: (result.logs || []).join('\n')
      })
      .eq('id', botId);

    // Update execution status if exists
    if (execution) {
      await supabase
        .from('bot_executions')
        .update({
          status: 'stopped',
          logs: (result.logs || []).join('\n'),
          stopped_at: new Date().toISOString()
        })
        .eq('id', execution.id);
    }

    console.log(`[${new Date().toISOString()}] Bot marked as stopped`);
    
    return result;

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] ========== BOT STOP ERROR ==========`);
    console.error(`[${new Date().toISOString()}] Failed to stop bot after ${duration}ms: ${error.message}`);
    
    // Update bot status to error
    await supabase
      .from('bots')
      .update({
        runtime_status: 'error',
        runtime_logs: `Error stopping bot: ${error.message}`
      })
      .eq('id', botId);

    console.log(`[${new Date().toISOString()}] Bot marked as error during stop`);
    
    // Return a safe result even if there was an error
    return { 
      success: false, 
      logs: [
        BotLogger.logSection('STOP BOT ERROR'),
        BotLogger.logError(`Failed to stop bot: ${error.message}`),
        BotLogger.log('', 'Bot status updated to error'),
        BotLogger.logSection('STOP PROCESS COMPLETE')
      ]
    };
  }
}

export async function restartBot(botId: string, userId: string): Promise<{ success: boolean; logs: string[] }> {
  console.log(`[${new Date().toISOString()}] ========== RESTART BOT REQUEST ==========`);
  console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);
  
  try {
    // First stop the bot
    const stopResult = await stopBot(botId);
    console.log(`[${new Date().toISOString()}] Stop completed, now starting...`);
    
    // Wait a moment for clean shutdown
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Then start it again
    const startResult = await startBot(botId, userId);
    
    return {
      success: startResult.success,
      logs: [
        ...stopResult.logs,
        BotLogger.logSection('RESTART - STARTING BOT'),
        ...startResult.logs
      ]
    };
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Restart failed: ${error.message}`);
    return {
      success: false,
      logs: [
        BotLogger.logSection('RESTART ERROR'),
        BotLogger.logError(`Restart failed: ${error.message}`)
      ]
    };
  }
}

export async function streamLogs(botId: string): Promise<{ success: boolean; logs: string[] }> {
  console.log(`[${new Date().toISOString()}] ========== STREAM LOGS REQUEST ==========`);
  console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);
  
  try {
    // Get logs from the bot process
    const logs = await getBotLogs(botId);
    
    // Get status information
    const statusLogs = ProcessManager.getBotStatus(botId);
    
    const allLogs = [
      ...statusLogs,
      BotLogger.logSection('DOCKER CONTAINER LOGS'),
      ...logs
    ];
    
    return {
      success: true,
      logs: allLogs
    };
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to get logs: ${error.message}`);
    return {
      success: false,
      logs: [
        BotLogger.logSection('LOGS ERROR'),
        BotLogger.logError(`Failed to get logs: ${error.message}`)
      ]
    };
  }
}

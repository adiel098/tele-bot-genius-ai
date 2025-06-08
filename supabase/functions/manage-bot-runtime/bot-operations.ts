import { startTelegramBot, stopTelegramBot, getBotLogs } from './bot-executor.ts';
import { 
  getBotData, 
  getBotFiles, 
  updateBotStatus, 
  createBotExecution, 
  getRunningExecution, 
  updateExecutionStatus 
} from './database-operations.ts';
import { LoggingUtils } from './logging-utils.ts';
import { ProcessManager } from './process-manager.ts';
import { BotLogger } from './logger.ts';

export async function startBotOperation(botId: string, userId: string): Promise<{ success: boolean; logs: string[]; containerId?: string }> {
  const startTime = Date.now();
  
  try {
    LoggingUtils.logOperation('START BOT REQUEST', botId, { 'User ID': userId });
    
    // Get bot data
    const bot = await getBotData(botId, userId);
    console.log(`[${new Date().toISOString()}] Bot found: ${bot.name}`);
    console.log(`[${new Date().toISOString()}] Token available: ${bot.token ? 'YES' : 'NO'}`);

    // Get latest files
    const mainCode = await getBotFiles(userId, botId);
    console.log(`[${new Date().toISOString()}] Loaded code from files`);

    console.log(`[${new Date().toISOString()}] Calling startTelegramBot...`);
    
    // Start the bot using real Docker containers
    const result = await startTelegramBot(botId, bot.token, mainCode);
    
    const duration = Date.now() - startTime;
    LoggingUtils.logCompletion('BOT START', duration, result.success);

    if (result.success) {
      // Update bot status with container info
      await updateBotStatus(botId, 'running', result.logs || [], result.containerId);
      
      // Create execution record
      await createBotExecution(botId, userId, 'running', result.logs || []);
      
      console.log(`[${new Date().toISOString()}] Bot marked as running with container: ${result.containerId}`);
    } else {
      // Update bot status to error
      await updateBotStatus(botId, 'error', result.logs || []);
      console.log(`[${new Date().toISOString()}] Bot marked as error`);
    }

    return result;

  } catch (error) {
    const duration = Date.now() - startTime;
    LoggingUtils.logError('BOT START', duration, error);
    
    // Update bot status to error
    await updateBotStatus(botId, 'error', [`Error starting bot: ${error.message}`]);
    
    throw error;
  }
}

export async function stopBotOperation(botId: string): Promise<{ success: boolean; logs: string[] }> {
  const startTime = Date.now();
  
  try {
    LoggingUtils.logOperation('STOP BOT REQUEST', botId);
    
    // Get bot data to retrieve token for webhook cleanup
    const { data: bot } = await supabase
      .from('bots')
      .select('token')
      .eq('id', botId)
      .single();
    
    // Get running execution
    const execution = await getRunningExecution(botId);
    
    if (execution) {
      console.log(`[${new Date().toISOString()}] Found running execution: ${execution.id}`);
    }

    console.log(`[${new Date().toISOString()}] Calling stopTelegramBot...`);
    
    // Stop the bot with token for webhook cleanup
    const result = await stopTelegramBot(botId, bot?.token);
    
    const duration = Date.now() - startTime;
    LoggingUtils.logCompletion('BOT STOP', duration, result.success);

    // Update bot status - clear container_id when stopped
    await updateBotStatus(botId, 'stopped', result.logs || []);

    // Update execution status if exists
    if (execution) {
      await updateExecutionStatus(execution.id, 'stopped', result.logs || []);
    }

    console.log(`[${new Date().toISOString()}] Bot marked as stopped`);
    
    return result;

  } catch (error) {
    const duration = Date.now() - startTime;
    LoggingUtils.logError('BOT STOP', duration, error);
    
    // Update bot status to error
    await updateBotStatus(botId, 'error', [`Error stopping bot: ${error.message}`]);
    
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

export async function restartBotOperation(botId: string, userId: string): Promise<{ success: boolean; logs: string[] }> {
  console.log(`[${new Date().toISOString()}] ========== RESTART BOT REQUEST ==========`);
  console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);
  
  try {
    // First stop the bot
    const stopResult = await stopBotOperation(botId);
    console.log(`[${new Date().toISOString()}] Stop completed, now starting...`);
    
    // Wait a moment for clean shutdown
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Then start it again
    const startResult = await startBotOperation(botId, userId);
    
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

export async function streamLogsOperation(botId: string): Promise<{ success: boolean; logs: string[] }> {
  console.log(`[${new Date().toISOString()}] ========== STREAM LOGS REQUEST ==========`);
  console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);
  
  try {
    // Get live logs from the real Docker container
    const containerLogs = await getBotLogs(botId);
    
    // Get status information
    const statusLogs = ProcessManager.getBotStatus(botId);
    
    const allLogs = [
      ...statusLogs,
      BotLogger.logSection('LIVE DOCKER CONTAINER LOGS'),
      ...containerLogs
    ];
    
    // Update bot logs in database with fresh container logs
    await updateBotStatus(botId, 'running', allLogs);
    
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

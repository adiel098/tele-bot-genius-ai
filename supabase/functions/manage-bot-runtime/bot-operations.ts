
import { 
  getBotData, 
  getBotFiles, 
  updateBotStatus, 
  createBotExecution, 
  getRunningExecution, 
  updateExecutionStatus 
} from './database-operations.ts';
import { LoggingUtils } from './logging-utils.ts';
import { BotLogger } from './logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { RealDockerManager } from './real-docker-manager.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function startBotOperation(botId: string, userId: string): Promise<{ success: boolean; logs: string[]; containerId?: string }> {
  const startTime = Date.now();
  
  try {
    console.log(`[${new Date().toISOString()}] ========== START BOT OPERATION BEGIN ==========`);
    console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);
    console.log(`[${new Date().toISOString()}] User ID: ${userId}`);
    
    LoggingUtils.logOperation('START BOT REQUEST', botId, { 'User ID': userId });
    
    // Get bot data from database
    console.log(`[${new Date().toISOString()}] Step 1: Getting bot data from database...`);
    const bot = await getBotData(botId, userId);
    console.log(`[${new Date().toISOString()}] Bot found: ${bot.name}`);
    console.log(`[${new Date().toISOString()}] Token available: ${bot.token ? 'YES' : 'NO'}`);
    console.log(`[${new Date().toISOString()}] Current bot status in DB: ${bot.status || 'undefined'}`);
    console.log(`[${new Date().toISOString()}] Current runtime_status in DB: ${bot.runtime_status || 'undefined'}`);

    // Use Kubernetes deployment via bot lifecycle orchestrator
    console.log(`[${new Date().toISOString()}] Step 2: Starting Kubernetes deployment...`);
    
    const k8sResponse = await supabase.functions.invoke('bot-lifecycle-orchestrator', {
      body: {
        action: 'start-bot',
        botId: botId,
        userId: userId
      }
    });
    
    console.log(`[${new Date().toISOString()}] Step 3: Kubernetes deployment completed`);
    console.log(`[${new Date().toISOString()}] Result success: ${k8sResponse.data?.success}`);
    console.log(`[${new Date().toISOString()}] Result logs count: ${k8sResponse.data?.logs?.length || 0}`);
    
    const duration = Date.now() - startTime;
    LoggingUtils.logCompletion('BOT START', duration, k8sResponse.data?.success);

    if (k8sResponse.data?.success) {
      console.log(`[${new Date().toISOString()}] Step 4a: Bot started successfully, updating status to RUNNING...`);
      
      // Update bot status with Kubernetes deployment info
      await updateBotStatus(botId, 'running', k8sResponse.data.logs || [], k8sResponse.data.deploymentId);
      console.log(`[${new Date().toISOString()}] Database updated with RUNNING status`);
      
      // Create execution record
      console.log(`[${new Date().toISOString()}] Creating execution record...`);
      await createBotExecution(botId, userId, 'running', k8sResponse.data.logs || []);
      console.log(`[${new Date().toISOString()}] Execution record created`);
      
      console.log(`[${new Date().toISOString()}] Bot marked as RUNNING with deployment: ${k8sResponse.data.deploymentId}`);
    } else {
      console.log(`[${new Date().toISOString()}] Step 4b: Bot start FAILED, updating status to ERROR...`);
      console.log(`[${new Date().toISOString()}] Error details: ${k8sResponse.error?.message || 'No error details'}`);
      
      // If start failed, mark as error
      await updateBotStatus(botId, 'error', k8sResponse.data?.logs || []);
      console.log(`[${new Date().toISOString()}] Database updated with ERROR status`);
      console.log(`[${new Date().toISOString()}] Bot marked as ERROR due to start failure`);
    }

    console.log(`[${new Date().toISOString()}] ========== START BOT OPERATION COMPLETE ==========`);
    
    return {
      success: k8sResponse.data?.success || false,
      logs: k8sResponse.data?.logs || [],
      containerId: k8sResponse.data?.deploymentId
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] ========== START BOT OPERATION EXCEPTION ==========`);
    console.error(`[${new Date().toISOString()}] Exception caught: ${error.message}`);
    console.error(`[${new Date().toISOString()}] Exception stack: ${error.stack}`);
    
    LoggingUtils.logError('BOT START', duration, error);
    
    // Update bot status to error on exception
    console.log(`[${new Date().toISOString()}] Updating status to ERROR due to exception...`);
    await updateBotStatus(botId, 'error', [`Error starting bot: ${error.message}`]);
    console.log(`[${new Date().toISOString()}] Database updated with ERROR status due to exception`);
    
    throw error;
  }
}

export async function stopBotOperation(botId: string): Promise<{ success: boolean; logs: string[] }> {
  const startTime = Date.now();
  
  try {
    LoggingUtils.logOperation('STOP BOT REQUEST', botId);
    
    // Get running execution
    const execution = await getRunningExecution(botId);
    
    if (execution) {
      console.log(`[${new Date().toISOString()}] Found running execution: ${execution.id}`);
    }

    console.log(`[${new Date().toISOString()}] Calling Kubernetes bot lifecycle orchestrator...`);
    
    // Stop the bot via Kubernetes
    const k8sResponse = await supabase.functions.invoke('bot-lifecycle-orchestrator', {
      body: {
        action: 'stop-bot',
        botId: botId
      }
    });
    
    const duration = Date.now() - startTime;
    LoggingUtils.logCompletion('BOT STOP', duration, k8sResponse.data?.success);

    // Update to stopped after stop operation
    await updateBotStatus(botId, 'stopped', k8sResponse.data?.logs || []);

    // Update execution status if exists
    if (execution) {
      await updateExecutionStatus(execution.id, 'stopped', k8sResponse.data?.logs || []);
    }

    console.log(`[${new Date().toISOString()}] Bot marked as STOPPED`);
    
    return {
      success: k8sResponse.data?.success || false,
      logs: k8sResponse.data?.logs || []
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    LoggingUtils.logError('BOT STOP', duration, error);
    
    // Update bot status to error
    await updateBotStatus(botId, 'error', [`Error stopping bot: ${error.message}`]);
    
    console.log(`[${new Date().toISOString()}] Bot marked as error during stop`);
    
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
    // Get logs from Kubernetes deployment
    const k8sResponse = await supabase.functions.invoke('kubernetes-deployment-manager', {
      body: {
        action: 'get-logs',
        botId: botId
      }
    });
    
    const allLogs = [
      BotLogger.logSection('LIVE KUBERNETES POD LOGS'),
      ...(k8sResponse.data?.logs || [])
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

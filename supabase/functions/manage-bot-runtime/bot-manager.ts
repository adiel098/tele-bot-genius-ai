
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { RealDockerManager } from './real-docker-manager.ts';
import { BotLogger } from './logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function startBot(botId: string, userId: string): Promise<{ success: boolean; logs: string[]; error?: string }> {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.logSection(`STARTING REAL PYTHON BOT ${botId}`));
    
    // Get bot data from database
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('*')
      .eq('id', botId)
      .eq('user_id', userId)
      .single();

    if (botError || !bot) {
      logs.push(BotLogger.logError(`Bot not found: ${botError?.message}`));
      return { success: false, logs, error: 'Bot not found' };
    }

    // Check if bot is already running
    const containerStatus = RealDockerManager.getContainerStatus(botId);
    if (containerStatus.isRunning) {
      logs.push(BotLogger.logWarning('Bot is already running'));
      return { success: true, logs };
    }

    // Get bot's actual main.py code from storage - try both buckets
    logs.push(BotLogger.log(botId, 'Fetching bot\'s main.py from storage...'));
    
    let actualBotCode = '';
    
    // First try bot-code bucket
    const { data: codeFile, error: codeError } = await supabase.storage
      .from('bot-code')
      .download(`${botId}/main.py`);

    if (codeError || !codeFile) {
      logs.push(BotLogger.logWarning(`Could not fetch from bot-code: ${codeError?.message}`));
      
      // Try bot-files bucket as fallback
      const { data: fallbackFile, error: fallbackError } = await supabase.storage
        .from('bot-files')
        .download(`${userId}/${botId}/main.py`);
        
      if (fallbackError || !fallbackFile) {
        logs.push(BotLogger.logWarning(`Could not fetch from bot-files: ${fallbackError?.message}`));
        logs.push(BotLogger.log(botId, 'Using fallback template code'));
      } else {
        actualBotCode = await fallbackFile.text();
        logs.push(BotLogger.log(botId, `Bot's main.py loaded from bot-files: ${actualBotCode.length} characters`));
      }
    } else {
      actualBotCode = await codeFile.text();
      logs.push(BotLogger.log(botId, `Bot's main.py loaded from bot-code: ${actualBotCode.length} characters`));
    }

    // Create and start real Docker container with the bot's actual code
    const dockerResult = await RealDockerManager.createContainer(botId, actualBotCode, bot.token);
    logs.push(...dockerResult.logs);

    if (!dockerResult.success) {
      logs.push(BotLogger.logError('Failed to create Docker container'));
      return { success: false, logs, error: dockerResult.error };
    }

    // Update bot status in database with detailed logs
    await supabase
      .from('bots')
      .update({
        runtime_status: 'running',
        container_id: dockerResult.containerId,
        runtime_logs: logs.join('\n')
      })
      .eq('id', botId);

    logs.push(BotLogger.logSuccess('✅ Real Python bot started successfully with actual main.py!'));
    return { success: true, logs };

  } catch (error) {
    logs.push(BotLogger.logError(`Error starting bot: ${error.message}`));
    
    // Update bot status to error in database
    await supabase
      .from('bots')
      .update({
        runtime_status: 'error',
        runtime_logs: logs.join('\n')
      })
      .eq('id', botId);
      
    return { success: false, logs, error: error.message };
  }
}

export async function stopBot(botId: string): Promise<{ success: boolean; logs: string[] }> {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.logSection(`STOPPING REAL PYTHON BOT ${botId}`));
    
    // Get bot data for token
    const { data: bot } = await supabase
      .from('bots')
      .select('token')
      .eq('id', botId)
      .single();

    // Stop Docker container
    const dockerResult = await RealDockerManager.stopContainer(botId, bot?.token);
    logs.push(...dockerResult.logs);

    // Update bot status in database
    await supabase
      .from('bots')
      .update({
        runtime_status: 'stopped',
        container_id: null,
        runtime_logs: logs.join('\n')
      })
      .eq('id', botId);

    logs.push(BotLogger.logSuccess('✅ Real Python bot stopped successfully!'));
    return { success: true, logs };

  } catch (error) {
    logs.push(BotLogger.logError(`Error stopping bot: ${error.message}`));
    return { success: false, logs };
  }
}

export async function restartBot(botId: string, userId: string): Promise<{ success: boolean; logs: string[] }> {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.logSection(`RESTARTING REAL PYTHON BOT ${botId}`));
    
    // Stop the bot first
    const stopResult = await stopBot(botId);
    logs.push(...stopResult.logs);
    
    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start the bot again
    const startResult = await startBot(botId, userId);
    logs.push(...startResult.logs);
    
    return { success: startResult.success, logs };

  } catch (error) {
    logs.push(BotLogger.logError(`Error restarting bot: ${error.message}`));
    return { success: false, logs };
  }
}

export async function streamLogs(botId: string): Promise<{ success: boolean; logs: string[] }> {
  try {
    // Get real-time logs from Docker container
    const containerLogs = await RealDockerManager.getContainerLogs(botId);
    
    // Also get logs from database
    const { data: bot } = await supabase
      .from('bots')
      .select('runtime_logs, runtime_status')
      .eq('id', botId)
      .single();
    
    const allLogs = [
      BotLogger.logSection('LIVE DOCKER CONTAINER LOGS'),
      ...containerLogs,
      BotLogger.logSection('DATABASE STORED LOGS'),
      ...(bot?.runtime_logs ? bot.runtime_logs.split('\n') : ['No database logs available'])
    ];
    
    return {
      success: true,
      logs: allLogs
    };

  } catch (error) {
    return {
      success: false,
      logs: [BotLogger.logError(`Error getting logs: ${error.message}`)]
    };
  }
}

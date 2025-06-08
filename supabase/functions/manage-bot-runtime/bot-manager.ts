
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { RealDockerManager } from './real-docker-manager.ts';
import { BotLogger } from './logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function startBot(botId: string, userId: string): Promise<{ success: boolean; logs: string[]; error?: string }> {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.logSection('STARTING REAL PYTHON BOT ' + botId));
    
    // Get bot data from database
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('*')
      .eq('id', botId)
      .eq('user_id', userId)
      .single();

    if (botError || !bot) {
      logs.push(BotLogger.logError('Bot not found: ' + (botError?.message || 'Unknown error')));
      return { success: false, logs, error: 'Bot not found' };
    }

    // Check if bot is already running using async method
    const containerStatus = await RealDockerManager.getContainerStatusAsync(botId);
    if (containerStatus.isRunning) {
      logs.push(BotLogger.logWarning('Bot is already running'));
      
      // Update database to reflect running status
      await supabase
        .from('bots')
        .update({
          runtime_status: 'running',
          container_id: containerStatus.containerId,
          runtime_logs: logs.join('\n')
        })
        .eq('id', botId);
        
      return { success: true, logs };
    }

    // CRITICAL: Load the user's actual main.py code ONLY from bot-files bucket
    logs.push(BotLogger.log(botId, 'Loading user\'s main.py from bot-files storage...'));
    logs.push(BotLogger.log(botId, `Storage path: ${userId}/${botId}/main.py`));
    
    const { data: mainFile, error: mainError } = await supabase.storage
      .from('bot-files')
      .download(`${userId}/${botId}/main.py`);
      
    if (mainError || !mainFile) {
      logs.push(BotLogger.logError('CRITICAL: Cannot find user\'s main.py file!'));
      logs.push(BotLogger.logError('Storage error: ' + (mainError?.message || 'File not found')));
      
      // Debug: List all files in the user's bot directory
      const { data: filesList, error: listError } = await supabase.storage
        .from('bot-files')
        .list(`${userId}/${botId}`);
        
      if (listError) {
        logs.push(BotLogger.logError('Cannot list files: ' + listError.message));
      } else if (filesList && filesList.length > 0) {
        logs.push(BotLogger.log(botId, `Files in storage: ${filesList.map(f => f.name).join(', ')}`));
      } else {
        logs.push(BotLogger.logError('NO FILES FOUND in bot directory!'));
      }
      
      logs.push(BotLogger.logError('Cannot start bot without user\'s main.py file'));
      
      await supabase
        .from('bots')
        .update({
          runtime_status: 'error',
          runtime_logs: logs.join('\n')
        })
        .eq('id', botId);
        
      return { success: false, logs, error: 'User main.py file not found in storage' };
    }

    const actualBotCode = await mainFile.text();
    logs.push(BotLogger.log(botId, 'SUCCESS: Loaded user\'s main.py: ' + actualBotCode.length + ' characters'));
    
    // Show code preview to verify we're using the right code
    const codePreview = actualBotCode.substring(0, 300);
    logs.push(BotLogger.log(botId, `Code preview: ${codePreview}...`));

    // Validate that we have real user code (not empty or fallback)
    if (!actualBotCode || actualBotCode.trim().length === 0) {
      logs.push(BotLogger.logError('User\'s main.py file is empty!'));
      
      await supabase
        .from('bots')
        .update({
          runtime_status: 'error',
          runtime_logs: logs.join('\n')
        })
        .eq('id', botId);
        
      return { success: false, logs, error: 'Empty main.py file' };
    }

    // Check if this looks like user code vs template code
    if (actualBotCode.includes('PLACEHOLDER_TOKEN') || actualBotCode.includes('fallback template')) {
      logs.push(BotLogger.logError('WARNING: Code appears to be template, not user code!'));
    } else {
      logs.push(BotLogger.logSuccess('Code appears to be genuine user code'));
    }

    // Create and start real Docker container with the user's actual code
    logs.push(BotLogger.log(botId, 'Creating Docker container with user\'s actual main.py code...'));
    const dockerResult = await RealDockerManager.createContainer(botId, actualBotCode, bot.token);
    logs.push(...dockerResult.logs);

    if (!dockerResult.success) {
      logs.push(BotLogger.logError('Failed to create Docker container'));
      
      // Update status to error
      await supabase
        .from('bots')
        .update({
          runtime_status: 'error',
          runtime_logs: logs.join('\n')
        })
        .eq('id', botId);
        
      return { success: false, logs, error: dockerResult.error };
    }

    // Validate container ID
    if (!dockerResult.containerId) {
      logs.push(BotLogger.logError('Container created but no container ID returned'));
      
      await supabase
        .from('bots')
        .update({
          runtime_status: 'error',
          runtime_logs: logs.join('\n')
        })
        .eq('id', botId);
        
      return { success: false, logs, error: 'No container ID returned' };
    }

    // Update bot status in database
    logs.push(BotLogger.log(botId, 'Updating database with container ID: ' + dockerResult.containerId));
    
    const { error: updateError } = await supabase
      .from('bots')
      .update({
        runtime_status: 'running',
        container_id: dockerResult.containerId,
        runtime_logs: logs.join('\n'),
        last_restart: new Date().toISOString()
      })
      .eq('id', botId);

    if (updateError) {
      logs.push(BotLogger.logError('Database update failed: ' + updateError.message));
    } else {
      logs.push(BotLogger.logSuccess('Database updated successfully'));
    }

    logs.push(BotLogger.logSuccess('✅ Bot started with USER\'S ACTUAL CODE from storage!'));
    return { success: true, logs };

  } catch (error) {
    logs.push(BotLogger.logError('Error starting bot: ' + error.message));
    
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
    logs.push(BotLogger.logSection('STOPPING REAL PYTHON BOT ' + botId));
    
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
    logs.push(BotLogger.logError('Error stopping bot: ' + error.message));
    return { success: false, logs };
  }
}

export async function restartBot(botId: string, userId: string): Promise<{ success: boolean; logs: string[] }> {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.logSection('RESTARTING REAL PYTHON BOT ' + botId));
    
    // Stop the bot first
    const stopResult = await stopBot(botId);
    logs.push(...stopResult.logs);
    
    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start the bot again
    const startResult = await startBot(botId, userId);
    logs.push(...startResult.logs);
    
    return { success: startResult.success, logs };

  } catch (error) {
    logs.push(BotLogger.logError('Error restarting bot: ' + error.message));
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
      logs: [BotLogger.logError('Error getting logs: ' + error.message)]
    };
  }
}

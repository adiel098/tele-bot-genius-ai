
import { RealDockerManager } from './real-docker-manager.ts';
import { BotLogger } from './logger.ts';
import { getBotFromDatabase, updateBotDatabaseStatus } from './bot-database.ts';
import { loadBotCodeFromStorage } from './bot-storage.ts';

export async function startBotLifecycle(botId: string, userId: string): Promise<{ success: boolean; logs: string[]; error?: string }> {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.logSection('STARTING REAL PYTHON BOT ' + botId));
    
    // Get bot data from database
    const botResult = await getBotFromDatabase(botId, userId);
    logs.push(...botResult.logs);
    
    if (!botResult.success || !botResult.bot) {
      await updateBotDatabaseStatus(botId, 'error', undefined, logs);
      return { success: false, logs, error: 'Bot not found' };
    }

    const bot = botResult.bot;

    // Check if bot is already running
    const containerStatus = await RealDockerManager.getContainerStatusAsync(botId);
    if (containerStatus.isRunning) {
      logs.push(BotLogger.logWarning('Bot is already running'));
      
      await updateBotDatabaseStatus(botId, 'running', containerStatus.containerId, logs);
      return { success: true, logs };
    }

    // Load bot code from storage
    const codeResult = await loadBotCodeFromStorage(userId, botId);
    logs.push(...codeResult.logs);
    
    if (!codeResult.success || !codeResult.code) {
      await updateBotDatabaseStatus(botId, 'error', undefined, logs);
      return { success: false, logs, error: 'User main.py file not found in storage' };
    }

    // Create and start Docker container
    logs.push(BotLogger.log(botId, 'Creating Docker container with user\'s actual main.py code...'));
    const dockerResult = await RealDockerManager.createContainer(botId, codeResult.code, bot.token);
    logs.push(...dockerResult.logs);

    if (!dockerResult.success) {
      logs.push(BotLogger.logError('Failed to create Docker container'));
      await updateBotDatabaseStatus(botId, 'error', undefined, logs);
      return { success: false, logs, error: dockerResult.error };
    }

    if (!dockerResult.containerId) {
      logs.push(BotLogger.logError('Container created but no container ID returned'));
      await updateBotDatabaseStatus(botId, 'error', undefined, logs);
      return { success: false, logs, error: 'No container ID returned' };
    }

    // Update database with success status
    logs.push(BotLogger.log(botId, 'Updating database with container ID: ' + dockerResult.containerId));
    await updateBotDatabaseStatus(botId, 'running', dockerResult.containerId, logs);
    
    logs.push(BotLogger.logSuccess('✅ Bot started with USER\'S ACTUAL CODE from storage!'));
    return { success: true, logs };

  } catch (error) {
    logs.push(BotLogger.logError('Error starting bot: ' + error.message));
    await updateBotDatabaseStatus(botId, 'error', undefined, logs);
    return { success: false, logs, error: error.message };
  }
}

export async function stopBotLifecycle(botId: string): Promise<{ success: boolean; logs: string[] }> {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.logSection('STOPPING REAL PYTHON BOT ' + botId));
    
    // Get bot data for token
    const botResult = await getBotFromDatabase(botId, ''); // Empty userId for stop operation
    if (botResult.success && botResult.bot) {
      // Stop Docker container
      const dockerResult = await RealDockerManager.stopContainer(botId, botResult.bot.token);
      logs.push(...dockerResult.logs);
    } else {
      // Stop without token if bot not found
      const dockerResult = await RealDockerManager.stopContainer(botId);
      logs.push(...dockerResult.logs);
    }

    // Update database status
    await updateBotDatabaseStatus(botId, 'stopped', undefined, logs);

    logs.push(BotLogger.logSuccess('✅ Real Python bot stopped successfully!'));
    return { success: true, logs };

  } catch (error) {
    logs.push(BotLogger.logError('Error stopping bot: ' + error.message));
    return { success: false, logs };
  }
}

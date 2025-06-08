
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

    // Get bot's actual main.py code from storage - prioritize bot-files bucket
    logs.push(BotLogger.log(botId, 'Fetching bot\'s main.py from storage...'));
    
    let actualBotCode = '';
    
    // First try bot-files bucket (where files are actually stored)
    const { data: mainFile, error: mainError } = await supabase.storage
      .from('bot-files')
      .download(userId + '/' + botId + '/main.py');
      
    if (mainError || !mainFile) {
      logs.push(BotLogger.logWarning('Could not fetch from bot-files: ' + (mainError?.message || 'No file')));
      
      // Try bot-code bucket as fallback
      const { data: fallbackFile, error: fallbackError } = await supabase.storage
        .from('bot-code')
        .download(botId + '/main.py');
        
      if (fallbackError || !fallbackFile) {
        logs.push(BotLogger.logWarning('Could not fetch from bot-code: ' + (fallbackError?.message || 'No file')));
        logs.push(BotLogger.log(botId, 'Using fallback template code'));
        
        // Use a basic fallback template
        actualBotCode = generateFallbackBotCode();
      } else {
        actualBotCode = await fallbackFile.text();
        logs.push(BotLogger.log(botId, 'Bot\'s main.py loaded from bot-code: ' + actualBotCode.length + ' characters'));
      }
    } else {
      actualBotCode = await mainFile.text();
      logs.push(BotLogger.log(botId, 'Bot\'s main.py loaded from bot-files: ' + actualBotCode.length + ' characters'));
    }

    // Validate that we have actual bot code
    if (!actualBotCode || actualBotCode.trim().length === 0) {
      logs.push(BotLogger.logError('No valid bot code found'));
      
      await supabase
        .from('bots')
        .update({
          runtime_status: 'error',
          runtime_logs: logs.join('\n')
        })
        .eq('id', botId);
        
      return { success: false, logs, error: 'No valid bot code found' };
    }

    // Create and start real Docker container with the bot's actual code
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

    // Update bot status in database - with detailed verification
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

    // Verify the database update
    const { data: verifyBot } = await supabase
      .from('bots')
      .select('runtime_status, container_id')
      .eq('id', botId)
      .single();
      
    logs.push(BotLogger.log(botId, 'Verification - DB status: ' + (verifyBot?.runtime_status || 'unknown') + ', container: ' + (verifyBot?.container_id || 'none')));

    logs.push(BotLogger.logSuccess('✅ Real Python bot started successfully with actual main.py!'));
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

function generateFallbackBotCode(): string {
  return `
import os
import logging
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# Set up logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Bot token will be replaced during container creation
BOT_TOKEN = "PLACEHOLDER_TOKEN"

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("🤖 Hello! I'm your AI bot created with BotFactory!")

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Available commands:\\n/start - Get started\\n/help - Show this help")

async def echo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(f"You said: {update.message.text}")

def main():
    app = Application.builder().token(BOT_TOKEN).build()
    
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))
    
    app.run_webhook(
        listen="0.0.0.0",
        port=8080,
        url_path="/webhook"
    )

if __name__ == '__main__':
    main()
`;
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

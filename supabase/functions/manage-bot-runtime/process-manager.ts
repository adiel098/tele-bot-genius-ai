
import { BotLogger } from './logger.ts';

interface BotProcess {
  process: Deno.Process;
  controller: AbortController;
}

export class ProcessManager {
  private static activeBots = new Map<string, BotProcess>();

  static hasActiveBot(botId: string): boolean {
    return this.activeBots.has(botId);
  }

  static getActiveBotIds(): string[] {
    return Array.from(this.activeBots.keys());
  }

  static async stopBot(botId: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection(`STOPPING PYTHON BOT ${botId}`));
      
      const botInstance = this.activeBots.get(botId);
      
      if (!botInstance) {
        logs.push(BotLogger.log(botId, 'No active Python process found - already stopped'));
        logs.push(BotLogger.log('', `Current active bots: ${this.getActiveBotIds().join(', ') || 'None'}`));
        return { success: true, logs };
      }
      
      logs.push(BotLogger.log(botId, 'Found active Python process, proceeding with termination...'));
      
      // Terminate the Python process
      try {
        if (botInstance.controller) {
          logs.push(BotLogger.log(botId, 'Aborting process controller...'));
          botInstance.controller.abort();
          logs.push(BotLogger.logSuccess('Process controller aborted'));
        }
      } catch (abortError) {
        logs.push(BotLogger.logWarning(`During process abort: ${abortError.message}`));
      }
      
      // Force kill the process if still running
      try {
        if (botInstance.process) {
          logs.push(BotLogger.log(botId, 'Killing Python process...'));
          botInstance.process.kill();
          logs.push(BotLogger.logSuccess('Python process killed'));
        }
      } catch (killError) {
        logs.push(BotLogger.logWarning(`During process kill: ${killError.message}`));
      }
      
      // Always remove from active bots
      this.activeBots.delete(botId);
      
      // Clean up temporary directory
      const tempDir = `/tmp/bot_${botId}`;
      Deno.remove(tempDir, { recursive: true }).catch(error => {
        logs.push(BotLogger.logWarning(`Failed to clean up temp directory: ${error.message}`));
      });
      
      logs.push(BotLogger.logSuccess(`Python bot ${botId} completely stopped and cleaned up`));
      logs.push(BotLogger.log('', `Remaining active bots: ${this.getActiveBotIds().join(', ') || 'None'}`));
      logs.push(BotLogger.logSection('PYTHON BOT STOP COMPLETE'));
      
      return { success: true, logs };
      
    } catch (error) {
      logs.push(BotLogger.logError(`stopping Python bot: ${error.message}`));
      logs.push(BotLogger.log('', `Error stack: ${error.stack || 'No stack trace'}`));
      // Still remove from active bots even if there was an error
      this.activeBots.delete(botId);
      logs.push(BotLogger.log(botId, 'Bot forcefully removed from active bots map'));
      return { success: false, logs };
    }
  }

  static async startPythonProcess(botId: string, token: string, code: string, tempDir: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('STARTING PYTHON BOT PROCESS'));
      
      // Start the Python bot process
      const controller = new AbortController();
      
      const pythonProcess = new Deno.Command("python", {
        args: [`${tempDir}/main.py`],
        stdout: "piped",
        stderr: "piped",
        env: { 
          BOT_TOKEN: token,
          PYTHONPATH: tempDir,
          PYTHONUNBUFFERED: "1"
        },
        signal: controller.signal
      });
      
      const process = pythonProcess.spawn();
      
      // Store the process
      this.activeBots.set(botId, { process, controller });
      
      logs.push(BotLogger.logSuccess('Python process started'));
      logs.push(BotLogger.logSuccess('Bot is running with python-telegram-bot library'));
      
      // Monitor the process for a few seconds to check if it starts successfully
      let processExited = false;
      const processPromise = process.status.then(status => {
        processExited = true;
        return status;
      });
      
      // Wait up to 10 seconds for the bot to start
      const timeout = new Promise(resolve => setTimeout(resolve, 10000));
      const result = await Promise.race([processPromise, timeout]);
      
      if (processExited) {
        // Process exited, read output
        const stdout = await process.output();
        const stderr = new TextDecoder().decode(stdout.stderr);
        const stdoutText = new TextDecoder().decode(stdout.stdout);
        
        logs.push(BotLogger.logError('Python process exited unexpectedly'));
        logs.push(BotLogger.log('', `Exit code: ${(result as any)?.code || 'unknown'}`));
        logs.push(BotLogger.log('', `Stdout: ${stdoutText}`));
        logs.push(BotLogger.log('', `Stderr: ${stderr}`));
        
        // Clean up
        this.activeBots.delete(botId);
        await Deno.remove(tempDir, { recursive: true }).catch(() => {});
        
        return { 
          success: false, 
          logs
        };
      }
      
      logs.push(BotLogger.logSuccess('Bot process running successfully for 10+ seconds'));
      logs.push(BotLogger.logSuccess('Bot is ready to receive messages'));
      logs.push(BotLogger.logSection('PYTHON BOT STARTUP COMPLETE'));
      
      return { success: true, logs };
      
    } catch (processError) {
      logs.push(BotLogger.logSection('PYTHON PROCESS ERROR'));
      logs.push(BotLogger.logError('Failed to start Python process'));
      logs.push(BotLogger.log('', `Error message: ${processError.message}`));
      logs.push(BotLogger.log('', `Error stack: ${processError.stack || 'No stack trace'}`));
      
      // Clean up
      this.activeBots.delete(botId);
      await Deno.remove(tempDir, { recursive: true }).catch(() => {});
      
      return { success: false, logs };
    }
  }

  static getBotStatus(botId: string): string[] {
    const timestamp = new Date().toISOString();
    const isActive = this.activeBots.has(botId);
    const activeCount = this.activeBots.size;
    const activeBotIds = this.getActiveBotIds();
    
    return [
      BotLogger.logSection('PYTHON BOT STATUS QUERY'),
      BotLogger.log('', `Bot ID: ${botId}`),
      BotLogger.log('', `Status: ${isActive ? 'RUNNING with Python code' : 'STOPPED'}`),
      BotLogger.log('', `Total active bots: ${activeCount}`),
      BotLogger.log('', `Active bot IDs: ${activeBotIds.join(', ') || 'None'}`),
      BotLogger.log('', 'Runtime: Python with python-telegram-bot library'),
      BotLogger.log('', 'Process type: Native Python subprocess'),
      BotLogger.logSection('STATUS QUERY COMPLETE')
    ];
  }
}

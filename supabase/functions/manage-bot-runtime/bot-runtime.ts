
import { BotLogger } from './logger.ts';
import { ProcessManager } from './process-manager.ts';

export class BotRuntime {
  static async setupEnvironment(botId: string, code: string): Promise<{ success: boolean; logs: string[]; tempDir?: string }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('CREATING PYTHON RUNTIME'));
      
      // Create temporary directory for this bot
      const tempDir = `/tmp/bot_${botId}`;
      
      try {
        // Create bot directory
        await Deno.mkdir(tempDir, { recursive: true });
        logs.push(BotLogger.logSuccess(`Created temporary directory: ${tempDir}`));
        
        // Write the Python code to main.py
        const mainPyPath = `${tempDir}/main.py`;
        await Deno.writeTextFile(mainPyPath, code);
        logs.push(BotLogger.logSuccess('Written main.py file'));
        
        // Create requirements.txt if not present in code
        if (!code.includes('requirements.txt')) {
          const requirementsContent = `python-telegram-bot>=20.0
requests>=2.28.0
httpx>=0.24.0`;
          await Deno.writeTextFile(`${tempDir}/requirements.txt`, requirementsContent);
          logs.push(BotLogger.logSuccess('Created requirements.txt'));
        }
        
        return { success: true, logs, tempDir };
        
      } catch (setupError) {
        logs.push(BotLogger.logError('Failed to setup environment', setupError));
        return { success: false, logs };
      }
      
    } catch (error) {
      logs.push(BotLogger.logError('Critical error in environment setup', error));
      return { success: false, logs };
    }
  }

  static async installDependencies(tempDir: string, token: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('INSTALLING DEPENDENCIES'));
      
      // Install dependencies
      const pipProcess = new Deno.Command("pip", {
        args: ["install", "-r", `${tempDir}/requirements.txt`],
        stdout: "piped",
        stderr: "piped",
        env: { 
          BOT_TOKEN: token,
          PYTHONPATH: tempDir,
          PYTHONUNBUFFERED: "1"
        }
      });
      
      const pipResult = await pipProcess.output();
      const pipStdout = new TextDecoder().decode(pipResult.stdout);
      const pipStderr = new TextDecoder().decode(pipResult.stderr);
      
      if (pipResult.code !== 0) {
        logs.push(BotLogger.logError('Failed to install dependencies'));
        logs.push(BotLogger.log('', `pip stdout: ${pipStdout}`));
        logs.push(BotLogger.log('', `pip stderr: ${pipStderr}`));
        return { success: false, logs };
      }
      
      logs.push(BotLogger.logSuccess('Dependencies installed successfully'));
      return { success: true, logs };
      
    } catch (error) {
      logs.push(BotLogger.logError('Error during dependency installation', error));
      return { success: false, logs };
    }
  }
}

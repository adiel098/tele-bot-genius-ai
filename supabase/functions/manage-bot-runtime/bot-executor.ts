
import { BotLogger } from './logger.ts';
import { PythonValidator } from './python-validator.ts';
import { ProcessManager } from './process-manager.ts';
import { BotRuntime } from './bot-runtime.ts';

export async function startTelegramBot(botId: string, token: string, code: string): Promise<{ success: boolean; logs: string[]; error?: string; errorType?: string }> {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.logSection(`STARTING PYTHON BOT ${botId}`));
    logs.push(BotLogger.log(botId, `Bot ID: ${botId}`));
    logs.push(BotLogger.log('', `Token length: ${token ? token.length : 'undefined'} characters`));
    logs.push(BotLogger.log('', `Code provided: ${code ? 'YES' : 'NO'}`));
    logs.push(BotLogger.log('', `Code length: ${code ? code.length : 0} characters`));
    
    // Always stop existing bot first to prevent conflicts
    if (ProcessManager.hasActiveBot(botId)) {
      logs.push(BotLogger.log(botId, 'EXISTING BOT DETECTED - stopping process'));
      const stopResult = ProcessManager.stopBot(botId);
      logs.push(...stopResult.logs);
      // Wait for the previous instance to fully stop
      await new Promise(resolve => setTimeout(resolve, 3000));
      logs.push(BotLogger.log('', 'Waited 3 seconds for previous instance to stop'));
    }

    // Validate token
    const tokenValidation = PythonValidator.validateToken(token);
    logs.push(...tokenValidation.logs);
    if (!tokenValidation.isValid) {
      return { 
        success: false, 
        logs, 
        error: tokenValidation.errorMessage,
        errorType: tokenValidation.errorType
      };
    }

    // Validate code
    const codeValidation = PythonValidator.validateCode(code);
    logs.push(...codeValidation.logs);
    if (!codeValidation.isValid) {
      return { 
        success: false, 
        logs, 
        error: codeValidation.errorMessage,
        errorType: codeValidation.errorType
      };
    }

    // Setup environment
    const envSetup = await BotRuntime.setupEnvironment(botId, code);
    logs.push(...envSetup.logs);
    if (!envSetup.success || !envSetup.tempDir) {
      return { 
        success: false, 
        logs, 
        error: "Failed to setup Python environment",
        errorType: "env_setup_failed"
      };
    }

    // Install dependencies
    const depInstall = await BotRuntime.installDependencies(envSetup.tempDir, token);
    logs.push(...depInstall.logs);
    if (!depInstall.success) {
      return { 
        success: false, 
        logs, 
        error: "Failed to install Python dependencies",
        errorType: "dependency_install_failed"
      };
    }

    // Start the bot process
    const processStart = await ProcessManager.startPythonProcess(botId, token, code, envSetup.tempDir);
    logs.push(...processStart.logs);
    
    if (!processStart.success) {
      return { 
        success: false, 
        logs, 
        error: "Python bot process failed to start",
        errorType: "process_failed"
      };
    }

    return { success: true, logs };
    
  } catch (error) {
    logs.push(BotLogger.logSection('CRITICAL ERROR'));
    logs.push(BotLogger.logError(`CRITICAL ERROR: ${error.message}`));
    logs.push(BotLogger.log('', `Error name: ${error.name || 'Unknown'}`));
    logs.push(BotLogger.log('', `Error stack: ${error.stack || 'No stack trace'}`));
    return { 
      success: false, 
      logs, 
      error: `Critical error: ${error.message}`,
      errorType: "critical_error"
    };
  }
}

export function stopTelegramBot(botId: string): { success: boolean; logs: string[] } {
  return ProcessManager.stopBot(botId);
}

export function getBotLogs(botId: string): string[] {
  return ProcessManager.getBotStatus(botId);
}

export function listActiveBots(): string[] {
  return ProcessManager.getActiveBotIds();
}

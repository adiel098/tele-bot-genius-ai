
import { BotLogger } from './logger.ts';
import { DockerManager } from './docker-manager.ts';
import { PythonValidator } from './python-validator.ts';

export async function startDockerBot(botId: string, token: string, code: string): Promise<{ success: boolean; logs: string[]; error?: string; errorType?: string; containerId?: string }> {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.logSection(`STARTING DOCKER BOT ${botId}`));
    logs.push(BotLogger.log(botId, `Bot ID: ${botId}`));
    logs.push(BotLogger.log('', `Token length: ${token ? token.length : 'undefined'} characters`));
    logs.push(BotLogger.log('', `Code provided: ${code ? 'YES' : 'NO'}`));
    logs.push(BotLogger.log('', `Code length: ${code ? code.length : 0} characters`));

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

    // Stop existing container if running
    const containerStatus = DockerManager.getContainerStatus(botId);
    if (containerStatus.isRunning) {
      logs.push(BotLogger.log(botId, 'Stopping existing container before restart'));
      const stopResult = await DockerManager.stopContainer(botId);
      logs.push(...stopResult.logs);
    }

    // Create and start new Docker container
    const containerResult = await DockerManager.createContainer(botId, code, token);
    logs.push(...containerResult.logs);
    
    if (!containerResult.success) {
      return { 
        success: false, 
        logs, 
        error: containerResult.error || "Failed to create Docker container",
        errorType: "container_creation_failed"
      };
    }

    logs.push(BotLogger.logSection('DOCKER BOT STARTUP COMPLETE'));
    logs.push(BotLogger.logSuccess('Bot is running in isolated Docker container'));

    return { 
      success: true, 
      logs, 
      containerId: containerResult.containerId 
    };
    
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

export async function stopDockerBot(botId: string): Promise<{ success: boolean; logs: string[] }> {
  return await DockerManager.stopContainer(botId);
}

export async function getDockerBotLogs(botId: string): Promise<string[]> {
  return await DockerManager.getContainerLogs(botId);
}

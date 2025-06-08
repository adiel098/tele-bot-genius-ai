
import { BotLogger } from './logger.ts';

export class RealDockerManager {
  private static runningContainers = new Map<string, { containerId: string; process?: Deno.ChildProcess }>(); 

  static async createContainer(botId: string, code: string, token: string): Promise<{ success: boolean; logs: string[]; containerId?: string; error?: string }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('CREATING REAL DOCKER CONTAINER'));
      logs.push(BotLogger.log(botId, 'Starting real Docker container creation process'));
      
      // Validate inputs
      if (!code || code.length === 0) {
        logs.push(BotLogger.logError('No code provided for container'));
        return { success: false, logs, error: 'No code provided' };
      }
      
      if (!token || !token.match(/^\d+:[A-Za-z0-9_-]+$/)) {
        logs.push(BotLogger.logError('Invalid bot token format'));
        return { success: false, logs, error: 'Invalid token format' };
      }

      const containerId = `telebot_${botId.replace(/-/g, '_')}`;
      logs.push(BotLogger.log(botId, `Creating container: ${containerId}`));

      // Create a temporary directory for bot files
      const tempDir = `/tmp/bot_${botId}`;
      
      try {
        await Deno.mkdir(tempDir, { recursive: true });
        logs.push(BotLogger.log(botId, `Created temp directory: ${tempDir}`));
      } catch (error) {
        logs.push(BotLogger.logWarning(`Directory might already exist: ${error.message}`));
      }

      // Write Python code to file
      const botFile = `${tempDir}/bot.py`;
      await Deno.writeTextFile(botFile, code);
      logs.push(BotLogger.log(botId, 'Bot code written to file'));

      // Create requirements.txt
      const requirements = `python-telegram-bot==20.7
requests==2.31.0
python-dotenv==1.0.0`;
      await Deno.writeTextFile(`${tempDir}/requirements.txt`, requirements);

      // Create .env file with token
      await Deno.writeTextFile(`${tempDir}/.env`, `TELEGRAM_BOT_TOKEN=${token}`);
      logs.push(BotLogger.log(botId, 'Environment file created'));

      // Create Dockerfile
      const dockerfile = `FROM python:3.11-slim

WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy bot code and env
COPY bot.py .
COPY .env .

# Run the bot
CMD ["python", "bot.py"]`;

      await Deno.writeTextFile(`${tempDir}/Dockerfile`, dockerfile);
      logs.push(BotLogger.log(botId, 'Dockerfile created'));

      // Build Docker image
      logs.push(BotLogger.log(botId, 'Building Docker image...'));
      const buildProcess = new Deno.Command("docker", {
        args: ["build", "-t", `telebot-${botId}`, tempDir],
        stdout: "piped",
        stderr: "piped"
      });

      const buildResult = await buildProcess.output();
      const buildOutput = new TextDecoder().decode(buildResult.stdout);
      const buildError = new TextDecoder().decode(buildResult.stderr);

      if (!buildResult.success) {
        logs.push(BotLogger.logError(`Docker build failed: ${buildError}`));
        return { success: false, logs, error: `Build failed: ${buildError}` };
      }

      logs.push(BotLogger.logSuccess('Docker image built successfully'));

      // Run the container
      logs.push(BotLogger.log(botId, 'Starting Docker container...'));
      const runProcess = new Deno.Command("docker", {
        args: [
          "run", "-d", 
          "--name", containerId,
          "--restart", "unless-stopped",
          `-telebot-${botId}`
        ],
        stdout: "piped",
        stderr: "piped"
      });

      const runResult = await runProcess.output();
      const runOutput = new TextDecoder().decode(runResult.stdout);
      const runError = new TextDecoder().decode(runResult.stderr);

      if (!runResult.success) {
        logs.push(BotLogger.logError(`Docker run failed: ${runError}`));
        return { success: false, logs, error: `Run failed: ${runError}` };
      }

      const actualContainerId = runOutput.trim();
      logs.push(BotLogger.logSuccess(`Container started: ${actualContainerId}`));

      // Setup webhook
      const webhookUrl = `https://efhwjkhqbbucvedgznba.supabase.co/functions/v1/telegram-webhook/${botId}`;
      
      try {
        const webhookResponse = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: webhookUrl,
            drop_pending_updates: true
          })
        });
        
        const webhookData = await webhookResponse.json();
        
        if (webhookData.ok) {
          logs.push(BotLogger.logSuccess(`Webhook set: ${webhookUrl}`));
        } else {
          logs.push(BotLogger.logWarning(`Webhook setup warning: ${webhookData.description}`));
        }
      } catch (webhookError) {
        logs.push(BotLogger.logWarning(`Webhook error: ${webhookError.message}`));
      }

      // Store container reference
      this.runningContainers.set(botId, { containerId: actualContainerId });

      // Clean up temp directory
      try {
        await Deno.remove(tempDir, { recursive: true });
        logs.push(BotLogger.log(botId, 'Temp directory cleaned up'));
      } catch (cleanupError) {
        logs.push(BotLogger.logWarning(`Cleanup warning: ${cleanupError.message}`));
      }

      logs.push(BotLogger.logSuccess('Real Docker container created and running'));
      logs.push(BotLogger.log(botId, `Container ID: ${actualContainerId}`));
      logs.push(BotLogger.log(botId, `Webhook: ${webhookUrl}`));
      logs.push(BotLogger.logSection('REAL CONTAINER CREATION COMPLETE'));
      
      return { success: true, logs, containerId: actualContainerId };
      
    } catch (error) {
      logs.push(BotLogger.logError(`Error creating real container: ${error.message}`));
      return { success: false, logs, error: error.message };
    }
  }

  static async stopContainer(botId: string, token?: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('STOPPING REAL DOCKER CONTAINER'));
      
      const containerInfo = this.runningContainers.get(botId);
      if (!containerInfo) {
        logs.push(BotLogger.log(botId, 'No running container found'));
        return { success: true, logs };
      }

      const { containerId } = containerInfo;
      logs.push(BotLogger.log(botId, `Stopping container: ${containerId}`));

      // Stop the Docker container
      const stopProcess = new Deno.Command("docker", {
        args: ["stop", containerId],
        stdout: "piped",
        stderr: "piped"
      });

      const stopResult = await stopProcess.output();
      if (stopResult.success) {
        logs.push(BotLogger.logSuccess('Container stopped successfully'));
      } else {
        const error = new TextDecoder().decode(stopResult.stderr);
        logs.push(BotLogger.logWarning(`Stop warning: ${error}`));
      }

      // Remove the container
      const removeProcess = new Deno.Command("docker", {
        args: ["rm", containerId],
        stdout: "piped",
        stderr: "piped"
      });

      await removeProcess.output();
      logs.push(BotLogger.log(botId, 'Container removed'));

      // Remove webhook if token provided
      if (token) {
        try {
          const webhookResponse = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
            method: 'POST'
          });
          
          const webhookData = await webhookResponse.json();
          if (webhookData.ok) {
            logs.push(BotLogger.logSuccess('Webhook removed'));
          }
        } catch (webhookError) {
          logs.push(BotLogger.logWarning(`Webhook cleanup warning: ${webhookError.message}`));
        }
      }

      // Remove from running containers
      this.runningContainers.delete(botId);
      
      logs.push(BotLogger.logSuccess('Real container stopped and cleaned up'));
      logs.push(BotLogger.logSection('REAL CONTAINER STOP COMPLETE'));
      
      return { success: true, logs };
      
    } catch (error) {
      logs.push(BotLogger.logError(`Error stopping real container: ${error.message}`));
      return { success: false, logs };
    }
  }

  static async getContainerLogs(botId: string): Promise<string[]> {
    const containerInfo = this.runningContainers.get(botId);
    if (!containerInfo) {
      return [BotLogger.log(botId, 'No container running - no logs available')];
    }

    try {
      // Get real Docker logs
      const logsProcess = new Deno.Command("docker", {
        args: ["logs", "--tail", "50", containerInfo.containerId],
        stdout: "piped",
        stderr: "piped"
      });

      const logsResult = await logsProcess.output();
      const dockerLogs = new TextDecoder().decode(logsResult.stdout);
      const dockerErrors = new TextDecoder().decode(logsResult.stderr);

      const logs = [
        BotLogger.logSection('REAL DOCKER CONTAINER LOGS'),
        BotLogger.log(botId, `Container: ${containerInfo.containerId}`),
        BotLogger.logSection('DOCKER STDOUT'),
        ...dockerLogs.split('\n').filter(line => line.trim()).map(line => 
          BotLogger.log('docker', line)
        ),
        BotLogger.logSection('DOCKER STDERR'),
        ...dockerErrors.split('\n').filter(line => line.trim()).map(line => 
          BotLogger.log('docker', line)
        ),
        BotLogger.logSection('LIVE CONTAINER LOGS END')
      ];

      return logs;
    } catch (error) {
      return [
        BotLogger.logError(`Failed to get container logs: ${error.message}`)
      ];
    }
  }

  static getContainerStatus(botId: string): { isRunning: boolean; containerId?: string; logs: string[] } {
    const logs: string[] = [];
    const containerInfo = this.runningContainers.get(botId);
    
    if (containerInfo) {
      logs.push(BotLogger.logSection('REAL CONTAINER STATUS CHECK'));
      logs.push(BotLogger.log(botId, `Container ID: ${containerInfo.containerId}`));
      logs.push(BotLogger.log(botId, 'Status: RUNNING (Real Docker Container)'));
      logs.push(BotLogger.log(botId, 'Environment: Isolated Docker container with Python runtime'));
      logs.push(BotLogger.log(botId, `Webhook: https://efhwjkhqbbucvedgznba.supabase.co/functions/v1/telegram-webhook/${botId}`));
      logs.push(BotLogger.logSection('STATUS CHECK COMPLETE'));
      
      return { isRunning: true, containerId: containerInfo.containerId, logs };
    }
    
    logs.push(BotLogger.log(botId, 'No real container running for this bot'));
    return { isRunning: false, logs };
  }

  static getRunningContainers(): string[] {
    return Array.from(this.runningContainers.keys());
  }
}

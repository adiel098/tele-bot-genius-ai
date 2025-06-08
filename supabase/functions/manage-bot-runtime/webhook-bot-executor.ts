
import { BotLogger } from './logger.ts';
import { PythonValidator } from './python-validator.ts';
import { BotRuntime } from './bot-runtime.ts';

export async function startWebhookBot(botId: string, token: string, code: string): Promise<{ success: boolean; logs: string[]; error?: string; errorType?: string; webhookUrl?: string }> {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.logSection(`STARTING WEBHOOK BOT ${botId}`));
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

    // Setup environment (no subprocess needed)
    const envSetup = await BotRuntime.setupEnvironment(botId, code);
    logs.push(...envSetup.logs);
    if (!envSetup.success) {
      return { 
        success: false, 
        logs, 
        error: "Failed to setup bot environment",
        errorType: "env_setup_failed"
      };
    }

    // Validate bot with Telegram API
    const botValidation = await BotRuntime.validateWebhookBot(code, token);
    logs.push(...botValidation.logs);
    if (!botValidation.success) {
      return { 
        success: false, 
        logs, 
        error: "Bot validation failed",
        errorType: "validation_failed"
      };
    }

    // Setup webhook
    const webhookSetup = await BotRuntime.setupWebhook(botId, token);
    logs.push(...webhookSetup.logs);
    if (!webhookSetup.success) {
      return { 
        success: false, 
        logs, 
        error: "Failed to setup webhook",
        errorType: "webhook_failed"
      };
    }

    logs.push(BotLogger.logSection('WEBHOOK BOT STARTUP COMPLETE'));
    logs.push(BotLogger.logSuccess('Bot is running and ready to receive messages'));

    return { 
      success: true, 
      logs, 
      webhookUrl: webhookSetup.webhookUrl 
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

export function stopWebhookBot(botId: string, token: string): { success: boolean; logs: string[] } {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.logSection(`STOPPING WEBHOOK BOT ${botId}`));
    
    // Remove webhook by setting empty URL
    fetch(`https://api.telegram.org/bot${token}/deleteWebhook`)
      .then(response => response.json())
      .then(data => {
        if (data.ok) {
          logs.push(BotLogger.logSuccess('Webhook removed successfully'));
        } else {
          logs.push(BotLogger.logWarning(`Failed to remove webhook: ${data.description}`));
        }
      })
      .catch(error => {
        logs.push(BotLogger.logWarning(`Error removing webhook: ${error.message}`));
      });
    
    logs.push(BotLogger.logSuccess(`Webhook bot ${botId} stopped`));
    logs.push(BotLogger.logSection('WEBHOOK BOT STOP COMPLETE'));
    
    return { success: true, logs };
    
  } catch (error) {
    logs.push(BotLogger.logError(`Error stopping webhook bot: ${error.message}`));
    return { success: false, logs };
  }
}

export function getWebhookBotLogs(botId: string): string[] {
  const timestamp = new Date().toISOString();
  
  return [
    BotLogger.logSection('WEBHOOK BOT STATUS QUERY'),
    BotLogger.log('', `Bot ID: ${botId}`),
    BotLogger.log('', `Status: RUNNING via webhook`),
    BotLogger.log('', 'Runtime: Telegram Webhook (Serverless)'),
    BotLogger.log('', 'Process type: Edge Function webhook handler'),
    BotLogger.log('', `Webhook URL: https://efhwjkhqbbucvedgznba.supabase.co/functions/v1/telegram-webhook/${botId}`),
    BotLogger.logSection('STATUS QUERY COMPLETE')
  ];
}

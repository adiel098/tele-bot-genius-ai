
import { BotLogger } from './logger.ts';

export async function loadBotCodeFromStorage(userId: string, botId: string): Promise<{ success: boolean; code?: string; logs: string[] }> {
  const logs: string[] = [];
  
  try {
    logs.push(BotLogger.log(botId, 'Loading bot code exclusively from Modal volume...'));
    
    // Call Modal FastAPI service to get bot files from Modal volume only
    const modalUrl = 'https://efhwjkhqbbucvedgznba--telegram-bot-service.modal.run';
    const response = await fetch(`${modalUrl}/files/${botId}?user_id=${userId}`);
    
    if (!response.ok) {
      logs.push(BotLogger.logError('Failed to fetch files from Modal volume: ' + response.statusText));
      return { success: false, logs };
    }
    
    const data = await response.json();
    
    if (!data.success || !data.files || !data.files['main.py']) {
      logs.push(BotLogger.logError('No main.py file found in Modal volume'));
      return { success: false, logs };
    }

    const botCode = data.files['main.py'];
    logs.push(BotLogger.log(botId, 'SUCCESS: Loaded main.py exclusively from Modal volume: ' + botCode.length + ' characters'));
    
    // Show code preview to verify we're using the right code
    const codePreview = botCode.substring(0, 300);
    logs.push(BotLogger.log(botId, `Code preview: ${codePreview}...`));

    // Validate that we have real user code
    if (!botCode || botCode.trim().length === 0) {
      logs.push(BotLogger.logError('Main.py file is empty!'));
      return { success: false, logs };
    }

    if (botCode.includes('PLACEHOLDER_TOKEN') || botCode.includes('fallback template')) {
      logs.push(BotLogger.logError('WARNING: Code appears to be template, not user code!'));
    } else {
      logs.push(BotLogger.logSuccess('Code appears to be genuine user code from Modal volume'));
    }

    return { success: true, code: botCode, logs };
    
  } catch (error) {
    logs.push(BotLogger.logError('Error loading bot code from Modal volume: ' + error.message));
    return { success: false, logs };
  }
}

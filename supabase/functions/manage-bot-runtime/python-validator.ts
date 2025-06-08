
import { BotLogger } from './logger.ts';

export interface ValidationResult {
  isValid: boolean;
  errorType?: string;
  errorMessage?: string;
  logs: string[];
}

export class PythonValidator {
  static validateToken(token: string): ValidationResult {
    const logs: string[] = [];
    
    logs.push(BotLogger.logSection('TOKEN VALIDATION'));
    
    if (!token) {
      logs.push(BotLogger.logError('No token provided'));
      return {
        isValid: false,
        logs,
        errorType: 'invalid_token',
        errorMessage: 'No bot token provided. Please check your token from @BotFather.'
      };
    }
    
    logs.push(BotLogger.log('', `Token format check: ${token.substring(0, 10)}...`));
    if (!token.match(/^\d+:[A-Za-z0-9_-]+$/)) {
      logs.push(BotLogger.logError('Invalid token format - does not match expected pattern'));
      return {
        isValid: false,
        logs,
        errorType: 'invalid_token',
        errorMessage: 'Invalid bot token format. Please check your token from @BotFather.'
      };
    }
    
    logs.push(BotLogger.logSuccess('Token format is valid'));
    return { isValid: true, logs };
  }

  static validateCode(code: string): ValidationResult {
    const logs: string[] = [];
    
    logs.push(BotLogger.logSection('PYTHON CODE ANALYSIS'));
    logs.push(BotLogger.log('', `Code preview (first 500 chars):`));
    logs.push(BotLogger.log('', `${code.substring(0, 500)}${code.length > 500 ? '...' : ''}`));
    
    if (!code || code.trim().length === 0) {
      logs.push(BotLogger.logError('No generated code provided'));
      return {
        isValid: false,
        logs,
        errorType: 'no_code',
        errorMessage: 'No generated code provided. Please regenerate your bot code.'
      };
    }
    
    // Check if this is JavaScript code (which won't work in Python)
    const isJavaScriptCode = code.includes('grammy') || 
                            code.includes('import { Bot }') || 
                            code.includes('new Bot(') ||
                            code.includes('bot.start()') ||
                            code.includes('const ') ||
                            code.includes('=> {');
    
    if (isJavaScriptCode) {
      logs.push(BotLogger.logSection('JAVASCRIPT CODE DETECTED'));
      logs.push(BotLogger.logError('Generated code appears to be JavaScript, but we need Python'));
      logs.push(BotLogger.log('', 'JavaScript indicators found:'));
      if (code.includes('grammy')) logs.push(BotLogger.log('', '- Grammy library reference'));
      if (code.includes('import { Bot }')) logs.push(BotLogger.log('', '- JavaScript Bot import'));
      if (code.includes('const ')) logs.push(BotLogger.log('', '- JavaScript const declarations'));
      if (code.includes('=> {')) logs.push(BotLogger.log('', '- JavaScript arrow functions'));
      
      return {
        isValid: false,
        logs,
        errorType: 'wrong_language',
        errorMessage: 'Generated code is JavaScript but we need Python. Please regenerate the bot with Python code for python-telegram-bot library.'
      };
    }
    
    logs.push(BotLogger.logSuccess('Code appears to be Python'));
    
    // Check for required Python imports
    if (!code.includes('from telegram') && !code.includes('import telegram')) {
      logs.push(BotLogger.logWarning('Code might be missing python-telegram-bot imports'));
    }

    return { isValid: true, logs };
  }
}

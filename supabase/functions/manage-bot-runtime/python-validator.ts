
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
    
    logs.push(BotLogger.logSection('TELEGRAM TOKEN VALIDATION'));
    
    if (!token) {
      logs.push(BotLogger.logError('❌ No token provided'));
      return {
        isValid: false,
        logs,
        errorType: 'missing_token',
        errorMessage: 'Telegram bot token is required. Get one from @BotFather on Telegram.'
      };
    }
    
    // Remove any whitespace
    token = token.trim();
    
    logs.push(BotLogger.log('', `Token format check: ${token.substring(0, 10)}...`));
    
    // Check token format: should be digits:alphanumeric_characters
    if (!token.match(/^\d+:[A-Za-z0-9_-]+$/)) {
      logs.push(BotLogger.logError('❌ Invalid token format - does not match Telegram bot token pattern'));
      logs.push(BotLogger.log('', 'Expected format: 123456789:ABC-DEF1234567890'));
      return {
        isValid: false,
        logs,
        errorType: 'invalid_token_format',
        errorMessage: 'Invalid bot token format. Telegram bot tokens should be in format: 123456789:ABC-DEF1234567890'
      };
    }
    
    // Check token length (typical Telegram bot tokens are around 45-50 characters)
    if (token.length < 35 || token.length > 60) {
      logs.push(BotLogger.logWarning(`⚠️ Unusual token length: ${token.length} characters`));
      logs.push(BotLogger.log('', 'Typical Telegram bot tokens are 45-50 characters long'));
    }
    
    // Check if token starts with reasonable bot ID (should be at least 9 digits)
    const botIdPart = token.split(':')[0];
    if (botIdPart.length < 9) {
      logs.push(BotLogger.logWarning('⚠️ Bot ID seems unusually short'));
    }
    
    logs.push(BotLogger.logSuccess('✅ Token format is valid'));
    logs.push(BotLogger.log('', `Bot ID: ${botIdPart}`));
    return { isValid: true, logs };
  }

  static validateCode(code: string): ValidationResult {
    const logs: string[] = [];
    
    logs.push(BotLogger.logSection('PYTHON BOT CODE VALIDATION'));
    
    if (!code || code.trim().length === 0) {
      logs.push(BotLogger.logError('❌ No generated code provided'));
      return {
        isValid: false,
        logs,
        errorType: 'no_code',
        errorMessage: 'No bot code generated. Please try regenerating your bot.'
      };
    }
    
    logs.push(BotLogger.log('', `Code length: ${code.length} characters`));
    logs.push(BotLogger.log('', 'Code preview (first 200 chars):'));
    logs.push(BotLogger.log('', `${code.substring(0, 200)}${code.length > 200 ? '...' : ''}`));
    
    // Check if this is JavaScript code (which won't work in Python)
    const jsIndicators = [
      'grammy', 'import { Bot }', 'new Bot(', 'bot.start()', 
      'const ', 'let ', '=>', 'npm install', 'node.js'
    ];
    
    const foundJsIndicators = jsIndicators.filter(indicator => 
      code.toLowerCase().includes(indicator.toLowerCase())
    );
    
    if (foundJsIndicators.length > 0) {
      logs.push(BotLogger.logSection('❌ JAVASCRIPT CODE DETECTED'));
      logs.push(BotLogger.logError('Generated code appears to be JavaScript, but we need Python'));
      logs.push(BotLogger.log('', 'JavaScript indicators found:'));
      foundJsIndicators.forEach(indicator => {
        logs.push(BotLogger.log('', `- ${indicator}`));
      });
      
      return {
        isValid: false,
        logs,
        errorType: 'wrong_language',
        errorMessage: 'Generated code is JavaScript but we need Python. Please regenerate the bot requesting Python code specifically.'
      };
    }
    
    // Check for Python imports
    const pythonImports = [
      'from telegram', 'import telegram', 'from telegram.ext', 
      'import asyncio', 'python-telegram-bot'
    ];
    
    const foundPythonImports = pythonImports.filter(imp => 
      code.toLowerCase().includes(imp.toLowerCase())
    );
    
    if (foundPythonImports.length === 0) {
      logs.push(BotLogger.logWarning('⚠️ No python-telegram-bot imports detected'));
      logs.push(BotLogger.log('', 'Expected imports: from telegram.ext import Application, CommandHandler'));
    } else {
      logs.push(BotLogger.logSuccess('✅ Python telegram imports found'));
      foundPythonImports.forEach(imp => {
        logs.push(BotLogger.log('', `- ${imp}`));
      });
    }
    
    // Check for common Python bot patterns
    const pythonPatterns = [
      'def ', 'async def', 'if __name__', 'Application.builder()', 
      'add_handler', 'run_polling()'
    ];
    
    const foundPatterns = pythonPatterns.filter(pattern => 
      code.includes(pattern)
    );
    
    if (foundPatterns.length > 0) {
      logs.push(BotLogger.logSuccess('✅ Python bot patterns detected'));
      foundPatterns.forEach(pattern => {
        logs.push(BotLogger.log('', `- ${pattern}`));
      });
    }
    
    // Check for token usage
    const tokenPatterns = ['BOT_TOKEN', 'token', 'TOKEN', 'os.getenv'];
    const hasTokenUsage = tokenPatterns.some(pattern => code.includes(pattern));
    
    if (hasTokenUsage) {
      logs.push(BotLogger.logSuccess('✅ Token usage detected in code'));
    } else {
      logs.push(BotLogger.logWarning('⚠️ No token usage pattern found'));
    }
    
    logs.push(BotLogger.logSuccess('✅ Code validation completed'));
    return { isValid: true, logs };
  }

  static validateBotStructure(files: Record<string, string>): ValidationResult {
    const logs: string[] = [];
    
    logs.push(BotLogger.logSection('BOT FILE STRUCTURE VALIDATION'));
    
    if (!files || Object.keys(files).length === 0) {
      logs.push(BotLogger.logError('❌ No files provided'));
      return {
        isValid: false,
        logs,
        errorType: 'no_files',
        errorMessage: 'No bot files generated. Please regenerate your bot.'
      };
    }
    
    const fileNames = Object.keys(files);
    logs.push(BotLogger.log('', `Files provided: ${fileNames.length}`));
    fileNames.forEach(name => {
      logs.push(BotLogger.log('', `- ${name} (${files[name].length} chars)`));
    });
    
    // Check for main.py
    if (!files['main.py']) {
      logs.push(BotLogger.logError('❌ Missing main.py file'));
      return {
        isValid: false,
        logs,
        errorType: 'missing_main_file',
        errorMessage: 'main.py file is required for bot deployment.'
      };
    }
    
    logs.push(BotLogger.logSuccess('✅ main.py file found'));
    
    // Validate main.py content
    const mainPyValidation = this.validateCode(files['main.py']);
    if (!mainPyValidation.isValid) {
      logs.push(...mainPyValidation.logs);
      return {
        isValid: false,
        logs,
        errorType: mainPyValidation.errorType,
        errorMessage: `main.py validation failed: ${mainPyValidation.errorMessage}`
      };
    }
    
    logs.push(BotLogger.logSuccess('✅ Bot file structure is valid'));
    return { isValid: true, logs };
  }
}

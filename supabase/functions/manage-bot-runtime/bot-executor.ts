
import { Bot, webhookCallback } from "https://deno.land/x/grammy@v1.19.2/mod.ts";

// Store active bot instances
const activeBots = new Map<string, { bot: Bot; controller: AbortController }>();

export async function startTelegramBot(botId: string, token: string, code: string): Promise<{ success: boolean; logs: string[]; error?: string; errorType?: string }> {
  const logs: string[] = [];
  
  try {
    logs.push(`[${new Date().toISOString()}] ========== STARTING BOT ${botId} ==========`);
    logs.push(`[${new Date().toISOString()}] Bot ID: ${botId}`);
    logs.push(`[${new Date().toISOString()}] Token length: ${token ? token.length : 'undefined'} characters`);
    logs.push(`[${new Date().toISOString()}] Code provided: ${code ? 'YES' : 'NO'}`);
    logs.push(`[${new Date().toISOString()}] Code length: ${code ? code.length : 0} characters`);
    
    // Always stop existing bot first to prevent conflicts
    if (activeBots.has(botId)) {
      logs.push(`[${new Date().toISOString()}] EXISTING BOT DETECTED - stopping instance for ${botId}`);
      const stopResult = stopTelegramBot(botId);
      logs.push(...stopResult.logs);
      // Wait longer for the previous instance to fully stop
      await new Promise(resolve => setTimeout(resolve, 3000));
      logs.push(`[${new Date().toISOString()}] Waited 3 seconds for previous instance to stop`);
    }

    logs.push(`[${new Date().toISOString()}] ========== TOKEN VALIDATION ==========`);
    
    // Validate token format
    if (!token) {
      logs.push(`[${new Date().toISOString()}] ERROR: No token provided`);
      return { 
        success: false, 
        logs, 
        error: "No bot token provided. Please check your token from @BotFather.",
        errorType: "invalid_token"
      };
    }
    
    logs.push(`[${new Date().toISOString()}] Token format check: ${token.substring(0, 10)}...`);
    if (!token.match(/^\d+:[A-Za-z0-9_-]+$/)) {
      logs.push(`[${new Date().toISOString()}] ERROR: Invalid token format - does not match expected pattern`);
      return { 
        success: false, 
        logs, 
        error: "Invalid bot token format. Please check your token from @BotFather.",
        errorType: "invalid_token"
      };
    }
    logs.push(`[${new Date().toISOString()}] ✓ Token format is valid`);

    logs.push(`[${new Date().toISOString()}] ========== BOT INSTANCE CREATION ==========`);
    
    // Create new bot instance with error handling
    let botInstance: Bot;
    try {
      logs.push(`[${new Date().toISOString()}] Creating Bot instance with Grammy...`);
      botInstance = new Bot(token);
      logs.push(`[${new Date().toISOString()}] ✓ Bot instance created successfully`);
    } catch (tokenError) {
      logs.push(`[${new Date().toISOString()}] ERROR: Failed to create bot instance`);
      logs.push(`[${new Date().toISOString()}] Error details: ${tokenError.message}`);
      logs.push(`[${new Date().toISOString()}] Error stack: ${tokenError.stack || 'No stack trace'}`);
      return { 
        success: false, 
        logs, 
        error: "Failed to create bot instance. Please verify your bot token.",
        errorType: "bot_creation_failed"
      };
    }
    
    const controller = new AbortController();
    logs.push(`[${new Date().toISOString()}] ✓ Abort controller created`);
    
    // Create a custom console for logging
    const customConsole = {
      log: (...args: any[]) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        logs.push(`[${new Date().toISOString()}] BOT-OUTPUT: ${message}`);
      },
      error: (...args: any[]) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        logs.push(`[${new Date().toISOString()}] BOT-ERROR: ${message}`);
      },
      warn: (...args: any[]) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        logs.push(`[${new Date().toISOString()}] BOT-WARN: ${message}`);
      }
    };

    logs.push(`[${new Date().toISOString()}] ========== CODE ANALYSIS & EXECUTION ==========`);
    logs.push(`[${new Date().toISOString()}] Original code preview (first 500 chars):`);
    logs.push(`[${new Date().toISOString()}] ${code.substring(0, 500)}${code.length > 500 ? '...' : ''}`);
    
    if (!code || code.trim().length === 0) {
      logs.push(`[${new Date().toISOString()}] ERROR: No generated code provided`);
      return { 
        success: false, 
        logs, 
        error: "No generated code provided. Please regenerate your bot code.",
        errorType: "no_code"
      };
    }
    
    // Check if this is Python code (which won't work in Deno)
    const isPythonCode = code.includes('python-telegram-bot') || 
                        code.includes('from telegram') || 
                        code.includes('import telegram') ||
                        code.includes('def ') ||
                        code.includes('async def ') ||
                        code.includes('Update, ContextTypes');
    
    if (isPythonCode) {
      logs.push(`[${new Date().toISOString()}] ========== PYTHON CODE DETECTED ==========`);
      logs.push(`[${new Date().toISOString()}] ERROR: Generated code appears to be Python, but we need JavaScript/TypeScript for Deno runtime`);
      logs.push(`[${new Date().toISOString()}] Python indicators found:`);
      if (code.includes('python-telegram-bot')) logs.push(`[${new Date().toISOString()}] - python-telegram-bot library reference`);
      if (code.includes('from telegram')) logs.push(`[${new Date().toISOString()}] - 'from telegram' import`);
      if (code.includes('def ') || code.includes('async def ')) logs.push(`[${new Date().toISOString()}] - Python function definitions`);
      if (code.includes('Update, ContextTypes')) logs.push(`[${new Date().toISOString()}] - Python-specific types`);
      
      return { 
        success: false, 
        logs, 
        error: "Generated code is Python but we need JavaScript/TypeScript. Please regenerate the bot with JavaScript/TypeScript code for Grammy library.",
        errorType: "wrong_language"
      };
    }
    
    logs.push(`[${new Date().toISOString()}] ✓ Code appears to be JavaScript/TypeScript`);
    
    try {
      logs.push(`[${new Date().toISOString()}] ========== CODE CLEANING PROCESS ==========`);
      
      // Clean the code more aggressively - remove all imports and bot declarations
      let cleanCode = code
        // Remove all import statements (both ES6 and CommonJS)
        .replace(/^import\s+.*$/gm, '')
        .replace(/^from\s+.*?\s+import\s+.*$/gm, '')
        .replace(/const\s+.*?\s*=\s*require\(.*?\);?\s*/g, '')
        // Remove bot variable declarations and Bot constructor calls
        .replace(/\b(const|let|var)\s+bot\s*=.*?$/gm, '')
        .replace(/new\s+Bot\s*\(.*?\)/g, '')
        .replace(/Bot\s*\(/g, 'botInstance.constructor(')
        // Replace bot references with botInstance
        .replace(/\bbot\./g, 'botInstance.')
        .replace(/\bbot\s*=/g, 'botInstance =')
        // Remove bot.start() calls since we handle that
        .replace(/botInstance\.start\s*\(.*?\);?\s*/g, '')
        .replace(/botInstance\.run_polling\s*\(.*?\);?\s*/g, '')
        // Replace console references
        .replace(/console\./g, 'customConsole.')
        .trim();

      logs.push(`[${new Date().toISOString()}] Original code length: ${code.length}`);
      logs.push(`[${new Date().toISOString()}] Cleaned code length: ${cleanCode.length}`);
      logs.push(`[${new Date().toISOString()}] Cleaned code preview (first 300 chars):`);
      logs.push(`[${new Date().toISOString()}] ${cleanCode.substring(0, 300)}${cleanCode.length > 300 ? '...' : ''}`);

      if (!cleanCode || cleanCode.trim().length === 0) {
        logs.push(`[${new Date().toISOString()}] ERROR: After cleaning, no executable code remains`);
        logs.push(`[${new Date().toISOString()}] This usually means the generated code was mostly imports and declarations`);
        return { 
          success: false, 
          logs, 
          error: "Generated code is empty after processing. Please regenerate your bot.",
          errorType: "empty_processed_code"
        };
      }

      logs.push(`[${new Date().toISOString()}] ========== JAVASCRIPT EXECUTION ==========`);
      
      // Create a safe execution environment
      const executionCode = `
        try {
          ${cleanCode}
          return { success: true, message: 'Generated code executed successfully' };
        } catch (error) {
          return { success: false, error: error.message, stack: error.stack, name: error.name };
        }
      `;

      logs.push(`[${new Date().toISOString()}] Preparing function execution context...`);
      logs.push(`[${new Date().toISOString()}] Available in context: botInstance, customConsole, Bot`);
      
      // Execute the code in a function context
      const executeFunction = new Function('botInstance', 'customConsole', 'Bot', executionCode);
      logs.push(`[${new Date().toISOString()}] Function created successfully, executing...`);
      
      const result = executeFunction(botInstance, customConsole, Bot);
      
      logs.push(`[${new Date().toISOString()}] ========== EXECUTION RESULT ==========`);
      logs.push(`[${new Date().toISOString()}] Execution completed`);
      logs.push(`[${new Date().toISOString()}] Result: ${JSON.stringify(result)}`);
      
      if (!result || !result.success) {
        logs.push(`[${new Date().toISOString()}] ERROR: Generated code execution failed`);
        logs.push(`[${new Date().toISOString()}] Error message: ${result?.error || 'Unknown error'}`);
        logs.push(`[${new Date().toISOString()}] Error name: ${result?.name || 'Unknown'}`);
        if (result?.stack) {
          logs.push(`[${new Date().toISOString()}] Stack trace: ${result.stack}`);
        }
        logs.push(`[${new Date().toISOString()}] STRICT MODE: Bot will NOT start with fallback code`);
        return { 
          success: false, 
          logs, 
          error: `Code execution failed: ${result?.error || 'Unknown error'}`,
          errorType: "code_execution_failed"
        };
      }
      
      logs.push(`[${new Date().toISOString()}] ✓ Generated code executed successfully`);
      
    } catch (codeError) {
      logs.push(`[${new Date().toISOString()}] ERROR: Code execution failed with exception`);
      logs.push(`[${new Date().toISOString()}] Exception: ${codeError.message}`);
      logs.push(`[${new Date().toISOString()}] Exception name: ${codeError.name}`);
      logs.push(`[${new Date().toISOString()}] Exception stack: ${codeError.stack || 'No stack trace'}`);
      logs.push(`[${new Date().toISOString()}] STRICT MODE: No fallback handlers - bot MUST work with generated code`);
      return { 
        success: false, 
        logs, 
        error: `Code execution failed: ${codeError.message}`,
        errorType: "code_execution_failed"
      };
    }
    
    // Store the bot instance BEFORE starting
    activeBots.set(botId, { bot: botInstance, controller });
    logs.push(`[${new Date().toISOString()}] ✓ Bot instance stored in active bots map`);
    
    logs.push(`[${new Date().toISOString()}] ========== TELEGRAM CONNECTION TEST ==========`);
    
    try {
      logs.push(`[${new Date().toISOString()}] Testing bot connection with getMe()...`);
      
      // Test bot connection first with getMe
      const botInfoPromise = botInstance.api.getMe();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Bot token validation timeout after 10 seconds')), 10000)
      );
      
      const botInfo = await Promise.race([botInfoPromise, timeoutPromise]) as any;
      
      logs.push(`[${new Date().toISOString()}] ✓ Bot connected to Telegram successfully`);
      logs.push(`[${new Date().toISOString()}] Bot info: @${botInfo.username} (${botInfo.first_name})`);
      logs.push(`[${new Date().toISOString()}] Bot ID: ${botInfo.id}`);
      logs.push(`[${new Date().toISOString()}] Can join groups: ${botInfo.can_join_groups}`);
      logs.push(`[${new Date().toISOString()}] Can read all group messages: ${botInfo.can_read_all_group_messages}`);
      
      logs.push(`[${new Date().toISOString()}] ========== STARTING BOT POLLING ==========`);
      
      // Start the bot with proper error handling
      const startPromise = botInstance.start({
        drop_pending_updates: true,
        allowed_updates: ["message", "callback_query", "inline_query"]
      });
      
      const startTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Bot start operation timeout after 15 seconds')), 15000)
      );
      
      await Promise.race([startPromise, startTimeoutPromise]);
      
      logs.push(`[${new Date().toISOString()}] ✓ Bot started successfully with generated code ONLY`);
      logs.push(`[${new Date().toISOString()}] ✓ No demo/fallback code is running`);
      logs.push(`[${new Date().toISOString()}] ✓ Bot is ready to receive messages`);
      logs.push(`[${new Date().toISOString()}] ========== BOT STARTUP COMPLETE ==========`);
      
      return { success: true, logs };
      
    } catch (startError) {
      logs.push(`[${new Date().toISOString()}] ========== BOT START ERROR ==========`);
      logs.push(`[${new Date().toISOString()}] ERROR: Failed to start bot with Telegram`);
      logs.push(`[${new Date().toISOString()}] Error message: ${startError.message}`);
      logs.push(`[${new Date().toISOString()}] Error name: ${startError.name || 'Unknown'}`);
      logs.push(`[${new Date().toISOString()}] Error stack: ${startError.stack || 'No stack trace'}`);
      
      // Enhanced error detection and classification
      let errorType = "unknown_error";
      let userFriendlyError = "Failed to start bot. Please check your configuration.";
      
      if (startError.message.includes('409') || startError.message.includes('Conflict') || startError.message.includes('already running')) {
        errorType = "bot_already_running";
        userFriendlyError = "This bot is already running in another location. Please stop the other instance first or wait a few minutes before trying again.";
        logs.push(`[${new Date().toISOString()}] ➤ DETECTED: Bot token conflict - another instance is running`);
      } else if (startError.message.includes('401') || startError.message.includes('Unauthorized') || startError.message.includes('token')) {
        errorType = "invalid_token";
        userFriendlyError = "Invalid bot token. Please check your token from @BotFather and make sure it's correct.";
        logs.push(`[${new Date().toISOString()}] ➤ DETECTED: Invalid bot token - check @BotFather`);
      } else if (startError.message.includes('timeout') || startError.message.includes('network')) {
        errorType = "network_timeout";
        userFriendlyError = "Network timeout while connecting to Telegram. Please check your internet connection and try again.";
        logs.push(`[${new Date().toISOString()}] ➤ DETECTED: Network timeout - check connectivity`);
      } else if (startError.message.includes('rate') || startError.message.includes('limit')) {
        errorType = "rate_limited";
        userFriendlyError = "Rate limited by Telegram. Please wait a few minutes before trying again.";
        logs.push(`[${new Date().toISOString()}] ➤ DETECTED: Rate limited by Telegram`);
      } else {
        logs.push(`[${new Date().toISOString()}] ➤ DETECTED: Unexpected error type`);
      }
      
      // Remove from active bots on error
      activeBots.delete(botId);
      logs.push(`[${new Date().toISOString()}] Bot removed from active bots map due to error`);
      
      return { 
        success: false, 
        logs, 
        error: userFriendlyError,
        errorType 
      };
    }
    
  } catch (error) {
    logs.push(`[${new Date().toISOString()}] ========== CRITICAL ERROR ==========`);
    logs.push(`[${new Date().toISOString()}] CRITICAL ERROR: ${error.message}`);
    logs.push(`[${new Date().toISOString()}] Error name: ${error.name || 'Unknown'}`);
    logs.push(`[${new Date().toISOString()}] Error stack: ${error.stack || 'No stack trace'}`);
    activeBots.delete(botId);
    return { 
      success: false, 
      logs, 
      error: `Critical error: ${error.message}`,
      errorType: "critical_error"
    };
  }
}

export function stopTelegramBot(botId: string): { success: boolean; logs: string[] } {
  const logs: string[] = [];
  
  try {
    logs.push(`[${new Date().toISOString()}] ========== STOPPING BOT ${botId} ==========`);
    
    const botInstance = activeBots.get(botId);
    
    if (!botInstance) {
      logs.push(`[${new Date().toISOString()}] No active bot found for ${botId} - already stopped`);
      logs.push(`[${new Date().toISOString()}] Current active bots: ${Array.from(activeBots.keys()).join(', ') || 'None'}`);
      return { success: true, logs };
    }
    
    logs.push(`[${new Date().toISOString()}] Found active bot instance, proceeding with graceful shutdown...`);
    
    // Stop the bot gracefully
    try {
      if (botInstance.bot && typeof botInstance.bot.stop === 'function') {
        logs.push(`[${new Date().toISOString()}] Calling bot.stop()...`);
        botInstance.bot.stop();
        logs.push(`[${new Date().toISOString()}] ✓ Bot stopped gracefully`);
      } else {
        logs.push(`[${new Date().toISOString()}] Warning: bot.stop() method not available`);
      }
    } catch (stopError) {
      logs.push(`[${new Date().toISOString()}] Warning during graceful stop: ${stopError.message}`);
    }
    
    // Always abort the controller
    try {
      if (botInstance.controller && typeof botInstance.controller.abort === 'function') {
        logs.push(`[${new Date().toISOString()}] Aborting controller...`);
        botInstance.controller.abort();
        logs.push(`[${new Date().toISOString()}] ✓ Controller aborted`);
      } else {
        logs.push(`[${new Date().toISOString()}] Warning: controller.abort() method not available`);
      }
    } catch (abortError) {
      logs.push(`[${new Date().toISOString()}] Warning during abort: ${abortError.message}`);
    }
    
    // Always remove from active bots
    activeBots.delete(botId);
    
    logs.push(`[${new Date().toISOString()}] ✓ Bot ${botId} completely stopped and removed`);
    logs.push(`[${new Date().toISOString()}] Remaining active bots: ${Array.from(activeBots.keys()).join(', ') || 'None'}`);
    logs.push(`[${new Date().toISOString()}] ========== BOT STOP COMPLETE ==========`);
    
    return { success: true, logs };
    
  } catch (error) {
    logs.push(`[${new Date().toISOString()}] ERROR stopping bot: ${error.message}`);
    logs.push(`[${new Date().toISOString()}] Error stack: ${error.stack || 'No stack trace'}`);
    // Still remove from active bots even if there was an error
    activeBots.delete(botId);
    logs.push(`[${new Date().toISOString()}] Bot forcefully removed from active bots map`);
    return { success: false, logs };
  }
}

export function getBotLogs(botId: string): string[] {
  const timestamp = new Date().toISOString();
  const isActive = activeBots.has(botId);
  const activeCount = activeBots.size;
  const activeBotIds = Array.from(activeBots.keys());
  
  return [
    `[${timestamp}] ========== BOT STATUS QUERY ==========`,
    `[${timestamp}] Bot ID: ${botId}`,
    `[${timestamp}] Status: ${isActive ? 'RUNNING with generated code' : 'STOPPED'}`,
    `[${timestamp}] Total active bots: ${activeCount}`,
    `[${timestamp}] Active bot IDs: ${activeBotIds.join(', ') || 'None'}`,
    `[${timestamp}] STRICT MODE: No demo/fallback code allowed`,
    `[${timestamp}] Runtime: Deno with Grammy library`,
    `[${timestamp}] ========== STATUS QUERY COMPLETE ==========`
  ];
}

export function listActiveBots(): string[] {
  return Array.from(activeBots.keys());
}

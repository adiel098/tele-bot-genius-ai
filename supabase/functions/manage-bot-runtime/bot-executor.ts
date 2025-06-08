
import { Bot, webhookCallback } from "https://deno.land/x/grammy@v1.19.2/mod.ts";

// Store active bot instances
const activeBots = new Map<string, { bot: Bot; controller: AbortController }>();

export async function startTelegramBot(botId: string, token: string, code: string): Promise<{ success: boolean; logs: string[] }> {
  const logs: string[] = [];
  
  try {
    logs.push(`[${new Date().toISOString()}] Starting bot ${botId} with ONLY generated code`);
    
    // Always stop existing bot first to prevent conflicts
    if (activeBots.has(botId)) {
      logs.push(`[${new Date().toISOString()}] Stopping existing bot instance for ${botId}`);
      const stopResult = stopTelegramBot(botId);
      logs.push(...stopResult.logs);
      // Wait longer for the previous instance to fully stop
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    logs.push(`[${new Date().toISOString()}] Validating bot token format...`);
    
    // Validate token format
    if (!token || !token.match(/^\d+:[A-Za-z0-9_-]+$/)) {
      logs.push(`[${new Date().toISOString()}] ERROR: Invalid bot token format`);
      return { success: false, logs };
    }

    logs.push(`[${new Date().toISOString()}] Creating bot instance for ${botId}`);
    
    // Create new bot instance with error handling
    let botInstance: Bot;
    try {
      botInstance = new Bot(token);
    } catch (tokenError) {
      logs.push(`[${new Date().toISOString()}] ERROR: Failed to create bot instance - ${tokenError.message}`);
      return { success: false, logs };
    }
    
    const controller = new AbortController();
    
    // Create a custom console for logging
    const customConsole = {
      log: (...args: any[]) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        logs.push(`[${new Date().toISOString()}] BOT: ${message}`);
      },
      error: (...args: any[]) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        logs.push(`[${new Date().toISOString()}] BOT ERROR: ${message}`);
      },
      warn: (...args: any[]) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        logs.push(`[${new Date().toISOString()}] BOT WARN: ${message}`);
      }
    };

    // Execute bot code - STRICT MODE: No fallbacks, must work or fail
    logs.push(`[${new Date().toISOString()}] Executing ONLY generated code - NO FALLBACKS`);
    logs.push(`[${new Date().toISOString()}] Generated code length: ${code.length} characters`);
    
    if (!code || code.trim().length === 0) {
      logs.push(`[${new Date().toISOString()}] ERROR: No generated code provided`);
      return { success: false, logs };
    }
    
    try {
      // Clean the code more aggressively - remove all imports and bot declarations
      let cleanCode = code
        // Remove all import statements (Python style)
        .replace(/^import\s+.*$/gm, '')
        .replace(/^from\s+.*?\s+import\s+.*$/gm, '')
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
        // Remove any console.log that might interfere
        .replace(/console\./g, 'customConsole.')
        .trim();

      logs.push(`[${new Date().toISOString()}] Code cleaned for execution`);
      logs.push(`[${new Date().toISOString()}] Cleaned code preview: ${cleanCode.substring(0, 300)}...`);

      if (!cleanCode || cleanCode.trim().length === 0) {
        logs.push(`[${new Date().toISOString()}] ERROR: After cleaning, no executable code remains`);
        return { success: false, logs };
      }

      // Create a safe execution environment - STRICT MODE
      const executionCode = `
        try {
          ${cleanCode}
          return { success: true, message: 'Generated code executed successfully' };
        } catch (error) {
          return { success: false, error: error.message, stack: error.stack };
        }
      `;

      // Execute the code in a function context
      const executeFunction = new Function('botInstance', 'customConsole', 'Bot', executionCode);
      const result = executeFunction(botInstance, customConsole, Bot);
      
      if (!result || !result.success) {
        logs.push(`[${new Date().toISOString()}] ERROR: Generated code execution failed: ${result?.error || 'Unknown error'}`);
        if (result?.stack) {
          logs.push(`[${new Date().toISOString()}] ERROR: Stack trace: ${result.stack}`);
        }
        logs.push(`[${new Date().toISOString()}] STRICT MODE: Bot will NOT start with fallback code`);
        return { success: false, logs };
      }
      
      logs.push(`[${new Date().toISOString()}] SUCCESS: Generated code executed successfully`);
      
    } catch (codeError) {
      logs.push(`[${new Date().toISOString()}] ERROR: Code execution failed: ${codeError.message}`);
      logs.push(`[${new Date().toISOString()}] STRICT MODE: No fallback handlers - bot MUST work with generated code`);
      return { success: false, logs };
    }
    
    // Store the bot instance BEFORE starting
    activeBots.set(botId, { bot: botInstance, controller });
    
    logs.push(`[${new Date().toISOString()}] Testing bot connection with Telegram...`);
    
    try {
      // Test bot connection first with getMe
      const botInfo = await Promise.race([
        botInstance.api.getMe(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Bot token validation timeout')), 10000)
        )
      ]) as any;
      
      logs.push(`[${new Date().toISOString()}] SUCCESS: Bot connected to Telegram: @${botInfo.username}`);
      
      // Start the bot with proper error handling
      await Promise.race([
        botInstance.start({
          drop_pending_updates: true,
          allowed_updates: ["message", "callback_query", "inline_query"]
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Bot start operation timeout')), 15000)
        )
      ]);
      
      logs.push(`[${new Date().toISOString()}] SUCCESS: Bot started with generated code ONLY`);
      logs.push(`[${new Date().toISOString()}] No demo/fallback code is running`);
      return { success: true, logs };
      
    } catch (startError) {
      logs.push(`[${new Date().toISOString()}] ERROR: Failed to start bot with Telegram: ${startError.message}`);
      
      // Provide specific error guidance
      if (startError.message.includes('409') || startError.message.includes('Conflict')) {
        logs.push(`[${new Date().toISOString()}] ERROR: Bot token conflict - another instance may be running`);
      } else if (startError.message.includes('401') || startError.message.includes('Unauthorized')) {
        logs.push(`[${new Date().toISOString()}] ERROR: Invalid bot token - check @BotFather`);
      } else if (startError.message.includes('timeout')) {
        logs.push(`[${new Date().toISOString()}] ERROR: Network timeout - check connectivity`);
      }
      
      // Remove from active bots on error
      activeBots.delete(botId);
      return { success: false, logs };
    }
    
  } catch (error) {
    logs.push(`[${new Date().toISOString()}] CRITICAL ERROR: ${error.message}`);
    activeBots.delete(botId);
    return { success: false, logs };
  }
}

export function stopTelegramBot(botId: string): { success: boolean; logs: string[] } {
  const logs: string[] = [];
  
  try {
    const botInstance = activeBots.get(botId);
    
    if (!botInstance) {
      logs.push(`[${new Date().toISOString()}] No active bot found for ${botId} - already stopped`);
      return { success: true, logs };
    }
    
    logs.push(`[${new Date().toISOString()}] Stopping bot ${botId}...`);
    
    // Stop the bot gracefully
    try {
      if (botInstance.bot && typeof botInstance.bot.stop === 'function') {
        botInstance.bot.stop();
        logs.push(`[${new Date().toISOString()}] Bot ${botId} stopped gracefully`);
      }
    } catch (stopError) {
      logs.push(`[${new Date().toISOString()}] Warning during graceful stop: ${stopError.message}`);
    }
    
    // Always abort the controller
    try {
      if (botInstance.controller && typeof botInstance.controller.abort === 'function') {
        botInstance.controller.abort();
        logs.push(`[${new Date().toISOString()}] Bot ${botId} controller aborted`);
      }
    } catch (abortError) {
      logs.push(`[${new Date().toISOString()}] Warning during abort: ${abortError.message}`);
    }
    
    // Always remove from active bots
    activeBots.delete(botId);
    
    logs.push(`[${new Date().toISOString()}] Bot ${botId} completely stopped and removed`);
    return { success: true, logs };
    
  } catch (error) {
    logs.push(`[${new Date().toISOString()}] ERROR stopping bot: ${error.message}`);
    // Still remove from active bots even if there was an error
    activeBots.delete(botId);
    return { success: false, logs };
  }
}

export function getBotLogs(botId: string): string[] {
  // In a real implementation, you'd retrieve stored logs
  // For now, return current status
  const isActive = activeBots.has(botId);
  return [
    `[${new Date().toISOString()}] Bot status: ${isActive ? 'RUNNING with generated code' : 'STOPPED'}`,
    `[${new Date().toISOString()}] Active bots: ${activeBots.size}`,
    `[${new Date().toISOString()}] STRICT MODE: No demo/fallback code allowed`,
    `[${new Date().toISOString()}] Active bot IDs: ${Array.from(activeBots.keys()).join(', ') || 'None'}`
  ];
}

export function listActiveBots(): string[] {
  return Array.from(activeBots.keys());
}


import { Bot, webhookCallback } from "https://deno.land/x/grammy@v1.19.2/mod.ts";

// Store active bot instances
const activeBots = new Map<string, { bot: Bot; controller: AbortController }>();

export async function startTelegramBot(botId: string, token: string, code: string): Promise<{ success: boolean; logs: string[] }> {
  const logs: string[] = [];
  
  try {
    // Always stop existing bot first to prevent conflicts
    if (activeBots.has(botId)) {
      logs.push(`[${new Date().toISOString()}] Stopping existing bot instance for ${botId}`);
      const stopResult = stopTelegramBot(botId);
      logs.push(...stopResult.logs);
      // Wait longer for the previous instance to fully stop
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    logs.push(`[${new Date().toISOString()}] Creating new bot instance for ${botId}`);
    
    // Create new bot instance
    const botInstance = new Bot(token);
    const controller = new AbortController();
    
    // Create a custom console for logging
    const customConsole = {
      log: (...args: any[]) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        logs.push(`[${new Date().toISOString()}] ${message}`);
      },
      error: (...args: any[]) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        logs.push(`[${new Date().toISOString()}] ERROR: ${message}`);
      },
      warn: (...args: any[]) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        logs.push(`[${new Date().toISOString()}] WARN: ${message}`);
      }
    };

    // Execute bot code by creating a dynamic module
    try {
      // More aggressive cleaning of the code
      let cleanCode = code
        // Remove all import statements
        .replace(/import\s+.*?from\s+['"].*?['"];?\s*/g, '')
        .replace(/import\s*\{.*?\}\s*from\s*['"].*?['"];?\s*/g, '')
        .replace(/from\s+['"]grammy['"];?\s*/g, '')
        // Remove any bot variable declarations
        .replace(/const\s+bot\s*=.*?;/g, '')
        .replace(/let\s+bot\s*=.*?;/g, '')
        .replace(/var\s+bot\s*=.*?;/g, '')
        // Remove Bot constructor calls
        .replace(/new\s+Bot\s*\(.*?\);?/g, '')
        // Remove any standalone 'bot' references that might be declarations
        .replace(/^\s*bot\s*=/gm, 'botInstance =')
        // Replace any remaining 'bot.' with 'botInstance.'
        .replace(/\bbot\./g, 'botInstance.')
        // Remove any bot.start() calls since we handle that
        .replace(/botInstance\.start\s*\(.*?\);?\s*/g, '');

      logs.push(`[${new Date().toISOString()}] Cleaned code for execution`);
      logs.push(`[${new Date().toISOString()}] Code preview: ${cleanCode.substring(0, 200)}...`);

      // Create a safe execution environment
      const executionCode = `
        try {
          ${cleanCode}
          return { success: true, message: 'Bot code executed successfully' };
        } catch (error) {
          return { success: false, error: error.message };
        }
      `;

      // Execute the code in a function context
      const executeFunction = new Function('botInstance', 'console', 'Bot', executionCode);
      const result = executeFunction(botInstance, customConsole, Bot);
      
      if (result && !result.success) {
        throw new Error(`Code execution failed: ${result.error}`);
      }
      
      logs.push(`[${new Date().toISOString()}] Bot code executed successfully`);
      
    } catch (codeError) {
      logs.push(`[${new Date().toISOString()}] Error executing bot code: ${codeError.message}`);
      logs.push(`[${new Date().toISOString()}] Code that failed: ${code.substring(0, 500)}...`);
      
      // Only fall back to echo bot if absolutely necessary
      logs.push(`[${new Date().toISOString()}] Creating basic bot handlers as fallback`);
      
      botInstance.command('start', (ctx) => {
        customConsole.log('Start command received');
        ctx.reply('Hello! I am your bot. There is an issue with the original code, but I am still here to help.');
      });
      
      botInstance.on('message:text', (ctx) => {
        customConsole.log(`Received message: ${ctx.message.text}`);
        ctx.reply(`I received your message: "${ctx.message.text}". There is a technical issue with the original code, but I am working on it.`);
      });
    }
    
    // Store the bot instance BEFORE starting to prevent race conditions
    activeBots.set(botId, { bot: botInstance, controller });
    
    try {
      // Start the bot with proper error handling for conflicts
      await botInstance.start({
        drop_pending_updates: true,
        allowed_updates: ["message", "callback_query", "inline_query"]
      });
      
      logs.push(`[${new Date().toISOString()}] Bot started successfully and listening for messages`);
      return { success: true, logs };
      
    } catch (startError) {
      logs.push(`[${new Date().toISOString()}] ERROR: Failed to start bot - ${startError.message}`);
      
      // If it's a conflict error, try to handle it gracefully
      if (startError.message.includes('409') || startError.message.includes('Conflict')) {
        logs.push(`[${new Date().toISOString()}] Detected conflict - another bot instance may be running`);
        
        // Remove from active bots and try once more after a longer delay
        activeBots.delete(botId);
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        logs.push(`[${new Date().toISOString()}] Retrying bot start after conflict resolution...`);
        
        try {
          const newBotInstance = new Bot(token);
          activeBots.set(botId, { bot: newBotInstance, controller });
          
          await newBotInstance.start({
            drop_pending_updates: true,
            allowed_updates: ["message", "callback_query", "inline_query"]
          });
          
          logs.push(`[${new Date().toISOString()}] Bot started successfully on retry`);
          return { success: true, logs };
          
        } catch (retryError) {
          logs.push(`[${new Date().toISOString()}] ERROR: Bot start failed on retry - ${retryError.message}`);
          activeBots.delete(botId);
          return { success: false, logs };
        }
      } else {
        // Remove from active bots on other errors
        activeBots.delete(botId);
        return { success: false, logs };
      }
    }
    
  } catch (error) {
    logs.push(`[${new Date().toISOString()}] ERROR: Failed to start bot - ${error.message}`);
    // Ensure cleanup on any error
    activeBots.delete(botId);
    return { success: false, logs };
  }
}

export function stopTelegramBot(botId: string): { success: boolean; logs: string[] } {
  const logs: string[] = [];
  
  try {
    const botInstance = activeBots.get(botId);
    
    if (!botInstance) {
      logs.push(`[${new Date().toISOString()}] No active bot found for ${botId}`);
      return { success: true, logs }; // Return success even if no bot found
    }
    
    logs.push(`[${new Date().toISOString()}] Stopping bot ${botId}...`);
    
    // Stop the bot gracefully with better error handling
    try {
      // First try to stop gracefully
      if (botInstance.bot && typeof botInstance.bot.stop === 'function') {
        botInstance.bot.stop();
        logs.push(`[${new Date().toISOString()}] Bot ${botId} stopped gracefully`);
      }
    } catch (stopError) {
      logs.push(`[${new Date().toISOString()}] Error during graceful stop: ${stopError.message}`);
    }
    
    // Always abort the controller
    try {
      if (botInstance.controller && typeof botInstance.controller.abort === 'function') {
        botInstance.controller.abort();
        logs.push(`[${new Date().toISOString()}] Bot ${botId} controller aborted`);
      }
    } catch (abortError) {
      logs.push(`[${new Date().toISOString()}] Error aborting controller: ${abortError.message}`);
    }
    
    // Always remove from active bots
    activeBots.delete(botId);
    
    logs.push(`[${new Date().toISOString()}] Bot ${botId} removed from active instances`);
    logs.push(`[${new Date().toISOString()}] Bot ${botId} stopped successfully`);
    return { success: true, logs };
    
  } catch (error) {
    logs.push(`[${new Date().toISOString()}] ERROR: Failed to stop bot - ${error.message}`);
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
    `[${new Date().toISOString()}] Bot status: ${isActive ? 'RUNNING' : 'STOPPED'}`,
    `[${new Date().toISOString()}] Active bots: ${activeBots.size}`,
    `[${new Date().toISOString()}] Active bot IDs: ${Array.from(activeBots.keys()).join(', ')}`
  ];
}

export function listActiveBots(): string[] {
  return Array.from(activeBots.keys());
}

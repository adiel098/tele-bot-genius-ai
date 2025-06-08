
import { Bot, webhookCallback } from "https://deno.land/x/grammy@v1.19.2/mod.ts";

// Store active bot instances
const activeBots = new Map<string, { bot: Bot; controller: AbortController }>();

export async function startTelegramBot(botId: string, token: string, code: string): Promise<{ success: boolean; logs: string[] }> {
  const logs: string[] = [];
  
  try {
    // Stop existing bot if running
    if (activeBots.has(botId)) {
      stopTelegramBot(botId);
    }

    logs.push(`[${new Date().toISOString()}] Creating bot instance for ${botId}`);
    
    // Create new bot instance
    const bot = new Bot(token);
    const controller = new AbortController();
    
    // Execute the bot code in a safe context
    const botFunction = new Function('bot', 'console', code);
    
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

    // Execute bot code with custom console
    botFunction(bot, customConsole);
    
    logs.push(`[${new Date().toISOString()}] Bot code executed successfully`);
    
    // Start the bot
    await bot.start({
      drop_pending_updates: true,
      allowed_updates: ["message", "callback_query", "inline_query"]
    });
    
    logs.push(`[${new Date().toISOString()}] Bot started and listening for messages`);
    
    // Store the bot instance
    activeBots.set(botId, { bot, controller });
    
    return { success: true, logs };
    
  } catch (error) {
    logs.push(`[${new Date().toISOString()}] ERROR: Failed to start bot - ${error.message}`);
    return { success: false, logs };
  }
}

export function stopTelegramBot(botId: string): { success: boolean; logs: string[] } {
  const logs: string[] = [];
  
  try {
    const botInstance = activeBots.get(botId);
    
    if (!botInstance) {
      logs.push(`[${new Date().toISOString()}] No active bot found for ${botId}`);
      return { success: false, logs };
    }
    
    // Stop the bot
    botInstance.bot.stop();
    botInstance.controller.abort();
    
    // Remove from active bots
    activeBots.delete(botId);
    
    logs.push(`[${new Date().toISOString()}] Bot ${botId} stopped successfully`);
    return { success: true, logs };
    
  } catch (error) {
    logs.push(`[${new Date().toISOString()}] ERROR: Failed to stop bot - ${error.message}`);
    return { success: false, logs };
  }
}

export function getBotLogs(botId: string): string[] {
  // In a real implementation, you'd retrieve stored logs
  // For now, return current status
  const isActive = activeBots.has(botId);
  return [
    `[${new Date().toISOString()}] Bot status: ${isActive ? 'RUNNING' : 'STOPPED'}`,
    `[${new Date().toISOString()}] Active bots: ${activeBots.size}`
  ];
}

export function listActiveBots(): string[] {
  return Array.from(activeBots.keys());
}

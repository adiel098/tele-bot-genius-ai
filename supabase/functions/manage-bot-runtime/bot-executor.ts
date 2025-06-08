
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
      // Replace any import statements with direct grammy usage
      const cleanCode = code
        .replace(/import\s+.*?from\s+['"].*?['"];?\s*/g, '')
        .replace(/from\s+['"]grammy['"]/, '')
        .replace(/import\s*\{\s*Bot\s*\}/, '// Bot is already available');

      // Create a function that has access to Bot and console
      const botFunction = new Function('bot', 'console', 'Bot', cleanCode);
      
      // Execute bot code with the bot instance, custom console, and Bot constructor
      botFunction(bot, customConsole, Bot);
      
      logs.push(`[${new Date().toISOString()}] Bot code executed successfully`);
      
    } catch (codeError) {
      logs.push(`[${new Date().toISOString()}] Error executing bot code: ${codeError.message}`);
      
      // Fallback: create a simple echo bot if the custom code fails
      logs.push(`[${new Date().toISOString()}] Falling back to simple echo bot`);
      
      bot.on('message:text', (ctx) => {
        customConsole.log(`Received message: ${ctx.message.text}`);
        ctx.reply(`Echo: ${ctx.message.text}`);
      });
      
      bot.command('start', (ctx) => {
        customConsole.log('Start command received');
        ctx.reply('Hello! I am your AI bot. Send me any message and I will echo it back.');
      });
    }
    
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

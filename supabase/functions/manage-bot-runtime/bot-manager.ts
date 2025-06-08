
import { 
  startBotOperation, 
  stopBotOperation, 
  restartBotOperation, 
  streamLogsOperation 
} from './bot-operations.ts';

export async function startBot(botId: string, userId: string): Promise<{ success: boolean; logs: string[]; containerId?: string }> {
  return await startBotOperation(botId, userId);
}

export async function stopBot(botId: string): Promise<{ success: boolean; logs: string[] }> {
  return await stopBotOperation(botId);
}

export async function restartBot(botId: string, userId: string): Promise<{ success: boolean; logs: string[] }> {
  return await restartBotOperation(botId, userId);
}

export async function streamLogs(botId: string): Promise<{ success: boolean; logs: string[] }> {
  return await streamLogsOperation(botId);
}

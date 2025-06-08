
import { createDockerContainer } from './container-creation.ts';
import { 
  stopDockerContainer, 
  getDockerContainerStatusAsync, 
  getDockerContainerLogs 
} from './container-management.ts';
import { storeContainerReference } from './container-database.ts';

export async function createContainer(botId: string, actualBotCode: string, token: string): Promise<{ success: boolean; logs: string[]; containerId?: string; error?: string }> {
  const result = await createDockerContainer(botId, actualBotCode, token);
  
  // Store container reference if creation was successful
  if (result.success && result.containerId) {
    await storeContainerReference(botId, result.containerId);
  }
  
  return result;
}

export { 
  stopDockerContainer, 
  getDockerContainerStatusAsync, 
  getDockerContainerLogs 
};

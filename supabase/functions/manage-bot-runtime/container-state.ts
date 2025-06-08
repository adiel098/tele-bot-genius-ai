
import { BotLogger } from './logger.ts';

// Enhanced global container tracking with persistence simulation
const GLOBAL_CONTAINER_STATE = new Map<string, string>(); // botId -> containerId

// Initialize with any existing containers from "database" simulation
let isInitialized = false;

export function initializeContainerState() {
  if (!isInitialized) {
    console.log(`[${new Date().toISOString()}] Initializing container state...`);
    // In a real implementation, this would load from persistent storage
    // For now, we simulate persistence within the same session
    isInitialized = true;
    console.log(`[${new Date().toISOString()}] Container state initialized`);
  }
}

export function storeContainerReference(botId: string, containerId: string): void {
  console.log(`[${new Date().toISOString()}] *** CRITICAL: STORING CONTAINER REFERENCE ***`);
  console.log(`[${new Date().toISOString()}] Before storing - GLOBAL_CONTAINER_STATE size: ${GLOBAL_CONTAINER_STATE.size}`);
  GLOBAL_CONTAINER_STATE.set(botId, containerId);
  console.log(`[${new Date().toISOString()}] After storing - GLOBAL_CONTAINER_STATE size: ${GLOBAL_CONTAINER_STATE.size}`);
  console.log(`[${new Date().toISOString()}] Stored mapping: ${botId} -> ${containerId}`);
  
  // CRITICAL: Verify storage immediately
  const storedContainerId = GLOBAL_CONTAINER_STATE.get(botId);
  console.log(`[${new Date().toISOString()}] *** VERIFICATION: Retrieved container ID: ${storedContainerId} ***`);
  
  if (storedContainerId !== containerId) {
    throw new Error(`Container storage failed! Expected: ${containerId}, Got: ${storedContainerId}`);
  }
}

export function removeContainerReference(botId: string): void {
  console.log(`[${new Date().toISOString()}] *** REMOVING CONTAINER FROM STATE ***`);
  console.log(`[${new Date().toISOString()}] Before removal - size: ${GLOBAL_CONTAINER_STATE.size}`);
  GLOBAL_CONTAINER_STATE.delete(botId);
  console.log(`[${new Date().toISOString()}] After removal - size: ${GLOBAL_CONTAINER_STATE.size}`);
}

export function getContainerReference(botId: string): string | undefined {
  console.log(`[${new Date().toISOString()}] ========== GET REAL CONTAINER STATUS ==========`);
  console.log(`[${new Date().toISOString()}] Checking status for bot: ${botId}`);
  console.log(`[${new Date().toISOString()}] Current GLOBAL_CONTAINER_STATE size: ${GLOBAL_CONTAINER_STATE.size}`);
  console.log(`[${new Date().toISOString()}] All stored bot IDs:`, Array.from(GLOBAL_CONTAINER_STATE.keys()));
  
  const containerId = GLOBAL_CONTAINER_STATE.get(botId);
  console.log(`[${new Date().toISOString()}] Container ID for ${botId}: ${containerId || 'undefined'}`);
  
  return containerId;
}

export function getAllRunningContainers(): string[] {
  return Array.from(GLOBAL_CONTAINER_STATE.keys());
}

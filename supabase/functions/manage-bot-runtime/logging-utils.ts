
export class LoggingUtils {
  static logOperation(operation: string, botId: string, details?: any) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ========== ${operation.toUpperCase()} ==========`);
    console.log(`[${timestamp}] Bot ID: ${botId}`);
    
    if (details) {
      Object.entries(details).forEach(([key, value]) => {
        console.log(`[${timestamp}] ${key}: ${value}`);
      });
    }
  }

  static logCompletion(operation: string, duration: number, success: boolean, details?: any) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ========== ${operation.toUpperCase()} COMPLETED ==========`);
    console.log(`[${timestamp}] Duration: ${duration}ms`);
    console.log(`[${timestamp}] Success: ${success}`);
    
    if (details) {
      Object.entries(details).forEach(([key, value]) => {
        console.log(`[${timestamp}] ${key}: ${value}`);
      });
    }
  }

  static logError(operation: string, duration: number, error: Error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ========== ${operation.toUpperCase()} ERROR ==========`);
    console.error(`[${timestamp}] Failed after ${duration}ms: ${error.message}`);
  }
}

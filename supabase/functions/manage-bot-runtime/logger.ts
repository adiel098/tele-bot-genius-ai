
export class BotLogger {
  static log(botId: string, message: string): string {
    return `[${new Date().toISOString()}] ${message}`;
  }

  static logSection(title: string): string {
    return `[${new Date().toISOString()}] ========== ${title} ==========`;
  }

  static logError(message: string, error?: any): string {
    const errorDetails = error ? ` - ${error.message || error}` : '';
    return `[${new Date().toISOString()}] ERROR: ${message}${errorDetails}`;
  }

  static logSuccess(message: string): string {
    return `[${new Date().toISOString()}] ✓ ${message}`;
  }

  static logWarning(message: string): string {
    return `[${new Date().toISOString()}] WARNING: ${message}`;
  }
}

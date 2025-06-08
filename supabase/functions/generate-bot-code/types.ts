
export interface BotCodeResponse {
  files: Record<string, string>;
  explanation: string;
}

export interface DeploymentInfo {
  executionId: string;
  autoStartInitiated: boolean;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  files?: Record<string, string>;
}

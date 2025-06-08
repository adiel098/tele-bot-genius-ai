
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  files?: Record<string, string>;
}

export interface DeploymentInfo {
  executionId: string;
  deploymentType: 'kubernetes' | 'deno';
  autoStartInitiated?: boolean;
  kubernetesConfig?: {
    success: boolean;
    namespace: string;
    helmChartPath: string;
    deploymentCommand: string;
  };
}

export interface KubernetesConfig {
  namespace: string;
  replicas: number;
  resources: {
    memory: string;
    cpu: string;
  };
}

export interface BotExecutionLogs {
  timestamp: string;
  level: 'info' | 'error' | 'warn';
  message: string;
  source: 'telegram' | 'kubernetes' | 'helm' | 'docker';
}

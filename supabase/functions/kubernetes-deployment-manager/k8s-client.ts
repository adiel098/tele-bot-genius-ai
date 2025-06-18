
export class KubernetesClient {
  private kubeconfig: any;
  private apiServer: string;
  private token: string;

  constructor() {
    this.initializeKubeconfig();
  }

  private initializeKubeconfig() {
    try {
      const kubeconfigYaml = Deno.env.get('KUBECONFIG');
      if (!kubeconfigYaml) {
        throw new Error('KUBECONFIG environment variable not set');
      }

      // Parse YAML kubeconfig (simplified parser for basic structure)
      this.kubeconfig = this.parseKubeconfig(kubeconfigYaml);
      
      const currentContext = this.kubeconfig.contexts.find(
        (ctx: any) => ctx.name === this.kubeconfig['current-context']
      );
      
      if (!currentContext) {
        throw new Error('Current context not found in kubeconfig');
      }

      const cluster = this.kubeconfig.clusters.find(
        (c: any) => c.name === currentContext.context.cluster
      );
      
      if (!cluster) {
        throw new Error('Cluster not found in kubeconfig');
      }

      this.apiServer = cluster.cluster.server;
      
      // For local Docker Desktop Kubernetes, we'll use certificate-based auth
      const user = this.kubeconfig.users.find(
        (u: any) => u.name === currentContext.context.user
      );
      
      if (user && user.user['client-certificate-data']) {
        this.token = 'cert-auth'; // Placeholder for certificate auth
      }
      
    } catch (error) {
      console.error('Failed to initialize kubeconfig:', error);
      throw error;
    }
  }

  private parseKubeconfig(yamlString: string): any {
    // Simple YAML parser for kubeconfig structure
    const lines = yamlString.split('\n');
    const config: any = {
      clusters: [],
      contexts: [],
      users: [],
      'current-context': ''
    };
    
    let currentSection = '';
    let currentItem: any = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('current-context:')) {
        config['current-context'] = trimmed.split(':')[1].trim();
      } else if (trimmed === 'clusters:') {
        currentSection = 'clusters';
      } else if (trimmed === 'contexts:') {
        currentSection = 'contexts';
      } else if (trimmed === 'users:') {
        currentSection = 'users';
      } else if (trimmed.startsWith('- name:')) {
        const name = trimmed.split(':')[1].trim();
        currentItem = { name };
        config[currentSection].push(currentItem);
      } else if (trimmed.startsWith('server:') && currentItem) {
        if (!currentItem.cluster) currentItem.cluster = {};
        currentItem.cluster.server = trimmed.split(':').slice(1).join(':').trim();
      }
    }
    
    return config;
  }

  async createNamespace(namespace: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      logs.push(`[K8S] Creating namespace: ${namespace}`);
      
      const namespaceManifest = {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: {
          name: namespace,
          labels: {
            'created-by': 'botfactory'
          }
        }
      };
      
      const response = await this.callKubernetesAPI('/api/v1/namespaces', {
        method: 'POST',
        body: JSON.stringify(namespaceManifest)
      });
      
      if (response.ok) {
        logs.push(`[K8S] ✅ Namespace created successfully`);
        return { success: true, logs };
      } else {
        const error = await response.text();
        if (error.includes('already exists')) {
          logs.push(`[K8S] ✅ Namespace already exists`);
          return { success: true, logs };
        }
        logs.push(`[K8S] ❌ Failed to create namespace: ${error}`);
        return { success: false, logs };
      }
      
    } catch (error) {
      logs.push(`[K8S] ❌ Error: ${error.message}`);
      return { success: false, logs };
    }
  }

  async deployBot(botId: string, userId: string, imageTag: string, namespace: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      logs.push(`[K8S] Deploying bot ${botId} to namespace ${namespace}`);
      
      const deploymentName = `bot-${botId}`;
      const labels = {
        app: 'telegram-bot',
        'bot-id': botId,
        'user-id': userId
      };
      
      const deployment = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: deploymentName,
          namespace,
          labels
        },
        spec: {
          replicas: 1,
          selector: {
            matchLabels: labels
          },
          template: {
            metadata: {
              labels
            },
            spec: {
              containers: [{
                name: 'telegram-bot',
                image: imageTag,
                resources: {
                  requests: {
                    memory: '64Mi',
                    cpu: '50m'
                  },
                  limits: {
                    memory: '150Mi',
                    cpu: '200m'
                  }
                },
                env: [{
                  name: 'BOT_ID',
                  value: botId
                }],
                ports: [{
                  containerPort: 8080,
                  name: 'health'
                }],
                livenessProbe: {
                  httpGet: {
                    path: '/health',
                    port: 8080
                  },
                  initialDelaySeconds: 30,
                  periodSeconds: 10
                }
              }],
              restartPolicy: 'Always'
            }
          }
        }
      };
      
      const response = await this.callKubernetesAPI(`/apis/apps/v1/namespaces/${namespace}/deployments`, {
        method: 'POST',
        body: JSON.stringify(deployment)
      });
      
      if (response.ok) {
        logs.push(`[K8S] ✅ Deployment created successfully`);
        return { success: true, logs };
      } else {
        const error = await response.text();
        logs.push(`[K8S] ❌ Deployment failed: ${error}`);
        return { success: false, logs };
      }
      
    } catch (error) {
      logs.push(`[K8S] ❌ Error: ${error.message}`);
      return { success: false, logs };
    }
  }

  async getDeploymentStatus(botId: string, namespace: string): Promise<{ success: boolean; status: string; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      const deploymentName = `bot-${botId}`;
      logs.push(`[K8S] Getting status for deployment ${deploymentName}`);
      
      const response = await this.callKubernetesAPI(`/apis/apps/v1/namespaces/${namespace}/deployments/${deploymentName}`);
      
      if (response.ok) {
        const deployment = await response.json();
        const status = deployment.status?.readyReplicas > 0 ? 'running' : 'pending';
        logs.push(`[K8S] Deployment status: ${status}`);
        return { success: true, status, logs };
      } else {
        logs.push(`[K8S] Deployment not found or error getting status`);
        return { success: false, status: 'not-found', logs };
      }
      
    } catch (error) {
      logs.push(`[K8S] ❌ Error: ${error.message}`);
      return { success: false, status: 'error', logs };
    }
  }

  async deleteDeployment(botId: string, namespace: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      const deploymentName = `bot-${botId}`;
      logs.push(`[K8S] Deleting deployment ${deploymentName}`);
      
      const response = await this.callKubernetesAPI(`/apis/apps/v1/namespaces/${namespace}/deployments/${deploymentName}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        logs.push(`[K8S] ✅ Deployment deleted successfully`);
        return { success: true, logs };
      } else {
        logs.push(`[K8S] ⚠️ Deployment may not exist or already deleted`);
        return { success: true, logs }; // Not critical if deployment doesn't exist
      }
      
    } catch (error) {
      logs.push(`[K8S] ❌ Error: ${error.message}`);
      return { success: false, logs };
    }
  }

  async getPodLogs(botId: string, namespace: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      const labelSelector = `bot-id=${botId}`;
      logs.push(`[K8S] Getting pod logs for bot ${botId}`);
      
      // First get pods
      const podsResponse = await this.callKubernetesAPI(`/api/v1/namespaces/${namespace}/pods?labelSelector=${labelSelector}`);
      
      if (!podsResponse.ok) {
        logs.push(`[K8S] ❌ Failed to get pods`);
        return { success: false, logs };
      }
      
      const podsData = await podsResponse.json();
      const pods = podsData.items || [];
      
      if (pods.length === 0) {
        logs.push(`[K8S] No pods found for bot ${botId}`);
        return { success: true, logs: [...logs, '[K8S] No pod logs available'] };
      }
      
      // Get logs from first pod
      const podName = pods[0].metadata.name;
      const logsResponse = await this.callKubernetesAPI(`/api/v1/namespaces/${namespace}/pods/${podName}/log?tailLines=50`);
      
      if (logsResponse.ok) {
        const podLogs = await logsResponse.text();
        const logLines = podLogs.split('\n').filter(line => line.trim());
        logs.push(`[K8S] Retrieved ${logLines.length} log lines from pod ${podName}`);
        return { success: true, logs: [...logs, ...logLines] };
      } else {
        logs.push(`[K8S] ❌ Failed to get pod logs`);
        return { success: false, logs };
      }
      
    } catch (error) {
      logs.push(`[K8S] ❌ Error: ${error.message}`);
      return { success: false, logs };
    }
  }

  private async callKubernetesAPI(endpoint: string, options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {}): Promise<Response> {
    const { method = 'GET', headers = {}, body } = options;
    
    const url = `${this.apiServer}${endpoint}`;
    
    return await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...headers
      },
      body,
      // Skip TLS verification for local Docker Desktop Kubernetes
      // In production, you'd want proper certificate validation
    });
  }
}

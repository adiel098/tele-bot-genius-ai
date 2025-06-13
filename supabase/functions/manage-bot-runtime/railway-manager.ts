
import { BotLogger } from './logger.ts';

const RAILWAY_API_URL = 'https://backboard.railway.app/graphql';
const RAILWAY_API_TOKEN = Deno.env.get('RAILWAY_API_TOKEN');

interface RailwayDeployment {
  id: string;
  status: string;
  url?: string;
}

export class RailwayManager {
  
  static async createBotDeployment(botId: string, code: string, token: string): Promise<{ success: boolean; logs: string[]; deploymentId?: string; error?: string }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('CREATING RAILWAY DEPLOYMENT'));
      logs.push(BotLogger.log(botId, 'Preparing bot deployment on Railway...'));
      
      if (!RAILWAY_API_TOKEN) {
        throw new Error('Railway API token not configured');
      }

      // Create a new service for the bot
      const createServiceMutation = `
        mutation {
          serviceCreate(input: {
            name: "bot-${botId}"
            projectId: "${Deno.env.get('RAILWAY_PROJECT_ID')}"
          }) {
            id
          }
        }
      `;

      const serviceResponse = await fetch(RAILWAY_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RAILWAY_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: createServiceMutation }),
      });

      if (!serviceResponse.ok) {
        throw new Error(`Railway API error: ${serviceResponse.status}`);
      }

      const serviceData = await serviceResponse.json();
      const serviceId = serviceData.data?.serviceCreate?.id;

      if (!serviceId) {
        throw new Error('Failed to create Railway service');
      }

      logs.push(BotLogger.log(botId, `Railway service created: ${serviceId}`));

      // Set environment variables for the bot
      const setEnvMutation = `
        mutation {
          variableUpsert(input: {
            serviceId: "${serviceId}"
            name: "BOT_TOKEN"
            value: "${token}"
          }) {
            id
          }
        }
      `;

      await fetch(RAILWAY_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RAILWAY_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: setEnvMutation }),
      });

      // Create deployment with bot code
      const deployMutation = `
        mutation {
          deploymentCreate(input: {
            serviceId: "${serviceId}"
            environmentId: "${Deno.env.get('RAILWAY_ENVIRONMENT_ID')}"
          }) {
            id
            status
            url
          }
        }
      `;

      const deployResponse = await fetch(RAILWAY_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RAILWAY_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: deployMutation }),
      });

      const deployData = await deployResponse.json();
      const deployment = deployData.data?.deploymentCreate;

      if (!deployment) {
        throw new Error('Failed to create Railway deployment');
      }

      logs.push(BotLogger.logSuccess(`✅ Railway deployment created: ${deployment.id}`));
      logs.push(BotLogger.log(botId, `Deployment URL: ${deployment.url || 'pending'}`));

      return {
        success: true,
        logs,
        deploymentId: deployment.id
      };

    } catch (error) {
      logs.push(BotLogger.logError(`❌ Railway deployment failed: ${error.message}`));
      return {
        success: false,
        logs,
        error: error.message
      };
    }
  }

  static async stopBotDeployment(botId: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('STOPPING RAILWAY DEPLOYMENT'));
      
      // Find and delete the service
      const deleteServiceMutation = `
        mutation {
          serviceDelete(id: "bot-${botId}") {
            id
          }
        }
      `;

      const response = await fetch(RAILWAY_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RAILWAY_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: deleteServiceMutation }),
      });

      if (response.ok) {
        logs.push(BotLogger.logSuccess('✅ Railway service deleted'));
      }

      return { success: true, logs };

    } catch (error) {
      logs.push(BotLogger.logError(`❌ Error stopping Railway deployment: ${error.message}`));
      return { success: false, logs };
    }
  }

  static async getDeploymentStatus(botId: string): Promise<{ isRunning: boolean; deploymentId?: string }> {
    try {
      const query = `
        query {
          service(id: "bot-${botId}") {
            id
            deployments {
              edges {
                node {
                  id
                  status
                  url
                }
              }
            }
          }
        }
      `;

      const response = await fetch(RAILWAY_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RAILWAY_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        return { isRunning: false };
      }

      const data = await response.json();
      const service = data.data?.service;
      
      if (!service) {
        return { isRunning: false };
      }

      const latestDeployment = service.deployments.edges[0]?.node;
      const isRunning = latestDeployment?.status === 'SUCCESS';

      return {
        isRunning,
        deploymentId: latestDeployment?.id
      };

    } catch (error) {
      console.error('Error checking Railway deployment status:', error);
      return { isRunning: false };
    }
  }

  static async getDeploymentLogs(botId: string): Promise<string[]> {
    try {
      const query = `
        query {
          service(id: "bot-${botId}") {
            deployments {
              edges {
                node {
                  id
                  logs {
                    edges {
                      node {
                        timestamp
                        message
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await fetch(RAILWAY_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RAILWAY_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        return ['Error fetching logs from Railway'];
      }

      const data = await response.json();
      const service = data.data?.service;
      
      if (!service) {
        return ['No Railway service found'];
      }

      const latestDeployment = service.deployments.edges[0]?.node;
      
      if (!latestDeployment) {
        return ['No deployments found'];
      }

      const logs = latestDeployment.logs.edges.map((edge: any) => 
        `[${edge.node.timestamp}] ${edge.node.message}`
      );

      return [
        BotLogger.logSection('RAILWAY DEPLOYMENT LOGS'),
        BotLogger.log(botId, `Deployment: ${latestDeployment.id}`),
        ...logs,
        BotLogger.logSection('END OF RAILWAY LOGS')
      ];

    } catch (error) {
      return [
        BotLogger.logSection('RAILWAY LOGS ERROR'),
        BotLogger.logError(`Failed to fetch logs: ${error.message}`)
      ];
    }
  }
}

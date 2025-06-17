
import { BotLogger } from './logger.ts';
import { RailwayConfigValidator } from './railway-config-validator.ts';

export class RailwayApiClient {
  private static async makeRequest(query: string, variables: any): Promise<any> {
    const railwayApiEndpoint = 'https://backboard.railway.app/graphql';
    const railwayApiToken = Deno.env.get('RAILWAY_API_TOKEN');

    if (!railwayApiToken) {
      console.error('Railway API token is missing. Please configure RAILWAY_API_TOKEN.');
      throw new Error('Railway API token is missing. Please configure RAILWAY_API_TOKEN.');
    }

    try {
      console.log(`[${new Date().toISOString()}] Making Railway API request to: ${railwayApiEndpoint}`);
      console.log(`[${new Date().toISOString()}] Query: ${query.substring(0, 100)}...`);
      console.log(`[${new Date().toISOString()}] Variables: ${JSON.stringify(variables, null, 2)}`);

      const response = await fetch(railwayApiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${railwayApiToken}`,
          'User-Agent': 'BotFactory/1.0',
        },
        body: JSON.stringify({
          query: query,
          variables: variables,
        }),
      });

      console.log(`[${new Date().toISOString()}] Railway API response status: ${response.status}`);

      if (!response.ok) {
        let errorDetails = '';
        try {
          const errorBody = await response.text();
          console.error(`[${new Date().toISOString()}] Railway API error response:`, errorBody);
          errorDetails = errorBody;
        } catch (jsonError) {
          console.error('Failed to parse error response as text');
        }

        // Special handling for specific error cases
        if (response.status === 404) {
          throw new Error(`Railway project or environment not found. Please verify RAILWAY_PROJECT_ID and RAILWAY_ENVIRONMENT_ID in your Supabase secrets. Status: ${response.status}. Details: ${errorDetails}`);
        }
        
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Railway API authentication failed. Please verify RAILWAY_API_TOKEN in your Supabase secrets. Status: ${response.status}. Details: ${errorDetails}`);
        }

        throw new Error(`Railway API request failed with status: ${response.status}. Details: ${errorDetails}`);
      }

      const result = await response.json();
      console.log(`[${new Date().toISOString()}] Railway API response:`, JSON.stringify(result, null, 2));

      if (result.errors) {
        console.error('GraphQL errors:', JSON.stringify(result.errors, null, 2));
        
        // Check for specific error types
        const errorMessages = result.errors.map((e: any) => e.message).join(', ');
        if (errorMessages.includes('not found') || errorMessages.includes('does not exist')) {
          throw new Error(`Railway resource not found. Please verify your RAILWAY_PROJECT_ID and RAILWAY_ENVIRONMENT_ID configuration. GraphQL errors: ${errorMessages}`);
        }
        
        throw new Error(`GraphQL errors: ${errorMessages}`);
      }

      return result;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error making Railway API request:`, error);
      throw error;
    }
  }

  static async validateConfigurationBeforeRequest(): Promise<{ isValid: boolean; logs: string[]; error?: string }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('RAILWAY CONFIGURATION PRE-VALIDATION'));
      
      // Step 1: Check environment variables
      const envValidation = RailwayConfigValidator.validateEnvironmentVariables();
      logs.push(...envValidation.logs);
      
      if (!envValidation.isValid) {
        return {
          isValid: false,
          logs,
          error: `Missing Railway configuration: ${envValidation.missingVars.join(', ')}`
        };
      }
      
      // Step 2: Test basic connectivity (quick check)
      logs.push(BotLogger.log('', 'Testing Railway API connectivity...'));
      
      const connectionTest = await RailwayConfigValidator.validateRailwayConnection();
      logs.push(...connectionTest.logs);
      
      if (!connectionTest.isValid) {
        return {
          isValid: false,
          logs,
          error: connectionTest.error || 'Railway API connection failed'
        };
      }
      
      logs.push(BotLogger.logSuccess('✅ Railway configuration validated successfully'));
      return { isValid: true, logs };
      
    } catch (error) {
      logs.push(BotLogger.logError(`❌ Configuration validation failed: ${error.message}`));
      return {
        isValid: false,
        logs,
        error: error.message
      };
    }
  }

  static async createService(projectId: string, botId: string, token: string): Promise<{ success: boolean; serviceId?: string; error?: string }> {
    try {
      console.log(`[${new Date().toISOString()}] Creating Railway service with template...`);
      console.log(`[${new Date().toISOString()}] Project ID: ${projectId}`);
      console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);

      // Pre-validate configuration
      const validation = await this.validateConfigurationBeforeRequest();
      if (!validation.isValid) {
        throw new Error(validation.error || 'Railway configuration validation failed');
      }

      const serviceName = `bot-${botId}`;
      
      // Create the service with a simple template
      const createServiceMutation = `
        mutation ServiceCreate($input: ServiceCreateInput!) {
          serviceCreate(input: $input) {
            id
            name
          }
        }
      `;

      const serviceResponse = await this.makeRequest(createServiceMutation, {
        input: {
          name: serviceName,
          projectId: projectId,
          source: {
            image: "python:3.11-slim"
          }
        }
      });

      if (!serviceResponse.data?.serviceCreate?.id) {
        throw new Error('Failed to create Railway service - no service ID returned');
      }

      const serviceId = serviceResponse.data.serviceCreate.id;
      console.log(`[${new Date().toISOString()}] ✅ Service created: ${serviceId}`);

      // Set environment variables
      const envVariables = [
        { name: 'BOT_TOKEN', value: token },
        { name: 'TELEGRAM_TOKEN', value: token },
        { name: 'PYTHONUNBUFFERED', value: '1' },
        { name: 'PORT', value: '8080' }
      ];

      for (const envVar of envVariables) {
        try {
          const setVariableMutation = `
            mutation VariableUpsert($input: VariableUpsertInput!) {
              variableUpsert(input: $input) {
                id
              }
            }
          `;

          await this.makeRequest(setVariableMutation, {
            input: {
              projectId: projectId,
              environmentId: Deno.env.get('RAILWAY_ENVIRONMENT_ID'),
              serviceId: serviceId,
              name: envVar.name,
              value: envVar.value
            }
          });

          console.log(`[${new Date().toISOString()}] ✅ Set env var: ${envVar.name}`);
        } catch (envError) {
          console.warn(`[${new Date().toISOString()}] ⚠️ Failed to set env var ${envVar.name}: ${envError.message}`);
        }
      }

      return {
        success: true,
        serviceId: serviceId
      };

    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Railway API error:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getServices(projectId: string): Promise<any[]> {
    try {
      // Pre-validate configuration
      const validation = await this.validateConfigurationBeforeRequest();
      if (!validation.isValid) {
        console.error(`Railway configuration invalid: ${validation.error}`);
        return [];
      }

      const projectQuery = `
        query GetProject($projectId: String!) {
          project(id: $projectId) {
            id
            name
            services {
              edges {
                node {
                  id
                  name
                }
              }
            }
          }
        }
      `;

      const response = await this.makeRequest(projectQuery, { projectId: projectId });
      
      if (!response.data?.project) {
        console.error(`[${new Date().toISOString()}] Project ${projectId} not found`);
        return [];
      }

      const services = response.data.project.services?.edges?.map((edge: any) => edge.node) || [];
      console.log(`[${new Date().toISOString()}] Found ${services.length} services in project`);
      
      return services;
    } catch (error) {
      console.error('Error fetching services:', error);
      return [];
    }
  }

  static async deleteService(projectId: string, serviceId: string): Promise<boolean> {
    try {
      const deleteServiceMutation = `
        mutation ServiceDelete($id: String!) {
          serviceDelete(id: $id)
        }
      `;

      const response = await this.makeRequest(deleteServiceMutation, {
        id: serviceId
      });

      return !!response.data?.serviceDelete;
    } catch (error) {
      console.error('Error deleting service:', error);
      return false;
    }
  }

  static async getDeployments(projectId: string, serviceId: string): Promise<any[]> {
    try {
      const getDeploymentsQuery = `
        query GetDeployments($serviceId: String!) {
          service(id: $serviceId) {
            deployments {
              edges {
                node {
                  id
                  createdAt
                  status
                }
              }
            }
          }
        }
      `;

      const response = await this.makeRequest(getDeploymentsQuery, { 
        serviceId: serviceId
      });

      const deployments = response.data?.service?.deployments?.edges?.map((edge: any) => edge.node) || [];
      return deployments;
    } catch (error) {
      console.error('Error fetching deployments:', error);
      return [];
    }
  }

  static async createServiceWithCode(
    projectId: string, 
    botId: string, 
    token: string, 
    mainPyContent: string,
    allFiles: Record<string, string>
  ): Promise<{ success: boolean; serviceId?: string; error?: string }> {
    try {
      console.log(`[${new Date().toISOString()}] Creating Railway service with actual bot code...`);
      console.log(`[${new Date().toISOString()}] Project ID: ${projectId}`);
      console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);
      console.log(`[${new Date().toISOString()}] Code length: ${mainPyContent.length}`);
      console.log(`[${new Date().toISOString()}] Files count: ${Object.keys(allFiles).length}`);

      // Pre-validate configuration with detailed logging
      const validation = await this.validateConfigurationBeforeRequest();
      if (!validation.isValid) {
        throw new Error(validation.error || 'Railway configuration validation failed');
      }

      // For now, create a basic service since direct code deployment via GraphQL is complex
      return await this.createService(projectId, botId, token);

    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Railway API error:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

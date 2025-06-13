import { BotLogger } from './logger.ts';

const RAILWAY_GRAPHQL_API_URL = 'https://backboard.railway.app/graphql/v2';
const RAILWAY_API_TOKEN = Deno.env.get('RAILWAY_API_TOKEN');

export class RailwayApiClient {
  
  static async makeGraphQLRequest(query: string, variables?: any): Promise<Response> {
    console.log(`[${new Date().toISOString()}] ========== RAILWAY GRAPHQL REQUEST DEBUG ==========`);
    console.log(`[${new Date().toISOString()}] Query: ${query.substring(0, 100)}...`);
    console.log(`[${new Date().toISOString()}] Variables: ${JSON.stringify(variables, null, 2)}`);
    console.log(`[${new Date().toISOString()}] Has API Token: ${RAILWAY_API_TOKEN ? 'YES' : 'NO'}`);
    
    if (!RAILWAY_API_TOKEN) {
      console.error(`[${new Date().toISOString()}] ❌ RAILWAY_API_TOKEN is missing!`);
      throw new Error('Railway API token not configured');
    }

    console.log(`[${new Date().toISOString()}] Token preview: ${RAILWAY_API_TOKEN.substring(0, 10)}...`);

    const requestBody = {
      query,
      variables: variables || {}
    };

    const options: RequestInit = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RAILWAY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    };

    console.log(`[${new Date().toISOString()}] Full URL: ${RAILWAY_GRAPHQL_API_URL}`);
    console.log(`[${new Date().toISOString()}] Request body: ${JSON.stringify(requestBody, null, 2)}`);
    console.log(`[${new Date().toISOString()}] Request headers: ${JSON.stringify(options.headers, null, 2)}`);

    try {
      console.log(`[${new Date().toISOString()}] Making GraphQL request...`);
      const response = await fetch(RAILWAY_GRAPHQL_API_URL, options);
      
      console.log(`[${new Date().toISOString()}] Response status: ${response.status}`);
      console.log(`[${new Date().toISOString()}] Response statusText: ${response.statusText}`);
      console.log(`[${new Date().toISOString()}] Response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2)}`);
      
      // Try to read response body for debugging
      const responseText = await response.text();
      console.log(`[${new Date().toISOString()}] Response body: ${responseText}`);
      
      // Create new response with same status for return
      const newResponse = new Response(responseText, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });

      return newResponse;

    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ GraphQL Request failed with error: ${error.message}`);
      console.error(`[${new Date().toISOString()}] Error stack: ${error.stack}`);
      throw error;
    }
  }

  // Test basic Railway API access using GraphQL
  static async testRailwayConnection(): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      console.log(`[${new Date().toISOString()}] ========== TESTING RAILWAY CONNECTION ==========`);
      
      const query = `
        query {
          me {
            id
            name
            email
          }
        }
      `;

      const response = await this.makeGraphQLRequest(query);
      
      if (response.ok) {
        const result = await response.json();
        if (result.errors) {
          console.error(`[${new Date().toISOString()}] ❌ GraphQL errors: ${JSON.stringify(result.errors)}`);
          return { success: false, error: `GraphQL errors: ${result.errors.map((e: any) => e.message).join(', ')}` };
        }
        
        console.log(`[${new Date().toISOString()}] ✅ Railway API connection successful!`);
        console.log(`[${new Date().toISOString()}] User data: ${JSON.stringify(result.data.me, null, 2)}`);
        return { success: true, data: result.data.me };
      } else {
        console.error(`[${new Date().toISOString()}] ❌ Railway API connection failed`);
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Railway connection test failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Enhanced project listing that includes both personal and organization projects
  static async listAllProjects(): Promise<{ success: boolean; projects?: any[]; error?: string }> {
    try {
      console.log(`[${new Date().toISOString()}] ========== LISTING ALL RAILWAY PROJECTS ==========`);
      
      const query = `
        query {
          me {
            projects {
              edges {
                node {
                  id
                  name
                  team {
                    id
                    name
                  }
                  services {
                    edges {
                      node {
                        id
                        name
                      }
                    }
                  }
                  environments {
                    edges {
                      node {
                        id
                        name
                      }
                    }
                  }
                }
              }
            }
            teams {
              edges {
                node {
                  id
                  name
                  projects {
                    edges {
                      node {
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
                        environments {
                          edges {
                            node {
                              id
                              name
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await this.makeGraphQLRequest(query);
      
      if (!response.ok) {
        console.error(`[${new Date().toISOString()}] ❌ Failed to list projects`);
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const result = await response.json();
      if (result.errors) {
        console.error(`[${new Date().toISOString()}] ❌ GraphQL errors: ${JSON.stringify(result.errors)}`);
        return { success: false, error: `GraphQL errors: ${result.errors.map((e: any) => e.message).join(', ')}` };
      }

      // Combine personal and team projects
      const personalProjects = result.data.me.projects.edges.map((edge: any) => ({
        ...edge.node,
        source: 'personal'
      }));

      const teamProjects: any[] = [];
      result.data.me.teams.edges.forEach((teamEdge: any) => {
        const team = teamEdge.node;
        team.projects.edges.forEach((projectEdge: any) => {
          teamProjects.push({
            ...projectEdge.node,
            source: 'team',
            teamName: team.name,
            teamId: team.id
          });
        });
      });

      const allProjects = [...personalProjects, ...teamProjects];
      
      console.log(`[${new Date().toISOString()}] ✅ Found ${personalProjects.length} personal projects and ${teamProjects.length} team projects`);
      console.log(`[${new Date().toISOString()}] Personal projects: ${JSON.stringify(personalProjects, null, 2)}`);
      console.log(`[${new Date().toISOString()}] Team projects: ${JSON.stringify(teamProjects, null, 2)}`);
      console.log(`[${new Date().toISOString()}] All project IDs: ${allProjects.map(p => `${p.name} (${p.id})`).join(', ')}`);
      
      return { success: true, projects: allProjects };

    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Error listing projects: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Legacy method for backwards compatibility
  static async listProjects(): Promise<{ success: boolean; projects?: any[]; error?: string }> {
    return this.listAllProjects();
  }

  static async createService(projectId: string, botId: string): Promise<{ success: boolean; serviceId?: string; error?: string }> {
    try {
      console.log(`[${new Date().toISOString()}] ========== CREATING RAILWAY SERVICE ==========`);
      console.log(`[${new Date().toISOString()}] Project ID: ${projectId}`);
      console.log(`[${new Date().toISOString()}] Bot ID: ${botId}`);
      console.log(`[${new Date().toISOString()}] Service name will be: bot-${botId}`);

      // First, test the connection and list projects
      console.log(`[${new Date().toISOString()}] Testing Railway connection first...`);
      const connectionTest = await this.testRailwayConnection();
      if (!connectionTest.success) {
        return { success: false, error: `Connection test failed: ${connectionTest.error}` };
      }

      console.log(`[${new Date().toISOString()}] Listing available projects...`);
      const projectsList = await this.listAllProjects();
      if (!projectsList.success) {
        return { success: false, error: `Failed to list projects: ${projectsList.error}` };
      }

      // Check if the project ID we're trying to use exists
      const targetProject = projectsList.projects?.find(p => p.id === projectId);
      if (!targetProject) {
        console.error(`[${new Date().toISOString()}] ❌ Project ${projectId} not found in available projects!`);
        console.log(`[${new Date().toISOString()}] Available project IDs: ${projectsList.projects?.map(p => `${p.name} (${p.id}) [${p.source}]`).join(', ')}`);
        return { 
          success: false, 
          error: `Project ${projectId} not found. Available projects: ${projectsList.projects?.map(p => `${p.name} (${p.id}) [${p.source}${p.teamName ? ` - ${p.teamName}` : ''}]`).join(', ')}` 
        };
      }

      console.log(`[${new Date().toISOString()}] ✅ Project found: ${targetProject.name} (${targetProject.id}) [${targetProject.source}]`);
      if (targetProject.teamName) {
        console.log(`[${new Date().toISOString()}] Project belongs to team: ${targetProject.teamName}`);
      }

      // Create service using GraphQL mutation
      const mutation = `
        mutation serviceCreate($input: ServiceCreateInput!) {
          serviceCreate(input: $input) {
            id
            name
          }
        }
      `;

      const variables = {
        input: {
          projectId: projectId,
          name: `bot-${botId}`,
          source: {
            image: "python:3.11-slim"
          },
          variables: {
            BOT_TOKEN: "placeholder"
          }
        }
      };

      const response = await this.makeGraphQLRequest(mutation, variables);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[${new Date().toISOString()}] ❌ Service creation failed!`);
        console.error(`[${new Date().toISOString()}] Error response: ${errorText}`);
        return { success: false, error: `HTTP ${response.status}: ${response.statusText} - ${errorText}` };
      }

      const result = await response.json();
      if (result.errors) {
        console.error(`[${new Date().toISOString()}] ❌ GraphQL errors: ${JSON.stringify(result.errors)}`);
        return { success: false, error: `GraphQL errors: ${result.errors.map((e: any) => e.message).join(', ')}` };
      }

      const serviceData = result.data.serviceCreate;
      console.log(`[${new Date().toISOString()}] ✅ Service created successfully!`);
      console.log(`[${new Date().toISOString()}] Service data: ${JSON.stringify(serviceData, null, 2)}`);
      return { success: true, serviceId: serviceData.id };

    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Exception in createService: ${error.message}`);
      console.error(`[${new Date().toISOString()}] Exception stack: ${error.stack}`);
      return { success: false, error: error.message };
    }
  }

  static async setEnvironmentVariables(projectId: string, serviceId: string, variables: Record<string, string>): Promise<boolean> {
    try {
      console.log(`[${new Date().toISOString()}] ========== SETTING ENVIRONMENT VARIABLES ==========`);
      console.log(`[${new Date().toISOString()}] Project ID: ${projectId}`);
      console.log(`[${new Date().toISOString()}] Service ID: ${serviceId}`);
      console.log(`[${new Date().toISOString()}] Variables: ${JSON.stringify(Object.keys(variables), null, 2)}`);

      const mutation = `
        mutation variableCollectionUpsert($input: VariableCollectionUpsertInput!) {
          variableCollectionUpsert(input: $input) {
            id
          }
        }
      `;

      const variableInputs = Object.entries(variables).map(([name, value]) => ({
        name,
        value
      }));

      const variablesInput = {
        input: {
          projectId: projectId,
          serviceId: serviceId,
          variables: variableInputs
        }
      };

      const response = await this.makeGraphQLRequest(mutation, variablesInput);
      
      if (response.ok) {
        const result = await response.json();
        if (!result.errors) {
          console.log(`[${new Date().toISOString()}] ✅ Environment variables set successfully`);
          return true;
        }
      }
      
      console.error(`[${new Date().toISOString()}] ❌ Failed to set environment variables`);
      return false;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Error setting environment variables: ${error.message}`);
      return false;
    }
  }

  static async deleteService(projectId: string, serviceId: string): Promise<boolean> {
    try {
      console.log(`[${new Date().toISOString()}] ========== DELETING RAILWAY SERVICE ==========`);
      console.log(`[${new Date().toISOString()}] Project ID: ${projectId}`);
      console.log(`[${new Date().toISOString()}] Service ID: ${serviceId}`);

      const mutation = `
        mutation serviceDelete($id: String!) {
          serviceDelete(id: $id)
        }
      `;

      const variables = {
        id: serviceId
      };

      const response = await this.makeGraphQLRequest(mutation, variables);
      
      if (response.ok) {
        const result = await response.json();
        if (!result.errors) {
          console.log(`[${new Date().toISOString()}] ✅ Service deleted successfully`);
          return true;
        }
      }
      
      console.error(`[${new Date().toISOString()}] ❌ Failed to delete service`);
      return false;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Error deleting service: ${error.message}`);
      return false;
    }
  }

  static async getServices(projectId: string): Promise<any[]> {
    try {
      console.log(`[${new Date().toISOString()}] ========== GETTING RAILWAY SERVICES ==========`);
      console.log(`[${new Date().toISOString()}] Project ID: ${projectId}`);

      const query = `
        query project($id: String!) {
          project(id: $id) {
            services {
              edges {
                node {
                  id
                  name
                  deployments {
                    edges {
                      node {
                        id
                        status
                        createdAt
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const variables = { id: projectId };
      const response = await this.makeGraphQLRequest(query, variables);
      
      if (!response.ok) {
        console.error(`[${new Date().toISOString()}] ❌ Failed to get services`);
        return [];
      }

      const result = await response.json();
      if (result.errors) {
        console.error(`[${new Date().toISOString()}] ❌ GraphQL errors: ${JSON.stringify(result.errors)}`);
        return [];
      }

      const services = result.data.project.services.edges.map((edge: any) => edge.node);
      console.log(`[${new Date().toISOString()}] ✅ Found ${services.length} services`);
      console.log(`[${new Date().toISOString()}] Services: ${JSON.stringify(services, null, 2)}`);
      return services;

    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Error fetching services: ${error.message}`);
      return [];
    }
  }

  static async getDeployments(projectId: string, serviceId: string): Promise<any[]> {
    try {
      console.log(`[${new Date().toISOString()}] ========== GETTING RAILWAY DEPLOYMENTS ==========`);
      console.log(`[${new Date().toISOString()}] Project ID: ${projectId}`);
      console.log(`[${new Date().toISOString()}] Service ID: ${serviceId}`);

      const query = `
        query service($id: String!) {
          service(id: $id) {
            deployments {
              edges {
                node {
                  id
                  status
                  createdAt
                  logs
                }
              }
            }
          }
        }
      `;

      const variables = { id: serviceId };
      const response = await this.makeGraphQLRequest(query, variables);
      
      if (!response.ok) {
        console.error(`[${new Date().toISOString()}] ❌ Failed to get deployments`);
        return [];
      }

      const result = await response.json();
      if (result.errors) {
        console.error(`[${new Date().toISOString()}] ❌ GraphQL errors: ${JSON.stringify(result.errors)}`);
        return [];
      }

      const deployments = result.data.service.deployments.edges.map((edge: any) => edge.node);
      console.log(`[${new Date().toISOString()}] ✅ Found ${deployments.length} deployments`);
      console.log(`[${new Date().toISOString()}] Deployments: ${JSON.stringify(deployments, null, 2)}`);
      return deployments;

    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Error fetching deployments: ${error.message}`);
      return [];
    }
  }
}

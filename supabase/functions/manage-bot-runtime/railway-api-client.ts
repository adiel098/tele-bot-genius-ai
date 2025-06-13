import { BotLogger } from './logger.ts';

const RAILWAY_REST_API_URL = 'https://backboard.railway.app';
const RAILWAY_API_TOKEN = Deno.env.get('RAILWAY_API_TOKEN');

export class RailwayApiClient {
  
  static async makeRequest(endpoint: string, method: string = 'GET', body?: any): Promise<Response> {
    console.log(`[${new Date().toISOString()}] ========== RAILWAY API REQUEST DEBUG ==========`);
    console.log(`[${new Date().toISOString()}] Endpoint: ${endpoint}`);
    console.log(`[${new Date().toISOString()}] Method: ${method}`);
    console.log(`[${new Date().toISOString()}] Has API Token: ${RAILWAY_API_TOKEN ? 'YES' : 'NO'}`);
    
    if (!RAILWAY_API_TOKEN) {
      console.error(`[${new Date().toISOString()}] ❌ RAILWAY_API_TOKEN is missing!`);
      throw new Error('Railway API token not configured');
    }

    console.log(`[${new Date().toISOString()}] Token preview: ${RAILWAY_API_TOKEN.substring(0, 10)}...`);

    const url = `${RAILWAY_REST_API_URL}${endpoint}`;
    console.log(`[${new Date().toISOString()}] Full URL: ${url}`);
    
    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${RAILWAY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
      console.log(`[${new Date().toISOString()}] Request body: ${JSON.stringify(body, null, 2)}`);
    }

    console.log(`[${new Date().toISOString()}] Request headers: ${JSON.stringify(options.headers, null, 2)}`);

    try {
      console.log(`[${new Date().toISOString()}] Making HTTP request...`);
      const response = await fetch(url, options);
      
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
      console.error(`[${new Date().toISOString()}] ❌ HTTP Request failed with error: ${error.message}`);
      console.error(`[${new Date().toISOString()}] Error stack: ${error.stack}`);
      throw error;
    }
  }

  // Test basic Railway API access
  static async testRailwayConnection(): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      console.log(`[${new Date().toISOString()}] ========== TESTING RAILWAY CONNECTION ==========`);
      
      // Try to get basic user/account info first
      const response = await this.makeRequest('/api/v2/me');
      
      if (response.ok) {
        const userData = await response.json();
        console.log(`[${new Date().toISOString()}] ✅ Railway API connection successful!`);
        console.log(`[${new Date().toISOString()}] User data: ${JSON.stringify(userData, null, 2)}`);
        return { success: true, data: userData };
      } else {
        console.error(`[${new Date().toISOString()}] ❌ Railway API connection failed`);
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Railway connection test failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // List all available projects
  static async listProjects(): Promise<{ success: boolean; projects?: any[]; error?: string }> {
    try {
      console.log(`[${new Date().toISOString()}] ========== LISTING RAILWAY PROJECTS ==========`);
      
      const response = await this.makeRequest('/api/v2/projects');
      
      if (response.ok) {
        const projects = await response.json();
        console.log(`[${new Date().toISOString()}] ✅ Found ${projects.length} projects`);
        console.log(`[${new Date().toISOString()}] Projects: ${JSON.stringify(projects, null, 2)}`);
        return { success: true, projects };
      } else {
        console.error(`[${new Date().toISOString()}] ❌ Failed to list projects`);
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Error listing projects: ${error.message}`);
      return { success: false, error: error.message };
    }
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
      const projectsList = await this.listProjects();
      if (!projectsList.success) {
        return { success: false, error: `Failed to list projects: ${projectsList.error}` };
      }

      // Check if the project ID we're trying to use exists
      const targetProject = projectsList.projects?.find(p => p.id === projectId);
      if (!targetProject) {
        console.error(`[${new Date().toISOString()}] ❌ Project ${projectId} not found in available projects!`);
        console.log(`[${new Date().toISOString()}] Available project IDs: ${projectsList.projects?.map(p => p.id).join(', ')}`);
        return { 
          success: false, 
          error: `Project ${projectId} not found. Available projects: ${projectsList.projects?.map(p => `${p.name} (${p.id})`).join(', ')}` 
        };
      }

      console.log(`[${new Date().toISOString()}] ✅ Project found: ${targetProject.name} (${targetProject.id})`);

      const response = await this.makeRequest(`/api/v2/projects/${projectId}/services`, 'POST', {
        name: `bot-${botId}`,
        source: {
          type: 'repo',
          repo: 'temporary'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[${new Date().toISOString()}] ❌ Service creation failed!`);
        console.error(`[${new Date().toISOString()}] Error response: ${errorText}`);
        return { success: false, error: `HTTP ${response.status}: ${response.statusText} - ${errorText}` };
      }

      const serviceData = await response.json();
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

      const response = await this.makeRequest(`/api/v2/projects/${projectId}/services/${serviceId}/variables`, 'POST', variables);
      
      if (response.ok) {
        console.log(`[${new Date().toISOString()}] ✅ Environment variables set successfully`);
        return true;
      } else {
        console.error(`[${new Date().toISOString()}] ❌ Failed to set environment variables`);
        return false;
      }
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

      const response = await this.makeRequest(`/api/v2/projects/${projectId}/services/${serviceId}`, 'DELETE');
      
      if (response.ok) {
        console.log(`[${new Date().toISOString()}] ✅ Service deleted successfully`);
        return true;
      } else {
        console.error(`[${new Date().toISOString()}] ❌ Failed to delete service`);
        return false;
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Error deleting service: ${error.message}`);
      return false;
    }
  }

  static async getServices(projectId: string): Promise<any[]> {
    try {
      console.log(`[${new Date().toISOString()}] ========== GETTING RAILWAY SERVICES ==========`);
      console.log(`[${new Date().toISOString()}] Project ID: ${projectId}`);

      const response = await this.makeRequest(`/api/v2/projects/${projectId}/services`);
      
      if (!response.ok) {
        console.error(`[${new Date().toISOString()}] ❌ Failed to get services`);
        return [];
      }

      const services = await response.json();
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

      const response = await this.makeRequest(`/api/v2/projects/${projectId}/services/${serviceId}/deployments`);
      
      if (!response.ok) {
        console.error(`[${new Date().toISOString()}] ❌ Failed to get deployments`);
        return [];
      }

      const deployments = await response.json();
      console.log(`[${new Date().toISOString()}] ✅ Found ${deployments.length} deployments`);
      console.log(`[${new Date().toISOString()}] Deployments: ${JSON.stringify(deployments, null, 2)}`);
      return deployments;

    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Error fetching deployments: ${error.message}`);
      return [];
    }
  }
}

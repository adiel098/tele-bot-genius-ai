
import { BotLogger } from './logger.ts';

const RAILWAY_REST_API_URL = 'https://backboard.railway.app';
const RAILWAY_API_TOKEN = Deno.env.get('RAILWAY_API_TOKEN');

export class RailwayApiClient {
  
  static async makeRequest(endpoint: string, method: string = 'GET', body?: any): Promise<Response> {
    if (!RAILWAY_API_TOKEN) {
      throw new Error('Railway API token not configured');
    }

    const url = `${RAILWAY_REST_API_URL}${endpoint}`;
    
    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${RAILWAY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    return fetch(url, options);
  }

  static async createService(projectId: string, botId: string): Promise<{ success: boolean; serviceId?: string; error?: string }> {
    try {
      const response = await this.makeRequest(`/api/v2/projects/${projectId}/services`, 'POST', {
        name: `bot-${botId}`,
        source: {
          type: 'repo',
          repo: 'temporary'
        }
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const serviceData = await response.json();
      return { success: true, serviceId: serviceData.id };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async setEnvironmentVariables(projectId: string, serviceId: string, variables: Record<string, string>): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/api/v2/projects/${projectId}/services/${serviceId}/variables`, 'POST', variables);
      return response.ok;
    } catch (error) {
      console.error('Error setting environment variables:', error);
      return false;
    }
  }

  static async deleteService(projectId: string, serviceId: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/api/v2/projects/${projectId}/services/${serviceId}`, 'DELETE');
      return response.ok;
    } catch (error) {
      console.error('Error deleting service:', error);
      return false;
    }
  }

  static async getServices(projectId: string): Promise<any[]> {
    try {
      const response = await this.makeRequest(`/api/v2/projects/${projectId}/services`);
      
      if (!response.ok) {
        return [];
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching services:', error);
      return [];
    }
  }

  static async getDeployments(projectId: string, serviceId: string): Promise<any[]> {
    try {
      const response = await this.makeRequest(`/api/v2/projects/${projectId}/services/${serviceId}/deployments`);
      
      if (!response.ok) {
        return [];
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching deployments:', error);
      return [];
    }
  }
}

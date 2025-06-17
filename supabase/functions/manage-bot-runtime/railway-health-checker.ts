
import { BotLogger } from './logger.ts';
import { RailwayConfigValidator } from './railway-config-validator.ts';

export class RailwayHealthChecker {
  
  static async performHealthCheck(): Promise<{ isHealthy: boolean; logs: string[]; issues: string[] }> {
    const logs: string[] = [];
    const issues: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('RAILWAY HEALTH CHECK'));
      
      // Step 1: Validate environment variables
      const envValidation = RailwayConfigValidator.validateEnvironmentVariables();
      logs.push(...envValidation.logs);
      
      if (!envValidation.isValid) {
        issues.push(`Missing environment variables: ${envValidation.missingVars.join(', ')}`);
        logs.push(BotLogger.logError('❌ Health check failed - missing environment variables'));
        return { isHealthy: false, logs, issues };
      }
      
      // Step 2: Test Railway API connection
      const connectionTest = await RailwayConfigValidator.validateRailwayConnection();
      logs.push(...connectionTest.logs);
      
      if (!connectionTest.isValid) {
        issues.push(`Railway API connection failed: ${connectionTest.error}`);
        logs.push(BotLogger.logError('❌ Health check failed - Railway API connection issue'));
        return { isHealthy: false, logs, issues };
      }
      
      // Step 3: Additional health checks
      logs.push(BotLogger.log('', 'Running additional Railway service checks...'));
      
      const projectId = Deno.env.get('RAILWAY_PROJECT_ID')!;
      const environmentId = Deno.env.get('RAILWAY_ENVIRONMENT_ID')!;
      
      // Test environment access
      const envQuery = `
        query GetEnvironment($projectId: String!, $environmentId: String!) {
          project(id: $projectId) {
            environment(id: $environmentId) {
              id
              name
            }
          }
        }
      `;
      
      const response = await fetch('https://backboard.railway.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('RAILWAY_API_TOKEN')}`,
          'User-Agent': 'BotFactory/1.0',
        },
        body: JSON.stringify({
          query: envQuery,
          variables: { projectId, environmentId },
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.data?.project?.environment) {
          logs.push(BotLogger.logSuccess(`✅ Railway environment accessible: ${result.data.project.environment.name}`));
        } else {
          issues.push(`Railway environment not found: ${environmentId}`);
          logs.push(BotLogger.logError(`❌ Railway environment not found: ${environmentId}`));
          return { isHealthy: false, logs, issues };
        }
      } else {
        issues.push(`Failed to access Railway environment: ${response.status}`);
        logs.push(BotLogger.logError(`❌ Failed to access Railway environment: ${response.status}`));
        return { isHealthy: false, logs, issues };
      }
      
      logs.push(BotLogger.logSuccess('✅ Railway health check passed - all systems operational'));
      return { isHealthy: true, logs, issues: [] };
      
    } catch (error) {
      issues.push(`Health check error: ${error.message}`);
      logs.push(BotLogger.logError(`❌ Railway health check failed: ${error.message}`));
      return { isHealthy: false, logs, issues };
    }
  }
  
  static async quickHealthCheck(): Promise<boolean> {
    try {
      const envValidation = RailwayConfigValidator.validateEnvironmentVariables();
      if (!envValidation.isValid) {
        return false;
      }
      
      const connectionTest = await RailwayConfigValidator.validateRailwayConnection();
      return connectionTest.isValid;
      
    } catch (error) {
      console.error('Quick health check failed:', error);
      return false;
    }
  }
}

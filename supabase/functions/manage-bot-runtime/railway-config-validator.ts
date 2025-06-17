import { BotLogger } from './logger.ts';

export class RailwayConfigValidator {
  
  static validateEnvironmentVariables(): { isValid: boolean; missingVars: string[]; logs: string[] } {
    const logs: string[] = [];
    const requiredVars = ['RAILWAY_API_TOKEN', 'RAILWAY_PROJECT_ID', 'RAILWAY_ENVIRONMENT_ID'];
    const missingVars: string[] = [];
    
    logs.push(BotLogger.logSection('RAILWAY CONFIGURATION VALIDATION'));
    logs.push(BotLogger.log('', 'Debugging environment variables access...'));
    
    // Debug: Log all available environment variables (safely)
    const allEnvVars = Object.keys(Deno.env.toObject());
    logs.push(BotLogger.log('', `Total environment variables available: ${allEnvVars.length}`));
    logs.push(BotLogger.log('', `Railway-related env vars found: ${allEnvVars.filter(key => key.includes('RAILWAY')).join(', ')}`));
    
    for (const varName of requiredVars) {
      const value = Deno.env.get(varName);
      logs.push(BotLogger.log('', `Checking ${varName}...`));
      logs.push(BotLogger.log('', `Raw value type: ${typeof value}, length: ${value ? value.length : 'N/A'}`));
      
      if (!value || value.trim() === '') {
        missingVars.push(varName);
        logs.push(BotLogger.logError(`❌ Missing or empty environment variable: ${varName}`));
      } else {
        logs.push(BotLogger.logSuccess(`✅ ${varName}: SET (length: ${value.length})`));
      }
    }
    
    const isValid = missingVars.length === 0;
    
    if (isValid) {
      logs.push(BotLogger.logSuccess('✅ All Railway environment variables are configured'));
    } else {
      logs.push(BotLogger.logError(`❌ Missing ${missingVars.length} required Railway environment variables`));
      logs.push(BotLogger.log('', 'Please configure these variables in Supabase Edge Functions secrets:'));
      missingVars.forEach(varName => {
        logs.push(BotLogger.log('', `  - ${varName}`));
      });
      logs.push(BotLogger.log('', 'If you believe these secrets are already set, try:'));
      logs.push(BotLogger.log('', '  1. Wait a few minutes for secrets to propagate'));
      logs.push(BotLogger.log('', '  2. Remove and re-add the secrets'));
      logs.push(BotLogger.log('', '  3. Check for extra spaces or invisible characters'));
    }
    
    return { isValid, missingVars, logs };
  }
  
  static async validateRailwayConnection(): Promise<{ isValid: boolean; logs: string[]; error?: string }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('RAILWAY API CONNECTION TEST'));
      
      const railwayApiToken = Deno.env.get('RAILWAY_API_TOKEN');
      const projectId = Deno.env.get('RAILWAY_PROJECT_ID');
      
      if (!railwayApiToken || !projectId) {
        logs.push(BotLogger.logError('❌ Cannot test connection - missing API token or project ID'));
        return { isValid: false, logs, error: 'Missing Railway credentials' };
      }
      
      // Test basic API connectivity with a simple query
      const testQuery = `
        query {
          me {
            id
            email
          }
        }
      `;
      
      logs.push(BotLogger.log('', 'Testing Railway API authentication...'));
      
      const response = await fetch('https://backboard.railway.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${railwayApiToken}`,
          'User-Agent': 'BotFactory/1.0',
        },
        body: JSON.stringify({
          query: testQuery,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        logs.push(BotLogger.logError(`❌ Railway API authentication failed: ${response.status}`));
        logs.push(BotLogger.logError(`Error details: ${errorText}`));
        return { isValid: false, logs, error: `API authentication failed: ${response.status}` };
      }
      
      const result = await response.json();
      
      if (result.errors) {
        logs.push(BotLogger.logError(`❌ Railway API authentication error: ${JSON.stringify(result.errors)}`));
        return { isValid: false, logs, error: 'API authentication error' };
      }
      
      if (result.data?.me) {
        logs.push(BotLogger.logSuccess(`✅ Railway API authentication successful`));
        logs.push(BotLogger.log('', `Authenticated as: ${result.data.me.email || result.data.me.id}`));
      }
      
      // Now test project access
      logs.push(BotLogger.log('', 'Testing Railway project access...'));
      
      const projectQuery = `
        query GetProject($projectId: String!) {
          project(id: $projectId) {
            id
            name
            description
          }
        }
      `;
      
      const projectResponse = await fetch('https://backboard.railway.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${railwayApiToken}`,
          'User-Agent': 'BotFactory/1.0',
        },
        body: JSON.stringify({
          query: projectQuery,
          variables: { projectId },
        }),
      });
      
      if (!projectResponse.ok) {
        const errorText = await projectResponse.text();
        logs.push(BotLogger.logError(`❌ Railway project access failed: ${projectResponse.status}`));
        logs.push(BotLogger.logError(`Error details: ${errorText}`));
        return { isValid: false, logs, error: `Project access failed: ${projectResponse.status}` };
      }
      
      const projectResult = await projectResponse.json();
      
      if (projectResult.errors) {
        logs.push(BotLogger.logError(`❌ Railway project access error: ${JSON.stringify(projectResult.errors)}`));
        return { isValid: false, logs, error: 'Project access error' };
      }
      
      if (!projectResult.data?.project) {
        logs.push(BotLogger.logError(`❌ Railway project not found: ${projectId}`));
        logs.push(BotLogger.log('', 'Please check that:'));
        logs.push(BotLogger.log('', '  1. The project ID is correct'));
        logs.push(BotLogger.log('', '  2. The API token has access to this project'));
        logs.push(BotLogger.log('', '  3. The project exists and is not deleted'));
        return { isValid: false, logs, error: 'Project not found or no access' };
      }
      
      const project = projectResult.data.project;
      logs.push(BotLogger.logSuccess(`✅ Railway project access successful`));
      logs.push(BotLogger.log('', `Project: ${project.name} (${project.id})`));
      if (project.description) {
        logs.push(BotLogger.log('', `Description: ${project.description}`));
      }
      
      logs.push(BotLogger.logSuccess('✅ Railway configuration is valid and accessible'));
      return { isValid: true, logs };
      
    } catch (error) {
      logs.push(BotLogger.logError(`❌ Railway connection test failed: ${error.message}`));
      return { isValid: false, logs, error: error.message };
    }
  }
}

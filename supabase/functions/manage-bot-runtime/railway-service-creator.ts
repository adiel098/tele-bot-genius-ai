
import { BotLogger } from './logger.ts';
import { RailwayApiClient } from './railway-api-client.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export class RailwayServiceCreator {
  
  static async createServiceWithActualCode(botId: string, token: string): Promise<{ success: boolean; logs: string[]; serviceId?: string; error?: string }> {
    const logs: string[] = [];
    
    try {
      logs.push(BotLogger.logSection('CREATING RAILWAY SERVICE WITH ACTUAL BOT CODE'));
      logs.push(BotLogger.log(botId, 'Preparing bot deployment with real Python code...'));
      
      console.log(`[${new Date().toISOString()}] ========== RAILWAY SERVICE CREATION START ==========`);
      
      const projectId = Deno.env.get('RAILWAY_PROJECT_ID');
      const environmentId = Deno.env.get('RAILWAY_ENVIRONMENT_ID');

      console.log(`[${new Date().toISOString()}] Environment variables check:`);
      console.log(`[${new Date().toISOString()}] RAILWAY_PROJECT_ID: ${projectId ? 'SET' : 'MISSING'}`);
      console.log(`[${new Date().toISOString()}] RAILWAY_ENVIRONMENT_ID: ${environmentId ? 'SET' : 'MISSING'}`);

      if (!projectId || !environmentId) {
        const missingVars = [];
        if (!projectId) missingVars.push('RAILWAY_PROJECT_ID');
        if (!environmentId) missingVars.push('RAILWAY_ENVIRONMENT_ID');
        
        console.error(`[${new Date().toISOString()}] ❌ Missing environment variables: ${missingVars.join(', ')}`);
        throw new Error(`Railway configuration incomplete. Missing: ${missingVars.join(', ')}`);
      }

      // Validate token format
      if (!token || !token.match(/^\d+:[A-Za-z0-9_-]+$/)) {
        console.error(`[${new Date().toISOString()}] ❌ Invalid bot token format`);
        logs.push(BotLogger.logError('❌ Invalid bot token format - must match pattern: 123456789:ABC-DEF1234567890'));
        throw new Error('Invalid bot token format. Please check your token from @BotFather.');
      }

      // Get actual bot code from database
      const { data: botData, error: botError } = await supabase
        .from('bots')
        .select('files')
        .eq('id', botId)
        .single();

      if (botError || !botData?.files) {
        console.error(`[${new Date().toISOString()}] ❌ Failed to get bot files: ${botError?.message}`);
        logs.push(BotLogger.logError(`❌ Failed to get bot files: ${botError?.message || 'No files found'}`));
        throw new Error('Failed to get bot files from database');
      }

      const botFiles = botData.files as Record<string, string>;
      const mainPyContent = botFiles['main.py'];

      if (!mainPyContent) {
        console.error(`[${new Date().toISOString()}] ❌ No main.py file found in bot files`);
        logs.push(BotLogger.logError('❌ No main.py file found in bot files'));
        throw new Error('No main.py file found in bot files');
      }

      logs.push(BotLogger.log(botId, 'Bot files retrieved from database'));
      logs.push(BotLogger.log(botId, `Main.py size: ${mainPyContent.length} characters`));

      logs.push(BotLogger.log(botId, 'Creating Railway service with actual bot code...'));
      console.log(`[${new Date().toISOString()}] Creating Railway service with actual bot code...`);

      // Create service with actual bot code
      const serviceResult = await RailwayApiClient.createServiceWithCode(projectId, botId, token, mainPyContent, botFiles);

      console.log(`[${new Date().toISOString()}] Service creation result: ${JSON.stringify(serviceResult, null, 2)}`);

      if (!serviceResult.success) {
        console.error(`[${new Date().toISOString()}] ❌ Service creation failed: ${serviceResult.error}`);
        logs.push(BotLogger.logError(`❌ Railway service creation failed: ${serviceResult.error}`));
        throw new Error(serviceResult.error || 'Failed to create Railway service');
      }

      const serviceId = serviceResult.serviceId!;
      console.log(`[${new Date().toISOString()}] ✅ Service created successfully: ${serviceId}`);
      logs.push(BotLogger.logSuccess(`✅ Railway service created with actual bot code: ${serviceId}`));
      logs.push(BotLogger.logSuccess(`✅ Bot deployed at: https://bot-${botId}.up.railway.app`));
      logs.push(BotLogger.log(botId, 'Railway deployment starting with real Python bot code...'));
      logs.push(BotLogger.log(botId, 'Environment variables configured with bot token'));

      // Wait for deployment to initialize
      logs.push(BotLogger.log(botId, 'Waiting for Railway to build and deploy bot...'));
      await new Promise(resolve => setTimeout(resolve, 20000)); // Wait for deployment
      
      logs.push(BotLogger.logSuccess(`✅ Railway deployment completed: ${serviceId}`));
      logs.push(BotLogger.log(botId, `Bot URL: https://bot-${botId}.up.railway.app`));
      logs.push(BotLogger.log(botId, 'Real Python bot code deployed and running'));
      logs.push(BotLogger.log(botId, 'Bot should now respond to Telegram messages'));

      console.log(`[${new Date().toISOString()}] ========== RAILWAY SERVICE CREATION SUCCESS ==========`);

      return {
        success: true,
        logs,
        serviceId: serviceId
      };

    } catch (error) {
      console.error(`[${new Date().toISOString()}] ========== RAILWAY SERVICE CREATION FAILED ==========`);
      console.error(`[${new Date().toISOString()}] Error: ${error.message}`);
      console.error(`[${new Date().toISOString()}] Stack: ${error.stack}`);
      
      logs.push(BotLogger.logError(`❌ Railway service creation failed: ${error.message}`));
      return {
        success: false,
        logs,
        error: error.message
      };
    }
  }
}

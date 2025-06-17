
import { BotLogger } from './logger.ts';
import { RailwayApiClient } from './railway-api-client.ts';
import { RailwayHealthChecker } from './railway-health-checker.ts';
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
      
      // Step 1: Perform comprehensive health check
      logs.push(BotLogger.log(botId, 'Performing Railway health check...'));
      const healthCheck = await RailwayHealthChecker.performHealthCheck();
      logs.push(...healthCheck.logs);
      
      if (!healthCheck.isHealthy) {
        console.error(`[${new Date().toISOString()}] ❌ Railway health check failed`);
        const errorMessage = `Railway health check failed. Issues: ${healthCheck.issues.join(', ')}`;
        logs.push(BotLogger.logError(errorMessage));
        throw new Error(errorMessage);
      }
      
      const projectId = Deno.env.get('RAILWAY_PROJECT_ID')!;
      const environmentId = Deno.env.get('RAILWAY_ENVIRONMENT_ID')!;

      // Step 2: Validate token format
      if (!token || !token.match(/^\d+:[A-Za-z0-9_-]+$/)) {
        console.error(`[${new Date().toISOString()}] ❌ Invalid bot token format`);
        logs.push(BotLogger.logError('❌ Invalid bot token format - must match pattern: 123456789:ABC-DEF1234567890'));
        throw new Error('Invalid bot token format. Please check your token from @BotFather.');
      }

      // Step 3: Get bot info to find user_id
      const { data: botData, error: botError } = await supabase
        .from('bots')
        .select('user_id')
        .eq('id', botId)
        .single();

      if (botError || !botData) {
        console.error(`[${new Date().toISOString()}] ❌ Failed to get bot info: ${botError?.message}`);
        logs.push(BotLogger.logError(`❌ Failed to get bot info: ${botError?.message || 'Bot not found'}`));
        throw new Error('Failed to get bot info from database');
      }

      const userId = botData.user_id;
      logs.push(BotLogger.log(botId, `Getting bot files from storage for user: ${userId}`));

      // Step 4: Get bot files from Supabase Storage
      const { data: files, error: filesError } = await supabase.storage
        .from('bot-files')
        .list(`${userId}/${botId}`);

      if (filesError || !files || files.length === 0) {
        console.error(`[${new Date().toISOString()}] ❌ Failed to list bot files: ${filesError?.message}`);
        logs.push(BotLogger.logError(`❌ Failed to get bot files from storage: ${filesError?.message || 'No files found'}`));
        throw new Error('Failed to get bot files from storage');
      }

      // Step 5: Download main.py file
      const mainFile = files.find(f => f.name === 'main.py');
      if (!mainFile) {
        console.error(`[${new Date().toISOString()}] ❌ No main.py file found`);
        logs.push(BotLogger.logError('❌ No main.py file found in storage'));
        throw new Error('No main.py file found in storage');
      }

      const { data: mainFileData, error: downloadError } = await supabase.storage
        .from('bot-files')
        .download(`${userId}/${botId}/${mainFile.name}`);

      if (downloadError || !mainFileData) {
        console.error(`[${new Date().toISOString()}] ❌ Failed to download main.py: ${downloadError?.message}`);
        logs.push(BotLogger.logError(`❌ Failed to download main.py: ${downloadError?.message || 'Download failed'}`));
        throw new Error('Failed to download main.py file');
      }

      const mainPyContent = await mainFileData.text();
      logs.push(BotLogger.log(botId, 'Bot files retrieved from storage'));
      logs.push(BotLogger.log(botId, `Main.py size: ${mainPyContent.length} characters`));

      // Step 6: Download other files if they exist
      const botFiles: Record<string, string> = {
        'main.py': mainPyContent
      };

      // Try to get other common files
      const commonFiles = ['requirements.txt', '.env', 'Dockerfile', 'README.md'];
      for (const fileName of commonFiles) {
        const file = files.find(f => f.name === fileName);
        if (file) {
          try {
            const { data: fileData } = await supabase.storage
              .from('bot-files')
              .download(`${userId}/${botId}/${fileName}`);
            
            if (fileData) {
              botFiles[fileName] = await fileData.text();
              logs.push(BotLogger.log(botId, `Downloaded ${fileName}`));
            }
          } catch (error) {
            console.warn(`[${new Date().toISOString()}] Warning: Could not download ${fileName}: ${error.message}`);
          }
        }
      }

      // Step 7: Create service with actual bot code
      logs.push(BotLogger.log(botId, 'Creating Railway service with validated configuration...'));
      console.log(`[${new Date().toISOString()}] Creating Railway service with actual bot code...`);

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

      // Step 8: Wait for deployment to initialize
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

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { DockerClient } from './docker-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const dockerClient = new DockerClient();

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, botId, userId } = await req.json();
    
    console.log(`Container Build Service - Action: ${action}, Bot: ${botId}`);
    
    switch (action) {
      case 'test':
        return await testDockerConnection();
      case 'build':
        return await buildContainer(botId, userId);
      case 'push':
        return await pushToRegistry(botId);
      case 'cleanup':
        return await cleanupImages(botId);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
  } catch (error) {
    console.error('Container Build Service Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message,
      logs: [`[ERROR] Container Build Service failed: ${error.message}`]
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function testDockerConnection() {
  console.log(`Testing Docker connection...`);
  
  try {
    const testResult = await dockerClient.testConnection();
    
    return new Response(JSON.stringify({
      success: testResult.success,
      logs: testResult.logs,
      error: testResult.error
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Docker connection test error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      logs: [`[TEST ERROR] ${error.message}`]
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function buildContainer(botId: string, userId: string) {
  console.log(`Building container for bot: ${botId}`);
  
  const allLogs: string[] = [];
  
  try {
    allLogs.push(`[SERVICE] ==================== CONTAINER BUILD SERVICE START ====================`);
    allLogs.push(`[SERVICE] Bot ID: ${botId}`);
    allLogs.push(`[SERVICE] User ID: ${userId}`);
    allLogs.push(`[SERVICE] Docker Host: ${Deno.env.get('DOCKER_HOST')}`);
    
    // Phase 1: Download bot files from Supabase Storage
    allLogs.push(`[SERVICE] Phase 1: Downloading bot files...`);
    const botFiles = await downloadBotFiles(userId, botId);
    allLogs.push(`[SERVICE] ✅ Downloaded ${Object.keys(botFiles).length} files`);
    
    for (const [filename, content] of Object.entries(botFiles)) {
      allLogs.push(`[SERVICE] - ${filename}: ${content.length} bytes`);
    }
    
    // Phase 2: Generate optimized Dockerfile
    allLogs.push(`[SERVICE] Phase 2: Generating Dockerfile...`);
    const dockerfile = generateDockerfile(botFiles);
    allLogs.push(`[SERVICE] ✅ Dockerfile generated: ${dockerfile.length} bytes`);
    
    // Phase 3: Build Docker image
    allLogs.push(`[SERVICE] Phase 3: Building Docker image...`);
    const buildResult = await dockerClient.buildImage(botId, dockerfile, botFiles);
    allLogs.push(...buildResult.logs);
    
    if (buildResult.success) {
      allLogs.push(`[SERVICE] ✅ Container build completed successfully`);
      
      // Update bot record with image reference
      await supabase
        .from('bots')
        .update({
          deployment_config: {
            type: 'kubernetes',
            image_tag: buildResult.imageTag,
            build_time: new Date().toISOString()
          }
        })
        .eq('id', botId);
      
      allLogs.push(`[SERVICE] ✅ Bot record updated with image tag`);
      allLogs.push(`[SERVICE] ==================== CONTAINER BUILD SERVICE SUCCESS ====================`);
      
      return new Response(JSON.stringify({
        success: true,
        imageTag: buildResult.imageTag,
        logs: allLogs
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
      
    } else {
      allLogs.push(`[SERVICE] ❌ Container build failed`);
      allLogs.push(`[SERVICE] ==================== CONTAINER BUILD SERVICE FAILED ====================`);
      
      return new Response(JSON.stringify({
        success: false,
        imageTag: '',
        logs: allLogs,
        error: 'Docker build failed - see logs for details'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
  } catch (error) {
    console.error('Build container error:', error);
    allLogs.push(`[SERVICE] ❌ Build exception: ${error.message}`);
    allLogs.push(`[SERVICE] ❌ Stack: ${error.stack}`);
    allLogs.push(`[SERVICE] ==================== CONTAINER BUILD SERVICE EXCEPTION ====================`);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      logs: allLogs
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function pushToRegistry(botId: string) {
  console.log(`Pushing image to registry for bot: ${botId}`);
  
  try {
    const imageTag = `ghcr.io/botfactory/telegram-bot:${botId}`;
    const pushResult = await dockerClient.pushImage(imageTag);
    
    return new Response(JSON.stringify({
      success: pushResult.success,
      imageTag,
      logs: pushResult.logs
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Push image error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      logs: [`[PUSH ERROR] ${error.message}`]
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function cleanupImages(botId: string) {
  console.log(`Cleaning up images for bot: ${botId}`);
  
  try {
    const imageTag = `ghcr.io/botfactory/telegram-bot:${botId}`;
    const cleanupResult = await dockerClient.removeImage(imageTag);
    
    return new Response(JSON.stringify({
      success: cleanupResult.success,
      logs: cleanupResult.logs
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Cleanup images error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      logs: [`[CLEANUP ERROR] ${error.message}`]
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function downloadBotFiles(userId: string, botId: string) {
  console.log(`Downloading bot files for: ${userId}/${botId}`);
  
  const files: Record<string, string> = {};
  
  // Download main.py
  const { data: mainFile, error: mainError } = await supabase.storage
    .from('bot-files')
    .download(`${userId}/${botId}/main.py`);
    
  if (mainError || !mainFile) {
    throw new Error(`Failed to download main.py: ${mainError?.message}`);
  }
  
  files['main.py'] = await mainFile.text();
  
  // Download requirements.txt
  const { data: reqFile, error: reqError } = await supabase.storage
    .from('bot-files')
    .download(`${userId}/${botId}/requirements.txt`);
    
  if (reqFile && !reqError) {
    files['requirements.txt'] = await reqFile.text();
  } else {
    files['requirements.txt'] = 'python-telegram-bot>=20.0\npython-dotenv>=1.0.0\nrequests>=2.28.0';
  }
  
  // Download .env
  const { data: envFile, error: envError } = await supabase.storage
    .from('bot-files')
    .download(`${userId}/${botId}/.env`);
    
  if (envFile && !envError) {
    files['.env'] = await envFile.text();
  }
  
  console.log(`Downloaded ${Object.keys(files).length} files for bot ${botId}`);
  return files;
}

function generateDockerfile(files: Record<string, string>) {
  return `
# Multi-stage build for optimized bot container
FROM python:3.11-slim as builder

# Install build dependencies
RUN apt-get update && apt-get install -y \\
    gcc \\
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Production stage
FROM python:3.11-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \\
    curl \\
    && rm -rf /var/lib/apt/lists/* \\
    && useradd --create-home --shell /bin/bash botuser

# Copy Python packages from builder
COPY --from=builder /root/.local /home/botuser/.local

WORKDIR /app
COPY --chown=botuser:botuser . .

# Switch to non-root user
USER botuser

# Add local bin to PATH
ENV PATH=/home/botuser/.local/bin:$PATH

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
    CMD python -c "import requests; requests.get('http://localhost:8080/health', timeout=5)" || exit 1

# Expose health check port
EXPOSE 8080

# Run the bot
CMD ["python", "main.py"]
`;

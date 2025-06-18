import { TarBuilder } from './tar-builder.ts';

export class DockerClient {
  private dockerHost: string;
  private apiVersion: string;
  
  constructor() {
    this.dockerHost = Deno.env.get('DOCKER_HOST') || 'http://localhost:2375';
    this.apiVersion = 'v1.41';
  }

  async testConnection(): Promise<{ success: boolean; logs: string[]; error?: string }> {
    const logs: string[] = [];
    
    try {
      logs.push(`[TEST] Testing Docker connection to: ${this.dockerHost}`);
      
      const response = await fetch(`${this.dockerHost}/${this.apiVersion}/version`, {
        method: 'GET',
        headers: {
          'ngrok-skip-browser-warning': 'true'
        }
      });
      
      logs.push(`[TEST] Connection response status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const version = await response.json();
        logs.push(`[TEST] ✅ Docker API version: ${version.ApiVersion}`);
        logs.push(`[TEST] ✅ Docker version: ${version.Version}`);
        logs.push(`[TEST] ✅ Connection successful`);
        return { success: true, logs };
      } else {
        const errorText = await response.text();
        logs.push(`[TEST] ❌ Connection failed: ${errorText}`);
        return { success: false, logs, error: `HTTP ${response.status}: ${errorText}` };
      }
    } catch (error) {
      logs.push(`[TEST] ❌ Connection exception: ${error.message}`);
      return { success: false, logs, error: error.message };
    }
  }

  async buildImage(botId: string, dockerfile: string, files: Record<string, string>): Promise<{ success: boolean; imageTag: string; logs: string[] }> {
    const logs: string[] = [];
    const imageTag = `ghcr.io/botfactory/telegram-bot:${botId}`;
    
    try {
      logs.push(`[BUILD] ==================== DOCKER BUILD START ====================`);
      logs.push(`[BUILD] Bot ID: ${botId}`);
      logs.push(`[BUILD] Image tag: ${imageTag}`);
      logs.push(`[BUILD] Docker host: ${this.dockerHost}`);
      logs.push(`[BUILD] Files to include: ${Object.keys(files).join(', ')}`);
      
      // Phase 1: Test Docker connection
      logs.push(`[BUILD] Phase 1: Testing Docker connection...`);
      const connectionTest = await this.testConnection();
      logs.push(...connectionTest.logs);
      
      if (!connectionTest.success) {
        logs.push(`[BUILD] ❌ Build failed: Docker connection test failed`);
        return { success: false, imageTag: '', logs };
      }
      
      // Phase 2: Create build context
      logs.push(`[BUILD] Phase 2: Creating TAR build context...`);
      const buildContext = await this.createBuildContext(dockerfile, files);
      logs.push(`[BUILD] ✅ Build context created: ${buildContext.length} bytes`);
      
      // Validate build context
      if (buildContext.length === 0) {
        logs.push(`[BUILD] ❌ Build context is empty`);
        return { success: false, imageTag: '', logs };
      }
      
      // Phase 3: Send build request
      logs.push(`[BUILD] Phase 3: Sending Docker build request...`);
      const buildUrl = `${this.dockerHost}/${this.apiVersion}/build`;
      const params = new URLSearchParams({
        t: imageTag,
        dockerfile: 'Dockerfile',
        rm: 'true',
        forcerm: 'true',
        pull: 'true'
      });
      
      const fullUrl = `${buildUrl}?${params.toString()}`;
      logs.push(`[BUILD] Request URL: ${fullUrl}`);
      logs.push(`[BUILD] Request headers: Content-Type=application/x-tar, Content-Length=${buildContext.length}`);
      
      const buildResponse = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-tar',
          'Content-Length': buildContext.length.toString(),
          'ngrok-skip-browser-warning': 'true'
        },
        body: buildContext
      });
      
      logs.push(`[BUILD] Response status: ${buildResponse.status} ${buildResponse.statusText}`);
      logs.push(`[BUILD] Response headers: ${JSON.stringify(Object.fromEntries(buildResponse.headers.entries()))}`);
      
      if (buildResponse.ok) {
        logs.push(`[BUILD] Phase 4: Processing build output...`);
        const buildOutput = await buildResponse.text();
        logs.push(`[BUILD] Raw output length: ${buildOutput.length} characters`);
        
        if (buildOutput.trim() === '') {
          logs.push(`[BUILD] ⚠️ Warning: Empty build output received`);
        }
        
        const buildLines = buildOutput.split('\n').filter(line => line.trim());
        logs.push(`[BUILD] Processing ${buildLines.length} output lines...`);
        
        let hasError = false;
        for (const line of buildLines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.stream) {
                logs.push(`[BUILD] ${parsed.stream.trim()}`);
              } else if (parsed.error) {
                logs.push(`[BUILD] ❌ Docker error: ${parsed.error}`);
                hasError = true;
              } else if (parsed.aux?.ID) {
                logs.push(`[BUILD] ✅ Image ID: ${parsed.aux.ID}`);
              } else {
                logs.push(`[BUILD] Docker: ${JSON.stringify(parsed)}`);
              }
            } catch {
              // Non-JSON line, log as-is
              logs.push(`[BUILD] ${line}`);
            }
          }
        }
        
        if (hasError) {
          logs.push(`[BUILD] ❌ Build failed with Docker errors`);
          return { success: false, imageTag: '', logs };
        }
        
        logs.push(`[BUILD] ✅ Image built successfully: ${imageTag}`);
        logs.push(`[BUILD] ==================== DOCKER BUILD SUCCESS ====================`);
        return { success: true, imageTag, logs };
        
      } else {
        logs.push(`[BUILD] Phase 4: Processing build error...`);
        const errorText = await buildResponse.text();
        logs.push(`[BUILD] ❌ Build failed with HTTP ${buildResponse.status}`);
        logs.push(`[BUILD] ❌ Error response: ${errorText}`);
        logs.push(`[BUILD] ==================== DOCKER BUILD FAILED ====================`);
        return { success: false, imageTag: '', logs };
      }
      
    } catch (error) {
      logs.push(`[BUILD] ❌ Build exception: ${error.message}`);
      logs.push(`[BUILD] ❌ Stack trace: ${error.stack}`);
      logs.push(`[BUILD] ==================== DOCKER BUILD EXCEPTION ====================`);
      return { success: false, imageTag: '', logs };
    }
  }

  async pushImage(imageTag: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      logs.push(`[PUSH] Pushing image: ${imageTag}`);
      
      const pushUrl = `${this.dockerHost}/${this.apiVersion}/images/${encodeURIComponent(imageTag)}/push`;
      const headers: Record<string, string> = {
        'ngrok-skip-browser-warning': 'true'
      };
      
      const registryAuth = await this.getRegistryAuth();
      if (registryAuth) {
        headers['X-Registry-Auth'] = registryAuth;
        logs.push(`[PUSH] Using registry authentication`);
      }
      
      const pushResponse = await fetch(pushUrl, {
        method: 'POST',
        headers
      });
      
      logs.push(`[PUSH] Push response status: ${pushResponse.status}`);
      
      if (pushResponse.ok) {
        const pushOutput = await pushResponse.text();
        const pushLines = pushOutput.split('\n').filter(line => line.trim());
        
        for (const line of pushLines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.status) {
                logs.push(`[PUSH] ${parsed.status}`);
              } else if (parsed.error) {
                logs.push(`[PUSH] ❌ ${parsed.error}`);
                return { success: false, logs };
              }
            } catch {
              logs.push(`[PUSH] ${line}`);
            }
          }
        }
        
        logs.push(`[PUSH] ✅ Image pushed successfully`);
        return { success: true, logs };
      } else {
        const error = await pushResponse.text();
        logs.push(`[PUSH] ❌ Push failed: ${error}`);
        return { success: false, logs };
      }
      
    } catch (error) {
      logs.push(`[PUSH] ❌ Exception: ${error.message}`);
      return { success: false, logs };
    }
  }

  async removeImage(imageTag: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      logs.push(`[CLEANUP] Removing image: ${imageTag}`);
      
      const removeUrl = `${this.dockerHost}/${this.apiVersion}/images/${encodeURIComponent(imageTag)}`;
      const removeResponse = await fetch(removeUrl, {
        method: 'DELETE',
        headers: {
          'ngrok-skip-browser-warning': 'true'
        }
      });
      
      if (removeResponse.ok || removeResponse.status === 404) {
        logs.push(`[CLEANUP] ✅ Image removed successfully`);
        return { success: true, logs };
      } else {
        const error = await removeResponse.text();
        logs.push(`[CLEANUP] ⚠️ Error removing image: ${error}`);
        return { success: true, logs };
      }
      
    } catch (error) {
      logs.push(`[CLEANUP] ❌ Exception: ${error.message}`);
      return { success: false, logs };
    }
  }

  private async createBuildContext(dockerfile: string, files: Record<string, string>): Promise<Uint8Array> {
    const tarBuilder = new TarBuilder();
    const encoder = new TextEncoder();
    
    console.log(`[TAR] Creating build context with ${Object.keys(files).length + 1} files`);
    
    // Add Dockerfile first
    console.log(`[TAR] Adding Dockerfile (${dockerfile.length} bytes)`);
    tarBuilder.addFile('Dockerfile', encoder.encode(dockerfile));
    
    // Add other files
    for (const [filename, content] of Object.entries(files)) {
      console.log(`[TAR] Adding ${filename} (${content.length} bytes)`);
      tarBuilder.addFile(filename, encoder.encode(content));
    }
    
    const result = tarBuilder.build();
    console.log(`[TAR] Build context created: ${result.length} bytes total`);
    
    return result;
  }

  private async getRegistryAuth(): Promise<string> {
    // For GitHub Container Registry (ghcr.io)
    const githubToken = Deno.env.get('GITHUB_TOKEN');
    if (githubToken) {
      const auth = btoa(JSON.stringify({
        username: 'token',
        password: githubToken,
        serveraddress: 'ghcr.io'
      }));
      return auth;
    }
    return '';
  }
}

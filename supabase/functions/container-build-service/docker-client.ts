
import { TarBuilder } from './tar-builder.ts';

export class DockerClient {
  private dockerHost: string;
  private apiVersion: string;
  
  constructor() {
    this.dockerHost = Deno.env.get('DOCKER_HOST') || 'http://localhost:2375';
    this.apiVersion = 'v1.41'; // Will be auto-detected
  }

  async buildImage(botId: string, dockerfile: string, files: Record<string, string>): Promise<{ success: boolean; imageTag: string; logs: string[] }> {
    const logs: string[] = [];
    const imageTag = `ghcr.io/botfactory/telegram-bot:${botId}`;
    
    try {
      logs.push(`[BUILD] Starting Docker build for bot ${botId}`);
      logs.push(`[BUILD] Image tag: ${imageTag}`);
      logs.push(`[BUILD] Docker host: ${this.dockerHost}`);
      
      // Test Docker connection first
      const connectionTest = await this.testDockerConnection();
      if (!connectionTest.success) {
        logs.push(`[BUILD] ❌ Docker connection failed: ${connectionTest.error}`);
        return { success: false, imageTag: '', logs };
      }
      logs.push(`[BUILD] ✅ Docker connection successful`);
      
      // Create proper TAR build context
      const buildContext = await this.createBuildContext(dockerfile, files);
      logs.push(`[BUILD] ✅ Build context created (${buildContext.length} bytes)`);
      
      // Build image using Docker HTTP API
      const buildUrl = `${this.dockerHost}/${this.apiVersion}/build`;
      const params = new URLSearchParams({
        t: imageTag,
        dockerfile: 'Dockerfile',
        rm: 'true',
        forcerm: 'true',
        pull: 'true'
      });
      
      logs.push(`[BUILD] Sending build request to: ${buildUrl}?${params.toString()}`);
      
      const buildResponse = await fetch(`${buildUrl}?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-tar',
          'Content-Length': buildContext.length.toString()
        },
        body: buildContext
      });
      
      logs.push(`[BUILD] Build response status: ${buildResponse.status} ${buildResponse.statusText}`);
      
      if (buildResponse.ok) {
        // Parse build output
        const buildOutput = await buildResponse.text();
        const buildLines = buildOutput.split('\n').filter(line => line.trim());
        
        for (const line of buildLines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.stream) {
                logs.push(`[BUILD] ${parsed.stream.trim()}`);
              } else if (parsed.error) {
                logs.push(`[BUILD] ❌ ${parsed.error}`);
                return { success: false, imageTag: '', logs };
              }
            } catch {
              logs.push(`[BUILD] ${line}`);
            }
          }
        }
        
        logs.push(`[BUILD] ✅ Image built successfully: ${imageTag}`);
        return { success: true, imageTag, logs };
      } else {
        const errorText = await buildResponse.text();
        logs.push(`[BUILD] ❌ Build failed with status ${buildResponse.status}`);
        logs.push(`[BUILD] ❌ Error: ${errorText}`);
        return { success: false, imageTag: '', logs };
      }
      
    } catch (error) {
      logs.push(`[BUILD] ❌ Exception: ${error.message}`);
      logs.push(`[BUILD] ❌ Stack: ${error.stack}`);
      return { success: false, imageTag: '', logs };
    }
  }

  async pushImage(imageTag: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      logs.push(`[PUSH] Pushing image: ${imageTag}`);
      
      const pushUrl = `${this.dockerHost}/${this.apiVersion}/images/${encodeURIComponent(imageTag)}/push`;
      const headers: Record<string, string> = {};
      
      // Add registry auth if available
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
        method: 'DELETE'
      });
      
      if (removeResponse.ok || removeResponse.status === 404) {
        logs.push(`[CLEANUP] ✅ Image removed successfully`);
        return { success: true, logs };
      } else {
        const error = await removeResponse.text();
        logs.push(`[CLEANUP] ⚠️ Error removing image: ${error}`);
        return { success: true, logs }; // Not critical if image doesn't exist
      }
      
    } catch (error) {
      logs.push(`[CLEANUP] ❌ Exception: ${error.message}`);
      return { success: false, logs };
    }
  }

  private async testDockerConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.dockerHost}/${this.apiVersion}/version`, {
        method: 'GET'
      });
      
      if (response.ok) {
        const version = await response.json();
        console.log(`[DOCKER] Connected to Docker API version: ${version.ApiVersion}`);
        return { success: true };
      } else {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  private async createBuildContext(dockerfile: string, files: Record<string, string>): Promise<Uint8Array> {
    const tarBuilder = new TarBuilder();
    const encoder = new TextEncoder();
    
    // Add Dockerfile
    tarBuilder.addFile('Dockerfile', encoder.encode(dockerfile));
    
    // Add other files
    for (const [filename, content] of Object.entries(files)) {
      tarBuilder.addFile(filename, encoder.encode(content));
    }
    
    return tarBuilder.build();
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

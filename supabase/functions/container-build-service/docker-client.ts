
export class DockerClient {
  private dockerHost: string;
  
  constructor() {
    this.dockerHost = Deno.env.get('DOCKER_HOST') || 'npipe://./pipe/docker_engine';
  }

  async buildImage(botId: string, dockerfile: string, files: Record<string, string>): Promise<{ success: boolean; imageTag: string; logs: string[] }> {
    const logs: string[] = [];
    const imageTag = `ghcr.io/botfactory/telegram-bot:${botId}`;
    
    try {
      logs.push(`[BUILD] Starting Docker build for bot ${botId}`);
      logs.push(`[BUILD] Image tag: ${imageTag}`);
      
      // Create build context as tar stream
      const buildContext = await this.createBuildContext(dockerfile, files);
      logs.push(`[BUILD] Build context created (${buildContext.length} bytes)`);
      
      // Build image using Docker HTTP API
      const buildResponse = await this.callDockerAPI('/build', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-tar',
        },
        body: buildContext,
        params: new URLSearchParams({
          t: imageTag,
          dockerfile: 'Dockerfile',
          rm: 'true',
          forcerm: 'true'
        })
      });
      
      if (buildResponse.ok) {
        logs.push(`[BUILD] ✅ Image built successfully: ${imageTag}`);
        return { success: true, imageTag, logs };
      } else {
        const error = await buildResponse.text();
        logs.push(`[BUILD] ❌ Build failed: ${error}`);
        return { success: false, imageTag: '', logs };
      }
      
    } catch (error) {
      logs.push(`[BUILD] ❌ Error: ${error.message}`);
      return { success: false, imageTag: '', logs };
    }
  }

  async pushImage(imageTag: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      logs.push(`[PUSH] Pushing image: ${imageTag}`);
      
      const pushResponse = await this.callDockerAPI(`/images/${encodeURIComponent(imageTag)}/push`, {
        method: 'POST',
        headers: {
          'X-Registry-Auth': await this.getRegistryAuth()
        }
      });
      
      if (pushResponse.ok) {
        logs.push(`[PUSH] ✅ Image pushed successfully`);
        return { success: true, logs };
      } else {
        const error = await pushResponse.text();
        logs.push(`[PUSH] ❌ Push failed: ${error}`);
        return { success: false, logs };
      }
      
    } catch (error) {
      logs.push(`[PUSH] ❌ Error: ${error.message}`);
      return { success: false, logs };
    }
  }

  async removeImage(imageTag: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      logs.push(`[CLEANUP] Removing image: ${imageTag}`);
      
      const removeResponse = await this.callDockerAPI(`/images/${encodeURIComponent(imageTag)}`, {
        method: 'DELETE'
      });
      
      if (removeResponse.ok) {
        logs.push(`[CLEANUP] ✅ Image removed successfully`);
        return { success: true, logs };
      } else {
        logs.push(`[CLEANUP] ⚠️ Image may not exist or already removed`);
        return { success: true, logs }; // Not critical if image doesn't exist
      }
      
    } catch (error) {
      logs.push(`[CLEANUP] ❌ Error: ${error.message}`);
      return { success: false, logs };
    }
  }

  private async createBuildContext(dockerfile: string, files: Record<string, string>): Promise<Uint8Array> {
    // Create a simple tar-like structure for the build context
    const encoder = new TextEncoder();
    let tarData = new Uint8Array();
    
    // Add Dockerfile
    const dockerfileData = encoder.encode(dockerfile);
    tarData = this.appendToTar(tarData, 'Dockerfile', dockerfileData);
    
    // Add other files
    for (const [filename, content] of Object.entries(files)) {
      const fileData = encoder.encode(content);
      tarData = this.appendToTar(tarData, filename, fileData);
    }
    
    return tarData;
  }

  private appendToTar(existing: Uint8Array, filename: string, data: Uint8Array): Uint8Array {
    // Simple tar-like format (simplified for basic Docker build)
    const header = new TextEncoder().encode(`${filename}\n`);
    const combined = new Uint8Array(existing.length + header.length + data.length + 1);
    combined.set(existing, 0);
    combined.set(header, existing.length);
    combined.set(data, existing.length + header.length);
    combined[existing.length + header.length + data.length] = 0; // null terminator
    return combined;
  }

  private async callDockerAPI(endpoint: string, options: {
    method?: string;
    headers?: Record<string, string>;
    body?: Uint8Array | string;
    params?: URLSearchParams;
  } = {}): Promise<Response> {
    const { method = 'GET', headers = {}, body, params } = options;
    
    // Convert Docker socket path to HTTP endpoint
    let baseUrl = this.dockerHost;
    if (baseUrl.startsWith('npipe://')) {
      // For Windows named pipes, use HTTP over Unix socket equivalent
      baseUrl = 'http://localhost:2375'; // Docker Desktop default
    } else if (baseUrl.startsWith('unix://')) {
      baseUrl = 'http://localhost:2375';
    }
    
    const url = new URL(`${baseUrl}/v1.41${endpoint}`);
    if (params) {
      url.search = params.toString();
    }
    
    return await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body
    });
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

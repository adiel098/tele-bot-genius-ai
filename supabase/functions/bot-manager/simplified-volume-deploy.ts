// Simplified single-machine volume deployment approach
async function deployBotToFlyWithVolume(appName: string, files: Record<string, string>, token: string): Promise<any> {
  console.log(`[BOT-MANAGER] Starting SIMPLIFIED single-machine volume deployment for ${appName}`);
  
  try {
    // Only cleanup machines, keep volumes for persistence
    console.log(`[BOT-MANAGER] Cleaning up existing machines only...`);
    await cleanupExistingMachines(appName, token);
    
    // Create or reuse volume
    const volumeName = `bot_${appName.replace(/telegram-bot-/, '').replace(/-/g, '_')}_vol`.substring(0, 30);
    console.log(`[BOT-MANAGER] Creating/checking volume: ${volumeName}`);
    
    const volumeConfig = {
      name: volumeName,
      size_gb: 1,
      region: 'iad'
    };
    
    const volumeResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/volumes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(volumeConfig)
    });
    
    let volume;
    if (!volumeResponse.ok) {
      const errorText = await volumeResponse.text();
      if (errorText.includes('already exists')) {
        console.log(`[BOT-MANAGER] Volume already exists, reusing it`);
        // Get existing volume
        const listResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/volumes`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const volumes = await listResponse.json();
        volume = volumes.find((v: any) => v.name === volumeName);
      } else {
        throw new Error(`Failed to create volume: ${errorText}`);
      }
    } else {
      volume = await volumeResponse.json();
    }
    
    console.log(`[BOT-MANAGER] Using volume: ${volume.id}`);
    
    // Encode files for safe embedding in script
    const encoder = new TextEncoder();
    const mainPyBase64 = btoa(String.fromCharCode(...encoder.encode(files['main.py'] || '')));
    const envBase64 = btoa(String.fromCharCode(...encoder.encode(files['.env'] || '')));
    const requirementsBase64 = btoa(String.fromCharCode(...encoder.encode(files['requirements.txt'] || '')));
    
    // Single machine script that handles both file setup and bot execution
    const singleMachineScript = `#!/bin/bash
set -e
echo "=== Single Machine: File Setup + Bot Execution ==="

# Create bot directory in volume
mkdir -p /data/bot
cd /data/bot

# File setup: Only create files if they don't exist (first run)
if [ ! -f "main.py" ] || [ ! -f ".env" ] || [ ! -f "requirements.txt" ]; then
    echo "=== First run: Creating bot files in persistent volume ==="
    
    python3 -c "
import base64

# Create main.py
with open('main.py', 'w', encoding='utf-8') as f:
    f.write(base64.b64decode('${mainPyBase64}').decode('utf-8'))
print('✅ main.py created and stored in volume')

# Create .env
with open('.env', 'w', encoding='utf-8') as f:
    f.write(base64.b64decode('${envBase64}').decode('utf-8'))
print('✅ .env created and stored in volume')

# Create requirements.txt
with open('requirements.txt', 'w', encoding='utf-8') as f:
    f.write(base64.b64decode('${requirementsBase64}').decode('utf-8'))
print('✅ requirements.txt created and stored in volume')
"
    echo "📁 Files created in persistent volume /data/bot/"
else
    echo "=== Reusing existing files from persistent volume ==="
    echo "📁 Files found in volume: $(ls -1 | wc -l)"
fi

echo "=== Volume contents ==="
ls -la /data/bot/

echo "=== Installing Dependencies ==="
pip install --no-cache-dir python-telegram-bot python-dotenv requests aiohttp

if [ -s requirements.txt ]; then
    pip install --no-cache-dir -r requirements.txt
fi

echo "=== Validating Bot Code ==="
python -m py_compile main.py || {
    echo "SYNTAX_ERROR: Bot code has syntax errors"
    exit 1
}

echo "=== Starting Bot from Persistent Volume ==="
echo "🤖 Running bot from /data/bot/ (files persist across deployments)"
python main.py || {
    echo "RUNTIME_ERROR: Bot failed to start"
    exit 1
}`;

    // Create single machine with volume mounted
    const machineConfig = {
      config: {
        image: 'python:3.11-slim',
        init: {
          cmd: ['/bin/bash', '-c', singleMachineScript]
        },
        env: {
          PYTHONUNBUFFERED: '1',
          BOT_TOKEN: extractTokenFromEnv(files['.env']) || ''
        },
        mounts: [
          {
            volume: volume.id,
            path: '/data'
          }
        ],
        guest: {
          cpu_kind: 'shared',
          cpus: 1,
          memory_mb: 512
        },
        restart: {
          policy: 'no'
        },
        auto_destroy: false
      },
      region: 'iad'
    };

    const machineResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}/machines`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(machineConfig)
    });

    if (!machineResponse.ok) {
      const errorText = await machineResponse.text();
      throw new Error(`Failed to create machine: ${errorText}`);
    }

    const machine = await machineResponse.json();
    console.log(`[BOT-MANAGER] ✅ Single machine created: ${machine.id}`);
    console.log(`[BOT-MANAGER] 📁 Files will be stored in persistent volume: ${volume.id}`);
    console.log(`[BOT-MANAGER] 🔄 Files will persist across deployments and restarts`);

    return {
      id: machine.id,
      appName,
      volumeId: volume.id,
      status: 'deployed',
      machine: machine
    };
    
  } catch (error) {
    console.error(`[BOT-MANAGER] Single-machine deployment failed:`, error);
    throw error;
  }
}

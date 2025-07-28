// Simplified single-machine volume deployment approach
async function deployBotToFlyWithVolume(appName: string, files: Record<string, string>, token: string): Promise<any> {
  console.log(`[BOT-MANAGER] Starting SIMPLIFIED single-machine volume deployment for ${appName}`);
  
  try {
    // Only cleanup machines, keep volumes for persistence
    console.log(`[BOT-MANAGER] Cleaning up existing machines only...`);
    await cleanupExistingMachines(appName, token);
    
    // Wait for app to be fully available before creating volume
    console.log(`[BOT-MANAGER] Waiting for app ${appName} to be ready...`);
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
    
    // Verify app exists before creating volume
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`[BOT-MANAGER] Verifying app availability (attempt ${attempt}/3)`);
      
      const appCheckResponse = await fetch(`${FLYIO_API_BASE}/apps/${appName}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (appCheckResponse.ok) {
        console.log(`[BOT-MANAGER] App ${appName} confirmed available`);
        break;
      } else if (attempt === 3) {
        throw new Error(`App ${appName} not available after 3 attempts`);
      } else {
        console.log(`[BOT-MANAGER] App not ready yet, waiting 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
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
    
    // Enhanced script with comprehensive volume verification and error handling
    const singleMachineScript = `#!/bin/bash
set -e
echo "=== ENHANCED Single Machine: Volume Verification + File Setup + Bot Execution ==="

# STEP 1: Volume Mount Verification
echo "🔍 STEP 1: Volume Mount Verification"
echo "Current directory: $(pwd)"

# Wait for volume to be mounted (retry logic)
for attempt in {1..5}; do
    echo "Attempt $attempt/5: Checking /data mount..."
    if mountpoint -q /data 2>/dev/null; then
        echo "✅ /data is properly mounted as a volume"
        break
    elif [ -d /data ]; then
        echo "⚠️  /data exists but not mounted as volume (attempt $attempt)"
        if [ $attempt -eq 5 ]; then
            echo "❌ Volume mount failed after 5 attempts"
            echo "Mount info:"
            mount | grep /data || echo "No /data mount found"
            df -h
            exit 1
        fi
        sleep 2
    else
        echo "❌ /data directory does not exist"
        mkdir -p /data
        sleep 2
    fi
done

# Verify volume is writable
if [ ! -w /data ]; then
    echo "❌ Volume /data is not writable"
    ls -ld /data
    exit 1
fi

echo "✅ Volume mount verification passed"
df -h | grep /data

# STEP 2: Create bot directory with verification
echo "🔍 STEP 2: Bot Directory Setup"
mkdir -p /data/bot
cd /data/bot

if [ "$(pwd)" != "/data/bot" ]; then
    echo "❌ Failed to change to /data/bot directory"
    exit 1
fi

echo "✅ Bot directory ready: $(pwd)"
echo "Directory permissions: $(ls -ld /data/bot)"

# STEP 3: File setup with verification
echo "🔍 STEP 3: File Creation and Verification"

# Check if this is first run or if files need updating
NEEDS_FILE_SETUP=false
if [ ! -f "main.py" ] || [ ! -f ".env" ] || [ ! -f "requirements.txt" ]; then
    NEEDS_FILE_SETUP=true
    echo "📝 First run or missing files: Creating bot files in persistent volume"
else
    echo "📁 Files exist: Checking if update needed..."
    # For now, always recreate files to ensure latest version
    NEEDS_FILE_SETUP=true
    echo "🔄 Updating files with latest version"
fi

if [ "$NEEDS_FILE_SETUP" = true ]; then
    echo "🔍 File data validation:"
    echo "main.py base64 length: ${mainPyBase64:0:50}... (${#mainPyBase64} chars)"
    echo ".env base64 length: ${envBase64:0:30}... (${#envBase64} chars)" 
    echo "requirements.txt base64 length: ${requirementsBase64:0:30}... (${#requirementsBase64} chars)"
    
    # Validate base64 data before proceeding
    if [ ${#mainPyBase64} -lt 10 ] || [ ${#envBase64} -lt 10 ]; then
        echo "❌ Invalid file data detected (too short)"
        exit 1
    fi
    
    # Enhanced Python file creation with comprehensive error handling
    python3 -c "
import base64
import os
import sys

print(f'🔍 Python environment check:')
print(f'  Working directory: {os.getcwd()}')
print(f'  /data/bot exists: {os.path.exists(\"/data/bot\")}')
print(f'  /data/bot writable: {os.access(\"/data/bot\", os.W_OK)}')
print(f'  Python version: {sys.version}')

files_created = 0
total_bytes = 0

# Create main.py with enhanced error handling
try:
    decoded_main = base64.b64decode('${mainPyBase64}').decode('utf-8')
    if len(decoded_main) < 50:
        raise ValueError(f'main.py content too short: {len(decoded_main)} chars')
    
    with open('main.py', 'w', encoding='utf-8') as f:
        f.write(decoded_main)
        f.flush()
        os.fsync(f.fileno())
    
    size = os.path.getsize('main.py')
    total_bytes += size
    files_created += 1
    print(f'✅ main.py created successfully ({size} bytes)')
    
    # Verify file content
    with open('main.py', 'r') as f:
        first_line = f.readline().strip()
        print(f'   First line: {first_line[:60]}...')
        
except Exception as e:
    print(f'❌ CRITICAL: Failed to create main.py: {e}')
    sys.exit(1)

# Create .env with validation
try:
    decoded_env = base64.b64decode('${envBase64}').decode('utf-8')
    if 'BOT_TOKEN' not in decoded_env:
        raise ValueError('.env missing BOT_TOKEN')
    
    with open('.env', 'w', encoding='utf-8') as f:
        f.write(decoded_env)
        f.flush()
        os.fsync(f.fileno())
    
    size = os.path.getsize('.env')
    total_bytes += size
    files_created += 1
    print(f'✅ .env created successfully ({size} bytes)')
    print(f'   Contains BOT_TOKEN: {\"BOT_TOKEN\" in decoded_env}')
    
except Exception as e:
    print(f'❌ CRITICAL: Failed to create .env: {e}')
    sys.exit(1)

# Create requirements.txt
try:
    decoded_req = base64.b64decode('${requirementsBase64}').decode('utf-8')
    
    with open('requirements.txt', 'w', encoding='utf-8') as f:
        f.write(decoded_req)
        f.flush()
        os.fsync(f.fileno())
    
    size = os.path.getsize('requirements.txt')
    total_bytes += size
    files_created += 1
    print(f'✅ requirements.txt created successfully ({size} bytes)')
    
except Exception as e:
    print(f'❌ WARNING: Failed to create requirements.txt: {e}')
    # This is not critical, we can continue

# Final comprehensive verification
print(f'\\n🔍 VERIFICATION REPORT:')
print(f'  Files created: {files_created}/3')
print(f'  Total size: {total_bytes} bytes')

all_files_ok = True
for file in ['main.py', '.env', 'requirements.txt']:
    if os.path.exists(file):
        size = os.path.getsize(file)
        readable = os.access(file, os.R_OK)
        print(f'  ✅ {file}: {size} bytes, readable: {readable}')
        if not readable or size == 0:
            all_files_ok = False
    else:
        print(f'  ❌ {file}: NOT FOUND')
        if file in ['main.py', '.env']:  # Critical files
            all_files_ok = False

if not all_files_ok:
    print('❌ CRITICAL: File verification failed')
    sys.exit(1)
else:
    print('✅ All files verified successfully')
"
    echo "✅ Files created successfully in persistent volume /data/bot/"
fi

# STEP 4: Post-creation verification and volume status
echo "🔍 STEP 4: Post-Creation Verification"
echo "=== Volume Status ==="
df -h /data
echo "Total files in /data/bot: $(ls -1 /data/bot | wc -l)"
echo "Volume contents:"
ls -la /data/bot/

echo "=== File Integrity Check ==="
for file in main.py .env requirements.txt; do
    if [ -f "/data/bot/$file" ]; then
        size=$(wc -c < "/data/bot/$file")
        echo "✅ $file: $size bytes"
        if [ "$file" = "main.py" ] && [ $size -lt 100 ]; then
            echo "❌ WARNING: main.py seems too small ($size bytes)"
        fi
    else
        echo "❌ MISSING: $file"
        if [ "$file" = "main.py" ] || [ "$file" = ".env" ]; then
            echo "❌ CRITICAL FILE MISSING: $file"
            exit 1
        fi
    fi
done

echo "=== File Content Validation ==="
echo "main.py first 3 lines:"
head -n 3 /data/bot/main.py 2>/dev/null || echo "❌ Cannot read main.py"

echo ".env validation:"
if grep -q "BOT_TOKEN" /data/bot/.env 2>/dev/null; then
    echo "✅ .env contains BOT_TOKEN"
else
    echo "❌ .env missing BOT_TOKEN"
    exit 1
fi

# STEP 5: Dependency Installation with error handling
echo "🔍 STEP 5: Installing Dependencies"
echo "=== Core Dependencies ==="
pip install --no-cache-dir python-telegram-bot python-dotenv requests aiohttp || {
    echo "❌ Failed to install core dependencies"
    exit 1
}

if [ -s requirements.txt ]; then
    echo "=== Custom Dependencies ==="
    pip install --no-cache-dir -r requirements.txt || {
        echo "⚠️  Some custom dependencies failed to install, continuing..."
    }
else
    echo "ℹ️  No additional requirements.txt found"
fi

# STEP 6: Code Validation
echo "🔍 STEP 6: Code Validation"
python -m py_compile main.py || {
    echo "❌ SYNTAX_ERROR: Bot code has syntax errors"
    python -c "
import ast
try:
    with open('main.py', 'r') as f:
        ast.parse(f.read())
    print('Code parsed successfully by AST')
except SyntaxError as e:
    print(f'Syntax error at line {e.lineno}: {e.msg}')
except Exception as e:
    print(f'Parse error: {e}')
"
    exit 1
}

echo "✅ Code validation passed"

# STEP 7: Final Status and Bot Launch
echo "🔍 STEP 7: Final Status Check"
echo "=== Pre-launch Summary ==="
echo "📁 Working directory: $(pwd)"
echo "📊 Disk usage: $(df -h /data | tail -1)"
echo "🐍 Python version: $(python --version)"
echo "📦 Installed packages: $(pip list | wc -l) packages"

echo "=== Starting Bot from Persistent Volume ==="
echo "🤖 Bot launching from /data/bot/ (files persist across deployments)"
echo "🔄 Bot will restart automatically on crashes"

# Set up error handling for bot execution
python main.py || {
    echo "❌ RUNTIME_ERROR: Bot failed to start"
    echo "Last 20 lines of any error output:"
    tail -20 /var/log/bot_error.log 2>/dev/null || echo "No error log available"
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

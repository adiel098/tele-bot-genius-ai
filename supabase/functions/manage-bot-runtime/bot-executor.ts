
// Store active bot processes
const activeBots = new Map<string, { process: Deno.Process; controller: AbortController }>();

export async function startTelegramBot(botId: string, token: string, code: string): Promise<{ success: boolean; logs: string[]; error?: string; errorType?: string }> {
  const logs: string[] = [];
  
  try {
    logs.push(`[${new Date().toISOString()}] ========== STARTING PYTHON BOT ${botId} ==========`);
    logs.push(`[${new Date().toISOString()}] Bot ID: ${botId}`);
    logs.push(`[${new Date().toISOString()}] Token length: ${token ? token.length : 'undefined'} characters`);
    logs.push(`[${new Date().toISOString()}] Code provided: ${code ? 'YES' : 'NO'}`);
    logs.push(`[${new Date().toISOString()}] Code length: ${code ? code.length : 0} characters`);
    
    // Always stop existing bot first to prevent conflicts
    if (activeBots.has(botId)) {
      logs.push(`[${new Date().toISOString()}] EXISTING BOT DETECTED - stopping process for ${botId}`);
      const stopResult = stopTelegramBot(botId);
      logs.push(...stopResult.logs);
      // Wait for the previous instance to fully stop
      await new Promise(resolve => setTimeout(resolve, 3000));
      logs.push(`[${new Date().toISOString()}] Waited 3 seconds for previous instance to stop`);
    }

    logs.push(`[${new Date().toISOString()}] ========== TOKEN VALIDATION ==========`);
    
    // Validate token format
    if (!token) {
      logs.push(`[${new Date().toISOString()}] ERROR: No token provided`);
      return { 
        success: false, 
        logs, 
        error: "No bot token provided. Please check your token from @BotFather.",
        errorType: "invalid_token"
      };
    }
    
    logs.push(`[${new Date().toISOString()}] Token format check: ${token.substring(0, 10)}...`);
    if (!token.match(/^\d+:[A-Za-z0-9_-]+$/)) {
      logs.push(`[${new Date().toISOString()}] ERROR: Invalid token format - does not match expected pattern`);
      return { 
        success: false, 
        logs, 
        error: "Invalid bot token format. Please check your token from @BotFather.",
        errorType: "invalid_token"
      };
    }
    logs.push(`[${new Date().toISOString()}] ✓ Token format is valid`);

    logs.push(`[${new Date().toISOString()}] ========== PYTHON CODE ANALYSIS ==========`);
    logs.push(`[${new Date().toISOString()}] Code preview (first 500 chars):`);
    logs.push(`[${new Date().toISOString()}] ${code.substring(0, 500)}${code.length > 500 ? '...' : ''}`);
    
    if (!code || code.trim().length === 0) {
      logs.push(`[${new Date().toISOString()}] ERROR: No generated code provided`);
      return { 
        success: false, 
        logs, 
        error: "No generated code provided. Please regenerate your bot code.",
        errorType: "no_code"
      };
    }
    
    // Check if this is JavaScript code (which won't work in Python)
    const isJavaScriptCode = code.includes('grammy') || 
                            code.includes('import { Bot }') || 
                            code.includes('new Bot(') ||
                            code.includes('bot.start()') ||
                            code.includes('const ') ||
                            code.includes('=> {');
    
    if (isJavaScriptCode) {
      logs.push(`[${new Date().toISOString()}] ========== JAVASCRIPT CODE DETECTED ==========`);
      logs.push(`[${new Date().toISOString()}] ERROR: Generated code appears to be JavaScript, but we need Python`);
      logs.push(`[${new Date().toISOString()}] JavaScript indicators found:`);
      if (code.includes('grammy')) logs.push(`[${new Date().toISOString()}] - Grammy library reference`);
      if (code.includes('import { Bot }')) logs.push(`[${new Date().toISOString()}] - JavaScript Bot import`);
      if (code.includes('const ')) logs.push(`[${new Date().toISOString()}] - JavaScript const declarations`);
      if (code.includes('=> {')) logs.push(`[${new Date().toISOString()}] - JavaScript arrow functions`);
      
      return { 
        success: false, 
        logs, 
        error: "Generated code is JavaScript but we need Python. Please regenerate the bot with Python code for python-telegram-bot library.",
        errorType: "wrong_language"
      };
    }
    
    logs.push(`[${new Date().toISOString()}] ✓ Code appears to be Python`);
    
    // Check for required Python imports
    if (!code.includes('from telegram') && !code.includes('import telegram')) {
      logs.push(`[${new Date().toISOString()}] WARNING: Code might be missing python-telegram-bot imports`);
    }

    logs.push(`[${new Date().toISOString()}] ========== CREATING PYTHON RUNTIME ==========`);
    
    // Create temporary directory for this bot
    const tempDir = `/tmp/bot_${botId}`;
    
    try {
      // Create bot directory
      await Deno.mkdir(tempDir, { recursive: true });
      logs.push(`[${new Date().toISOString()}] ✓ Created temporary directory: ${tempDir}`);
      
      // Write the Python code to main.py
      const mainPyPath = `${tempDir}/main.py`;
      await Deno.writeTextFile(mainPyPath, code);
      logs.push(`[${new Date().toISOString()}] ✓ Written main.py file`);
      
      // Create requirements.txt if not present in code
      if (!code.includes('requirements.txt')) {
        const requirementsContent = `python-telegram-bot>=20.0
requests>=2.28.0
httpx>=0.24.0`;
        await Deno.writeTextFile(`${tempDir}/requirements.txt`, requirementsContent);
        logs.push(`[${new Date().toISOString()}] ✓ Created requirements.txt`);
      }
      
      // Set environment variable for bot token
      const env = { 
        BOT_TOKEN: token,
        PYTHONPATH: tempDir,
        PYTHONUNBUFFERED: "1"
      };
      
      logs.push(`[${new Date().toISOString()}] ========== INSTALLING DEPENDENCIES ==========`);
      
      // Install dependencies
      const pipProcess = new Deno.Command("pip", {
        args: ["install", "-r", `${tempDir}/requirements.txt`],
        stdout: "piped",
        stderr: "piped",
        env
      });
      
      const pipResult = await pipProcess.output();
      const pipStdout = new TextDecoder().decode(pipResult.stdout);
      const pipStderr = new TextDecoder().decode(pipResult.stderr);
      
      if (pipResult.code !== 0) {
        logs.push(`[${new Date().toISOString()}] ERROR: Failed to install dependencies`);
        logs.push(`[${new Date().toISOString()}] pip stdout: ${pipStdout}`);
        logs.push(`[${new Date().toISOString()}] pip stderr: ${pipStderr}`);
        return { 
          success: false, 
          logs, 
          error: `Failed to install Python dependencies: ${pipStderr}`,
          errorType: "dependency_install_failed"
        };
      }
      
      logs.push(`[${new Date().toISOString()}] ✓ Dependencies installed successfully`);
      
      logs.push(`[${new Date().toISOString()}] ========== STARTING PYTHON BOT PROCESS ==========`);
      
      // Start the Python bot process
      const controller = new AbortController();
      
      const pythonProcess = new Deno.Command("python", {
        args: [mainPyPath],
        stdout: "piped",
        stderr: "piped",
        env,
        signal: controller.signal
      });
      
      const process = pythonProcess.spawn();
      
      // Store the process
      activeBots.set(botId, { process, controller });
      
      logs.push(`[${new Date().toISOString()}] ✓ Python process started`);
      logs.push(`[${new Date().toISOString()}] ✓ Bot is running with python-telegram-bot library`);
      
      // Monitor the process for a few seconds to check if it starts successfully
      let processExited = false;
      const processPromise = process.status.then(status => {
        processExited = true;
        return status;
      });
      
      // Wait up to 10 seconds for the bot to start
      const timeout = new Promise(resolve => setTimeout(resolve, 10000));
      const result = await Promise.race([processPromise, timeout]);
      
      if (processExited) {
        // Process exited, read output
        const stdout = await process.output();
        const stderr = new TextDecoder().decode(stdout.stderr);
        const stdoutText = new TextDecoder().decode(stdout.stdout);
        
        logs.push(`[${new Date().toISOString()}] ERROR: Python process exited unexpectedly`);
        logs.push(`[${new Date().toISOString()}] Exit code: ${(result as any)?.code || 'unknown'}`);
        logs.push(`[${new Date().toISOString()}] Stdout: ${stdoutText}`);
        logs.push(`[${new Date().toISOString()}] Stderr: ${stderr}`);
        
        // Clean up
        activeBots.delete(botId);
        await Deno.remove(tempDir, { recursive: true }).catch(() => {});
        
        return { 
          success: false, 
          logs, 
          error: `Python bot process failed: ${stderr || stdoutText || 'Unknown error'}`,
          errorType: "process_failed"
        };
      }
      
      logs.push(`[${new Date().toISOString()}] ✓ Bot process running successfully for 10+ seconds`);
      logs.push(`[${new Date().toISOString()}] ✓ Bot is ready to receive messages`);
      logs.push(`[${new Date().toISOString()}] ========== PYTHON BOT STARTUP COMPLETE ==========`);
      
      return { success: true, logs };
      
    } catch (processError) {
      logs.push(`[${new Date().toISOString()}] ========== PYTHON PROCESS ERROR ==========`);
      logs.push(`[${new Date().toISOString()}] ERROR: Failed to start Python process`);
      logs.push(`[${new Date().toISOString()}] Error message: ${processError.message}`);
      logs.push(`[${new Date().toISOString()}] Error stack: ${processError.stack || 'No stack trace'}`);
      
      // Clean up
      activeBots.delete(botId);
      await Deno.remove(tempDir, { recursive: true }).catch(() => {});
      
      return { 
        success: false, 
        logs, 
        error: `Failed to start Python bot: ${processError.message}`,
        errorType: "process_start_failed"
      };
    }
    
  } catch (error) {
    logs.push(`[${new Date().toISOString()}] ========== CRITICAL ERROR ==========`);
    logs.push(`[${new Date().toISOString()}] CRITICAL ERROR: ${error.message}`);
    logs.push(`[${new Date().toISOString()}] Error name: ${error.name || 'Unknown'}`);
    logs.push(`[${new Date().toISOString()}] Error stack: ${error.stack || 'No stack trace'}`);
    activeBots.delete(botId);
    return { 
      success: false, 
      logs, 
      error: `Critical error: ${error.message}`,
      errorType: "critical_error"
    };
  }
}

export function stopTelegramBot(botId: string): { success: boolean; logs: string[] } {
  const logs: string[] = [];
  
  try {
    logs.push(`[${new Date().toISOString()}] ========== STOPPING PYTHON BOT ${botId} ==========`);
    
    const botInstance = activeBots.get(botId);
    
    if (!botInstance) {
      logs.push(`[${new Date().toISOString()}] No active Python process found for ${botId} - already stopped`);
      logs.push(`[${new Date().toISOString()}] Current active bots: ${Array.from(activeBots.keys()).join(', ') || 'None'}`);
      return { success: true, logs };
    }
    
    logs.push(`[${new Date().toISOString()}] Found active Python process, proceeding with termination...`);
    
    // Terminate the Python process
    try {
      if (botInstance.controller) {
        logs.push(`[${new Date().toISOString()}] Aborting process controller...`);
        botInstance.controller.abort();
        logs.push(`[${new Date().toISOString()}] ✓ Process controller aborted`);
      }
    } catch (abortError) {
      logs.push(`[${new Date().toISOString()}] Warning during process abort: ${abortError.message}`);
    }
    
    // Force kill the process if still running
    try {
      if (botInstance.process) {
        logs.push(`[${new Date().toISOString()}] Killing Python process...`);
        botInstance.process.kill();
        logs.push(`[${new Date().toISOString()}] ✓ Python process killed`);
      }
    } catch (killError) {
      logs.push(`[${new Date().toISOString()}] Warning during process kill: ${killError.message}`);
    }
    
    // Always remove from active bots
    activeBots.delete(botId);
    
    // Clean up temporary directory
    const tempDir = `/tmp/bot_${botId}`;
    Deno.remove(tempDir, { recursive: true }).catch(error => {
      logs.push(`[${new Date().toISOString()}] Warning: Failed to clean up temp directory: ${error.message}`);
    });
    
    logs.push(`[${new Date().toISOString()}] ✓ Python bot ${botId} completely stopped and cleaned up`);
    logs.push(`[${new Date().toISOString()}] Remaining active bots: ${Array.from(activeBots.keys()).join(', ') || 'None'}`);
    logs.push(`[${new Date().toISOString()}] ========== PYTHON BOT STOP COMPLETE ==========`);
    
    return { success: true, logs };
    
  } catch (error) {
    logs.push(`[${new Date().toISOString()}] ERROR stopping Python bot: ${error.message}`);
    logs.push(`[${new Date().toISOString()}] Error stack: ${error.stack || 'No stack trace'}`);
    // Still remove from active bots even if there was an error
    activeBots.delete(botId);
    logs.push(`[${new Date().toISOString()}] Bot forcefully removed from active bots map`);
    return { success: false, logs };
  }
}

export function getBotLogs(botId: string): string[] {
  const timestamp = new Date().toISOString();
  const isActive = activeBots.has(botId);
  const activeCount = activeBots.size;
  const activeBotIds = Array.from(activeBots.keys());
  
  return [
    `[${timestamp}] ========== PYTHON BOT STATUS QUERY ==========`,
    `[${timestamp}] Bot ID: ${botId}`,
    `[${timestamp}] Status: ${isActive ? 'RUNNING with Python code' : 'STOPPED'}`,
    `[${timestamp}] Total active bots: ${activeCount}`,
    `[${timestamp}] Active bot IDs: ${activeBotIds.join(', ') || 'None'}`,
    `[${timestamp}] Runtime: Python with python-telegram-bot library`,
    `[${timestamp}] Process type: Native Python subprocess`,
    `[${timestamp}] ========== STATUS QUERY COMPLETE ==========`
  ];
}

export function listActiveBots(): string[] {
  return Array.from(activeBots.keys());
}

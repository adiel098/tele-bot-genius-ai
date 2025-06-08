
export function generatePythonBotScript(botId: string, containerId: string, token: string, actualBotCode: string): string {
  // ALWAYS use the actual user's code - no fallback templates
  if (!actualBotCode || actualBotCode.trim().length === 0) {
    throw new Error('No actual bot code provided - cannot create container without user code');
  }

  console.log(`[${new Date().toISOString()}] Using REAL user code: ${actualBotCode.length} characters`);
  
  // Prepare the user's actual code for container execution
  let preparedCode = actualBotCode;
  
  // Replace token placeholders with actual token
  preparedCode = preparedCode.replace(/\${token}/g, token);
  preparedCode = preparedCode.replace(/BOT_TOKEN\s*=\s*['"][^'"]*['"]/, `BOT_TOKEN = "${token}"`);
  preparedCode = preparedCode.replace(/os\.getenv\(['"]TELEGRAM_TOKEN['"][^)]*\)/, `"${token}"`);
  preparedCode = preparedCode.replace(/os\.getenv\(['"]BOT_TOKEN['"][^)]*\)/, `"${token}"`);
  preparedCode = preparedCode.replace(/token = os\.getenv\(['"]BOT_TOKEN['"][^)]*\)/, `token = "${token}"`);
  
  console.log(`[${new Date().toISOString()}] Token replacement completed in user's actual code`);
  
  // Add container metadata as comments at the top
  const containerInfo = `# Real Docker Container: ${containerId}
# Bot ID: ${botId}
# This is the user's actual Python code running in a real container
# Generated at: ${new Date().toISOString()}

`;
  
  return containerInfo + preparedCode;
}

export function generateDockerfile(token: string): string {
  return `# Real Docker container for user's Python bot
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install required Python packages
RUN pip install python-telegram-bot aiohttp requests

# Copy user's actual bot code
COPY main.py .

# Set environment variables
ENV TELEGRAM_TOKEN=${token}
ENV BOT_TOKEN=${token}
ENV PYTHONUNBUFFERED=1

# Expose webhook port
EXPOSE 8080

# Run the user's actual Python code
CMD ["python", "main.py"]`;
}

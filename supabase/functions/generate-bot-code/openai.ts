
import type { BotCodeResponse } from './types.ts';

const openAIApiKey = Deno.env.get('OPENAI_APIKEY');

export async function generateBotCode(prompt: string, botToken?: string): Promise<BotCodeResponse> {
  if (!openAIApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const systemPrompt = `You are an expert Python developer specialized in creating Telegram bots. 
    Generate complete, production-ready Python code for a Telegram bot based on the user's requirements.
    
    IMPORTANT REQUIREMENTS:
    1. Use python-telegram-bot library (version 20.x)
    2. Include proper error handling and logging
    3. Create modular, clean code structure
    4. Include a requirements.txt file
    5. Use environment variables for the bot token
    6. Include proper docstrings and comments
    7. Handle common Telegram bot scenarios (start, help, error handling)
    8. Make the bot robust and production-ready
    9. CRITICAL: Always create a .env file with the actual bot token provided by the user
    10. Include health check endpoint for containerized deployments
    11. Add proper logging for monitoring and debugging
    12. Implement graceful shutdown handling
    
    Return your response as a JSON object with this structure:
    {
      "files": {
        "main.py": "# Main bot code with health checks and proper error handling",
        "requirements.txt": "python-telegram-bot==20.7\\nrequests==2.31.0\\nflask==2.3.3",
        "config.py": "# Configuration file",
        "handlers.py": "# Message handlers",
        "health.py": "# Health check endpoints for container orchestration",
        ".env": "BOT_TOKEN=actual_bot_token_here",
        ".env.example": "BOT_TOKEN=your_bot_token_here"
      },
      "explanation": "Brief explanation of the bot structure and features"
    }
    
    CRITICAL: 
    - Return ONLY the JSON object, no markdown code blocks, no additional text.
    - Always include both .env (with the actual token) and .env.example (with placeholder) files
    - The .env file MUST contain the actual bot token provided by the user
    - Include health.py for container health checks and monitoring
    - Add proper logging configuration for production deployments`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${prompt}${botToken ? `\n\nIMPORTANT: Use this bot token in the .env file: ${botToken}` : ''}` }
      ],
      temperature: 0.7,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error:', response.status, errorText);
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const generatedContent = data.choices[0].message.content;

  console.log('Generated content received from OpenAI');

  // Clean the response - remove markdown code blocks if present
  let cleanedContent = generatedContent.trim();
  
  // Remove markdown code blocks
  if (cleanedContent.startsWith('```json')) {
    cleanedContent = cleanedContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleanedContent.startsWith('```')) {
    cleanedContent = cleanedContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  
  // Remove any leading/trailing whitespace
  cleanedContent = cleanedContent.trim();

  console.log('Cleaned content:', cleanedContent.substring(0, 200) + '...');

  // Parse the JSON response from GPT
  try {
    const result = JSON.parse(cleanedContent);
    
    // Ensure .env file contains the actual bot token if provided
    if (botToken && result.files) {
      result.files['.env'] = `BOT_TOKEN=${botToken}\nLOG_LEVEL=INFO`;
    }
    
    // Add health check if not present
    if (result.files && !result.files['health.py']) {
      result.files['health.py'] = generateHealthCheckFile();
    }
    
    return result;
  } catch (error) {
    console.error('Failed to parse GPT response as JSON:', error);
    console.log('Raw response:', generatedContent);
    console.log('Cleaned content:', cleanedContent);
    
    // Enhanced fallback: try to extract JSON from the response
    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        console.log('Attempting to parse extracted JSON...');
        const result = JSON.parse(jsonMatch[0]);
        
        // Ensure .env file contains the actual bot token if provided
        if (botToken && result.files) {
          result.files['.env'] = `BOT_TOKEN=${botToken}\nLOG_LEVEL=INFO`;
        }
        
        // Add health check if not present
        if (result.files && !result.files['health.py']) {
          result.files['health.py'] = generateHealthCheckFile();
        }
        
        return result;
      } catch (extractError) {
        console.error('Failed to parse extracted JSON:', extractError);
      }
    }
    
    // Final fallback: create a simple structure
    const fallbackResult = {
      files: {
        "main.py": `# Generated bot code\n# Original prompt: ${prompt}\n\n${cleanedContent}`,
        "requirements.txt": "python-telegram-bot==20.7\nrequests==2.31.0\nflask==2.3.3",
        "health.py": generateHealthCheckFile(),
        ".env.example": "BOT_TOKEN=your_bot_token_here\nLOG_LEVEL=INFO"
      },
      explanation: "Generated bot code (fallback due to parsing error)"
    };
    
    // Add actual .env file with token if provided
    if (botToken) {
      fallbackResult.files['.env'] = `BOT_TOKEN=${botToken}\nLOG_LEVEL=INFO`;
    }
    
    return fallbackResult;
  }
}

function generateHealthCheckFile(): string {
  return `
import os
import time
import logging
from flask import Flask, jsonify
from threading import Thread

app = Flask(__name__)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.route('/health')
def health_check():
    """Health check endpoint for container orchestration"""
    return jsonify({
        'status': 'healthy',
        'timestamp': int(time.time()),
        'bot_token_configured': bool(os.getenv('BOT_TOKEN'))
    }), 200

@app.route('/ready')
def readiness_check():
    """Readiness check endpoint"""
    bot_token = os.getenv('BOT_TOKEN')
    if bot_token:
        return jsonify({
            'status': 'ready',
            'timestamp': int(time.time())
        }), 200
    else:
        return jsonify({
            'status': 'not ready',
            'error': 'BOT_TOKEN not configured',
            'timestamp': int(time.time())
        }), 503

def run_health_server():
    """Run health check server in background thread"""
    try:
        app.run(host='0.0.0.0', port=8080, debug=False)
    except Exception as e:
        logger.error(f"Health server failed: {e}")

def start_health_server():
    """Start health check server in background thread"""
    health_thread = Thread(target=run_health_server, daemon=True)
    health_thread.start()
    logger.info("Health check server started on port 8080")

if __name__ == '__main__':
    start_health_server()
`;
}

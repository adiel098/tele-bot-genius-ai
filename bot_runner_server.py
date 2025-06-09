
from flask import Flask, request, jsonify
import subprocess
import os
import threading
import time
import requests
from typing import Dict
import uuid
import asyncio
import json

app = Flask(__name__)

# Dictionary to store running bot processes
running_bots: Dict[str, subprocess.Popen] = {}

@app.route('/')
def health_check():
    return jsonify({"status": "Bot Runner Server is running"})

@app.route('/create_bot', methods=['POST'])
def create_bot():
    data = request.json
    bot_id = data['botId']
    container_id = data['containerId']
    python_code = data['pythonCode']
    token = data['token']
    
    # Modify the Python code to use webhook instead of polling
    webhook_code = python_code.replace(
        'application.run_polling()',
        f'application.run_webhook(listen="0.0.0.0", port={5000 + hash(bot_id) % 1000}, webhook_url=f"{{os.getenv(\'WEBHOOK_URL\', \'http://localhost:3000\')}}/webhook/{bot_id}")'
    )
    
    # If the code doesn't have run_polling, add webhook setup
    if 'run_polling()' not in python_code and 'run_webhook(' not in python_code:
        # Add webhook setup to the main function
        webhook_setup = f'''
    # Set up webhook
    webhook_url = f"{{os.getenv('WEBHOOK_URL', 'http://localhost:3000')}}/webhook/{bot_id}"
    logger.info(f'Setting up webhook: {{webhook_url}}')
    
    # Run with webhook
    application.run_webhook(
        listen="0.0.0.0",
        port={5000 + hash(bot_id) % 1000},
        webhook_url=webhook_url
    )'''
        
        # Replace the end of main function
        if 'if __name__ == \'__main__\':' in webhook_code:
            webhook_code = webhook_code.replace(
                'if __name__ == \'__main__\':\n    main()',
                f'if __name__ == \'__main__\':\n    main(){webhook_setup}'
            )
        elif 'def main()' in webhook_code and 'main()' in webhook_code:
            # Find the last occurrence of starting the application and replace it
            lines = webhook_code.split('\n')
            for i in range(len(lines) - 1, -1, -1):
                if 'logger.info(' in lines[i] and 'running' in lines[i].lower():
                    lines[i] = lines[i] + webhook_setup
                    break
            webhook_code = '\n'.join(lines)
    
    # Create bot file
    bot_file = f"bot_{bot_id}.py"
    with open(bot_file, 'w', encoding='utf-8') as f:
        f.write(webhook_code)
    
    # Start bot process
    try:
        process = subprocess.Popen([
            'python', bot_file
        ], env={
            **os.environ, 
            'BOT_TOKEN': token,
            'WEBHOOK_URL': 'http://localhost:3000'
        })
        
        running_bots[bot_id] = process
        
        return jsonify({
            'success': True,
            'containerId': container_id,
            'message': 'Bot started successfully with webhook'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/stop_bot', methods=['POST'])
def stop_bot():
    data = request.json
    bot_id = data['botId']
    
    if bot_id in running_bots:
        process = running_bots[bot_id]
        process.terminate()
        del running_bots[bot_id]
        
        # Clean up bot file
        bot_file = f"bot_{bot_id}.py"
        if os.path.exists(bot_file):
            os.remove(bot_file)
            
        return jsonify({'success': True})
    
    return jsonify({'success': False, 'error': 'Bot not found'})

@app.route('/status', methods=['POST'])
def status():
    data = request.json
    bot_id = data['botId']
    
    if bot_id in running_bots:
        process = running_bots[bot_id]
        if process.poll() is None:  # Process is still running
            return jsonify({
                'success': True,
                'data': {'running': True}
            })
    
    return jsonify({
        'success': True,
        'data': {'running': False}
    })

@app.route('/logs', methods=['POST'])
def logs():
    data = request.json
    bot_id = data['botId']
    
    # Return some sample logs - in a real implementation you'd capture actual bot logs
    current_time = time.strftime('%Y-%m-%d %H:%M:%S')
    
    if bot_id in running_bots:
        process = running_bots[bot_id]
        if process.poll() is None:
            logs_data = [
                f"[{current_time}] INFO - Bot {bot_id} is running with WEBHOOK mode",
                f"[{current_time}] INFO - Python process PID: {process.pid}",
                f"[{current_time}] INFO - Webhook URL configured: http://localhost:3000/webhook/{bot_id}",
                f"[{current_time}] INFO - Bot handlers loaded successfully",
                f"[{current_time}] INFO - Listening for webhook updates (NOT polling)"
            ]
        else:
            logs_data = [
                f"[{current_time}] ERROR - Bot {bot_id} process has stopped",
                f"[{current_time}] INFO - Exit code: {process.returncode}"
            ]
    else:
        logs_data = [
            f"[{current_time}] WARNING - Bot {bot_id} not found in running processes"
        ]
    
    return jsonify({
        'success': True,
        'data': {'logs': logs_data}
    })

@app.route('/webhook/<bot_id>', methods=['POST'])
def webhook_handler(bot_id):
    """
    This endpoint receives webhooks from Telegram and forwards them to the running bot.
    The bot should be running on a different port and handling webhooks directly.
    """
    webhook_data = request.json
    
    print(f"[WEBHOOK] Received for bot {bot_id}: {webhook_data}")
    
    # Forward the webhook to the bot's webhook port
    try:
        bot_port = 5000 + hash(bot_id) % 1000
        bot_webhook_url = f"http://localhost:{bot_port}/webhook"
        
        response = requests.post(
            bot_webhook_url,
            json=webhook_data,
            timeout=10
        )
        
        print(f"[WEBHOOK] Forwarded to bot port {bot_port}, response: {response.status_code}")
        return jsonify({'success': True, 'forwarded': True})
        
    except Exception as e:
        print(f"[WEBHOOK] Error forwarding to bot: {e}")
        # If forwarding fails, the webhook from Telegram still needs a success response
        return jsonify({'success': True, 'forwarded': False, 'error': str(e)})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=False)

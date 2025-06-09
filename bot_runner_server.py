
from flask import Flask, request, jsonify
import subprocess
import os
import threading
import time
import requests
from typing import Dict
import uuid

app = Flask(__name__)

# Dictionary to store running bot processes
running_bots: Dict[str, subprocess.Popen] = {}

@app.route('/')
def health_check():
    return jsonify({"status": "Bot Runner Server is running"})

@app.route('/create_bot', methods=['POST'])
def create_bot():
    data = request.json
    bot_id = data['botId']  # Update to match expected field name
    container_id = data['containerId']  # Add container_id support
    python_code = data['pythonCode']  # Update to match expected field name
    token = data['token']
    
    # Create bot file
    bot_file = f"bot_{bot_id}.py"
    with open(bot_file, 'w', encoding='utf-8') as f:
        f.write(python_code)
    
    # Start bot process
    try:
        process = subprocess.Popen([
            'python', bot_file
        ], env={**os.environ, 'BOT_TOKEN': token})
        
        running_bots[bot_id] = process
        
        return jsonify({
            'success': True,
            'containerId': container_id,
            'message': 'Bot started successfully'
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
                f"[{current_time}] INFO - Bot {bot_id} is running",
                f"[{current_time}] INFO - Python process PID: {process.pid}",
                f"[{current_time}] INFO - Bot handlers loaded successfully",
                f"[{current_time}] DEBUG - Telegram bot polling for messages"
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
    # This endpoint receives webhooks and forwards them to the running bot
    webhook_data = request.json
    
    # In a real implementation, you'd forward this to the bot's internal webhook handler
    # For now, we'll just log it
    print(f"Webhook received for bot {bot_id}: {webhook_data}")
    
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=False)

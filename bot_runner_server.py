
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
bot_logs: Dict[str, list] = {}
bot_errors: Dict[str, str] = {}

@app.route('/')
def health_check():
    return jsonify({"status": "Bot Runner Server is running"})

def capture_bot_output(bot_id, process):
    """Capture bot output and errors in real-time"""
    if bot_id not in bot_logs:
        bot_logs[bot_id] = []
    
    # Read stdout and stderr
    try:
        while process.poll() is None:
            # Read stdout
            if process.stdout:
                line = process.stdout.readline()
                if line:
                    decoded_line = line.decode('utf-8').strip()
                    timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
                    log_entry = f"[{timestamp}] {decoded_line}"
                    bot_logs[bot_id].append(log_entry)
                    print(f"BOT {bot_id} STDOUT: {decoded_line}")
            
            # Read stderr
            if process.stderr:
                error_line = process.stderr.readline()
                if error_line:
                    decoded_error = error_line.decode('utf-8').strip()
                    timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
                    error_entry = f"[{timestamp}] ERROR: {decoded_error}"
                    bot_logs[bot_id].append(error_entry)
                    bot_errors[bot_id] = decoded_error
                    print(f"BOT {bot_id} ERROR: {decoded_error}")
            
            time.sleep(0.1)
    except Exception as e:
        print(f"Error capturing output for bot {bot_id}: {e}")

def fix_python_telegram_bot_imports(code):
    """Fix common python-telegram-bot import issues"""
    # Fix ParseMode import - it's now in telegram.constants
    if 'from telegram import Update, ParseMode' in code:
        code = code.replace(
            'from telegram import Update, ParseMode',
            'from telegram import Update\nfrom telegram.constants import ParseMode'
        )
    
    # Fix other common imports
    if 'ParseMode.MARKDOWN_V2' in code:
        # Make sure we have the right import
        if 'from telegram.constants import ParseMode' not in code:
            code = code.replace(
                'from telegram import Update',
                'from telegram import Update\nfrom telegram.constants import ParseMode'
            )
    
    return code

@app.route('/create_bot', methods=['POST'])
def create_bot():
    data = request.json
    bot_id = data['botId']
    container_id = data['containerId']
    python_code = data['pythonCode']
    token = data['token']
    
    # Fix common python-telegram-bot issues
    fixed_code = fix_python_telegram_bot_imports(python_code)
    
    # Modify the Python code to use webhook instead of polling
    webhook_code = fixed_code.replace(
        'application.run_polling()',
        f'application.run_webhook(listen="0.0.0.0", port={5000 + hash(bot_id) % 1000}, webhook_url=f"{{os.getenv(\'WEBHOOK_URL\', \'http://localhost:3000\')}}/webhook/{bot_id}")'
    )
    
    # If the code doesn't have run_polling, add webhook setup
    if 'run_polling()' not in fixed_code and 'run_webhook(' not in fixed_code:
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
    
    # Initialize logs for this bot
    bot_logs[bot_id] = []
    bot_errors[bot_id] = ""
    
    # Start bot process with output capture
    try:
        process = subprocess.Popen([
            'python', bot_file
        ], env={
            **os.environ, 
            'BOT_TOKEN': token,
            'WEBHOOK_URL': 'http://localhost:3000'
        }, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        running_bots[bot_id] = process
        
        # Start output capture in a separate thread
        threading.Thread(target=capture_bot_output, args=(bot_id, process), daemon=True).start()
        
        return jsonify({
            'success': True,
            'containerId': container_id,
            'message': 'Bot started successfully with webhook and error monitoring'
        })
    except Exception as e:
        error_msg = str(e)
        bot_errors[bot_id] = error_msg
        bot_logs[bot_id].append(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] STARTUP ERROR: {error_msg}")
        return jsonify({'success': False, 'error': error_msg})

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
        else:
            # Process has stopped, check if there are errors
            return jsonify({
                'success': True,
                'data': {'running': False, 'error': bot_errors.get(bot_id, '')}
            })
    
    return jsonify({
        'success': True,
        'data': {'running': False}
    })

@app.route('/logs', methods=['POST'])
def logs():
    data = request.json
    bot_id = data['botId']
    
    current_time = time.strftime('%Y-%m-%d %H:%M:%S')
    
    # Get actual logs for this bot
    bot_log_entries = bot_logs.get(bot_id, [])
    
    if bot_id in running_bots:
        process = running_bots[bot_id]
        if process.poll() is None:
            # Bot is running
            if not bot_log_entries:
                logs_data = [
                    f"[{current_time}] INFO - Bot {bot_id} is running with WEBHOOK mode",
                    f"[{current_time}] INFO - Python process PID: {process.pid}",
                    f"[{current_time}] INFO - Webhook URL configured: http://localhost:3000/webhook/{bot_id}",
                    f"[{current_time}] INFO - Monitoring for errors and output..."
                ]
            else:
                logs_data = bot_log_entries[-50:]  # Last 50 log entries
        else:
            # Bot has stopped
            logs_data = bot_log_entries[-50:] + [
                f"[{current_time}] ERROR - Bot {bot_id} process has stopped",
                f"[{current_time}] INFO - Exit code: {process.returncode}"
            ]
            
            # Add error information if available
            if bot_id in bot_errors and bot_errors[bot_id]:
                logs_data.append(f"[{current_time}] LAST ERROR: {bot_errors[bot_id]}")
    else:
        logs_data = [
            f"[{current_time}] WARNING - Bot {bot_id} not found in running processes"
        ]
        
        # Add any logged errors even if bot is not running
        if bot_id in bot_logs and bot_logs[bot_id]:
            logs_data.extend(bot_logs[bot_id][-20:])
    
    return jsonify({
        'success': True,
        'data': {'logs': logs_data}
    })

@app.route('/get_bot_errors', methods=['POST'])
def get_bot_errors():
    """New endpoint to get bot errors for AI fixing"""
    data = request.json
    bot_id = data['botId']
    
    error_info = {
        'hasErrors': False,
        'errorLogs': '',
        'fullLogs': [],
        'botCode': ''
    }
    
    # Check if bot has errors
    if bot_id in bot_errors and bot_errors[bot_id]:
        error_info['hasErrors'] = True
        error_info['errorLogs'] = bot_errors[bot_id]
    
    # Get full logs
    if bot_id in bot_logs:
        error_info['fullLogs'] = bot_logs[bot_id]
    
    # Get current bot code
    bot_file = f"bot_{bot_id}.py"
    if os.path.exists(bot_file):
        with open(bot_file, 'r', encoding='utf-8') as f:
            error_info['botCode'] = f.read()
    
    return jsonify({
        'success': True,
        'data': error_info
    })

@app.route('/update_bot_code', methods=['POST'])
def update_bot_code():
    """Update bot code and restart (for AI fixing)"""
    data = request.json
    bot_id = data['botId']
    new_code = data['newCode']
    token = data['token']
    
    try:
        # Stop current bot if running
        if bot_id in running_bots:
            process = running_bots[bot_id]
            process.terminate()
            del running_bots[bot_id]
        
        # Clear previous logs and errors
        bot_logs[bot_id] = []
        bot_errors[bot_id] = ""
        
        # Fix common issues in the new code
        fixed_code = fix_python_telegram_bot_imports(new_code)
        
        # Apply webhook modifications
        webhook_code = fixed_code.replace(
            'application.run_polling()',
            f'application.run_webhook(listen="0.0.0.0", port={5000 + hash(bot_id) % 1000}, webhook_url=f"{{os.getenv(\'WEBHOOK_URL\', \'http://localhost:3000\')}}/webhook/{bot_id}")'
        )
        
        # Write updated code
        bot_file = f"bot_{bot_id}.py"
        with open(bot_file, 'w', encoding='utf-8') as f:
            f.write(webhook_code)
        
        # Restart bot
        process = subprocess.Popen([
            'python', bot_file
        ], env={
            **os.environ, 
            'BOT_TOKEN': token,
            'WEBHOOK_URL': 'http://localhost:3000'
        }, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        running_bots[bot_id] = process
        
        # Start output capture
        threading.Thread(target=capture_bot_output, args=(bot_id, process), daemon=True).start()
        
        return jsonify({
            'success': True,
            'message': 'Bot code updated and restarted successfully'
        })
        
    except Exception as e:
        error_msg = str(e)
        bot_errors[bot_id] = error_msg
        return jsonify({'success': False, 'error': error_msg})

@app.route('/webhook/<bot_id>', methods=['POST'])
def webhook_handler(bot_id):
    """
    This endpoint receives webhooks from Telegram and forwards them to the running bot.
    """
    webhook_data = request.json
    
    print(f"[WEBHOOK] Received for bot {bot_id}: {webhook_data}")
    
    # Log webhook receipt
    if bot_id in bot_logs:
        timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
        bot_logs[bot_id].append(f"[{timestamp}] WEBHOOK: Received update from Telegram")
    
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
        # Log the error
        if bot_id in bot_logs:
            timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
            bot_logs[bot_id].append(f"[{timestamp}] WEBHOOK ERROR: {str(e)}")
        
        # If forwarding fails, the webhook from Telegram still needs a success response
        return jsonify({'success': True, 'forwarded': False, 'error': str(e)})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=False)

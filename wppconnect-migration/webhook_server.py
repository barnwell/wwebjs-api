#!/usr/bin/env python3
"""Standalone webhook server for testing WPPConnect webhooks."""

import json
from datetime import datetime
from flask import Flask, request, jsonify

app = Flask(__name__)

# Store received webhooks
webhooks_received = []


@app.route("/webhook", methods=["POST", "GET"])
def webhook():
    """Receive and log all webhook calls."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    print("\n" + "=" * 60)
    print(f"🔔 WEBHOOK RECEIVED at {timestamp}")
    print("=" * 60)
    
    # Log request details
    print(f"Method: {request.method}")
    print(f"Headers: {dict(request.headers)}")
    print(f"URL: {request.url}")
    print(f"Remote Address: {request.remote_addr}")
    
    # Get data
    if request.method == "POST":
        try:
            data = request.json
            print(f"\n📦 JSON Data:")
            print(json.dumps(data, indent=2))
            
            # Store webhook
            webhooks_received.append({
                "timestamp": timestamp,
                "data": data,
                "headers": dict(request.headers)
            })
            
            # Parse message if it's a message event
            event = data.get("event", "")
            if event in ["onmessage", "message.any"]:
                print(f"\n📨 Message Event Detected!")
                print(f"   Event: {event}")
                print(f"   From: {data.get('from', 'Unknown')}")
                print(f"   To: {data.get('to', 'Unknown')}")
                print(f"   Body: {data.get('body', data.get('content', 'No body'))}")
                print(f"   Type: {data.get('type', 'Unknown')}")
            
        except Exception as e:
            print(f"❌ Error parsing JSON: {e}")
            print(f"Raw data: {request.data}")
    else:
        print("GET request received (health check?)")
    
    print("=" * 60 + "\n")
    
    return jsonify({"status": "received", "timestamp": timestamp}), 200


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "ok",
        "webhooks_received": len(webhooks_received),
        "last_webhook": webhooks_received[-1]["timestamp"] if webhooks_received else None
    }), 200


@app.route("/webhooks", methods=["GET"])
def list_webhooks():
    """List all received webhooks."""
    return jsonify({
        "total": len(webhooks_received),
        "webhooks": webhooks_received
    }), 200


if __name__ == "__main__":
    print("=" * 60)
    print("🚀 WEBHOOK SERVER STARTING")
    print("=" * 60)
    print("\nEndpoints:")
    print("  POST/GET /webhook  - Receive webhooks")
    print("  GET /health        - Health check")
    print("  GET /webhooks      - List all received webhooks")
    print("\nServer will run on: http://0.0.0.0:5000")
    print("\nFor ngrok, run in another terminal:")
    print("  ngrok http 5000")
    print("\nPress Ctrl+C to stop")
    print("=" * 60 + "\n")
    
    app.run(host="0.0.0.0", port=5000, debug=True)

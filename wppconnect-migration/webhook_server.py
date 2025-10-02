#!/usr/bin/env python3
"""
Webhook server for receiving WhatsApp messages in real-time
This is an optional enhancement to the CLI chat app for better message receiving
"""

import json
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Callable, Optional
from urllib.parse import parse_qs, urlparse

from wppconnect_api import WPPConnectAPI


class WebhookHandler(BaseHTTPRequestHandler):
    """HTTP request handler for WhatsApp webhooks."""
    
    # Class variable to store the message callback
    message_callback: Optional[Callable] = None
    
    def do_POST(self):
        """Handle POST requests from WPPConnect webhooks."""
        try:
            # Get content length
            content_length = int(self.headers.get('Content-Length', 0))
            
            # Read the request body
            post_data = self.rfile.read(content_length)
            
            # Parse JSON data
            webhook_data = json.loads(post_data.decode('utf-8'))
            
            # Parse the message using WPPConnect's parser
            parsed_message = WPPConnectAPI.parse_inbound_message(webhook_data)
            
            if parsed_message and not parsed_message.get('fromMe', False):
                # Only process messages not from us
                if self.message_callback:
                    self.message_callback(parsed_message)
            
            # Send success response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
            
        except Exception as e:
            print(f"❌ Webhook error: {e}")
            self.send_response(500)
            self.end_headers()
    
    def do_GET(self):
        """Handle GET requests (health check)."""
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"status": "webhook_active"}).encode())
    
    def log_message(self, format, *args):
        """Override to suppress default logging."""
        pass


class WebhookServer:
    """Webhook server for receiving WhatsApp messages."""
    
    def __init__(self, host: str = "localhost", port: int = 8080):
        """Initialize webhook server."""
        self.host = host
        self.port = port
        self.server = None
        self.server_thread = None
        self.running = False
    
    def start(self, message_callback: Callable):
        """Start the webhook server."""
        if self.running:
            return
        
        # Set the callback for message handling
        WebhookHandler.message_callback = message_callback
        
        # Create HTTP server
        self.server = HTTPServer((self.host, self.port), WebhookHandler)
        
        # Start server in a separate thread
        self.server_thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.server_thread.start()
        self.running = True
        
        print(f"🌐 Webhook server started on http://{self.host}:{self.port}")
    
    def stop(self):
        """Stop the webhook server."""
        if self.server and self.running:
            self.server.shutdown()
            self.server.server_close()
            self.running = False
            print("🛑 Webhook server stopped")
    
    def get_webhook_url(self) -> str:
        """Get the webhook URL."""
        return f"http://{self.host}:{self.port}"


class EnhancedWhatsAppCLIChat:
    """Enhanced CLI Chat with webhook support."""
    
    def __init__(self, api_url: str, session: str, token: str, secret_key: Optional[str] = None, 
                 webhook_host: str = "localhost", webhook_port: int = 8880):
        """Initialize the enhanced chat application."""
        from whatsapp_cli_chat import WhatsAppCLIChat
        
        # Initialize base chat app
        self.base_chat = WhatsAppCLIChat(api_url, session, token, secret_key)
        
        # Webhook server
        self.webhook_server = WebhookServer(webhook_host, webhook_port)
        self.target_phone = None
        self.is_group = False
    
    def setup_session(self) -> bool:
        """Setup session with webhook registration."""
        print("🔄 Setting up WhatsApp session with webhook support...")
        
        # Start webhook server first
        self.webhook_server.start(self._handle_incoming_message)
        webhook_url = self.webhook_server.get_webhook_url()
        
        # Register session with webhook
        result = self.base_chat.api.register_session(
            webhook_url=webhook_url,
            auto_register=True
        )
        
        if result.get("status") == "CONNECTED":
            device_info = result.get("device", {})
            phone_number = device_info.get("phone", "Unknown")
            print(f"✅ Session connected with webhook! Phone: {phone_number}")
            print(f"📡 Webhook URL: {webhook_url}")
            return True
            
        elif result.get("status") == "AWAITING_QR_SCAN":
            qr_code = result.get("qrcode")
            if qr_code:
                print(f"\n📱 Please scan the QR code with your WhatsApp mobile app:")
                print("   1. Open WhatsApp on your phone")
                print("   2. Go to Settings > Linked Devices")
                print("   3. Tap 'Link a Device'")
                print("   4. Scan the QR code below:\n")
                print(f"QR Code (base64): {qr_code[:50]}...")
                print(f"📡 Webhook URL: {webhook_url}")
                print("\n⏳ Waiting for QR code scan...")
                
                return self.base_chat._wait_for_connection()
            else:
                print("❌ Failed to get QR code")
                return False
        else:
            print(f"❌ Session setup failed: {result}")
            return False
    
    def _handle_incoming_message(self, parsed_message: dict):
        """Handle incoming messages from webhook."""
        # Only show messages from our current chat target
        sender = parsed_message.get('sender', '')
        author = parsed_message.get('author', '')
        message_body = parsed_message.get('body', '')
        
        # Check if message is from our target contact/group
        if self.target_phone and (sender == self.target_phone or author == self.target_phone):
            timestamp = datetime.now().strftime("%H:%M:%S")
            sender_name = parsed_message.get('sender_name', sender)
            
            if parsed_message.get('isGroup'):
                display_name = f"{sender_name} (in group)"
            else:
                display_name = sender_name or sender
            
            # Display the message
            print(f"\n📨 [{timestamp}] {display_name}: {message_body}")
            print("You: ", end="", flush=True)
    
    def start_chat(self, phone: str, is_group: bool = False):
        """Start enhanced chat with webhook support."""
        self.target_phone = phone
        self.is_group = is_group
        
        # Use the base chat functionality but with webhook receiving
        print(f"\n💬 Starting enhanced chat with {'group' if is_group else 'contact'}: {phone}")
        print("📡 Real-time message receiving enabled via webhook")
        print("📝 Type your messages below. Commands:")
        print("   /quit or /exit - End the chat")
        print("   /status - Check connection status")
        print("   /clear - Clear screen")
        print("   /help - Show this help")
        print("-" * 50)
        
        # Start the chat loop (without polling since we have webhooks)
        self.base_chat.target_phone = phone
        self.base_chat.is_group = is_group
        self.base_chat.running = True
        
        try:
            self.base_chat._chat_loop()
        finally:
            self.webhook_server.stop()


def main():
    """Main entry point for enhanced webhook-based chat."""
    import argparse
    import os
    import sys
    
    parser = argparse.ArgumentParser(description="Enhanced WhatsApp CLI Chat with Webhook Support")
    parser.add_argument("--api-url", help="WPPConnect API URL (or set WPP_API_URL env var)")
    parser.add_argument("--session", help="Session name (or set WPP_SESSION env var)")
    parser.add_argument("--token", help="API token (or set WPP_TOKEN env var)")
    parser.add_argument("--secret-key", help="Secret key (or set WPP_SECRET_KEY env var)")
    parser.add_argument("--phone", help="Target phone number to chat with")
    parser.add_argument("--group", action="store_true", help="Target is a group")
    parser.add_argument("--webhook-host", default="localhost", help="Webhook server host")
    parser.add_argument("--webhook-port", type=int, default=8080, help="Webhook server port")
    
    args = parser.parse_args()
    
    # Get configuration from args or environment
    api_url = args.api_url or os.getenv("WPP_API_URL")
    session = args.session or os.getenv("WPP_SESSION")
    token = args.token or os.getenv("WPP_TOKEN")
    secret_key = args.secret_key or os.getenv("WPP_SECRET_KEY")
    
    if not api_url:
        print("❌ Error: API URL is required. Use --api-url or set WPP_API_URL environment variable")
        sys.exit(1)
    
    if not session:
        print("❌ Error: Session name is required. Use --session or set WPP_SESSION environment variable")
        sys.exit(1)
    
    if not token:
        print("❌ Error: Token is required. Use --token or set WPP_TOKEN environment variable")
        print("\n💡 Run 'python get_token.py --save-env' to generate and save credentials")
        sys.exit(1)
    
    # Initialize enhanced chat app
    chat_app = EnhancedWhatsAppCLIChat(
        api_url=api_url,
        session=session,
        token=token,
        secret_key=secret_key,
        webhook_host=args.webhook_host,
        webhook_port=args.webhook_port
    )
    
    print("🚀 Enhanced WhatsApp CLI Chat (Webhook Mode)")
    print("=" * 45)
    
    # Setup session
    if not chat_app.setup_session():
        print("❌ Failed to setup WhatsApp session")
        sys.exit(1)
    
    # Get target phone if not provided
    phone = args.phone
    if not phone:
        phone = input("\n📱 Enter phone number (with country code, e.g., 1234567890): ").strip()
        if not phone:
            print("❌ Phone number is required")
            sys.exit(1)
    
    # Start enhanced chat
    try:
        chat_app.start_chat(phone, args.group)
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

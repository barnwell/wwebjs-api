#!/usr/bin/env python3
"""CLI Chat Application with Webhook support for receiving messages."""

import argparse
import base64
import os
import sys
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from flask import Flask, request, jsonify

from wwebjs_wppconnect_api import WPPConnectAPI

load_dotenv()

# Global message queue
message_queue = []
app = Flask(__name__)


@app.route("/webhook", methods=["POST"])
def webhook():
    """Receive incoming messages from WPPConnect."""
    try:
        data = request.json
        message_queue.append(data)
        return jsonify({"status": "received"}), 200
    except Exception as e:
        print(f"Webhook error: {e}")
        return jsonify({"error": str(e)}), 500


class ChatCLI:
    """Command-line interface for WPPConnect chat with webhook support."""

    def __init__(self, api: WPPConnectAPI, webhook_url: str = ""):
        self.api = api
        self.webhook_url = webhook_url
        self.active_chat = None
        self.running = False
        self.webhook_thread = None

    def start_webhook_server(self, port: int = 5000):
        """Start Flask webhook server in background thread."""

        def run_server():
            app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)

        self.webhook_thread = threading.Thread(target=run_server, daemon=True)
        self.webhook_thread.start()
        print(f"✓ Webhook server started on port {port}")

    def display_qr_code(self, qr_base64: str) -> None:
        """Save QR code as image and display."""
        try:
            if qr_base64.startswith("data:"):
                qr_base64 = qr_base64.split(",", 1)[1]

            missing_padding = len(qr_base64) % 4
            if missing_padding:
                qr_base64 += "=" * (4 - missing_padding)

            qr_data = base64.b64decode(qr_base64)
            qr_path = Path("qrcode.png")
            qr_path.write_bytes(qr_data)
            print(f"\n✓ QR Code saved to: {qr_path.absolute()}")
            print("📱 Please scan the QR code with WhatsApp to connect.\n")

            try:
                import platform
                import subprocess

                system = platform.system()
                if system == "Windows":
                    os.startfile(qr_path)
                elif system == "Darwin":
                    subprocess.run(["open", str(qr_path)])
                else:
                    subprocess.run(["xdg-open", str(qr_path)])
                print("✓ QR code opened in default image viewer")
            except Exception:
                print("💡 Open qrcode.png to scan with your phone.")

        except Exception as e:
            print(f"⚠️  Could not save QR code image: {e}")

    def connect_session(self) -> bool:
        """Initialize and connect the WhatsApp session."""
        print("🔄 Connecting to WhatsApp...")

        status_check = self.api.status()
        if not status_check.get("ok", True) and "Unauthorized" in str(
            status_check.get("error", "")
        ):
            print("⚠️  Token invalid or expired. Generating new token...")
            token_result = self.api.create_session()
            if token_result.get("token"):
                self.api.token = token_result["token"]
                print(f"✓ New token generated")
                print(
                    f"💡 Update your .env file with: WPP_TOKEN={token_result['token']}"
                )
            else:
                print(f"✗ Failed to generate token: {token_result}")
                return False

        result = self.api.register_session(
            webhook_url=self.webhook_url, wait_qr_code=True
        )
        status = result.get("status", "")

        if status == "CONNECTED":
            device = result.get("device", {})

            phone = "Unknown"
            if isinstance(device, dict):
                wid = device.get("wid", {})
                if isinstance(wid, dict):
                    phone = wid.get("user", wid.get("_serialized", "Unknown"))
                elif isinstance(wid, str):
                    phone = wid

                if phone == "Unknown":
                    phone = device.get(
                        "phone", device.get("me", {}).get("user", "Unknown")
                    )

                # Try response.phoneNumber format
                if phone == "Unknown":
                    response = device.get("response", {})
                    phone_num = response.get("phoneNumber", "")
                    if phone_num:
                        phone = phone_num.replace("@c.us", "")

            print(f"✓ Connected as: {phone}")
            print(f"✓ Session is active and ready to use")

            return True

        elif status == "AWAITING_QR_SCAN":
            qr_code = result.get("qrcode")
            if qr_code:
                self.display_qr_code(qr_code)
                print("⏳ Waiting for QR code scan...")

                for _ in range(60):
                    time.sleep(1)
                    status_check = self.api.status()
                    if status_check.get("status") == "CONNECTED":
                        device = self.api.get_host_device()

                        phone = "Unknown"
                        if isinstance(device, dict):
                            wid = device.get("wid", {})
                            if isinstance(wid, dict):
                                phone = wid.get("user", "Unknown")

                        print(f"\n✓ Connected as: {phone}")
                        return True

                print("\n✗ Connection timeout. Please try again.")
                return False
        else:
            print(f"✗ Connection failed: {result.get('message', 'Unknown error')}")
            print(f"   Status: {status}")
            return False

    def format_phone(self, phone: str) -> str:
        """Format phone number for WhatsApp (must include @c.us suffix)."""
        if "@c.us" in phone:
            return phone

        phone = "".join(filter(str.isdigit, phone))
        return f"{phone}@c.us"

    def send_message(self, phone: str, message: str) -> bool:
        """Send a text message."""
        formatted_phone = self.format_phone(phone)
        result = self.api.send_message(formatted_phone, message)

        if result.get("status") == "success" or result.get("ok"):
            return True
        else:
            print(f"✗ Failed to send: {result.get('error', 'Unknown error')}")
            return False

    def display_message(self, msg: dict) -> None:
        """Display a formatted message."""
        parsed = self.api.parse_inbound_message(msg)

        if not parsed:
            return

        timestamp = datetime.fromtimestamp(msg.get("timestamp", time.time())).strftime(
            "%H:%M:%S"
        )
        sender = parsed.get("sender_name", parsed.get("sender", "Unknown"))
        is_from_me = parsed.get("fromMe", False)
        body = parsed.get("body", parsed.get("caption", ""))
        msg_type = parsed.get("message_type", "")

        prefix = "You" if is_from_me else sender
        arrow = "→" if is_from_me else "←"

        if msg_type == "chat":
            print(f"[{timestamp}] {arrow} {prefix}: {body}")
        elif msg_type in ["image", "video", "document"]:
            filename = parsed.get("filename", "media")
            print(f"[{timestamp}] {arrow} {prefix}: [{msg_type.upper()}] {filename}")
            if body:
                print(f"           Caption: {body}")
        elif msg_type == "location":
            loc = parsed.get("location", {})
            print(
                f"[{timestamp}] {arrow} {prefix}: [LOCATION] {loc.get('latitude')}, {loc.get('longitude')}"
            )
        else:
            print(f"[{timestamp}] {arrow} {prefix}: [{msg_type.upper()}]")

    def process_incoming_messages(self, target_phone: str):
        """Process messages from the webhook queue."""
        global message_queue

        formatted_target = self.format_phone(target_phone)

        while message_queue:
            msg = message_queue.pop(0)

            # Check if message is from/to the active chat
            sender = msg.get("from", "")
            receiver = msg.get("to", "")

            if sender == formatted_target or receiver == formatted_target:
                self.display_message(msg)

    def start_chat(self, phone: str) -> None:
        """Start an interactive chat session with webhook support."""
        self.active_chat = self.format_phone(phone)
        self.running = True

        print(f"\n💬 Chat with {phone}")
        print("=" * 50)
        print("Commands:")
        print("  /quit or /exit - Exit chat")
        print("  /file <path> - Send a file")
        print("  /image <path> - Send an image")
        print("=" * 50)
        print("\n💡 Messages will appear here as they arrive...\n")

        try:
            while self.running:
                try:
                    # Check for incoming messages
                    self.process_incoming_messages(phone)

                    # Get user input with timeout
                    message = input("You: ").strip()

                    if not message:
                        continue

                    if message.lower() in ["/quit", "/exit"]:
                        print("👋 Exiting chat...")
                        break

                    elif message.startswith("/file "):
                        file_path = message[6:].strip()
                        self.send_file(phone, file_path)

                    elif message.startswith("/image "):
                        image_path = message[7:].strip()
                        self.send_image(phone, image_path)

                    else:
                        if self.send_message(phone, message):
                            print(f"[{datetime.now().strftime('%H:%M:%S')}] → You: {message}")

                except KeyboardInterrupt:
                    print("\n👋 Exiting chat...")
                    break

        finally:
            self.running = False

    def send_file(self, phone: str, file_path: str) -> bool:
        """Send a file to a contact."""
        if not Path(file_path).exists():
            print(f"✗ File not found: {file_path}")
            return False

        formatted_phone = self.format_phone(phone)
        filename = Path(file_path).name

        with open(file_path, "rb") as f:
            file_data = f.read()
            file_base64 = base64.b64encode(file_data).decode("utf-8")

        result = self.api.send_file_base64(
            formatted_phone, file_base64, filename=filename
        )

        if result.get("status") == "success" or result.get("ok"):
            print(f"✓ File sent: {filename}")
            return True
        else:
            print(f"✗ Failed to send file: {result.get('error', 'Unknown error')}")
            return False

    def send_image(self, phone: str, image_path: str, caption: str = "") -> bool:
        """Send an image to a contact."""
        if not Path(image_path).exists():
            print(f"✗ Image not found: {image_path}")
            return False

        formatted_phone = self.format_phone(phone)
        file_url = Path(image_path).absolute().as_uri()

        result = self.api.send_image(
            formatted_phone,
            filename=Path(image_path).name,
            caption=caption,
            file_url=file_url,
        )

        if result.get("status") == "success" or result.get("ok"):
            print(f"✓ Image sent")
            return True
        else:
            print(f"✗ Failed to send image: {result.get('error', 'Unknown error')}")
            return False


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="WPPConnect CLI Chat with Webhook Support",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --connect                    # Connect to WhatsApp
  %(prog)s --chat 1234567890            # Start chat with webhook
  %(prog)s --send 1234567890 "Hello"    # Send a quick message
  %(prog)s --webhook-port 5000          # Use custom webhook port
        """,
    )

    parser.add_argument("--connect", action="store_true", help="Connect to WhatsApp")
    parser.add_argument("--chat", metavar="PHONE", help="Start interactive chat")
    parser.add_argument(
        "--send", nargs=2, metavar=("PHONE", "MESSAGE"), help="Send a quick message"
    )
    parser.add_argument("--status", action="store_true", help="Check connection status")
    parser.add_argument(
        "--webhook-port", type=int, default=5000, help="Webhook server port (default: 5000)"
    )
    parser.add_argument(
        "--webhook-url",
        default="",
        help="Public webhook URL (leave empty for local)",
    )

    args = parser.parse_args()

    # Initialize API
    api_url = os.getenv("WPP_API_URL", "http://localhost:21465/api")
    session = os.getenv("WPP_SESSION", "mysession")
    token = os.getenv("WPP_TOKEN", "")
    secret_key = os.getenv("WPP_SECRET_KEY", "")

    if not api_url or not session:
        print("✗ Error: WPP_API_URL and WPP_SESSION must be set in .env file")
        sys.exit(1)

    print(f"📡 API URL: {api_url}")
    print(f"📱 Session: {session}")
    print(f"🔑 Token: {'✓ Set' if token else '✗ Not set'}")
    print(f"🔐 Secret Key: {'✓ Set' if secret_key else '✗ Not set'}\n")

    api = WPPConnectAPI(
        api_url=api_url, session=session, token=token, secret_key=secret_key
    )

    # Setup webhook URL
    webhook_url = args.webhook_url
    if not webhook_url and args.chat:
        webhook_url = f"http://localhost:{args.webhook_port}/webhook"

    cli = ChatCLI(api, webhook_url=webhook_url)

    # Handle commands
    if args.status:
        status = api.status()
        print(f"Status: {status.get('status', 'Unknown')}")
        if status.get("status") == "CONNECTED":
            device = api.get_host_device()
            print(f"Connected as: {device.get('wid', {}).get('user', 'Unknown')}")

    elif args.connect:
        cli.connect_session()

    elif args.chat:
        # Start webhook server
        cli.start_webhook_server(port=args.webhook_port)
        time.sleep(1)  # Give server time to start

        # Check if connected
        status = api.status()
        if status.get("status") != "CONNECTED":
            print("⚠️  Not connected. Connecting now...")
            if not cli.connect_session():
                sys.exit(1)

        cli.start_chat(args.chat)

    elif args.send:
        phone, message = args.send
        status = api.status()
        if status.get("status") != "CONNECTED":
            print("⚠️  Not connected. Connecting now...")
            if not cli.connect_session():
                sys.exit(1)

        cli.send_message(phone, message)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()

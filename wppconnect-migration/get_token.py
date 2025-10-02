#!/usr/bin/env python3
"""
WPPConnect Token Generator and QR Code Helper
This script helps you get a token and QR code for WPPConnect setup
"""

import argparse
import base64
import os
import sys
import time
from io import BytesIO

import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def create_session_and_get_token(api_url: str, session: str, secret_key: str) -> dict:
    """Create a new session and get the token."""
    print(f"🔄 Creating session '{session}'...")
    
    # WPPConnect endpoint for creating session and generating token
    url = f"{api_url.rstrip('/')}/{session}/{secret_key}/generate-token"
    
    try:
        response = requests.post(url, timeout=30)
        response.raise_for_status()
        result = response.json()
        
        if result.get("token"):
            print(f"✅ Token generated successfully!")
            print(f"🔑 Token: {result['token']}")
            return result
        else:
            print(f"❌ Failed to generate token: {result}")
            return {}
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Error creating session: {e}")
        return {}


def get_qr_code(api_url: str, session: str, token: str) -> str:
    """Get QR code for the session."""
    print(f"🔄 Getting QR code for session '{session}'...")
    
    url = f"{api_url.rstrip('/')}/{session}/qrcode-session"
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        # QR code is returned as binary data
        qr_code_base64 = base64.b64encode(response.content).decode('ascii')
        return qr_code_base64
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Error getting QR code: {e}")
        return ""


def display_qr_code(qr_code_base64: str):
    """Display QR code in terminal using multiple methods."""
    print("📱 QR Code Generated!")
    print("=" * 30)
    
    # Method 1: Try segno library (better for large QR codes)
    try:
        import segno
        qr_data = base64.b64decode(qr_code_base64)
        
        # Try to create QR code with segno
        qr = segno.make(qr_data)
        
        print("✅ QR Code displayed in terminal:")
        print(qr.terminal(compact=True))
        
        # Also save as image
        qr_filename = "whatsapp_qr_code.png"
        qr.save(qr_filename, scale=4)
        print(f"\n📁 Also saved as: {qr_filename}")
        
        # Try to open automatically
        try:
            import webbrowser
            import os
            webbrowser.open(f"file://{os.path.abspath(qr_filename)}")
            print("🖼️  Image opened automatically!")
        except:
            pass
            
        return
        
    except ImportError:
        print("⚠️  segno library not installed")
    except Exception as e:
        print(f"⚠️  segno failed: {e}")
    
    # Method 2: Try qrcode library with better error handling
    try:
        import qrcode
        qr_data = base64.b64decode(qr_code_base64)
        
        # Create QR code with minimal settings
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=1,
            border=1,
        )
        qr.add_data(qr_data)
        qr.make(fit=True)
        
        print("✅ QR Code displayed in terminal:")
        qr.print_ascii(invert=True)
        
        # Also save as image
        img = qr.make_image(fill_color="black", back_color="white")
        qr_filename = "whatsapp_qr_code.png"
        img.save(qr_filename)
        print(f"\n📁 Also saved as: {qr_filename}")
        
        return
        
    except Exception as e:
        print(f"⚠️  qrcode library failed: {e}")
    
    # Method 3: Fallback - save raw data and show info
    try:
        qr_data = base64.b64decode(qr_code_base64)
        qr_filename = "whatsapp_qr_code.png"
        
        with open(qr_filename, 'wb') as f:
            f.write(qr_data)
        
        print(f"✅ QR Code saved as: {qr_filename}")
        print("📱 Open this file and scan with WhatsApp mobile app")
        
        # Try to open automatically
        try:
            import webbrowser
            import os
            webbrowser.open(f"file://{os.path.abspath(qr_filename)}")
            print("🖼️  Image opened automatically!")
        except:
            pass
            
    except Exception as e:
        print(f"❌ All methods failed: {e}")
        print("📱 Base64 Data (first 100 chars):")
        print(f"{qr_code_base64[:100]}...")
        print("\n💡 Manual options:")
        print("1. Copy base64 data to online QR decoder")
        print("2. Use WhatsApp Web interface")
        print("3. Install segno: pip install segno")


def start_session(api_url: str, session: str, token: str) -> dict:
    """Start the WhatsApp session."""
    print(f"🔄 Starting session '{session}'...")
    
    url = f"{api_url.rstrip('/')}/{session}/start-session"
    headers = {"Authorization": f"Bearer {token}"}
    data = {"webhook": "", "waitQrCode": True}
    
    try:
        response = requests.post(url, headers=headers, json=data, timeout=30)
        response.raise_for_status()
        result = response.json()
        
        print(f"✅ Session started: {result.get('status', 'Unknown')}")
        return result
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Error starting session: {e}")
        return {}


def check_session_status(api_url: str, session: str, token: str) -> dict:
    """Check the current session status."""
    url = f"{api_url.rstrip('/')}/{session}/status-session"
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        return response.json()
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Error checking status: {e}")
        return {}


def wait_for_connection(api_url: str, session: str, token: str, timeout: int = 60) -> bool:
    """Wait for WhatsApp connection after QR scan."""
    print(f"⏳ Waiting for WhatsApp connection (timeout: {timeout}s)...")
    
    start_time = time.time()
    
    while time.time() - start_time < timeout:
        status_result = check_session_status(api_url, session, token)
        status = status_result.get("status", "").upper()
        
        if status == "CONNECTED":
            print("✅ Connected successfully!")
            
            # Get device info
            device_url = f"{api_url.rstrip('/')}/{session}/host-device"
            try:
                device_response = requests.get(device_url, headers={"Authorization": f"Bearer {token}"})
                if device_response.ok:
                    device_info = device_response.json()
                    phone = device_info.get("phone", "Unknown")
                    print(f"📱 Connected phone: {phone}")
            except:
                pass
            
            return True
        
        print(f"⏳ Status: {status} - Waiting...")
        time.sleep(3)
    
    print("❌ Connection timeout")
    return False


def save_credentials_to_env(token: str, secret_key: str, session: str, api_url: str):
    """Save credentials to .env file."""
    env_file = ".env"
    
    # Read existing .env file
    env_content = {}
    if os.path.exists(env_file):
        with open(env_file, 'r') as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    key, value = line.strip().split('=', 1)
                    env_content[key] = value
    
    # Update with new credentials
    env_content['WPP_TOKEN'] = token
    env_content['WPP_SECRET_KEY'] = secret_key
    env_content['WPP_SESSION'] = session
    env_content['WPP_API_URL'] = api_url
    
    # Write back to .env file
    with open(env_file, 'w') as f:
        for key, value in env_content.items():
            f.write(f"{key}={value}\n")
    
    print(f"💾 Credentials saved to {env_file}")


def main():
    """Main function."""
    parser = argparse.ArgumentParser(description="WPPConnect Token Generator and QR Code Helper")
    parser.add_argument("--api-url", help="WPPConnect API URL (or set WPP_API_URL env var)")
    parser.add_argument("--session", help="Session name (or set WPP_SESSION env var)")
    parser.add_argument("--secret-key", help="Secret key (or set WPP_SECRET_KEY env var)")
    parser.add_argument("--save-env", action="store_true", help="Save credentials to .env file")
    parser.add_argument("--wait-connection", action="store_true", help="Wait for WhatsApp connection")
    
    args = parser.parse_args()
    
    # Get configuration from args or environment
    api_url = args.api_url or os.getenv("WPP_API_URL")
    session = args.session or os.getenv("WPP_SESSION")
    secret_key = args.secret_key or os.getenv("WPP_SECRET_KEY")
    
    if not api_url:
        print("❌ Error: API URL is required. Use --api-url or set WPP_API_URL environment variable")
        sys.exit(1)
    
    if not session:
        print("❌ Error: Session name is required. Use --session or set WPP_SESSION environment variable")
        sys.exit(1)
    
    if not secret_key:
        print("❌ Error: Secret key is required. Use --secret-key or set WPP_SECRET_KEY environment variable")
        print("\n💡 The secret key is usually provided by your WPPConnect server administrator")
        print("   or can be found in your WPPConnect server configuration.")
        sys.exit(1)
    
    print("🚀 WPPConnect Token Generator")
    print("=" * 35)
    
    # Step 1: Create session and get token
    token_result = create_session_and_get_token(api_url, session, secret_key)
    if not token_result.get("token"):
        print("❌ Failed to create session and get token")
        sys.exit(1)
    
    token = token_result["token"]
    
    # Step 2: Start session
    start_result = start_session(api_url, session, token)
    if not start_result:
        print("❌ Failed to start session")
        sys.exit(1)
    
    # Step 3: Get QR code
    qr_code = get_qr_code(api_url, session, token)
    if not qr_code:
        print("❌ Failed to get QR code")
        sys.exit(1)
    
    # Step 4: Display QR code
    print("\n📱 Scan this QR code with your WhatsApp mobile app:")
    print("   1. Open WhatsApp on your phone")
    print("   2. Go to Settings > Linked Devices")
    print("   3. Tap 'Link a Device'")
    print("   4. Scan the QR code below:\n")
    
    display_qr_code(qr_code)
    
    # Step 5: Save credentials if requested
    if args.save_env:
        save_credentials_to_env(token, secret_key, session, api_url)
    
    # Step 6: Wait for connection if requested
    if args.wait_connection:
        if wait_for_connection(api_url, session, token):
            print("\n🎉 Setup complete! You can now use the CLI chat:")
            print(f"   python whatsapp_cli_chat.py --phone YOUR_PHONE")
        else:
            print("\n⚠️  Connection failed. You can try again later.")
    
    print(f"\n📋 Your credentials:")
    print(f"   API URL: {api_url}")
    print(f"   Session: {session}")
    print(f"   Token: {token}")
    print(f"   Secret Key: {secret_key}")


if __name__ == "__main__":
    main()

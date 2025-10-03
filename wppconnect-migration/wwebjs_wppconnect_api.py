"""
WWebJS API Wrapper with WPPConnect-compatible interface.

This module provides a drop-in replacement for WPPConnectAPI that works with WWebJS backend.
All method signatures remain the same for compatibility with existing code.
"""

import base64
import logging
import mimetypes
import os
import time
from pathlib import Path
from typing import Dict, List, Optional

import filetype
import requests
from dotenv import load_dotenv

load_dotenv()


class WPPConnectAPI:
    """WWebJS API wrapper with WPPConnect-compatible interface."""

    logger = logging.getLogger(__name__)

    def __init__(
        self,
        api_url: str,
        session: str,
        token: str,
        secret_key: Optional[str] = None,
        timeout: float = 10.0,
    ) -> None:
        """
        Initialize the API wrapper.

        Args:
            api_url: WWebJS API base URL (e.g., http://localhost:3000)
            session: Session ID for this WhatsApp instance
            token: API key for authentication (x-api-key header)
            secret_key: Not used in WWebJS, kept for compatibility
            timeout: Request timeout in seconds
        """
        self.api_url = api_url.rstrip("/")
        self.session = session
        self.token = token
        self.secret_key = secret_key or os.environ.get("WPP_SECRET_KEY", "")
        self.timeout = timeout

    def _format_chat_id(self, phone: str, is_group: bool = False) -> str:
        """Format phone number to WWebJS chat ID format."""
        if "@" in phone:
            return phone
        suffix = "@g.us" if is_group else "@c.us"
        return f"{phone}{suffix}"

    def send_rest_request(
        self,
        endpoint: str,
        method: str = "POST",
        data: Optional[dict] = None,
        params: Optional[dict] = None,
        headers: Optional[dict] = None,
        json_body: bool = True,
        use_full_url: bool = False,
    ) -> dict:
        """Generic HTTP request to WWebJS API."""
        # Always include x-api-key header for WWebJS
        if headers is None:
            headers = {}
        
        # Ensure x-api-key is always present
        if "x-api-key" not in headers:
            headers["x-api-key"] = self.secret_key
        
        # Add Content-Type if not present and using JSON
        if json_body and "Content-Type" not in headers:
            headers["Content-Type"] = "application/json"

        url = endpoint if use_full_url else f"{self.api_url}/{endpoint.lstrip('/')}"
        json_payload = data if json_body else None
        body = None if json_body else data

        try:
            response = requests.request(
                method=method,
                url=url,
                headers=headers,
                json=json_payload,
                data=body,
                params=params,
                timeout=self.timeout,
            )
            response.raise_for_status()
            if response.content:
                try:
                    result = response.json()
                    # Convert WWebJS {success: bool} to WPPConnect {ok: bool}
                    if "success" in result:
                        result["ok"] = result["success"]
                    return result
                except Exception:
                    return {"ok": True, "raw": response.content}
            return {"ok": True, "no_content": True}
        except requests.Timeout:
            self.logger.error(
                f"WWebJS request timed out after {self.timeout} seconds."
            )
            return {"ok": False, "error": f"Timeout after {self.timeout} seconds"}
        except requests.RequestException as e:
            self.logger.error(f"WWebJS request error: {str(e)}")
            return {"ok": False, "error": str(e)}

    # Utility methods (static, same as WPPConnect)

    @staticmethod
    def parse_inbound_message(request: dict) -> dict:
        """Parses an inbound message request payload and returns extracted values."""
        payload = {}

        try:
            event = request.get("event")
            if event not in ["onmessage", "onpollresponse", "onack"]:
                return {}

            payload = {
                "message_id": request.get("id", ""),
                "event_type": request.get("dataType", event),
                "message_type": request.get("type", "unknown"),
                "author": str(request.get("author", "").replace("@c.us", "")),
                "sender": str(request.get("from", "").replace("@c.us", "")),
                "receiver": str(request.get("to", "").replace("@c.us", "")),
                "caption": request.get("caption", ""),
                "location": request.get("location", {}),
                "fromMe": request.get("fromMe", False),
                "isGroup": request.get("isGroupMsg", False),
                "isForwarded": request.get("isForwarded", False),
                "sender_name": request.get("notifyName", ""),
            }

            if isinstance(payload["fromMe"], dict):
                payload["fromMe"] = payload["fromMe"].get("fromMe", False)

            if isinstance(payload["message_id"], dict):
                payload["fromMe"] = payload["message_id"].get("fromMe", False)
                payload["message_id"] = payload["message_id"].get("id", "")

            if "quotedMsg" in request:
                payload["quoted_message"] = request["quotedMsg"]

            if (
                payload["author"]
                and payload["sender"]
                and payload["author"] != payload["sender"]
            ):
                payload["isGroup"] = True

            if payload["message_type"] == "chat":
                payload["body"] = request.get("content", request.get("body", ""))
            elif payload["message_type"] in ["image", "video", "document"]:
                payload["media"] = request.get("body", "")
                payload["filename"] = request.get("filename", "")
                payload["mime_type"] = request.get("mimetype", "")
            elif payload["message_type"] == "location":
                payload["location"] = {
                    "latitude": request.get("lat", ""),
                    "longitude": request.get("lng", ""),
                }
            elif payload["message_type"] in ["audio", "ptt", "sticker"]:
                payload["media"] = request.get("body", "")
            elif payload["message_type"] in ["contacts", "vcard"]:
                payload["contact"] = request.get("body", {})
            elif payload["event_type"] == "onpollresponse":
                payload["poll_id"] = request.get("msgId", {}).get("_serialized", "")
                payload["selectedOptions"] = request.get("selectedOptions", "")
                payload["sender"] = str(request.get("chatId", "").replace("@c.us", ""))
                payload["message_type"] = "poll"

            return payload

        except Exception as e:
            WPPConnectAPI.logger.error("Error parsing inbound message: %s", str(e))
            return {}

    @staticmethod
    def get_file_type(
        file_path: Optional[str] = None,
        url: Optional[str] = None,
        mime_type: Optional[str] = None,
    ) -> dict:
        """Determines the MIME type of a file or URL and categorizes it."""
        detected_mime_type = None

        if file_path:
            detected_mime_type, _ = mimetypes.guess_type(file_path)
        elif url:
            try:
                response = requests.head(url, allow_redirects=True)
                detected_mime_type = response.headers.get("Content-Type")
            except requests.RequestException as e:
                WPPConnectAPI.logger.error(f"Error making HEAD request: {e}")
        else:
            detected_mime_type = mime_type

        mime_categories = {
            "image": [
                "image/jpeg", "image/png", "image/gif", "image/bmp", "image/webp",
                "image/tiff", "image/svg+xml", "image/x-icon", "image/heic",
                "image/heif", "image/x-raw",
            ],
            "document": [
                "application/pdf", "application/msword",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/vnd.ms-excel",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "application/vnd.ms-powerpoint",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "text/plain", "text/csv", "text/html", "application/rtf",
                "application/x-tex", "application/vnd.oasis.opendocument.text",
                "application/vnd.oasis.opendocument.spreadsheet",
                "application/epub+zip", "application/x-mobipocket-ebook",
                "application/x-fictionbook+xml", "application/x-abiword",
                "application/vnd.apple.pages", "application/vnd.google-apps.document",
            ],
            "audio": [
                "audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/aac",
                "audio/mp3", "audio/webm", "audio/amr", "audio/midi", "audio/x-m4a",
                "audio/x-realaudio", "audio/x-aiff", "audio/x-wav", "audio/x-matroska",
            ],
            "video": [
                "video/mp4", "video/mpeg", "video/ogg", "video/webm",
                "video/quicktime", "video/x-msvideo", "video/x-matroska",
                "video/x-flv", "video/x-ms-wmv", "video/3gpp", "video/3gpp2",
                "video/h264", "video/h265", "video/x-f4v", "video/avi",
            ],
            "poll": [
                "application/poll", "application/vnd.jivas.poll", "poll/message",
                "application/x-poll-data", "application/jivas-poll+json", "jivas/poll",
            ],
        }

        if not detected_mime_type or detected_mime_type == "binary/octet-stream":
            file_extension = ""
            if file_path:
                _, file_extension = os.path.splitext(file_path)
            elif url:
                _, file_extension = os.path.splitext(url)
            detected_mime_type = mimetypes.types_map.get(
                file_extension.lower(), "unknown/unknown"
            )

        for category, mime_list in mime_categories.items():
            if detected_mime_type in mime_list:
                return {"file_type": category, "mime": detected_mime_type}

        return {"file_type": "unknown", "mime": detected_mime_type}

    @staticmethod
    def file_url_to_base64(file_url: str, force_prefix: bool = True) -> Optional[str]:
        """Downloads a file from a URL and returns its base64-encoded content."""
        try:
            response = requests.get(file_url, timeout=15)
            response.raise_for_status()
            content = response.content

            kind = filetype.guess(content)
            content_type = kind.mime if kind else "application/octet-stream"

            encoded = base64.b64encode(content).decode("utf-8")

            if force_prefix:
                return f"data:{content_type};base64,{encoded}"
            return encoded

        except Exception as e:
            WPPConnectAPI.logger.error(f"[ERROR] Failed to fetch or encode file: {e}")
            return None

    def list_files_in_folder(
        self, directory: str, within_seconds: int = 0
    ) -> List[str]:
        """Returns filenames created within the last X seconds."""
        dir_path = Path(directory)
        dir_path.mkdir(parents=True, exist_ok=True)

        if not dir_path.is_dir():
            raise ValueError(f"Directory not found: {directory}")

        current_time = time.time()
        recent_files = []

        for file in dir_path.iterdir():
            if file.is_file():
                if within_seconds > 0:
                    if os.name == "nt":
                        created = os.path.getctime(file)
                    else:
                        stat = file.stat()
                        created = getattr(stat, "st_birthtime", stat.st_ctime)

                    if (current_time - created) <= within_seconds:
                        recent_files.append(file.name)
                else:
                    recent_files.append(file.name)

        return recent_files

    def register_session(
        self,
        webhook_url: str = "",
        wait_qr_code: bool = True,
        auto_register: bool = True,
    ) -> dict:
        """
        Initializes the WWebJS session.
        Note: WWebJS doesn't support webhook registration in start endpoint.
        """
        status_resp = self.status()
        # Check both 'state' (WWebJS) and 'status' (for test compatibility)
        state = (status_resp.get("state") or status_resp.get("status", "")).upper()
        
        # Check for unauthorized/error - try to create session (regardless of auto_register)
        # This matches WPPConnect behavior where create_session is called for auth errors
        if "error" in status_resp or "Unauthorized" in str(status_resp.get("error", "")):
            create_res = self.create_session()
            if not create_res.get("token") and not create_res.get("ok"):
                return {
                    "status": "ERROR",
                    "message": "Could not create instance or get token.",
                    "details": create_res,
                }
            # Update token if we got a new one
            if create_res.get("token"):
                self.token = create_res["token"]
            
            # Try status again
            status_resp = self.status()
            state = (status_resp.get("state") or status_resp.get("status", "")).upper()

        if state == "CONNECTED":
            device_info = self.get_host_device()
            return {
                "status": "CONNECTED",
                "message": "Session is already active and connected.",
                "device": device_info,
                "session": self.session,
                "token": self.token,
            }
        elif state in {"QRCODE", "DISCONNECTED", "UNPAIRED", ""} and auto_register:
            start_res = self.start_session()

            qr_resp = self.qrcode()
            qrcode_b64 = qr_resp.get("qrcode_base64") or qr_resp.get("qr") or qr_resp.get("qrcode")

            return {
                "status": "AWAITING_QR_SCAN",
                "message": "Session created or started. Awaiting QR Code scan.",
                "qrcode": qrcode_b64,
                "session": self.session,
                "token": self.token,
            }

        return {
            "status": state,
            "message": f"Session status: {state}",
            "details": status_resp,
        }

    # 1. Instance/session related

    def status(self) -> dict:
        """GET /session/status/{sessionId}"""
        result = self.send_rest_request(f"session/status/{self.session}", method="GET")
        
        # Normalize WWebJS response to WPPConnect format
        # WWebJS returns: {"success": true/false, "state": "CONNECTED"|null, "message": "session_connected"|"session_not_connected"|...}
        # WPPConnect expects: {"status": "CONNECTED"|"QRCODE"|"DISCONNECTED"|"", ...}
        
        # Map WWebJS messages to status values
        message = result.get("message", "")
        state = result.get("state")
        
        if message == "session_not_found":
            # Session doesn't exist - set empty status to trigger creation
            result["status"] = ""
        elif message in ["browser tab closed", "session closed"]:
            # Session is closed/dead - set empty status to trigger recreation
            result["status"] = ""
        elif message == "session_not_connected":
            # Session exists but not connected - use the state value (QRCODE, DISCONNECTED, etc.)
            result["status"] = state if state else "DISCONNECTED"
        elif message == "session_connected":
            # Session is connected
            result["status"] = "CONNECTED"
        elif "state" in result and state:
            # Fallback: use state if available
            result["status"] = state
        elif "error" in result and not result.get("ok"):
            # Handle error cases - set empty status so register_session can handle it
            result["status"] = ""
        else:
            # Unknown state - set empty to be safe
            result["status"] = ""
        
        return result

    def show_all_sessions(self) -> dict:
        """GET /session/getSessions"""
        return self.send_rest_request("session/getSessions", method="GET")

    def check_connection(self) -> dict:
        """GET /client/getState/{sessionId}"""
        return self.send_rest_request(f"client/getState/{self.session}", method="GET")

    def start_session(self, webhook: str = "", wait_qr_code: bool = False) -> dict:
        """GET /session/start/{sessionId}"""
        # Note: WWebJS doesn't support webhook parameter in start endpoint
        return self.send_rest_request(f"session/start/{self.session}", method="GET")

    def close_session(self) -> dict:
        """GET /session/stop/{sessionId}"""
        return self.send_rest_request(f"session/stop/{self.session}", method="GET")

    def logout_session(self) -> None:
        """GET /session/terminate/{sessionId}"""
        self.send_rest_request(f"session/terminate/{self.session}", method="GET")

    def qrcode(self) -> dict:
        """GET /session/qr/{sessionId}/image - Returns QR code as base64 image"""
        try:
            # Get QR code as PNG image
            response = self.send_rest_request(f"session/qr/{self.session}/image", method="GET")
            
            # Convert image to base64
            qr_base64 = base64.b64encode(response["raw"]).decode("ascii")
            return {
                "ok": True,
                "qrcode_base64": qr_base64,
                "qrcode": qr_base64
            }
        except requests.RequestException as e:
            self.logger.error(f"Failed to get QR code: {str(e)}")
            return {"ok": False, "error": str(e)}

    def get_host_device(self) -> dict:
        """GET /client/getClassInfo/{sessionId}"""
        return self.send_rest_request(f"client/getClassInfo/{self.session}", method="GET")

    def profile_exists(self) -> dict:
        """Not directly supported in WWebJS"""
        return {"ok": False, "error": "profile_exists not supported in WWebJS"}

    def create_session(self) -> dict:
        """GET /session/start/{sessionId} - Start/create session in WWebJS"""
        if not self.secret_key:
            # For compatibility with WPPConnect tests
            return {"ok": False, "error": "secret_key required"}
        
        # In WWebJS, starting a session is equivalent to creating it
        result = self.send_rest_request(f"session/start/{self.session}", method="GET")
        
        # Add token to response for compatibility
        if result.get("ok") or result.get("success"):
            result["token"] = self.token
            result["session"] = self.session
        
        return result

    # 2. Messaging

    def send_message(
        self,
        phone: str,
        message: str,
        is_group: bool = False,
        is_newsletter: bool = False,
        message_id: str = "",
        options: Optional[dict] = None,
    ) -> dict:
        """POST /client/sendMessage/{sessionId}"""
        chat_id = self._format_chat_id(phone, is_group)

        data = {
            "chatId": chat_id,
            "contentType": "string",
            "content": message,
        }

        if message_id:
            data["options"] = {"quotedMessageId": message_id}
        elif options:
            data["options"] = options

        return self.send_rest_request(f"client/sendMessage/{self.session}", data=data)

    def send_reply(
        self, phone: str, message: str, message_id: str, is_group: bool = False
    ) -> dict:
        """POST /client/sendMessage/{sessionId} with quotedMessageId"""
        return self.send_message(phone, message, is_group, message_id=message_id)

    def send_location(
        self,
        phone: str,
        latitude: float,
        longitude: float,
        title: str = "",
        is_group: bool = False,
    ) -> dict:
        """POST /client/sendMessage/{sessionId} with Location"""
        chat_id = self._format_chat_id(phone, is_group)

        data = {
            "chatId": chat_id,
            "contentType": "Location",
            "content": {
                "latitude": latitude,
                "longitude": longitude,
                "description": title
            }
        }

        return self.send_rest_request(f"client/sendMessage/{self.session}", data=data)

    def send_contact(self, phone: str, contactid: str, is_group: bool = False) -> dict:
        """POST /client/sendMessage/{sessionId} with Contact"""
        chat_id = self._format_chat_id(phone, is_group)
        contact_chat_id = self._format_chat_id(contactid, False)

        data = {
            "chatId": chat_id,
            "contentType": "Contact",
            "content": {
                "contactId": contact_chat_id
            }
        }

        return self.send_rest_request(f"client/sendMessage/{self.session}", data=data)

    def send_image(
        self,
        phone: str,
        is_group: bool = False,
        is_newsletter: bool = False,
        is_lid: bool = False,
        filename: str = "",
        caption: str = "",
        file_url: str = "",
    ) -> dict:
        """POST /client/sendMessage/{sessionId} with MessageMedia"""
        chat_id = self._format_chat_id(phone, is_group)

        base64_data = self.file_url_to_base64(file_url, force_prefix=False)
        if not base64_data:
            return {"ok": False, "error": "Failed to encode file"}

        file_info = self.get_file_type(url=file_url)

        data = {
            "chatId": chat_id,
            "contentType": "MessageMedia",
            "content": {
                "mimetype": file_info["mime"],
                "data": base64_data,
                "filename": filename or "image.jpg"
            }
        }

        if caption:
            data["options"] = {"caption": caption}

        return self.send_rest_request(f"client/sendMessage/{self.session}", data=data)

    def send_file(
        self,
        phone: str,
        is_group: bool = False,
        is_newsletter: bool = False,
        is_lid: bool = False,
        filename: str = "",
        caption: str = "",
        file_url: str = "",
    ) -> dict:
        """POST /client/sendMessage/{sessionId} with MessageMedia"""
        chat_id = self._format_chat_id(phone, is_group)

        base64_data = self.file_url_to_base64(file_url, force_prefix=False)
        if not base64_data:
            return {"ok": False, "error": "Failed to encode file"}

        file_info = self.get_file_type(url=file_url)

        data = {
            "chatId": chat_id,
            "contentType": "MessageMedia",
            "content": {
                "mimetype": file_info["mime"],
                "data": base64_data,
                "filename": filename or "file"
            }
        }

        if caption:
            data["options"] = {"caption": caption}

        return self.send_rest_request(f"client/sendMessage/{self.session}", data=data)

    def send_file_base64(
        self,
        phone: str,
        base64: str,
        filename: str = "",
        caption: str = "",
        is_group: bool = False,
        is_newsletter: bool = False,
        is_lid: bool = False,
    ) -> dict:
        """POST /client/sendMessage/{sessionId} with MessageMedia"""
        chat_id = self._format_chat_id(phone, is_group)

        # Remove data URI prefix if present
        if "base64," in base64:
            base64 = base64.split("base64,")[1]

        # Detect MIME type from filename
        file_info = self.get_file_type(file_path=filename)

        data = {
            "chatId": chat_id,
            "contentType": "MessageMedia",
            "content": {
                "mimetype": file_info["mime"],
                "data": base64,
                "filename": filename or "file"
            }
        }

        if caption:
            data["options"] = {"caption": caption}

        return self.send_rest_request(f"client/sendMessage/{self.session}", data=data)

    def send_voice(
        self,
        phone: str,
        file_url: str,
        is_group: bool = False,
        quoted_message_id: str = "",
    ) -> dict:
        """POST /client/sendMessage/{sessionId} with MessageMediaFromURL and sendAudioAsVoice"""
        chat_id = self._format_chat_id(phone, is_group)

        data = {
            "chatId": chat_id,
            "contentType": "MessageMediaFromURL",
            "content": file_url,
            "options": {"sendAudioAsVoice": True}
        }

        if quoted_message_id:
            data["options"]["quotedMessageId"] = quoted_message_id

        return self.send_rest_request(f"client/sendMessage/{self.session}", data=data)

    def send_voice_base64(
        self, phone: str, base64_ptt: str, is_group: bool = False
    ) -> dict:
        """POST /client/sendMessage/{sessionId} with MessageMedia as voice"""
        chat_id = self._format_chat_id(phone, is_group)

        # Remove data URI prefix if present
        if "base64," in base64_ptt:
            base64_ptt = base64_ptt.split("base64,")[1]

        data = {
            "chatId": chat_id,
            "contentType": "MessageMedia",
            "content": {
                "mimetype": "audio/ogg; codecs=opus",
                "data": base64_ptt,
                "filename": "voice.ogg"
            },
            "options": {"sendAudioAsVoice": True}
        }

        return self.send_rest_request(f"client/sendMessage/{self.session}", data=data)

    def send_poll_message(
        self,
        phone: str,
        name: str,
        choices: list,
        options: Optional[dict] = None,
        is_group: bool = False,
    ) -> dict:
        """POST /client/sendMessage/{sessionId} with Poll"""
        chat_id = self._format_chat_id(phone, is_group)

        poll_options = {}
        if options and "selectableCount" in options:
            poll_options["allowMultipleAnswers"] = options["selectableCount"] > 1

        data = {
            "chatId": chat_id,
            "contentType": "Poll",
            "content": {
                "pollName": name,
                "pollOptions": choices,
                "options": poll_options
            }
        }

        return self.send_rest_request(f"client/sendMessage/{self.session}", data=data)

    def send_status_message(
        self, phone: str, message: str, is_group: bool, message_id: Optional[str] = None
    ) -> dict:
        """TODO: Status/Story messages - need to investigate WWebJS support"""
        return {"ok": False, "error": "send_status_message not yet implemented for WWebJS"}

    def send_link_preview(
        self, phone: str, url: str, caption: str, is_group: bool = False
    ) -> dict:
        """TODO: Link previews may be automatic in WWebJS"""
        # Try sending as regular message - WWebJS may auto-generate preview
        return self.send_message(phone, f"{caption}\n{url}", is_group)

    def send_mentioned_message(
        self, phone: str, message: str, mentioned: List[str], is_group: bool = True
    ) -> dict:
        """TODO: Mentioned messages - need to check WWebJS options"""
        return {"ok": False, "error": "send_mentioned_message not yet implemented for WWebJS"}

    def send_buttons_message(
        self, phone: str, text: str, buttons: List[dict], is_group: bool = False
    ) -> dict:
        """TODO: Button messages - deprecated in WPPConnect, may not exist in WWebJS"""
        return {"ok": False, "error": "send_buttons_message deprecated and not supported in WWebJS"}

    def send_list_message(
        self,
        phone: str,
        description: str,
        button_text: str,
        sections: List[dict],
        is_group: bool = False,
    ) -> dict:
        """TODO: List messages - need to check WWebJS support"""
        return {"ok": False, "error": "send_list_message not yet implemented for WWebJS"}

    def send_order_message(
        self,
        phone: str,
        items: List[dict],
        is_group: bool = False,
        options: Optional[dict] = None,
    ) -> dict:
        """TODO: Order messages - Business API feature"""
        return {"ok": False, "error": "send_order_message not yet implemented for WWebJS"}

    # 3. Groups

    def create_group(self, name: str, participants: List[str]) -> dict:
        """POST /client/createGroup/{sessionId}"""
        formatted_participants = [self._format_chat_id(p, False) for p in participants]

        data = {
            "title": name,
            "participants": formatted_participants
        }

        return self.send_rest_request(f"client/createGroup/{self.session}", data=data)

    def group_members(self, group_id: str) -> dict:
        """POST /group/getParticipants/{sessionId}"""
        if not group_id:
            return {}
        group_chat_id = self._format_chat_id(group_id, True)
        data = {"groupId": group_chat_id}
        return self.send_rest_request(f"group/getParticipants/{self.session}", data=data)

    def leave_group(self, group_id: str) -> dict:
        """POST /group/leaveGroup/{sessionId}"""
        group_chat_id = self._format_chat_id(group_id, True)
        data = {"groupId": group_chat_id}
        return self.send_rest_request(f"group/leaveGroup/{self.session}", data=data)

    def add_group_participant(self, group_id: str, phone: str) -> dict:
        """POST /group/addParticipant/{sessionId}"""
        group_chat_id = self._format_chat_id(group_id, True)
        participant_id = self._format_chat_id(phone, False)
        data = {
            "groupId": group_chat_id,
            "participantId": participant_id
        }
        return self.send_rest_request(f"group/addParticipant/{self.session}", data=data)

    def remove_group_participant(self, group_id: str, phone: str) -> dict:
        """POST /group/removeParticipant/{sessionId}"""
        group_chat_id = self._format_chat_id(group_id, True)
        participant_id = self._format_chat_id(phone, False)
        data = {
            "groupId": group_chat_id,
            "participantId": participant_id
        }
        return self.send_rest_request(f"group/removeParticipant/{self.session}", data=data)

    def promote_group_admin(self, group_id: str, phone: str) -> dict:
        """POST /group/promoteParticipant/{sessionId}"""
        group_chat_id = self._format_chat_id(group_id, True)
        participant_id = self._format_chat_id(phone, False)
        data = {
            "groupId": group_chat_id,
            "participantId": participant_id
        }
        return self.send_rest_request(f"group/promoteParticipant/{self.session}", data=data)

    def demote_group_admin(self, group_id: str, phone: str) -> dict:
        """POST /group/demoteParticipant/{sessionId}"""
        group_chat_id = self._format_chat_id(group_id, True)
        participant_id = self._format_chat_id(phone, False)
        data = {
            "groupId": group_chat_id,
            "participantId": participant_id
        }
        return self.send_rest_request(f"group/demoteParticipant/{self.session}", data=data)

    def set_group_subject(self, group_id: str, title: str) -> dict:
        """POST /group/setSubject/{sessionId}"""
        group_chat_id = self._format_chat_id(group_id, True)
        data = {
            "groupId": group_chat_id,
            "title": title
        }
        return self.send_rest_request(f"group/setSubject/{self.session}", data=data)

    def set_group_description(self, group_id: str, description: str) -> dict:
        """POST /group/setDescription/{sessionId}"""
        group_chat_id = self._format_chat_id(group_id, True)
        data = {
            "groupId": group_chat_id,
            "description": description
        }
        return self.send_rest_request(f"group/setDescription/{self.session}", data=data)

    # 4. Contacts

    def get_contacts(self) -> dict:
        """GET /client/getContacts/{sessionId}"""
        return self.send_rest_request(f"client/getContacts/{self.session}", method="GET")

    def get_contact(self, phone: str) -> dict:
        """POST /client/getContactById/{sessionId}"""
        contact_id = self._format_chat_id(phone, False)
        data = {"contactId": contact_id}
        return self.send_rest_request(f"client/getContactById/{self.session}", data=data)

    def block_contact(self, phone: str, is_group: bool = False) -> dict:
        """POST /contact/block/{sessionId}"""
        contact_id = self._format_chat_id(phone, is_group)
        data = {"contactId": contact_id}
        return self.send_rest_request(f"contact/block/{self.session}", data=data)

    def unblock_contact(self, phone: str, is_group: bool = False) -> dict:
        """POST /contact/unblock/{sessionId}"""
        contact_id = self._format_chat_id(phone, is_group)
        data = {"contactId": contact_id}
        return self.send_rest_request(f"contact/unblock/{self.session}", data=data)

    def get_blocklist(self) -> dict:
        """POST /client/getBlockedContacts/{sessionId}"""
        return self.send_rest_request(f"client/getBlockedContacts/{self.session}")

    # 5. Chats

    def list_chats(self, options: Optional[dict] = None) -> dict:
        """POST /client/getChats/{sessionId}"""
        data = {"searchOptions": options} if options else {}
        return self.send_rest_request(f"client/getChats/{self.session}", data=data)

    def get_chat_by_id(self, phone: str) -> dict:
        """POST /client/getChatById/{sessionId}"""
        chat_id = self._format_chat_id(phone, False)
        data = {"chatId": chat_id}
        return self.send_rest_request(f"client/getChatById/{self.session}", data=data)

    def clear_chat(self, phone: str, is_group: bool = False) -> dict:
        """POST /chat/clearMessages/{sessionId}"""
        chat_id = self._format_chat_id(phone, is_group)
        data = {"chatId": chat_id}
        return self.send_rest_request(f"chat/clearMessages/{self.session}", data=data)

    def archive_chat(self, phone: str, is_group: bool = False) -> dict:
        """POST /client/archiveChat/{sessionId}"""
        chat_id = self._format_chat_id(phone, is_group)
        data = {"chatId": chat_id}
        return self.send_rest_request(f"client/archiveChat/{self.session}", data=data)

    def unarchive_chat(self, phone: str, is_group: bool = False) -> dict:
        """POST /client/archiveChat/{sessionId} - WWebJS toggles archive state"""
        return self.archive_chat(phone, is_group)

    def set_typing_status(
        self, phone: str, is_group: bool = False, value: bool = True
    ) -> dict:
        """POST /chat/sendStateTyping/{sessionId}"""
        chat_id = self._format_chat_id(phone, is_group)
        data = {"chatId": chat_id}
        # Note: WWebJS typing lasts for 25 seconds, value parameter is ignored
        return self.send_rest_request(f"chat/sendStateTyping/{self.session}", data=data)

    def set_recording_status(
        self, phone: str, is_group: bool = False, duration: int = 5, value: bool = True
    ) -> dict:
        """POST /chat/sendStateRecording/{sessionId}"""
        chat_id = self._format_chat_id(phone, is_group)
        data = {"chatId": chat_id}
        # Note: WWebJS recording lasts for 25 seconds, duration and value parameters are ignored
        return self.send_rest_request(f"chat/sendStateRecording/{self.session}", data=data)

    # 6. Media (Download/Upload helpers) - already implemented as static methods

    # 7. Utility & info

    def device_battery(self) -> dict:
        """GET /device/getBatteryLevel/{sessionId}"""
        return self.send_rest_request(f"device/getBatteryLevel/{self.session}", method="GET")

    def mark_unread(self, chatid: str) -> dict:
        """POST /client/markChatUnread/{sessionId}"""
        data = {"chatId": chatid}
        return self.send_rest_request(f"client/markChatUnread/{self.session}", data=data)

    def read_chat(self, chatid: str) -> dict:
        """POST /chat/sendSeen/{sessionId}"""
        data = {"chatId": chatid}
        return self.send_rest_request(f"chat/sendSeen/{self.session}", data=data)

    def get_profile_picture(self, phone: str) -> dict:
        """POST /client/getProfilePicUrl/{sessionId}"""
        contact_id = self._format_chat_id(phone, False)
        data = {"contactId": contact_id}
        return self.send_rest_request(f"client/getProfilePicUrl/{self.session}", data=data)

    def get_message_by_id(self, message_id: str) -> dict:
        """POST /message/getMessageById/{sessionId}"""
        data = {"messageId": message_id}
        return self.send_rest_request(f"message/getMessageById/{self.session}", data=data)

    def forward_messages(
        self, phone: str, message_ids: list, is_group: bool = False
    ) -> dict:
        """POST /message/forward/{sessionId}"""
        chat_id = self._format_chat_id(phone, is_group)
        data = {
            "chatId": chat_id,
            "messageIds": message_ids
        }
        return self.send_rest_request(f"message/forward/{self.session}", data=data)

    def delete_message(
        self,
        phone: str,
        message_id: str,
        is_group: bool = False,
        only_local: bool = False,
        delete_media_in_device: bool = False,
    ) -> dict:
        """POST /message/delete/{sessionId}"""
        chat_id = self._format_chat_id(phone, is_group)
        data = {
            "chatId": chat_id,
            "messageId": message_id,
            "onlyLocal": only_local
            # Note: delete_media_in_device parameter not supported in WWebJS
        }
        return self.send_rest_request(f"message/delete/{self.session}", data=data)

    # Profile

    def change_username(self, name: str) -> dict:
        """POST /client/setDisplayName/{sessionId}"""
        data = {"displayName": name}
        return self.send_rest_request(f"client/setDisplayName/{self.session}", data=data)

    def set_profile_status(self, status: str) -> dict:
        """POST /client/setStatus/{sessionId}"""
        data = {"status": status}
        return self.send_rest_request(f"client/setStatus/{self.session}", data=data)

    def set_profile_pic(self, file_data: bytes) -> dict:
        """POST /client/setProfilePicture/{sessionId}"""
        # Convert bytes to base64
        base64_data = base64.b64encode(file_data).decode("utf-8")
        
        data = {"base64": base64_data}
        return self.send_rest_request(f"client/setProfilePicture/{self.session}", data=data)

    # Catalog & Business

    def add_product(self, product_data: Dict[str, str]) -> dict:
        """TODO: Business API - add product"""
        return {"ok": False, "error": "add_product not yet implemented for WWebJS"}

    def edit_product(self, product_id: str, options: dict) -> dict:
        """TODO: Business API - edit product"""
        return {"ok": False, "error": "edit_product not yet implemented for WWebJS"}

    def delete_product(self, product_id: str) -> dict:
        """TODO: Business API - delete product"""
        return {"ok": False, "error": "delete_product not yet implemented for WWebJS"}

    def change_product_image(self, product_id: str, base64_image: str) -> dict:
        """TODO: Business API - change product image"""
        return {"ok": False, "error": "change_product_image not yet implemented for WWebJS"}

    def get_products(
        self, phone: Optional[str] = None, qnt: Optional[int] = None
    ) -> dict:
        """TODO: Business API - get products"""
        return {"ok": False, "error": "get_products not yet implemented for WWebJS"}

    # Misc

    def health_check(self) -> dict:
        """GET /ping"""
        return self.send_rest_request("ping", method="GET")

    def get_metrics(self) -> dict:
        """Not supported in WWebJS"""
        return {"ok": False, "error": "get_metrics not supported in WWebJS"}

    @classmethod
    def translate_wwebjs_to_wppconnect(wwebjs_data):
        """
        Translates message data from WWEBJS format to WPPConnect format.

        Args:
            wwebjs_data (dict): Message data in WWEBJS format

        Returns:
            dict: Message data in WPPConnect format
        """
        # Extract the message data from WWEBJS structure
        message = wwebjs_data.get('data', {}).get('message', {})
        msg_data = message.get('_data', {})
        msg_id = msg_data.get('id', {})

        # Build WPPConnect format
        wppconnect_data = {
            # WPPConnect specific fields
            "event": "onmessage",
            "session": wwebjs_data.get('sessionId', 'Dispatcher'),

            # ID fields
            "id": msg_id.get('_serialized', ''),

            # Message content fields - from _data
            "viewed": msg_data.get('viewed', False),
            "body": msg_data.get('body', ''),
            "type": msg_data.get('type', 'chat'),
            "t": msg_data.get('t', 0),
            "notifyName": msg_data.get('notifyName', ''),
            "from": msg_data.get('from', ''),
            "to": msg_data.get('to', ''),
            "ack": msg_data.get('ack', 0),
            "invis": msg_data.get('invis', False),
            "isNewMsg": msg_data.get('isNewMsg', True),
            "star": msg_data.get('star', False),
            "kicNotified": msg_data.get('kicNotified', False),
            "recvFresh": msg_data.get('recvFresh', True),
            "isFromTemplate": msg_data.get('isFromTemplate', False),
            "pollInvalidated": msg_data.get('pollInvalidated', False),
            "isSentCagPollCreation": msg_data.get('isSentCagPollCreation', False),
            "latestEditMsgKey": msg_data.get('latestEditMsgKey'),
            "latestEditSenderTimestampMs": msg_data.get('latestEditSenderTimestampMs'),
            "mentionedJidList": msg_data.get('mentionedJidList', []),
            "groupMentions": msg_data.get('groupMentions', []),
            "isEventCanceled": msg_data.get('isEventCanceled', False),
            "eventInvalidated": msg_data.get('eventInvalidated', False),
            "isVcardOverMmsDocument": msg_data.get('isVcardOverMmsDocument', False),
            "isForwarded": msg_data.get('isForwarded', False),
            "isQuestion": msg_data.get('isQuestion', False),
            "hasReaction": msg_data.get('hasReaction', False),
            "viewMode": msg_data.get('viewMode', 'VISIBLE'),
            "messageSecret": msg_data.get('messageSecret', {}),
            "productHeaderImageRejected": msg_data.get('productHeaderImageRejected', False),
            "lastPlaybackProgress": msg_data.get('lastPlaybackProgress', 0),
            "isDynamicReplyButtonsMsg": msg_data.get('isDynamicReplyButtonsMsg', False),
            "isCarouselCard": msg_data.get('isCarouselCard', False),
            "parentMsgId": msg_data.get('parentMsgId'),
            "callSilenceReason": msg_data.get('callSilenceReason'),
            "isVideoCall": msg_data.get('isVideoCall', False),
            "callDuration": msg_data.get('callDuration'),
            "callCreator": msg_data.get('callCreator'),
            "callParticipants": msg_data.get('callParticipants'),
            "isCallLink": msg_data.get('isCallLink'),
            "callLinkToken": msg_data.get('callLinkToken'),
            "isMdHistoryMsg": msg_data.get('isMdHistoryMsg', False),
            "stickerSentTs": msg_data.get('stickerSentTs', 0),
            "isAvatar": msg_data.get('isAvatar', False),
            "lastUpdateFromServerTs": msg_data.get('lastUpdateFromServerTs', 0),
            "invokedBotWid": msg_data.get('invokedBotWid'),
            "bizBotType": msg_data.get('bizBotType'),
            "botResponseTargetId": msg_data.get('botResponseTargetId'),
            "botPluginType": msg_data.get('botPluginType'),
            "botPluginReferenceIndex": msg_data.get('botPluginReferenceIndex'),
            "botPluginSearchProvider": msg_data.get('botPluginSearchProvider'),
            "botPluginSearchUrl": msg_data.get('botPluginSearchUrl'),
            "botPluginSearchQuery": msg_data.get('botPluginSearchQuery'),
            "botPluginMaybeParent": msg_data.get('botPluginMaybeParent', False),
            "botReelPluginThumbnailCdnUrl": msg_data.get('botReelPluginThumbnailCdnUrl'),
            "botMessageDisclaimerText": msg_data.get('botMessageDisclaimerText'),
            "botMsgBodyType": msg_data.get('botMsgBodyType'),
            "reportingTokenInfo": msg_data.get('reportingTokenInfo', {}),
            "requiresDirectConnection": msg_data.get('requiresDirectConnection'),
            "bizContentPlaceholderType": msg_data.get('bizContentPlaceholderType'),
            "hostedBizEncStateMismatch": msg_data.get('hostedBizEncStateMismatch', False),
            "senderOrRecipientAccountTypeHosted": msg_data.get('senderOrRecipientAccountTypeHosted', False),
            "placeholderCreatedWhenAccountIsHosted": msg_data.get('placeholderCreatedWhenAccountIsHosted', False),

            # WPPConnect specific fields from message level
            "chatId": msg_data.get('from', ''),
            "fromMe": msg_id.get('fromMe', False),
            "timestamp": msg_data.get('t', 0),
            "content": msg_data.get('body', ''),
            "isGroupMsg": '@g.us' in msg_data.get('from', ''),
            "mediaData": {}
        }

        # Build sender object for WPPConnect
        sender_id = msg_data.get('from', '')
        wppconnect_data["sender"] = {
            "id": sender_id,
            "name": msg_data.get('notifyName', ''),
            "shortName": msg_data.get('notifyName', ''),
            "pushname": msg_data.get('notifyName', ''),
            "type": "in",
            "isBusiness": False,
            "isEnterprise": False,
            "isSmb": False,
            "isContactSyncCompleted": 0,
            "textStatusLastUpdateTime": -1,
            "syncToAddressbook": True,
            "formattedName": msg_data.get('notifyName', ''),
            "isMe": False,
            "isMyContact": True,
            "isPSA": False,
            "isUser": True,
            "isWAContact": True,
            "profilePicThumbObj": {
                "id": sender_id,
                "tag": ""
            },
            "msgs": None
        }

        return wppconnect_data

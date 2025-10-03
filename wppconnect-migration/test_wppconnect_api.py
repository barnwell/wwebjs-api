"""Unit tests for WPPConnectAPI class."""

import base64
import json
import os
import tempfile
import time
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

import pytest
import requests

from wwebjs_wppconnect_wrapper import WPPConnectAPI


class TestWPPConnectAPIInit:
    """Tests for WPPConnectAPI initialization."""

    def test_init_basic(self):
        """Test basic initialization."""
        api = WPPConnectAPI(
            api_url="http://localhost:8080",
            session="test_session",
            token="test_token"
        )
        assert api.api_url == "http://localhost:8080"
        assert api.session == "test_session"
        assert api.token == "test_token"
        assert api.timeout == 10.0

    def test_init_with_trailing_slash(self):
        """Test that trailing slash is removed from api_url."""
        api = WPPConnectAPI(
            api_url="http://localhost:8080/",
            session="test_session",
            token="test_token"
        )
        assert api.api_url == "http://localhost:8080"

    def test_init_with_secret_key(self):
        """Test initialization with secret key."""
        api = WPPConnectAPI(
            api_url="http://localhost:8080",
            session="test_session",
            token="test_token",
            secret_key="my_secret"
        )
        assert api.secret_key == "my_secret"

    def test_init_with_custom_timeout(self):
        """Test initialization with custom timeout."""
        api = WPPConnectAPI(
            api_url="http://localhost:8080",
            session="test_session",
            token="test_token",
            timeout=30.0
        )
        assert api.timeout == 30.0

    @patch.dict(os.environ, {"WPP_SECRET_KEY": "env_secret"})
    def test_init_secret_key_from_env(self):
        """Test that secret key is loaded from environment."""
        api = WPPConnectAPI(
            api_url="http://localhost:8080",
            session="test_session",
            token="test_token"
        )
        assert api.secret_key == "env_secret"


class TestSendRestRequest:
    """Tests for send_rest_request method."""

    @patch('requests.request')
    def test_successful_post_request(self, mock_request):
        """Test successful POST request."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.content = b'{"status": "success"}'
        mock_response.json.return_value = {"status": "success"}
        mock_request.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.send_rest_request("send-message", data={"phone": "1234567890"})

        assert result == {"status": "success"}
        mock_request.assert_called_once()

    @patch('requests.request')
    def test_successful_get_request(self, mock_request):
        """Test successful GET request."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.content = b'{"data": "test"}'
        mock_response.json.return_value = {"data": "test"}
        mock_request.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.send_rest_request("status-session", method="GET")

        assert result == {"data": "test"}

    @patch('requests.request')
    def test_request_timeout(self, mock_request):
        """Test request timeout handling."""
        mock_request.side_effect = requests.Timeout()

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123", timeout=5.0)
        result = api.send_rest_request("send-message")

        assert result["ok"] is False
        assert "Timeout after 5.0 seconds" in result["error"]

    @patch('requests.request')
    def test_request_exception(self, mock_request):
        """Test request exception handling."""
        mock_request.side_effect = requests.RequestException("Connection error")

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.send_rest_request("send-message")

        assert result["ok"] is False
        assert "Connection error" in result["error"]

    @patch('requests.request')
    def test_empty_response(self, mock_request):
        """Test handling of empty response."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.content = b''
        mock_request.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.send_rest_request("close-session")

        assert result == {"ok": True, "no_content": True}

    @patch('requests.request')
    def test_use_full_url(self, mock_request):
        """Test using full URL instead of constructing it."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.content = b'{"ok": true}'
        mock_response.json.return_value = {"ok": True}
        mock_request.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        api.send_rest_request(
            "http://example.com/api/endpoint",
            use_full_url=True
        )

        call_args = mock_request.call_args
        assert call_args[1]["url"] == "http://example.com/api/endpoint"


class TestParseInboundMessage:
    """Tests for parse_inbound_message static method."""

    def test_parse_chat_message(self):
        """Test parsing a chat message."""
        request = {
            "event": "onmessage",
            "id": "msg123",
            "type": "chat",
            "from": "1234567890@c.us",
            "to": "0987654321@c.us",
            "body": "Hello World",
            "fromMe": False,
            "notifyName": "John Doe"
        }

        result = WPPConnectAPI.parse_inbound_message(request)

        assert result["message_id"] == "msg123"
        assert result["message_type"] == "chat"
        assert result["sender"] == "1234567890"
        assert result["receiver"] == "0987654321"
        assert result["body"] == "Hello World"
        assert result["fromMe"] is False
        assert result["sender_name"] == "John Doe"

    def test_parse_image_message(self):
        """Test parsing an image message."""
        request = {
            "event": "onmessage",
            "id": "msg456",
            "type": "image",
            "from": "1234567890@c.us",
            "body": "base64imagedata",
            "filename": "photo.jpg",
            "mimetype": "image/jpeg",
            "caption": "Check this out"
        }

        result = WPPConnectAPI.parse_inbound_message(request)

        assert result["message_type"] == "image"
        assert result["media"] == "base64imagedata"
        assert result["filename"] == "photo.jpg"
        assert result["mime_type"] == "image/jpeg"
        assert result["caption"] == "Check this out"

    def test_parse_group_message(self):
        """Test parsing a group message."""
        request = {
            "event": "onmessage",
            "id": "msg789",
            "type": "chat",
            "from": "group123@g.us",
            "author": "1234567890@c.us",
            "body": "Group message",
            "isGroupMsg": True
        }

        result = WPPConnectAPI.parse_inbound_message(request)

        assert result["isGroup"] is True
        assert result["author"] == "1234567890"
        assert result["sender"] == "group123@g.us"

    def test_parse_poll_response(self):
        """Test parsing a poll response."""
        request = {
            "event": "onpollresponse",
            "msgId": {"_serialized": "poll123"},
            "selectedOptions": ["option1"],
            "chatId": "1234567890@c.us"
        }

        result = WPPConnectAPI.parse_inbound_message(request)

        assert result["message_type"] == "poll"
        assert result["poll_id"] == "poll123"
        assert result["selectedOptions"] == ["option1"]
        assert result["sender"] == "1234567890"

    def test_parse_quoted_message(self):
        """Test parsing a message with quoted reply."""
        request = {
            "event": "onmessage",
            "id": "msg999",
            "type": "chat",
            "from": "1234567890@c.us",
            "body": "Reply text",
            "quotedMsg": {
                "id": "original_msg",
                "body": "Original message"
            }
        }

        result = WPPConnectAPI.parse_inbound_message(request)

        assert "quoted_message" in result
        assert result["quoted_message"]["id"] == "original_msg"

    def test_parse_invalid_event(self):
        """Test parsing message with invalid event type."""
        request = {
            "event": "invalid_event",
            "id": "msg000"
        }

        result = WPPConnectAPI.parse_inbound_message(request)

        assert result == {}

    def test_parse_exception_handling(self):
        """Test exception handling in parse."""
        request = None

        result = WPPConnectAPI.parse_inbound_message(request)

        assert result == {}


class TestGetFileType:
    """Tests for get_file_type static method."""

    def test_image_file_type(self):
        """Test detecting image file type."""
        result = WPPConnectAPI.get_file_type(file_path="photo.jpg")
        assert result["file_type"] == "image"
        assert "image/jpeg" in result["mime"]

    def test_document_file_type(self):
        """Test detecting document file type."""
        result = WPPConnectAPI.get_file_type(file_path="document.pdf")
        assert result["file_type"] == "document"
        assert "application/pdf" in result["mime"]

    def test_audio_file_type(self):
        """Test detecting audio file type."""
        result = WPPConnectAPI.get_file_type(file_path="audio.mp3")
        assert result["file_type"] == "audio"
        assert "audio/mpeg" in result["mime"]

    def test_video_file_type(self):
        """Test detecting video file type."""
        result = WPPConnectAPI.get_file_type(file_path="video.mp4")
        assert result["file_type"] == "video"
        assert "video/mp4" in result["mime"]

    @patch('requests.head')
    def test_url_file_type(self, mock_head):
        """Test detecting file type from URL."""
        mock_response = Mock()
        mock_response.headers = {"Content-Type": "image/png"}
        mock_head.return_value = mock_response

        result = WPPConnectAPI.get_file_type(url="http://example.com/image.png")
        assert result["file_type"] == "image"

    def test_unknown_file_type(self):
        """Test unknown file type."""
        result = WPPConnectAPI.get_file_type(file_path="file.xyz")
        assert result["file_type"] == "unknown"


class TestSessionManagement:
    """Tests for session management methods."""

    @patch('requests.request')
    def test_status(self, mock_request):
        """Test status method."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"status": "CONNECTED"}
        mock_response.content = b'{"status": "CONNECTED"}'
        mock_request.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.status()

        assert result["status"] == "CONNECTED"

    @patch('requests.request')
    def test_start_session(self, mock_request):
        """Test start_session method."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"status": "QRCODE"}
        mock_response.content = b'{"status": "QRCODE"}'
        mock_request.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.start_session(webhook="http://webhook.url")

        assert result["status"] == "QRCODE"

    @patch('requests.request')
    def test_close_session(self, mock_request):
        """Test close_session method."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"ok": True}
        mock_response.content = b'{"ok": true}'
        mock_request.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.close_session()

        assert result["ok"] is True

    @patch('requests.get')
    def test_qrcode(self, mock_get):
        """Test qrcode method."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.content = b'qrcode_image_data'
        mock_get.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.qrcode()

        assert "qrcode_base64" in result
        assert isinstance(result["qrcode_base64"], str)

    @patch('requests.request')
    def test_create_session(self, mock_request):
        """Test create_session method."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"token": "new_token"}
        mock_response.content = b'{"token": "new_token"}'
        mock_request.return_value = mock_response

        api = WPPConnectAPI(
            "http://localhost:8080",
            "session1",
            "token123",
            secret_key="secret"
        )
        result = api.create_session()

        assert result["token"] == "new_token"

    @patch.dict(os.environ, {}, clear=True)
    def test_create_session_no_secret(self):
        """Test create_session without secret key."""
        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.create_session()

        assert result["ok"] is False
        assert "secret_key required" in result["error"]


class TestMessaging:
    """Tests for messaging methods."""

    @patch('requests.request')
    def test_send_message(self, mock_request):
        """Test send_message method."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"ok": True, "id": "msg123"}
        mock_response.content = b'{"ok": true, "id": "msg123"}'
        mock_request.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.send_message("1234567890", "Hello")

        assert result["ok"] is True
        assert result["id"] == "msg123"

    @patch('requests.request')
    def test_send_reply(self, mock_request):
        """Test send_reply method."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"ok": True}
        mock_response.content = b'{"ok": true}'
        mock_request.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.send_reply("1234567890", "Reply", "msg123")

        assert result["ok"] is True

    @patch('requests.request')
    def test_send_location(self, mock_request):
        """Test send_location method."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"ok": True}
        mock_response.content = b'{"ok": true}'
        mock_request.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.send_location("1234567890", 40.7128, -74.0060, "NYC")

        assert result["ok"] is True

    @patch('requests.request')
    def test_send_poll_message(self, mock_request):
        """Test send_poll_message method."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"ok": True}
        mock_response.content = b'{"ok": true}'
        mock_request.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.send_poll_message(
            "1234567890",
            "Poll Title",
            ["Option 1", "Option 2"]
        )

        assert result["ok"] is True


class TestGroups:
    """Tests for group management methods."""

    @patch('requests.request')
    def test_create_group(self, mock_request):
        """Test create_group method."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"ok": True, "groupId": "group123"}
        mock_response.content = b'{"ok": true, "groupId": "group123"}'
        mock_request.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.create_group("Test Group", ["1234567890", "0987654321"])

        assert result["ok"] is True
        assert result["groupId"] == "group123"

    @patch('requests.request')
    def test_group_members(self, mock_request):
        """Test group_members method."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"members": ["1234567890"]}
        mock_response.content = b'{"members": ["1234567890"]}'
        mock_request.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.group_members("group123")

        assert "members" in result

    def test_group_members_empty_id(self):
        """Test group_members with empty group_id."""
        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.group_members("")

        assert result == {}

    @patch('requests.request')
    def test_add_group_participant(self, mock_request):
        """Test add_group_participant method."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"ok": True}
        mock_response.content = b'{"ok": true}'
        mock_request.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.add_group_participant("group123", "1234567890")

        assert result["ok"] is True


class TestContacts:
    """Tests for contact management methods."""

    @patch('requests.request')
    def test_get_contacts(self, mock_request):
        """Test get_contacts method."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"contacts": []}
        mock_response.content = b'{"contacts": []}'
        mock_request.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.get_contacts()

        assert "contacts" in result

    @patch('requests.request')
    def test_block_contact(self, mock_request):
        """Test block_contact method."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"ok": True}
        mock_response.content = b'{"ok": true}'
        mock_request.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.block_contact("1234567890")

        assert result["ok"] is True


class TestFileUrlToBase64:
    """Tests for file_url_to_base64 static method."""

    @patch('requests.get')
    @patch('filetype.guess')
    def test_successful_conversion(self, mock_guess, mock_get):
        """Test successful file URL to base64 conversion."""
        mock_response = Mock()
        mock_response.content = b'test_content'
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        mock_kind = Mock()
        mock_kind.mime = "image/jpeg"
        mock_guess.return_value = mock_kind

        result = WPPConnectAPI.file_url_to_base64("http://example.com/image.jpg")

        assert result.startswith("data:image/jpeg;base64,")
        assert "test_content" in str(base64.b64decode(result.split(",")[1]))

    @patch('requests.get')
    def test_conversion_without_prefix(self, mock_get):
        """Test conversion without MIME prefix."""
        mock_response = Mock()
        mock_response.content = b'test_content'
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        result = WPPConnectAPI.file_url_to_base64(
            "http://example.com/file.txt",
            force_prefix=False
        )

        assert not result.startswith("data:")

    @patch('requests.get')
    def test_conversion_failure(self, mock_get):
        """Test handling of conversion failure."""
        mock_get.side_effect = Exception("Network error")

        result = WPPConnectAPI.file_url_to_base64("http://example.com/image.jpg")

        assert result is None


class TestListFilesInFolder:
    """Tests for list_files_in_folder method."""

    def test_list_all_files(self):
        """Test listing all files in folder."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create test files
            Path(tmpdir, "file1.txt").touch()
            Path(tmpdir, "file2.txt").touch()

            api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
            files = api.list_files_in_folder(tmpdir)

            assert len(files) == 2
            assert "file1.txt" in files
            assert "file2.txt" in files

    def test_list_recent_files(self):
        """Test listing files created within time window."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create old file
            old_file = Path(tmpdir, "old.txt")
            old_file.touch()
            
            # Modify timestamp to make it old
            old_time = time.time() - 100
            os.utime(old_file, (old_time, old_time))

            # Create new file
            time.sleep(0.1)
            Path(tmpdir, "new.txt").touch()

            api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
            files = api.list_files_in_folder(tmpdir, within_seconds=10)

            assert "new.txt" in files
            # Note: old.txt might still appear on some systems due to ctime behavior

    def test_create_directory_if_not_exists(self):
        """Test that directory is created if it doesn't exist."""
        with tempfile.TemporaryDirectory() as tmpdir:
            new_dir = Path(tmpdir, "new_folder")

            api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
            files = api.list_files_in_folder(str(new_dir))

            assert new_dir.exists()
            assert files == []


class TestRegisterSession:
    """Tests for register_session method."""

    @patch.object(WPPConnectAPI, 'status')
    @patch.object(WPPConnectAPI, 'get_host_device')
    @patch.object(WPPConnectAPI, 'start_session')
    def test_register_already_connected(self, mock_start, mock_device, mock_status):
        """Test registration when already connected."""
        mock_status.return_value = {"status": "CONNECTED"}
        mock_start.return_value = {"status": "CONNECTED"}
        mock_device.return_value = {"phone": "1234567890"}

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.register_session()

        assert result["status"] == "CONNECTED"
        assert "device" in result

    @patch.object(WPPConnectAPI, 'status')
    @patch.object(WPPConnectAPI, 'start_session')
    @patch.object(WPPConnectAPI, 'qrcode')
    def test_register_needs_qr(self, mock_qr, mock_start, mock_status):
        """Test registration when QR code is needed."""
        mock_status.return_value = {"status": "QRCODE"}
        mock_start.return_value = {"status": "QRCODE"}
        mock_qr.return_value = {"qrcode": "base64qrcode"}

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.register_session()

        assert result["status"] == "AWAITING_QR_SCAN"
        assert "qrcode" in result

    @patch.object(WPPConnectAPI, 'status')
    @patch.object(WPPConnectAPI, 'create_session')
    def test_register_unauthorized(self, mock_create, mock_status):
        """Test registration when unauthorized."""
        mock_status.return_value = {"error": "Unauthorized"}
        mock_create.return_value = {"token": "new_token"}

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        # This will fail on second status call, but tests the flow
        result = api.register_session(auto_register=False)

        mock_create.assert_called_once()


class TestUtilityMethods:
    """Tests for utility methods."""

    @patch('requests.request')
    def test_device_battery(self, mock_request):
        """Test device_battery method."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"battery": 85}
        mock_response.content = b'{"battery": 85}'
        mock_request.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.device_battery()

        assert result["battery"] == 85

    @patch('requests.request')
    def test_get_profile_picture(self, mock_request):
        """Test get_profile_picture method."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"url": "http://pic.url"}
        mock_response.content = b'{"url": "http://pic.url"}'
        mock_request.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.get_profile_picture("1234567890")

        assert "url" in result

    @patch('requests.request')
    def test_forward_messages(self, mock_request):
        """Test forward_messages method."""
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"ok": True}
        mock_response.content = b'{"ok": true}'
        mock_request.return_value = mock_response

        api = WPPConnectAPI("http://localhost:8080", "session1", "token123")
        result = api.forward_messages("1234567890", ["msg1", "msg2"])

        assert result["ok"] is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

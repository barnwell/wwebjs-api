/**
 * Default configuration for wwebjs-api instances
 * This file contains all available environment variables with their default values
 * Modify this file to change the default configuration for new instances
 */

module.exports = {
  // Application Configuration
  PORT: '3000',
  API_KEY: 'SET_YOUR_API_KEY_HERE',
  BASE_WEBHOOK_URL: 'http://localhost:3000/localCallbackExample',
  ENABLE_LOCAL_CALLBACK_EXAMPLE: 'TRUE',
  RATE_LIMIT_MAX: '1000',
  RATE_LIMIT_WINDOW_MS: '1000',
  
  // Client Configuration
  MAX_ATTACHMENT_SIZE: '10000000',
  SET_MESSAGES_AS_SEEN: 'TRUE',
  DISABLED_CALLBACKS: 'message_ack|message_reaction|unread_count|message_edit|message_ciphertext|message_create',
  WEB_VERSION: '2.2328.5',
  WEB_VERSION_CACHE_TYPE: 'none',
  RECOVER_SESSIONS: 'TRUE',
  CHROME_BIN: '',
  HEADLESS: 'TRUE',
  RELEASE_BROWSER_LOCK: 'TRUE',
  LOG_LEVEL: 'info',
  ENABLE_WEBHOOK: 'TRUE',
  ENABLE_WEBSOCKET: 'FALSE',
  AUTO_START_SESSIONS: 'TRUE',
  
  // Session File Storage
  SESSIONS_PATH: './sessions',
  ENABLE_SWAGGER_ENDPOINT: 'TRUE',
  
  // Reverse Proxy / Load Balancer
  BASE_PATH: '',
  TRUST_PROXY: 'FALSE',
  
  // Available callback types for DISABLED_CALLBACKS:
  // - auth_failure: Authentication failures
  // - authenticated: Successful authentication
  // - call: Voice/video calls
  // - change_state: Session state changes
  // - disconnected: Disconnection events
  // - group_join: User joins group
  // - group_leave: User leaves group
  // - group_update: Group information updates
  // - loading_screen: Loading screen events
  // - media_uploaded: Media upload completion
  // - message: New messages
  // - message_ack: Message acknowledgments
  // - message_create: Message creation events
  // - message_reaction: Message reactions
  // - message_revoke_everyone: Message revocations
  // - qr: QR code generation
  // - ready: Session ready
  // - contact_changed: Contact information changes
  // - unread_count: Unread message count
  // - message_edit: Message edits
  // - message_ciphertext: Encrypted message content
};

/**
 * Communication Module
 * Exports communication components for inter-agent messaging
 */

// Protocol
export {
  Protocol,
  createProtocol,
  defaultProtocol,
  MessageBuilder,
  createRequest,
  createResponse,
  createBroadcast,
  createHandoffMessage,
  createStatusMessage,
  createHandoffRequest,
  type MessageEnvelope,
  type ProtocolConfig,
} from './protocol.js';

// Channel Manager
export {
  ChannelManager,
  createChannelManager,
  type CreateChannelOptions,
  type ChannelManagerConfig,
  type ChannelManagerEvents,
} from './channel-manager.js';

// Message Router
export {
  MessageRouter,
  createMessageRouter,
  type MessageHandler,
  type MessageFilter,
  type RouterSubscription,
  type MessageRouterConfig,
  type DeliveryResult,
  type MessageRouterEvents,
} from './message-router.js';

// Collaboration Session
export {
  CollaborationSessionManager,
  createCollaborationSessionManager,
  type CreateSessionOptions,
  type CollaborationSessionConfig,
  type HandoffResult,
  type CollaborationSessionEvents,
} from './collaboration-session.js';

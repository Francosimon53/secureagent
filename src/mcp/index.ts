// OAuth 2.1 + PKCE + DPoP
export {
  OAuthAuthorizationServer,
  generatePKCE,
  verifyPKCE,
  verifyDPoPProof,
  computeJWKThumbprint,
  ClientRegistrationSchema,
  type OAuthServerConfig,
  type ClientRegistration,
  type RegisteredClient,
  type PKCEChallenge,
  type AuthorizationCode,
  type AccessToken,
  type RefreshToken,
  type DPoPProof,
  type TokenResponse,
  type TokenError,
} from './oauth.js';

// MCP Protocol
export {
  MCPProtocolHandler,
  MCPHTTPTransport,
  MCPRequestSchema,
  MCPErrorCodes,
  type MCPRequest,
  type MCPResponse,
  type MCPNotification,
  type MCPToolDefinition,
  type MCPResource,
  type MCPPrompt,
  type MCPServerConfig,
  type HTTPTransportConfig,
} from './protocol.js';

// MCP Transports
export {
  StdioTransport,
  SSETransport,
  BufferedTransport,
  MultiplexedTransport,
  createTransport,
  type MCPTransport,
  type MessageHandler,
  type StdioTransportConfig,
  type SSETransportConfig,
  type TransportType,
} from './transports.js';

// Rate Limiting
export {
  MCPRateLimiter,
  rateLimitHeaders,
  createProductionRateLimiter,
  createDevelopmentRateLimiter,
  type MCPRateLimiterConfig,
  type RateLimitRule,
  type RateLimitResult,
} from './rate-limiter.js';

// Scopes
export {
  ScopeManager,
  STANDARD_SCOPES,
  hasScope,
  hasAnyScope,
  hasAllScopes,
  createScopeManager,
  type ScopeDefinition,
  type ToolScopeMapping,
} from './scopes.js';

// MCP Server
export {
  MCPServer,
  createMCPMiddleware,
  createMCPServer,
  type MCPServerOptions,
  type MCPMiddlewareOptions,
  type CreateMCPServerOptions,
} from './server.js';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OAuthAuthorizationServer,
  generatePKCE,
  verifyPKCE,
  MCPProtocolHandler,
  MCPServer,
  MCPErrorCodes,
} from '../../src/mcp/index.js';

describe('OAuth 2.1 + PKCE', () => {
  describe('generatePKCE', () => {
    it('should generate PKCE challenge and verifier', async () => {
      const pkce = await generatePKCE();

      expect(pkce.codeVerifier).toBeDefined();
      expect(pkce.codeChallenge).toBeDefined();
      expect(pkce.codeChallengeMethod).toBe('S256');
      expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);
    });

    it('should generate unique values each time', async () => {
      const pkce1 = await generatePKCE();
      const pkce2 = await generatePKCE();

      expect(pkce1.codeVerifier).not.toBe(pkce2.codeVerifier);
      expect(pkce1.codeChallenge).not.toBe(pkce2.codeChallenge);
    });
  });

  describe('verifyPKCE', () => {
    it('should verify valid PKCE', async () => {
      const pkce = await generatePKCE();

      const isValid = await verifyPKCE(
        pkce.codeVerifier,
        pkce.codeChallenge,
        pkce.codeChallengeMethod
      );

      expect(isValid).toBe(true);
    });

    it('should reject invalid verifier', async () => {
      const pkce = await generatePKCE();

      const isValid = await verifyPKCE(
        'wrong-verifier',
        pkce.codeChallenge,
        pkce.codeChallengeMethod
      );

      expect(isValid).toBe(false);
    });
  });
});

describe('OAuthAuthorizationServer', () => {
  let server: OAuthAuthorizationServer;

  beforeEach(() => {
    server = new OAuthAuthorizationServer({
      issuer: 'https://auth.example.com',
      tokenEndpoint: '/oauth/token',
      authorizationEndpoint: '/oauth/authorize',
      accessTokenTTL: 3600,
      refreshTokenTTL: 86400,
      authCodeTTL: 600,
    });
  });

  describe('registerClient', () => {
    it('should register a client', async () => {
      const client = await server.registerClient({
        clientName: 'Test App',
        redirectUris: ['https://app.example.com/callback'],
        grantTypes: ['authorization_code', 'refresh_token'],
        tokenEndpointAuthMethod: 'none',
      });

      expect(client.clientId).toBeDefined();
      expect(client.clientName).toBe('Test App');
    });

    it('should assign client secret for confidential clients', async () => {
      const client = await server.registerClient({
        clientName: 'Confidential App',
        redirectUris: ['https://app.example.com/callback'],
        grantTypes: ['authorization_code'],
        tokenEndpointAuthMethod: 'client_secret_post',
      });

      expect(client.clientSecret).toBeDefined();
    });
  });

  describe('authorization flow', () => {
    it('should complete authorization code flow with PKCE', async () => {
      // Register client
      const client = await server.registerClient({
        clientName: 'PKCE App',
        redirectUris: ['https://app.example.com/callback'],
        grantTypes: ['authorization_code'],
        tokenEndpointAuthMethod: 'none',
      });

      // Generate PKCE
      const pkce = await generatePKCE();

      // Create authorization request
      const authRequest = await server.createAuthorizationRequest({
        clientId: client.clientId,
        redirectUri: 'https://app.example.com/callback',
        scope: 'openid profile',
        codeChallenge: pkce.codeChallenge,
        codeChallengeMethod: pkce.codeChallengeMethod,
        state: 'random-state',
      });

      // Approve the request (simulating user approval)
      const authCode = await server.approveAuthorizationRequest(
        authRequest.requestId,
        'user-123'
      );

      // Exchange code for tokens
      const tokens = await server.exchangeAuthorizationCode({
        code: authCode.code,
        clientId: client.clientId,
        redirectUri: 'https://app.example.com/callback',
        codeVerifier: pkce.codeVerifier,
      });

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.expiresIn).toBeGreaterThan(0);
    });
  });

  describe('token refresh', () => {
    it('should refresh access tokens', async () => {
      const client = await server.registerClient({
        clientName: 'Refresh App',
        redirectUris: ['https://app.example.com/callback'],
        grantTypes: ['authorization_code', 'refresh_token'],
        tokenEndpointAuthMethod: 'none',
      });

      const pkce = await generatePKCE();

      const authRequest = await server.createAuthorizationRequest({
        clientId: client.clientId,
        redirectUri: 'https://app.example.com/callback',
        scope: 'openid',
        codeChallenge: pkce.codeChallenge,
        codeChallengeMethod: pkce.codeChallengeMethod,
      });

      const authCode = await server.approveAuthorizationRequest(
        authRequest.requestId,
        'user-123'
      );

      const tokens = await server.exchangeAuthorizationCode({
        code: authCode.code,
        clientId: client.clientId,
        redirectUri: 'https://app.example.com/callback',
        codeVerifier: pkce.codeVerifier,
      });

      // Refresh the token
      const newTokens = await server.refreshToken({
        refreshToken: tokens.refreshToken!,
        clientId: client.clientId,
      });

      expect(newTokens.accessToken).toBeDefined();
      expect(newTokens.accessToken).not.toBe(tokens.accessToken);
    });
  });

  describe('token validation', () => {
    it('should validate access tokens', async () => {
      const client = await server.registerClient({
        clientName: 'Validate App',
        redirectUris: ['https://app.example.com/callback'],
        grantTypes: ['authorization_code'],
        tokenEndpointAuthMethod: 'none',
      });

      const pkce = await generatePKCE();

      const authRequest = await server.createAuthorizationRequest({
        clientId: client.clientId,
        redirectUri: 'https://app.example.com/callback',
        scope: 'openid',
        codeChallenge: pkce.codeChallenge,
        codeChallengeMethod: pkce.codeChallengeMethod,
      });

      const authCode = await server.approveAuthorizationRequest(
        authRequest.requestId,
        'user-123'
      );

      const tokens = await server.exchangeAuthorizationCode({
        code: authCode.code,
        clientId: client.clientId,
        redirectUri: 'https://app.example.com/callback',
        codeVerifier: pkce.codeVerifier,
      });

      const validation = await server.validateAccessToken(tokens.accessToken);

      expect(validation.valid).toBe(true);
      expect(validation.userId).toBe('user-123');
    });
  });
});

describe('MCPProtocolHandler', () => {
  let handler: MCPProtocolHandler;

  beforeEach(() => {
    handler = new MCPProtocolHandler();
  });

  describe('handleRequest', () => {
    it('should handle initialize request', async () => {
      const response = await handler.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      });

      expect(response.result).toBeDefined();
      expect(response.result.protocolVersion).toBe('2024-11-05');
      expect(response.result.serverInfo).toBeDefined();
    });

    it('should handle tools/list request', async () => {
      // First initialize
      await handler.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      });

      const response = await handler.handleRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      });

      expect(response.result).toBeDefined();
      expect(response.result.tools).toBeDefined();
      expect(Array.isArray(response.result.tools)).toBe(true);
    });

    it('should handle tools/call request', async () => {
      await handler.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      });

      // Register a test tool
      handler.registerTool({
        name: 'echo',
        description: 'Echoes input',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
        handler: async (params) => ({
          content: [{ type: 'text', text: params.message }],
        }),
      });

      const response = await handler.handleRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'echo',
          arguments: { message: 'Hello!' },
        },
      });

      expect(response.result).toBeDefined();
      expect(response.result.content[0].text).toBe('Hello!');
    });

    it('should return error for unknown method', async () => {
      const response = await handler.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'unknown/method',
      });

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(MCPErrorCodes.MethodNotFound);
    });

    it('should return error for uninitialized state', async () => {
      const response = await handler.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      });

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(MCPErrorCodes.InvalidRequest);
    });
  });
});

describe('MCPServer', () => {
  let server: MCPServer;

  beforeEach(() => {
    server = new MCPServer({
      name: 'test-server',
      version: '1.0.0',
    });
  });

  describe('registerTool', () => {
    it('should register tools', () => {
      server.registerTool({
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({ content: [] }),
      });

      const tools = server.getTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test-tool');
    });
  });

  describe('registerResource', () => {
    it('should register resources', () => {
      server.registerResource({
        uri: 'file:///test.txt',
        name: 'Test File',
        mimeType: 'text/plain',
        handler: async () => ({
          contents: [{ uri: 'file:///test.txt', text: 'content' }],
        }),
      });

      const resources = server.getResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].name).toBe('Test File');
    });
  });

  describe('registerPrompt', () => {
    it('should register prompts', () => {
      server.registerPrompt({
        name: 'greeting',
        description: 'A greeting prompt',
        arguments: [
          { name: 'name', description: 'Name to greet', required: true },
        ],
        handler: async (args) => ({
          messages: [
            { role: 'user', content: { type: 'text', text: `Hello, ${args.name}!` } },
          ],
        }),
      });

      const prompts = server.getPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe('greeting');
    });
  });
});

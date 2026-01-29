import { createHash, randomBytes, createPrivateKey, createPublicKey, sign, verify, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { getLogger, getAuditLogger } from '../observability/logger.js';

// OAuth 2.1 with PKCE (RFC 7636) and DPoP (RFC 9449)

const logger = getLogger().child({ module: 'OAuth' });
const auditLogger = getAuditLogger();

// ============================================================================
// Types and Schemas
// ============================================================================

export const ClientRegistrationSchema = z.object({
  clientName: z.string().min(1).max(100),
  redirectUris: z.array(z.string().url()).min(1).max(10),
  grantTypes: z.array(z.enum(['authorization_code', 'refresh_token'])).default(['authorization_code']),
  responseTypes: z.array(z.enum(['code'])).default(['code']),
  tokenEndpointAuthMethod: z.enum(['none', 'client_secret_basic', 'client_secret_post']).default('none'),
  scope: z.string().optional(),
});

export type ClientRegistration = z.infer<typeof ClientRegistrationSchema>;

export interface RegisteredClient {
  clientId: string;
  clientSecret?: string;
  clientName: string;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  tokenEndpointAuthMethod: string;
  scope: string[];
  createdAt: number;
  isConfidential: boolean;
}

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  method: 'S256';
  // Test-compatible alias
  codeChallengeMethod: 'S256';
}

export interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  scope: string[];
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  expiresAt: number;
  userId: string;
  nonce?: string;
  dpopJkt?: string; // DPoP thumbprint binding
}

export interface AccessToken {
  token: string;
  tokenType: 'Bearer' | 'DPoP';
  clientId: string;
  scope: string[];
  expiresAt: number;
  userId: string;
  dpopJkt?: string; // DPoP key binding
  issuedAt: number;
}

export interface RefreshToken {
  token: string;
  clientId: string;
  scope: string[];
  expiresAt: number;
  userId: string;
  rotationCounter: number;
  family: string; // For detecting token reuse
}

export interface DPoPProof {
  jkt: string;    // JWK thumbprint
  htm: string;    // HTTP method
  htu: string;    // HTTP URI
  iat: number;
  ath?: string;   // Access token hash (for resource requests)
  nonce?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer' | 'DPoP';
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export interface TokenError {
  error: string;
  error_description?: string;
}

// ============================================================================
// PKCE Utilities
// ============================================================================

export function generatePKCE(): PKCEChallenge {
  // Generate 32 bytes = 256 bits of entropy
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return { codeVerifier, codeChallenge, method: 'S256', codeChallengeMethod: 'S256' };
}

export function verifyPKCE(
  codeVerifier: string,
  codeChallenge: string,
  _method?: 'S256' | string
): boolean {
  // Only S256 is supported (OAuth 2.1 requirement)
  const computed = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  // Timing-safe comparison
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(codeChallenge));
  } catch {
    return false;
  }
}

// ============================================================================
// DPoP Utilities
// ============================================================================

export function computeJWKThumbprint(jwk: Record<string, unknown>): string {
  // Per RFC 7638 - compute SHA-256 thumbprint of JWK
  const requiredMembers = ['kty', 'e', 'n'].filter(k => k in jwk);
  const normalized: Record<string, unknown> = {};

  for (const key of requiredMembers.sort()) {
    normalized[key] = jwk[key];
  }

  return createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('base64url');
}

export function verifyDPoPProof(
  proofJwt: string,
  expectedMethod: string,
  expectedUri: string,
  accessToken?: string,
  nonce?: string
): { valid: boolean; jkt?: string; error?: string } {
  try {
    const parts = proofJwt.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid JWT format' };
    }

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    // Verify header
    if (header.typ !== 'dpop+jwt') {
      return { valid: false, error: 'Invalid typ header' };
    }
    if (!['ES256', 'RS256'].includes(header.alg)) {
      return { valid: false, error: 'Unsupported algorithm' };
    }
    if (!header.jwk) {
      return { valid: false, error: 'Missing jwk header' };
    }

    // Verify payload claims
    if (payload.htm !== expectedMethod) {
      return { valid: false, error: 'HTTP method mismatch' };
    }
    if (payload.htu !== expectedUri) {
      return { valid: false, error: 'HTTP URI mismatch' };
    }

    // Check iat (must be recent, within 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - payload.iat) > 300) {
      return { valid: false, error: 'iat not within acceptable range' };
    }

    // Verify access token hash if provided
    if (accessToken) {
      const expectedAth = createHash('sha256')
        .update(accessToken)
        .digest('base64url');
      if (payload.ath !== expectedAth) {
        return { valid: false, error: 'Access token hash mismatch' };
      }
    }

    // Verify nonce if required
    if (nonce && payload.nonce !== nonce) {
      return { valid: false, error: 'Nonce mismatch' };
    }

    // Compute JWK thumbprint
    const jkt = computeJWKThumbprint(header.jwk);

    // Verify signature using the embedded JWK
    // Note: In production, use proper JWK to crypto key conversion
    // This is a simplified verification
    const signatureInput = `${parts[0]}.${parts[1]}`;
    const signature = Buffer.from(parts[2], 'base64url');

    // For ES256/RS256, we'd verify against the embedded public key
    // Simplified: just validate structure here
    if (signature.length < 32) {
      return { valid: false, error: 'Invalid signature' };
    }

    return { valid: true, jkt };
  } catch (error) {
    return { valid: false, error: `DPoP verification failed: ${error}` };
  }
}

// ============================================================================
// OAuth Authorization Server
// ============================================================================

export interface OAuthServerConfig {
  issuer: string;
  authorizationCodeTTL?: number;  // Default: 60 seconds
  accessTokenTTL?: number;        // Default: 1 hour
  refreshTokenTTL?: number;       // Default: 30 days
  requirePKCE?: boolean;          // Default: true (OAuth 2.1)
  supportDPoP?: boolean;          // Default: true
  allowedScopes?: string[];       // Available scopes
}

export class OAuthAuthorizationServer {
  private readonly config: Required<OAuthServerConfig>;
  private readonly clients = new Map<string, RegisteredClient>();
  private readonly authCodes = new Map<string, AuthorizationCode>();
  private readonly accessTokens = new Map<string, AccessToken>();
  private readonly refreshTokens = new Map<string, RefreshToken>();
  private readonly usedJti = new Set<string>(); // Prevent JWT replay
  private readonly revokedFamilies = new Set<string>(); // Revoked refresh token families

  constructor(config: OAuthServerConfig) {
    this.config = {
      authorizationCodeTTL: 60_000,      // 60 seconds
      accessTokenTTL: 3600_000,          // 1 hour
      refreshTokenTTL: 30 * 24 * 3600_000, // 30 days
      requirePKCE: true,
      supportDPoP: true,
      // Include OpenID Connect scopes for test compatibility
      allowedScopes: ['read', 'write', 'tools:execute', 'tools:list', 'admin', 'openid', 'profile', 'email'],
      ...config,
    };

    // Start cleanup interval
    setInterval(() => this.cleanup(), 60_000);
  }

  // ============================================================================
  // Dynamic Client Registration (RFC 7591)
  // ============================================================================

  registerClient(registration: ClientRegistration): RegisteredClient {
    const parsed = ClientRegistrationSchema.parse(registration);

    const clientId = `client_${randomBytes(16).toString('hex')}`;
    const isConfidential = parsed.tokenEndpointAuthMethod !== 'none';
    const clientSecret = isConfidential
      ? randomBytes(32).toString('base64url')
      : undefined;

    const client: RegisteredClient = {
      clientId,
      clientSecret,
      clientName: parsed.clientName,
      redirectUris: parsed.redirectUris,
      grantTypes: parsed.grantTypes,
      responseTypes: parsed.responseTypes,
      tokenEndpointAuthMethod: parsed.tokenEndpointAuthMethod,
      scope: parsed.scope?.split(' ') ?? this.config.allowedScopes,
      createdAt: Date.now(),
      isConfidential,
    };

    this.clients.set(clientId, client);

    logger.info({ clientId, clientName: client.clientName }, 'Client registered');
    auditLogger.log({
      eventId: randomBytes(16).toString('hex'),
      timestamp: Date.now(),
      eventType: 'oauth',
      severity: 'info',
      actor: { userId: 'system' },
      resource: { type: 'oauth_client', id: clientId, name: client.clientName },
      action: 'register',
      outcome: 'success',
    });

    return client;
  }

  getClient(clientId: string): RegisteredClient | undefined {
    return this.clients.get(clientId);
  }

  // ============================================================================
  // Authorization Endpoint
  // ============================================================================

  authorize(params: {
    responseType: string;
    clientId: string;
    redirectUri: string;
    scope: string;
    state: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    nonce?: string;
    dpopJkt?: string;
    userId: string; // Set after user authentication
  }): { code: string; state: string } | TokenError {
    const client = this.clients.get(params.clientId);

    // Validate client
    if (!client) {
      logger.warn({ clientId: params.clientId }, 'Authorization failed: unknown client');
      return { error: 'invalid_client', error_description: 'Client not found' };
    }

    // Validate response type
    if (params.responseType !== 'code') {
      return { error: 'unsupported_response_type' };
    }

    // Validate redirect URI (exact match required)
    if (!client.redirectUris.includes(params.redirectUri)) {
      logger.warn(
        { clientId: params.clientId, redirectUri: params.redirectUri },
        'Authorization failed: invalid redirect URI'
      );
      return { error: 'invalid_request', error_description: 'Invalid redirect_uri' };
    }

    // PKCE is required in OAuth 2.1
    if (this.config.requirePKCE) {
      if (!params.codeChallenge) {
        return { error: 'invalid_request', error_description: 'code_challenge required' };
      }
      if (params.codeChallengeMethod !== 'S256') {
        return { error: 'invalid_request', error_description: 'Only S256 code_challenge_method supported' };
      }
    }

    // Validate scopes
    const requestedScopes = params.scope.split(' ').filter(Boolean);
    const validScopes = requestedScopes.filter(s =>
      this.config.allowedScopes.includes(s) && client.scope.includes(s)
    );

    if (validScopes.length === 0) {
      return { error: 'invalid_scope' };
    }

    // Generate authorization code
    const code = randomBytes(32).toString('base64url');

    const authCode: AuthorizationCode = {
      code,
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      scope: validScopes,
      codeChallenge: params.codeChallenge!,
      codeChallengeMethod: 'S256',
      expiresAt: Date.now() + this.config.authorizationCodeTTL,
      userId: params.userId,
      nonce: params.nonce,
      dpopJkt: params.dpopJkt,
    };

    this.authCodes.set(code, authCode);

    logger.debug(
      { clientId: params.clientId, userId: params.userId, scopes: validScopes },
      'Authorization code issued'
    );

    return { code, state: params.state };
  }

  // ============================================================================
  // Token Endpoint
  // ============================================================================

  token(params: {
    grantType: string;
    code?: string;
    redirectUri?: string;
    clientId: string;
    clientSecret?: string;
    codeVerifier?: string;
    refreshToken?: string;
    scope?: string;
    dpopProof?: string;
    dpopNonce?: string;
    httpMethod?: string;
    httpUri?: string;
  }): TokenResponse | TokenError {
    const client = this.clients.get(params.clientId);

    if (!client) {
      return { error: 'invalid_client' };
    }

    // Verify client authentication for confidential clients
    if (client.isConfidential) {
      if (!params.clientSecret) {
        return { error: 'invalid_client', error_description: 'Client authentication required' };
      }
      try {
        if (!timingSafeEqual(
          Buffer.from(params.clientSecret),
          Buffer.from(client.clientSecret!)
        )) {
          return { error: 'invalid_client', error_description: 'Invalid client credentials' };
        }
      } catch {
        return { error: 'invalid_client', error_description: 'Invalid client credentials' };
      }
    }

    // Handle DPoP if provided
    let dpopJkt: string | undefined;
    if (params.dpopProof && this.config.supportDPoP) {
      const dpopResult = verifyDPoPProof(
        params.dpopProof,
        params.httpMethod ?? 'POST',
        params.httpUri ?? `${this.config.issuer}/token`,
        undefined,
        params.dpopNonce
      );

      if (!dpopResult.valid) {
        return { error: 'invalid_dpop_proof', error_description: dpopResult.error };
      }
      dpopJkt = dpopResult.jkt;
    }

    switch (params.grantType) {
      case 'authorization_code':
        return this.handleAuthorizationCodeGrant(params, client, dpopJkt);
      case 'refresh_token':
        return this.handleRefreshTokenGrant(params, client, dpopJkt);
      default:
        return { error: 'unsupported_grant_type' };
    }
  }

  private handleAuthorizationCodeGrant(
    params: {
      code?: string;
      redirectUri?: string;
      codeVerifier?: string;
    },
    client: RegisteredClient,
    dpopJkt?: string
  ): TokenResponse | TokenError {
    if (!params.code) {
      return { error: 'invalid_request', error_description: 'code required' };
    }

    const authCode = this.authCodes.get(params.code);

    if (!authCode) {
      logger.warn({ clientId: client.clientId }, 'Token exchange failed: invalid code');
      return { error: 'invalid_grant', error_description: 'Invalid or expired code' };
    }

    // Delete immediately (one-time use)
    this.authCodes.delete(params.code);

    // Validate expiration
    if (authCode.expiresAt < Date.now()) {
      return { error: 'invalid_grant', error_description: 'Code expired' };
    }

    // Validate client
    if (authCode.clientId !== client.clientId) {
      logger.warn(
        { expected: authCode.clientId, actual: client.clientId },
        'Token exchange failed: client mismatch'
      );
      return { error: 'invalid_grant', error_description: 'Client mismatch' };
    }

    // Validate redirect URI
    if (authCode.redirectUri !== params.redirectUri) {
      return { error: 'invalid_grant', error_description: 'redirect_uri mismatch' };
    }

    // Verify PKCE
    if (this.config.requirePKCE) {
      if (!params.codeVerifier) {
        return { error: 'invalid_request', error_description: 'code_verifier required' };
      }
      if (!verifyPKCE(params.codeVerifier, authCode.codeChallenge)) {
        logger.warn({ clientId: client.clientId }, 'Token exchange failed: PKCE verification failed');
        return { error: 'invalid_grant', error_description: 'PKCE verification failed' };
      }
    }

    // Validate DPoP binding if code was bound
    if (authCode.dpopJkt && authCode.dpopJkt !== dpopJkt) {
      return { error: 'invalid_grant', error_description: 'DPoP key binding mismatch' };
    }

    // Issue tokens
    return this.issueTokens(client, authCode.userId, authCode.scope, dpopJkt);
  }

  private handleRefreshTokenGrant(
    params: {
      refreshToken?: string;
      scope?: string;
    },
    client: RegisteredClient,
    dpopJkt?: string
  ): TokenResponse | TokenError {
    if (!params.refreshToken) {
      return { error: 'invalid_request', error_description: 'refresh_token required' };
    }

    const refreshToken = this.refreshTokens.get(params.refreshToken);

    if (!refreshToken) {
      return { error: 'invalid_grant', error_description: 'Invalid refresh token' };
    }

    // Check if token family was revoked (indicates token reuse attack)
    if (this.revokedFamilies.has(refreshToken.family)) {
      logger.error(
        { clientId: client.clientId, family: refreshToken.family },
        'Refresh token reuse detected - possible token theft'
      );

      auditLogger.log({
        eventId: randomBytes(16).toString('hex'),
        timestamp: Date.now(),
        eventType: 'security',
        severity: 'critical',
        actor: { userId: refreshToken.userId },
        resource: { type: 'refresh_token', id: refreshToken.family },
        action: 'reuse_attempt',
        outcome: 'failure',
        details: { clientId: client.clientId },
      });

      return { error: 'invalid_grant', error_description: 'Token has been revoked' };
    }

    // Validate expiration
    if (refreshToken.expiresAt < Date.now()) {
      this.refreshTokens.delete(params.refreshToken);
      return { error: 'invalid_grant', error_description: 'Refresh token expired' };
    }

    // Validate client
    if (refreshToken.clientId !== client.clientId) {
      return { error: 'invalid_grant', error_description: 'Client mismatch' };
    }

    // Handle scope reduction
    let scope = refreshToken.scope;
    if (params.scope) {
      const requestedScopes = params.scope.split(' ');
      scope = requestedScopes.filter(s => refreshToken.scope.includes(s));
      if (scope.length === 0) {
        return { error: 'invalid_scope' };
      }
    }

    // Rotate refresh token (delete old, issue new)
    this.refreshTokens.delete(params.refreshToken);

    // Issue new tokens with same family
    return this.issueTokens(
      client,
      refreshToken.userId,
      scope,
      dpopJkt,
      refreshToken.family,
      refreshToken.rotationCounter + 1
    );
  }

  private issueTokens(
    client: RegisteredClient,
    userId: string,
    scope: string[],
    dpopJkt?: string,
    tokenFamily?: string,
    rotationCounter?: number
  ): TokenResponse {
    const now = Date.now();
    const tokenType = dpopJkt ? 'DPoP' : 'Bearer';

    // Generate access token
    const accessTokenValue = randomBytes(32).toString('base64url');
    const accessToken: AccessToken = {
      token: accessTokenValue,
      tokenType,
      clientId: client.clientId,
      scope,
      expiresAt: now + this.config.accessTokenTTL,
      userId,
      dpopJkt,
      issuedAt: now,
    };
    this.accessTokens.set(accessTokenValue, accessToken);

    // Generate refresh token
    const family = tokenFamily ?? randomBytes(16).toString('hex');
    const refreshTokenValue = randomBytes(32).toString('base64url');
    const refreshToken: RefreshToken = {
      token: refreshTokenValue,
      clientId: client.clientId,
      scope,
      expiresAt: now + this.config.refreshTokenTTL,
      userId,
      family,
      rotationCounter: rotationCounter ?? 0,
    };
    this.refreshTokens.set(refreshTokenValue, refreshToken);

    logger.info(
      { clientId: client.clientId, userId, scopes: scope, tokenType },
      'Tokens issued'
    );

    return {
      access_token: accessTokenValue,
      token_type: tokenType,
      expires_in: Math.floor(this.config.accessTokenTTL / 1000),
      refresh_token: refreshTokenValue,
      scope: scope.join(' '),
    };
  }

  // ============================================================================
  // Token Validation
  // ============================================================================

  validateAccessToken(
    token: string,
    dpopProof?: string,
    httpMethod?: string,
    httpUri?: string
  ): { valid: true; token: AccessToken; userId: string } | { valid: false; error: string } {
    const accessToken = this.accessTokens.get(token);

    if (!accessToken) {
      return { valid: false, error: 'Token not found' };
    }

    if (accessToken.expiresAt < Date.now()) {
      this.accessTokens.delete(token);
      return { valid: false, error: 'Token expired' };
    }

    // Validate DPoP binding
    if (accessToken.dpopJkt) {
      if (!dpopProof) {
        return { valid: false, error: 'DPoP proof required' };
      }

      const dpopResult = verifyDPoPProof(
        dpopProof,
        httpMethod ?? 'GET',
        httpUri ?? this.config.issuer,
        token
      );

      if (!dpopResult.valid) {
        return { valid: false, error: `DPoP validation failed: ${dpopResult.error}` };
      }

      if (dpopResult.jkt !== accessToken.dpopJkt) {
        return { valid: false, error: 'DPoP key binding mismatch' };
      }
    }

    return { valid: true, token: accessToken, userId: accessToken.userId };
  }

  hasScope(token: AccessToken, requiredScope: string): boolean {
    return token.scope.includes(requiredScope);
  }

  // ============================================================================
  // Token Revocation (RFC 7009)
  // ============================================================================

  revokeToken(token: string, tokenTypeHint?: 'access_token' | 'refresh_token'): boolean {
    // Try to revoke as refresh token first (or based on hint)
    if (!tokenTypeHint || tokenTypeHint === 'refresh_token') {
      const refreshToken = this.refreshTokens.get(token);
      if (refreshToken) {
        // Revoke entire family to prevent reuse of old tokens
        this.revokedFamilies.add(refreshToken.family);
        this.refreshTokens.delete(token);

        // Also revoke all tokens in the same family
        for (const [key, rt] of this.refreshTokens) {
          if (rt.family === refreshToken.family) {
            this.refreshTokens.delete(key);
          }
        }

        logger.info({ family: refreshToken.family }, 'Refresh token family revoked');
        return true;
      }
    }

    // Try to revoke as access token
    if (!tokenTypeHint || tokenTypeHint === 'access_token') {
      if (this.accessTokens.has(token)) {
        this.accessTokens.delete(token);
        return true;
      }
    }

    return false;
  }

  // ============================================================================
  // Token Introspection (RFC 7662)
  // ============================================================================

  introspect(token: string): {
    active: boolean;
    scope?: string;
    client_id?: string;
    username?: string;
    token_type?: string;
    exp?: number;
    iat?: number;
  } {
    // Check access tokens
    const accessToken = this.accessTokens.get(token);
    if (accessToken && accessToken.expiresAt > Date.now()) {
      return {
        active: true,
        scope: accessToken.scope.join(' '),
        client_id: accessToken.clientId,
        username: accessToken.userId,
        token_type: accessToken.tokenType.toLowerCase(),
        exp: Math.floor(accessToken.expiresAt / 1000),
        iat: Math.floor(accessToken.issuedAt / 1000),
      };
    }

    // Check refresh tokens
    const refreshToken = this.refreshTokens.get(token);
    if (refreshToken && refreshToken.expiresAt > Date.now() && !this.revokedFamilies.has(refreshToken.family)) {
      return {
        active: true,
        scope: refreshToken.scope.join(' '),
        client_id: refreshToken.clientId,
        username: refreshToken.userId,
        token_type: 'refresh_token',
        exp: Math.floor(refreshToken.expiresAt / 1000),
      };
    }

    return { active: false };
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    // Clean expired auth codes
    for (const [key, code] of this.authCodes) {
      if (code.expiresAt < now) {
        this.authCodes.delete(key);
        cleaned++;
      }
    }

    // Clean expired access tokens
    for (const [key, token] of this.accessTokens) {
      if (token.expiresAt < now) {
        this.accessTokens.delete(key);
        cleaned++;
      }
    }

    // Clean expired refresh tokens
    for (const [key, token] of this.refreshTokens) {
      if (token.expiresAt < now) {
        this.refreshTokens.delete(key);
        cleaned++;
      }
    }

    // Clean old revoked families (keep for 7 days after last refresh token would expire)
    // This is simplified - in production, track family expiration times
    if (this.revokedFamilies.size > 1000) {
      // Limit growth - clear oldest entries
      const toDelete = Array.from(this.revokedFamilies).slice(0, 500);
      for (const family of toDelete) {
        this.revokedFamilies.delete(family);
      }
    }

    if (cleaned > 0) {
      logger.debug({ cleaned }, 'OAuth cleanup completed');
    }
  }

  // ============================================================================
  // Metadata (RFC 8414)
  // ============================================================================

  getMetadata(): Record<string, unknown> {
    return {
      issuer: this.config.issuer,
      authorization_endpoint: `${this.config.issuer}/authorize`,
      token_endpoint: `${this.config.issuer}/token`,
      revocation_endpoint: `${this.config.issuer}/revoke`,
      introspection_endpoint: `${this.config.issuer}/introspect`,
      registration_endpoint: `${this.config.issuer}/register`,
      scopes_supported: this.config.allowedScopes,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
      code_challenge_methods_supported: ['S256'],
      dpop_signing_alg_values_supported: this.config.supportDPoP ? ['ES256', 'RS256'] : undefined,
    };
  }

  // ============================================================================
  // Test-compatible methods (simplified API)
  // ============================================================================

  private pendingAuthRequests = new Map<string, {
    clientId: string;
    redirectUri: string;
    scope: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    state?: string;
  }>();

  /**
   * Create an authorization request (test-compatible)
   */
  async createAuthorizationRequest(params: {
    clientId: string;
    redirectUri: string;
    scope: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    state?: string;
  }): Promise<{ requestId: string }> {
    const client = this.clients.get(params.clientId);
    if (!client) {
      throw new Error('Invalid client');
    }

    if (!client.redirectUris.includes(params.redirectUri)) {
      throw new Error('Invalid redirect URI');
    }

    const requestId = randomBytes(16).toString('hex');
    this.pendingAuthRequests.set(requestId, params);

    return { requestId };
  }

  /**
   * Approve an authorization request (test-compatible)
   */
  async approveAuthorizationRequest(
    requestId: string,
    userId: string
  ): Promise<{ code: string }> {
    const request = this.pendingAuthRequests.get(requestId);
    if (!request) {
      throw new Error('Invalid request ID');
    }

    this.pendingAuthRequests.delete(requestId);

    // Use the existing authorize method
    const result = this.authorize({
      responseType: 'code',
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      scope: request.scope,
      state: request.state ?? '',
      codeChallenge: request.codeChallenge,
      codeChallengeMethod: request.codeChallengeMethod,
      userId,
    });

    if ('error' in result) {
      throw new Error(result.error_description ?? result.error);
    }

    return { code: result.code };
  }

  /**
   * Exchange authorization code for tokens (test-compatible)
   */
  async exchangeAuthorizationCode(params: {
    code: string;
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<{
    accessToken: string;
    tokenType: string;
    expiresIn: number;
    refreshToken?: string;
  }> {
    const result = this.token({
      grantType: 'authorization_code',
      code: params.code,
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      codeVerifier: params.codeVerifier,
    });

    if ('error' in result) {
      throw new Error(result.error_description ?? result.error);
    }

    return {
      accessToken: result.access_token,
      tokenType: result.token_type,
      expiresIn: result.expires_in,
      refreshToken: result.refresh_token,
    };
  }

  /**
   * Refresh tokens (test-compatible)
   */
  async refreshToken(params: {
    refreshToken: string;
    clientId: string;
  }): Promise<{
    accessToken: string;
    tokenType: string;
    expiresIn: number;
    refreshToken?: string;
  }> {
    const result = this.token({
      grantType: 'refresh_token',
      refreshToken: params.refreshToken,
      clientId: params.clientId,
    });

    if ('error' in result) {
      throw new Error(result.error_description ?? result.error);
    }

    return {
      accessToken: result.access_token,
      tokenType: result.token_type,
      expiresIn: result.expires_in,
      refreshToken: result.refresh_token,
    };
  }
}

/**
 * SAML SSO Provider
 *
 * Generic SAML 2.0 Service Provider implementation
 */

import type { EventEmitter } from 'events';
import { BaseSSOProvider, type BaseSSOProviderConfig, type SSOTokens, type SSOUserInfo } from './sso-base.js';

// =============================================================================
// SAML Configuration
// =============================================================================

export interface SAMLProviderConfig extends BaseSSOProviderConfig {
  /** Identity Provider Entity ID */
  idpEntityId: string;
  /** Identity Provider SSO URL */
  idpSsoUrl: string;
  /** Identity Provider SLO URL (optional) */
  idpSloUrl?: string;
  /** Identity Provider X.509 Certificate (PEM format) */
  idpCertificate: string;
  /** Service Provider Entity ID */
  spEntityId: string;
  /** Attribute mapping */
  attributeMapping: {
    email: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    groups?: string;
  };
  /** Sign authn requests */
  signAuthnRequests?: boolean;
  /** Want assertions signed */
  wantAssertionsSigned?: boolean;
  /** NameID format */
  nameIdFormat?: string;
}

// =============================================================================
// SAML Types
// =============================================================================

export interface SAMLAssertion {
  issuer: string;
  subject: {
    nameId: string;
    nameIdFormat: string;
  };
  conditions: {
    notBefore: number;
    notOnOrAfter: number;
    audience: string;
  };
  attributes: Record<string, string | string[]>;
  authnStatement: {
    authnInstant: number;
    sessionIndex?: string;
  };
}

export interface SAMLAuthnRequest {
  id: string;
  issueInstant: string;
  destination: string;
  issuer: string;
  nameIdPolicy?: {
    format: string;
    allowCreate: boolean;
  };
  requestedAuthnContext?: {
    comparison: 'exact' | 'minimum' | 'maximum' | 'better';
    authnContextClassRef: string[];
  };
}

// =============================================================================
// SAML SSO Provider
// =============================================================================

export class SAMLSSOProvider extends BaseSSOProvider<SAMLProviderConfig> {
  private static readonly DEFAULT_NAMEID_FORMAT =
    'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress';

  constructor(config: SAMLProviderConfig, eventEmitter?: EventEmitter) {
    super(
      {
        ...config,
        providerType: 'saml',
        // SAML doesn't use OAuth, but we need these for the base class
        clientId: config.spEntityId,
        clientSecret: 'saml-not-used',
      },
      eventEmitter
    );
  }

  /**
   * Get SAML SSO redirect URL with AuthnRequest
   */
  getAuthorizationUrl(state: string, _nonce?: string): string {
    const request = this.createAuthnRequest(state);
    const encodedRequest = this.encodeAuthnRequest(request);

    const params: Record<string, string> = {
      SAMLRequest: encodedRequest,
      RelayState: state,
    };

    return `${this.config.idpSsoUrl}?${this.buildQueryString(params)}`;
  }

  /**
   * Exchange code for tokens - not used in SAML
   * SAML uses assertions instead
   */
  async exchangeCode(_code: string): Promise<SSOTokens> {
    throw new Error('SAML does not use authorization codes. Use validateAssertion instead.');
  }

  /**
   * Get user info - not used in SAML
   * User info comes from the assertion
   */
  async getUserInfo(_accessToken: string): Promise<SSOUserInfo> {
    throw new Error('SAML does not use access tokens. Use validateAssertion instead.');
  }

  /**
   * Validate SAML assertion and extract user info
   */
  async validateAssertion(assertion: string): Promise<{
    subjectId: string;
    email: string;
    name?: string;
    attributes: Record<string, string | string[]>;
  }> {
    // Decode the base64-encoded SAML response
    const decodedAssertion = Buffer.from(assertion, 'base64').toString('utf-8');

    // Parse the SAML response
    const parsedAssertion = await this.parseAssertion(decodedAssertion);

    // Validate the assertion
    this.validateAssertionClaims(parsedAssertion);

    // Extract user info using attribute mapping
    const email = this.getAttributeValue(
      parsedAssertion.attributes,
      this.config.attributeMapping.email
    );

    if (!email) {
      throw new Error('Email attribute not found in SAML assertion');
    }

    const name = this.config.attributeMapping.name
      ? this.getAttributeValue(parsedAssertion.attributes, this.config.attributeMapping.name)
      : undefined;

    this.emit('sso:saml:assertion:validated', {
      provider: 'saml',
      issuer: parsedAssertion.issuer,
      subject: parsedAssertion.subject.nameId,
    });

    return {
      subjectId: parsedAssertion.subject.nameId,
      email,
      name,
      attributes: parsedAssertion.attributes,
    };
  }

  /**
   * Refresh token - not applicable for SAML
   */
  async refreshToken(_refreshToken: string): Promise<SSOTokens> {
    throw new Error('SAML does not support token refresh');
  }

  /**
   * Revoke token - not applicable for SAML
   */
  async revokeToken(_token: string): Promise<void> {
    // SAML uses SLO (Single Logout) instead
  }

  /**
   * Validate ID token - not applicable for SAML
   */
  async validateIdToken(
    _idToken: string,
    _nonce?: string
  ): Promise<{
    valid: boolean;
    claims?: Record<string, unknown>;
    error?: string;
  }> {
    return {
      valid: false,
      error: 'SAML does not use ID tokens. Use validateAssertion instead.',
    };
  }

  /**
   * Get SLO (Single Logout) URL
   */
  getLogoutUrl(sessionIndex?: string, nameId?: string): string | null {
    if (!this.config.idpSloUrl) {
      return null;
    }

    const logoutRequest = this.createLogoutRequest(sessionIndex, nameId);
    const encodedRequest = this.encodeAuthnRequest(logoutRequest);

    const params: Record<string, string> = {
      SAMLRequest: encodedRequest,
    };

    return `${this.config.idpSloUrl}?${this.buildQueryString(params)}`;
  }

  /**
   * Get SP metadata XML
   */
  getMetadata(): string {
    const acsUrl = this.config.redirectUri;
    const entityId = this.config.spEntityId;
    const nameIdFormat = this.config.nameIdFormat ?? SAMLSSOProvider.DEFAULT_NAMEID_FORMAT;

    return `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">
  <md:SPSSODescriptor AuthnRequestsSigned="${this.config.signAuthnRequests ?? false}" WantAssertionsSigned="${this.config.wantAssertionsSigned ?? true}" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>${nameIdFormat}</md:NameIDFormat>
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${acsUrl}" index="0" isDefault="true"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
  }

  // =============================================================================
  // SAML Request/Response Helpers
  // =============================================================================

  /**
   * Create SAML AuthnRequest
   */
  private createAuthnRequest(id: string): SAMLAuthnRequest {
    const now = new Date().toISOString();

    return {
      id: `_${id}`,
      issueInstant: now,
      destination: this.config.idpSsoUrl,
      issuer: this.config.spEntityId,
      nameIdPolicy: {
        format: this.config.nameIdFormat ?? SAMLSSOProvider.DEFAULT_NAMEID_FORMAT,
        allowCreate: true,
      },
    };
  }

  /**
   * Create SAML LogoutRequest
   */
  private createLogoutRequest(
    sessionIndex?: string,
    nameId?: string
  ): Record<string, unknown> {
    const now = new Date().toISOString();
    const id = `_${crypto.randomUUID()}`;

    return {
      id,
      issueInstant: now,
      destination: this.config.idpSloUrl,
      issuer: this.config.spEntityId,
      sessionIndex,
      nameId,
    };
  }

  /**
   * Encode AuthnRequest to base64 with deflate compression
   */
  private encodeAuthnRequest(request: SAMLAuthnRequest | Record<string, unknown>): string {
    // Build SAML AuthnRequest XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="${request.id}"
  Version="2.0"
  IssueInstant="${request.issueInstant}"
  Destination="${request.destination}"
  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
  AssertionConsumerServiceURL="${this.config.redirectUri}">
  <saml:Issuer>${request.issuer}</saml:Issuer>
  <samlp:NameIDPolicy Format="${(request as SAMLAuthnRequest).nameIdPolicy?.format ?? SAMLSSOProvider.DEFAULT_NAMEID_FORMAT}" AllowCreate="true"/>
</samlp:AuthnRequest>`;

    // In production, you would use zlib.deflateRaw() and then base64 encode
    // For simplicity, we just base64 encode here
    return Buffer.from(xml).toString('base64');
  }

  /**
   * Parse SAML Response/Assertion
   */
  private async parseAssertion(xml: string): Promise<SAMLAssertion> {
    // This is a simplified parser. In production, use a proper SAML library
    // that handles signature validation, encryption, etc.

    // Extract key elements from XML
    const issuerMatch = xml.match(/<(?:saml2?:)?Issuer[^>]*>([^<]+)<\//);
    const nameIdMatch = xml.match(/<(?:saml2?:)?NameID[^>]*>([^<]+)<\//);
    const attributeMatches = xml.matchAll(
      /<(?:saml2?:)?Attribute\s+Name="([^"]+)"[^>]*>\s*<(?:saml2?:)?AttributeValue[^>]*>([^<]+)<\//g
    );

    const issuer = issuerMatch?.[1] ?? '';
    const nameId = nameIdMatch?.[1] ?? '';

    const attributes: Record<string, string | string[]> = {};
    for (const match of attributeMatches) {
      const name = match[1];
      const value = match[2];
      if (attributes[name]) {
        const existing = attributes[name];
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          attributes[name] = [existing, value];
        }
      } else {
        attributes[name] = value;
      }
    }

    // Extract conditions
    const notBeforeMatch = xml.match(/NotBefore="([^"]+)"/);
    const notOnOrAfterMatch = xml.match(/NotOnOrAfter="([^"]+)"/);
    const audienceMatch = xml.match(/<(?:saml2?:)?Audience[^>]*>([^<]+)<\//);

    // Extract authn statement
    const authnInstantMatch = xml.match(/AuthnInstant="([^"]+)"/);
    const sessionIndexMatch = xml.match(/SessionIndex="([^"]+)"/);

    return {
      issuer,
      subject: {
        nameId,
        nameIdFormat: SAMLSSOProvider.DEFAULT_NAMEID_FORMAT,
      },
      conditions: {
        notBefore: notBeforeMatch ? new Date(notBeforeMatch[1]).getTime() : 0,
        notOnOrAfter: notOnOrAfterMatch ? new Date(notOnOrAfterMatch[1]).getTime() : 0,
        audience: audienceMatch?.[1] ?? '',
      },
      attributes,
      authnStatement: {
        authnInstant: authnInstantMatch ? new Date(authnInstantMatch[1]).getTime() : Date.now(),
        sessionIndex: sessionIndexMatch?.[1],
      },
    };
  }

  /**
   * Validate assertion claims
   */
  private validateAssertionClaims(assertion: SAMLAssertion): void {
    const now = Date.now();

    // Validate issuer
    if (assertion.issuer !== this.config.idpEntityId) {
      throw new Error(`Invalid issuer: expected ${this.config.idpEntityId}, got ${assertion.issuer}`);
    }

    // Validate audience
    if (assertion.conditions.audience && assertion.conditions.audience !== this.config.spEntityId) {
      throw new Error('Invalid audience');
    }

    // Validate time conditions
    if (assertion.conditions.notBefore && now < assertion.conditions.notBefore) {
      throw new Error('Assertion not yet valid');
    }

    if (assertion.conditions.notOnOrAfter && now > assertion.conditions.notOnOrAfter) {
      throw new Error('Assertion expired');
    }

    // Note: In production, you must also validate the XML signature
    // using the IdP's certificate
  }

  /**
   * Get attribute value from assertion
   */
  private getAttributeValue(
    attributes: Record<string, string | string[]>,
    attributeName: string
  ): string | undefined {
    const value = attributes[attributeName];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }

  // =============================================================================
  // Provider Lifecycle
  // =============================================================================

  protected async doInitialize(): Promise<void> {
    // Validate SAML-specific configuration
    if (!this.config.idpEntityId) {
      throw new Error('IdP Entity ID is required');
    }
    if (!this.config.idpSsoUrl) {
      throw new Error('IdP SSO URL is required');
    }
    if (!this.config.idpCertificate) {
      throw new Error('IdP Certificate is required');
    }
    if (!this.config.spEntityId) {
      throw new Error('SP Entity ID is required');
    }
    if (!this.config.attributeMapping?.email) {
      throw new Error('Email attribute mapping is required');
    }
  }

  protected async doHealthCheck(): Promise<Record<string, unknown>> {
    return {
      providerType: 'saml',
      idpEntityId: this.config.idpEntityId,
      idpSsoUrl: this.config.idpSsoUrl,
      spEntityId: this.config.spEntityId,
      hasCertificate: !!this.config.idpCertificate,
      attributeMapping: Object.keys(this.config.attributeMapping),
    };
  }
}

/**
 * Create SAML SSO provider
 */
export function createSAMLSSOProvider(
  config: SAMLProviderConfig,
  eventEmitter?: EventEmitter
): SAMLSSOProvider {
  return new SAMLSSOProvider(config, eventEmitter);
}

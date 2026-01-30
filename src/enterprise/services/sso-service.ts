/**
 * SSO Service
 *
 * SSO orchestration and authentication flow management
 */

import type {
  SSOConfiguration,
  SSOConfigCreateInput,
  SSOProvider,
  SSOAuthResult,
  EnterpriseUser,
  EnterpriseRole,
  GoogleSSOConfig,
  MicrosoftSSOConfig,
  SAMLConfig,
} from '../types.js';
import type { SSOConfigStore } from '../stores/sso-config-store.js';
import type { EnterpriseUserStore } from '../stores/user-store.js';
import type { TenantStore } from '../stores/tenant-store.js';
import type { LicensingService } from './licensing-service.js';
import { EnterpriseError } from '../types.js';

// =============================================================================
// SSO Provider Interface
// =============================================================================

export interface SSOProviderInterface {
  /** Get authorization URL */
  getAuthorizationUrl(state: string, nonce?: string): string;

  /** Exchange code for tokens */
  exchangeCode(code: string): Promise<{
    accessToken: string;
    idToken?: string;
    refreshToken?: string;
    expiresIn?: number;
  }>;

  /** Get user info from tokens */
  getUserInfo(accessToken: string): Promise<{
    subjectId: string;
    email: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
    groups?: string[];
  }>;

  /** Validate SAML assertion (for SAML provider) */
  validateAssertion?(assertion: string): Promise<{
    subjectId: string;
    email: string;
    name?: string;
    attributes: Record<string, string | string[]>;
  }>;
}

// =============================================================================
// Service Configuration
// =============================================================================

export interface SSOServiceConfig {
  /** Base URL for callbacks */
  baseUrl: string;
  /** Default role for auto-provisioned users */
  defaultRole: EnterpriseRole;
  /** Whether to auto-provision users by default */
  defaultAutoProvision: boolean;
  /** Session duration in minutes */
  sessionDurationMinutes: number;
}

const DEFAULT_CONFIG: SSOServiceConfig = {
  baseUrl: 'http://localhost:3000',
  defaultRole: 'member',
  defaultAutoProvision: true,
  sessionDurationMinutes: 60,
};

// =============================================================================
// SSO Service
// =============================================================================

export class SSOService {
  private readonly config: SSOServiceConfig;
  private readonly providers = new Map<string, SSOProviderInterface>();

  constructor(
    private readonly ssoConfigStore: SSOConfigStore,
    private readonly userStore: EnterpriseUserStore,
    private readonly tenantStore: TenantStore,
    private readonly licensingService: LicensingService,
    config?: Partial<SSOServiceConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register an SSO provider implementation
   */
  registerProvider(name: string, provider: SSOProviderInterface): void {
    this.providers.set(name, provider);
  }

  /**
   * Get SSO configuration for a tenant
   */
  async getSSOConfig(tenantId: string): Promise<SSOConfiguration | null> {
    return this.ssoConfigStore.getSSOConfig(tenantId);
  }

  /**
   * Configure SSO for a tenant
   */
  async configureSSOConfig(
    tenantId: string,
    provider: SSOProvider,
    config: GoogleSSOConfig | MicrosoftSSOConfig | SAMLConfig,
    options?: {
      defaultRole?: EnterpriseRole;
      autoProvision?: boolean;
      enforced?: boolean;
    }
  ): Promise<SSOConfiguration> {
    // Check if SSO feature is available
    const hasFeature = await this.licensingService.hasFeature(tenantId, 'sso');
    if (!hasFeature) {
      throw new EnterpriseError(
        'FEATURE_NOT_AVAILABLE',
        'SSO feature is not available on your current plan',
        403
      );
    }

    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    // Validate provider-specific configuration
    this.validateProviderConfig(provider, config);

    const ssoConfig = await this.ssoConfigStore.upsertSSOConfig({
      tenantId,
      provider,
      enabled: true,
      config,
      defaultRole: options?.defaultRole ?? this.config.defaultRole,
      autoProvision: options?.autoProvision ?? this.config.defaultAutoProvision,
      enforced: options?.enforced ?? false,
      domainVerified: false,
    });

    return ssoConfig;
  }

  /**
   * Enable SSO for a tenant
   */
  async enableSSO(tenantId: string): Promise<SSOConfiguration | null> {
    const config = await this.ssoConfigStore.getSSOConfig(tenantId);
    if (!config) {
      throw new EnterpriseError(
        'SSO_CONFIG_INVALID',
        'SSO must be configured before enabling',
        400
      );
    }

    return this.ssoConfigStore.updateSSOConfig(tenantId, { enabled: true });
  }

  /**
   * Disable SSO for a tenant
   */
  async disableSSO(tenantId: string): Promise<SSOConfiguration | null> {
    return this.ssoConfigStore.updateSSOConfig(tenantId, { enabled: false });
  }

  /**
   * Delete SSO configuration
   */
  async deleteSSOConfig(tenantId: string): Promise<boolean> {
    return this.ssoConfigStore.deleteSSOConfig(tenantId);
  }

  /**
   * Get authorization URL for SSO login
   */
  async getAuthorizationUrl(tenantId: string, state: string): Promise<string> {
    const config = await this.ssoConfigStore.getSSOConfig(tenantId);
    if (!config || !config.enabled) {
      throw new EnterpriseError('SSO_CONFIG_INVALID', 'SSO is not configured or enabled', 400);
    }

    const provider = this.providers.get(config.provider);
    if (!provider) {
      throw new EnterpriseError(
        'SSO_CONFIG_INVALID',
        `SSO provider "${config.provider}" is not registered`,
        500
      );
    }

    return provider.getAuthorizationUrl(state);
  }

  /**
   * Handle SSO callback and authenticate user
   */
  async handleCallback(
    tenantId: string,
    code: string,
    state: string
  ): Promise<SSOAuthResult> {
    const config = await this.ssoConfigStore.getSSOConfig(tenantId);
    if (!config || !config.enabled) {
      return {
        success: false,
        error: 'SSO is not configured or enabled',
        errorCode: 'SSO_CONFIG_INVALID',
      };
    }

    const provider = this.providers.get(config.provider);
    if (!provider) {
      return {
        success: false,
        error: `SSO provider "${config.provider}" is not registered`,
        errorCode: 'SSO_CONFIG_INVALID',
      };
    }

    try {
      // Exchange code for tokens
      const tokens = await provider.exchangeCode(code);

      // Get user info
      const userInfo = await provider.getUserInfo(tokens.accessToken);

      // Find or create user
      const result = await this.findOrCreateUser(tenantId, config, userInfo);

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'SSO authentication failed',
        errorCode: 'SSO_AUTH_FAILED',
      };
    }
  }

  /**
   * Handle SAML assertion
   */
  async handleSAMLAssertion(
    tenantId: string,
    assertion: string
  ): Promise<SSOAuthResult> {
    const config = await this.ssoConfigStore.getSSOConfig(tenantId);
    if (!config || !config.enabled || config.provider !== 'saml') {
      return {
        success: false,
        error: 'SAML SSO is not configured or enabled',
        errorCode: 'SSO_CONFIG_INVALID',
      };
    }

    const provider = this.providers.get('saml');
    if (!provider?.validateAssertion) {
      return {
        success: false,
        error: 'SAML provider is not configured',
        errorCode: 'SSO_CONFIG_INVALID',
      };
    }

    try {
      const assertionData = await provider.validateAssertion(assertion);

      const result = await this.findOrCreateUser(tenantId, config, {
        subjectId: assertionData.subjectId,
        email: assertionData.email,
        name: assertionData.name,
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'SAML authentication failed',
        errorCode: 'SSO_AUTH_FAILED',
      };
    }
  }

  /**
   * Initiate SSO login by email domain
   */
  async initiateLoginByEmail(email: string): Promise<{
    tenantId: string;
    authUrl: string;
  } | null> {
    const domain = email.split('@')[1];
    if (!domain) return null;

    const config = await this.ssoConfigStore.getSSOConfigByDomain(domain);
    if (!config || !config.enabled) return null;

    const state = this.generateState(config.tenantId);
    const authUrl = await this.getAuthorizationUrl(config.tenantId, state);

    return {
      tenantId: config.tenantId,
      authUrl,
    };
  }

  /**
   * Check if SSO is enforced for a tenant
   */
  async isSSOEnforced(tenantId: string): Promise<boolean> {
    const config = await this.ssoConfigStore.getSSOConfig(tenantId);
    return config?.enabled && config?.enforced || false;
  }

  /**
   * Get SAML metadata for SP
   */
  getSAMLMetadata(tenantId: string): string {
    const callbackUrl = `${this.config.baseUrl}/api/enterprise/sso/saml/acs`;
    const entityId = `${this.config.baseUrl}/api/enterprise/sso/saml/metadata/${tenantId}`;

    return `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">
  <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${callbackUrl}" index="0" isDefault="true"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
  }

  /**
   * Find existing user or create new one via auto-provisioning
   */
  private async findOrCreateUser(
    tenantId: string,
    config: SSOConfiguration,
    userInfo: {
      subjectId: string;
      email: string;
      name?: string;
      firstName?: string;
      lastName?: string;
      avatarUrl?: string;
    }
  ): Promise<SSOAuthResult> {
    // First, check if user exists by SSO subject
    let user = await this.userStore.getUserBySSOSubject(
      tenantId,
      config.provider,
      userInfo.subjectId
    );

    if (user) {
      // Update last login
      await this.userStore.updateLastLogin(user.id);
      return { success: true, user, provisioned: false };
    }

    // Check by email
    user = await this.userStore.getUserByEmail(tenantId, userInfo.email);

    if (user) {
      // Link SSO to existing user
      await this.userStore.updateUser(user.id, {
        ssoProvider: config.provider,
        ssoSubjectId: userInfo.subjectId,
        lastLoginAt: Date.now(),
      });

      const updatedUser = await this.userStore.getUser(user.id);
      return { success: true, user: updatedUser!, provisioned: false };
    }

    // Auto-provision if enabled
    if (!config.autoProvision) {
      return {
        success: false,
        error: 'User not found and auto-provisioning is disabled',
        errorCode: 'USER_NOT_FOUND',
      };
    }

    // Check user limit
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      return {
        success: false,
        error: 'Tenant not found',
        errorCode: 'TENANT_NOT_FOUND',
      };
    }

    // Create new user
    const name = userInfo.name
      ?? [userInfo.firstName, userInfo.lastName].filter(Boolean).join(' ')
      ?? userInfo.email.split('@')[0];

    const newUser = await this.userStore.createUser({
      tenantId,
      email: userInfo.email.toLowerCase(),
      name,
      role: config.defaultRole,
      status: 'active',
      ssoProvider: config.provider,
      ssoSubjectId: userInfo.subjectId,
      avatarUrl: userInfo.avatarUrl,
      mfaEnabled: false,
      lastLoginAt: Date.now(),
    });

    return { success: true, user: newUser, provisioned: true };
  }

  /**
   * Validate provider-specific configuration
   */
  private validateProviderConfig(
    provider: SSOProvider,
    config: GoogleSSOConfig | MicrosoftSSOConfig | SAMLConfig
  ): void {
    switch (provider) {
      case 'google': {
        const googleConfig = config as GoogleSSOConfig;
        if (!googleConfig.clientId || !googleConfig.clientSecret) {
          throw new EnterpriseError(
            'SSO_CONFIG_INVALID',
            'Google SSO requires clientId and clientSecret',
            400
          );
        }
        break;
      }
      case 'microsoft': {
        const msConfig = config as MicrosoftSSOConfig;
        if (!msConfig.tenantId || !msConfig.clientId || !msConfig.clientSecret) {
          throw new EnterpriseError(
            'SSO_CONFIG_INVALID',
            'Microsoft SSO requires tenantId, clientId, and clientSecret',
            400
          );
        }
        break;
      }
      case 'saml': {
        const samlConfig = config as SAMLConfig;
        if (!samlConfig.idpEntityId || !samlConfig.ssoUrl || !samlConfig.certificate) {
          throw new EnterpriseError(
            'SSO_CONFIG_INVALID',
            'SAML SSO requires idpEntityId, ssoUrl, and certificate',
            400
          );
        }
        if (!samlConfig.attributeMapping?.email) {
          throw new EnterpriseError(
            'SSO_CONFIG_INVALID',
            'SAML SSO requires email attribute mapping',
            400
          );
        }
        break;
      }
      default:
        throw new EnterpriseError(
          'SSO_CONFIG_INVALID',
          `Unknown SSO provider: ${provider}`,
          400
        );
    }
  }

  /**
   * Generate state parameter for OAuth flow
   */
  private generateState(tenantId: string): string {
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const random = Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return `${tenantId}:${random}`;
  }
}

/**
 * Create SSO service
 */
export function createSSOService(
  ssoConfigStore: SSOConfigStore,
  userStore: EnterpriseUserStore,
  tenantStore: TenantStore,
  licensingService: LicensingService,
  config?: Partial<SSOServiceConfig>
): SSOService {
  return new SSOService(ssoConfigStore, userStore, tenantStore, licensingService, config);
}

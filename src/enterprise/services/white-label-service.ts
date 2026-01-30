/**
 * White Label Service
 *
 * Branding and custom domain management
 */

import type {
  WhiteLabelConfig,
  WhiteLabelCreateInput,
  WhiteLabelUpdateInput,
  BrandingConfig,
} from '../types.js';
import type { WhiteLabelStore } from '../stores/white-label-store.js';
import type { TenantStore } from '../stores/tenant-store.js';
import type { LicensingService } from './licensing-service.js';
import { EnterpriseError } from '../types.js';

// =============================================================================
// Service Configuration
// =============================================================================

export interface WhiteLabelServiceConfig {
  /** Domain verification method */
  verificationMethod: 'dns_txt' | 'dns_cname' | 'file';
  /** DNS verification record name prefix */
  dnsRecordPrefix: string;
  /** Default branding colors */
  defaultBranding: BrandingConfig;
}

const DEFAULT_CONFIG: WhiteLabelServiceConfig = {
  verificationMethod: 'dns_txt',
  dnsRecordPrefix: '_secureagent-verify',
  defaultBranding: {
    primaryColor: '#2563eb',
    accentColor: '#3b82f6',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
};

// =============================================================================
// White Label Service
// =============================================================================

export class WhiteLabelService {
  private readonly config: WhiteLabelServiceConfig;

  constructor(
    private readonly whiteLabelStore: WhiteLabelStore,
    private readonly tenantStore: TenantStore,
    private readonly licensingService: LicensingService,
    config?: Partial<WhiteLabelServiceConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get white-label configuration for a tenant
   */
  async getWhiteLabelConfig(tenantId: string): Promise<WhiteLabelConfig | null> {
    return this.whiteLabelStore.getWhiteLabelConfig(tenantId);
  }

  /**
   * Get white-label configuration by custom domain
   */
  async getWhiteLabelConfigByDomain(domain: string): Promise<WhiteLabelConfig | null> {
    return this.whiteLabelStore.getWhiteLabelConfigByDomain(domain);
  }

  /**
   * Configure white-label branding
   */
  async configureWhiteLabel(
    tenantId: string,
    input: {
      branding?: Partial<BrandingConfig>;
      emailFromName?: string;
      emailFromAddress?: string;
      supportEmail?: string;
      termsUrl?: string;
      privacyUrl?: string;
    }
  ): Promise<WhiteLabelConfig> {
    // Check if white-label feature is available
    const hasFeature = await this.licensingService.hasFeature(tenantId, 'whiteLabel');
    if (!hasFeature) {
      throw new EnterpriseError(
        'FEATURE_NOT_AVAILABLE',
        'White-label feature is not available on your current plan',
        403
      );
    }

    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const existing = await this.whiteLabelStore.getWhiteLabelConfig(tenantId);

    const branding: BrandingConfig = {
      ...this.config.defaultBranding,
      ...existing?.branding,
      ...input.branding,
    };

    if (existing) {
      return (await this.whiteLabelStore.updateWhiteLabelConfig(tenantId, {
        enabled: true,
        branding,
        emailFromName: input.emailFromName,
        emailFromAddress: input.emailFromAddress,
        supportEmail: input.supportEmail,
        termsUrl: input.termsUrl,
        privacyUrl: input.privacyUrl,
      }))!;
    }

    return this.whiteLabelStore.upsertWhiteLabelConfig({
      tenantId,
      enabled: true,
      branding,
      emailFromName: input.emailFromName,
      emailFromAddress: input.emailFromAddress,
      supportEmail: input.supportEmail,
      termsUrl: input.termsUrl,
      privacyUrl: input.privacyUrl,
    });
  }

  /**
   * Configure custom domain
   */
  async configureCustomDomain(
    tenantId: string,
    domain: string
  ): Promise<{
    config: WhiteLabelConfig;
    verificationRecord: {
      type: 'TXT' | 'CNAME';
      name: string;
      value: string;
    };
  }> {
    // Check if custom domain feature is available
    const hasFeature = await this.licensingService.hasFeature(tenantId, 'customDomain');
    if (!hasFeature) {
      throw new EnterpriseError(
        'FEATURE_NOT_AVAILABLE',
        'Custom domain feature is not available on your current plan',
        403
      );
    }

    // Validate domain format
    if (!this.isValidDomain(domain)) {
      throw new EnterpriseError(
        'FEATURE_NOT_AVAILABLE',
        'Invalid domain format',
        400
      );
    }

    // Check if domain is already in use
    const existingConfig = await this.whiteLabelStore.getWhiteLabelConfigByDomain(domain);
    if (existingConfig && existingConfig.tenantId !== tenantId) {
      throw new EnterpriseError(
        'FEATURE_NOT_AVAILABLE',
        'Domain is already in use by another tenant',
        400
      );
    }

    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new EnterpriseError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    // Update or create white-label config
    let config = await this.whiteLabelStore.getWhiteLabelConfig(tenantId);
    if (config) {
      config = (await this.whiteLabelStore.updateWhiteLabelConfig(tenantId, {
        customDomain: domain,
        domainVerified: false,
        sslStatus: 'pending',
      }))!;
    } else {
      config = await this.whiteLabelStore.upsertWhiteLabelConfig({
        tenantId,
        enabled: true,
        branding: this.config.defaultBranding,
        customDomain: domain,
      });
    }

    // Generate verification record
    const verificationRecord = this.generateVerificationRecord(tenantId, domain);

    return { config, verificationRecord };
  }

  /**
   * Verify custom domain
   */
  async verifyCustomDomain(tenantId: string): Promise<{
    verified: boolean;
    error?: string;
  }> {
    const config = await this.whiteLabelStore.getWhiteLabelConfig(tenantId);
    if (!config?.customDomain) {
      throw new EnterpriseError(
        'FEATURE_NOT_AVAILABLE',
        'No custom domain configured',
        400
      );
    }

    if (config.domainVerified) {
      return { verified: true };
    }

    // In a real implementation, this would:
    // 1. Query DNS for the verification record
    // 2. Check if the record matches expected value
    // For now, we'll simulate a verification check

    const verified = await this.checkDNSVerification(tenantId, config.customDomain);

    if (verified) {
      await this.whiteLabelStore.verifyDomain(tenantId);
      return { verified: true };
    }

    return {
      verified: false,
      error: 'DNS verification record not found',
    };
  }

  /**
   * Remove custom domain
   */
  async removeCustomDomain(tenantId: string): Promise<WhiteLabelConfig | null> {
    const config = await this.whiteLabelStore.getWhiteLabelConfig(tenantId);
    if (!config) return null;

    return this.whiteLabelStore.updateWhiteLabelConfig(tenantId, {
      customDomain: undefined,
      domainVerified: false,
      sslStatus: undefined,
    });
  }

  /**
   * Enable white-label
   */
  async enableWhiteLabel(tenantId: string): Promise<WhiteLabelConfig> {
    const hasFeature = await this.licensingService.hasFeature(tenantId, 'whiteLabel');
    if (!hasFeature) {
      throw new EnterpriseError(
        'FEATURE_NOT_AVAILABLE',
        'White-label feature is not available on your current plan',
        403
      );
    }

    const config = await this.whiteLabelStore.getWhiteLabelConfig(tenantId);
    if (!config) {
      return this.whiteLabelStore.upsertWhiteLabelConfig({
        tenantId,
        enabled: true,
        branding: this.config.defaultBranding,
      });
    }

    return (await this.whiteLabelStore.updateWhiteLabelConfig(tenantId, { enabled: true }))!;
  }

  /**
   * Disable white-label
   */
  async disableWhiteLabel(tenantId: string): Promise<WhiteLabelConfig | null> {
    const config = await this.whiteLabelStore.getWhiteLabelConfig(tenantId);
    if (!config) return null;

    return this.whiteLabelStore.updateWhiteLabelConfig(tenantId, { enabled: false });
  }

  /**
   * Update branding
   */
  async updateBranding(tenantId: string, branding: Partial<BrandingConfig>): Promise<WhiteLabelConfig> {
    const hasFeature = await this.licensingService.hasFeature(tenantId, 'whiteLabel');
    if (!hasFeature) {
      throw new EnterpriseError(
        'FEATURE_NOT_AVAILABLE',
        'White-label feature is not available on your current plan',
        403
      );
    }

    const config = await this.whiteLabelStore.getWhiteLabelConfig(tenantId);
    if (!config) {
      return this.whiteLabelStore.upsertWhiteLabelConfig({
        tenantId,
        enabled: true,
        branding: { ...this.config.defaultBranding, ...branding },
      });
    }

    const updatedBranding: BrandingConfig = {
      ...config.branding,
      ...branding,
    };

    return (await this.whiteLabelStore.updateWhiteLabelConfig(tenantId, {
      branding: updatedBranding,
    }))!;
  }

  /**
   * Get effective branding for a domain or tenant
   */
  async getEffectiveBranding(tenantIdOrDomain: string): Promise<BrandingConfig> {
    // First try as domain
    let config = await this.whiteLabelStore.getWhiteLabelConfigByDomain(tenantIdOrDomain);

    // Then try as tenant ID
    if (!config) {
      config = await this.whiteLabelStore.getWhiteLabelConfig(tenantIdOrDomain);
    }

    if (config?.enabled) {
      return config.branding;
    }

    return this.config.defaultBranding;
  }

  /**
   * Validate branding colors
   */
  validateBranding(branding: Partial<BrandingConfig>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

    if (branding.primaryColor && !hexColorRegex.test(branding.primaryColor)) {
      errors.push('Invalid primary color format. Use hex format (e.g., #2563eb)');
    }

    if (branding.accentColor && !hexColorRegex.test(branding.accentColor)) {
      errors.push('Invalid accent color format. Use hex format (e.g., #3b82f6)');
    }

    if (branding.backgroundColor && !hexColorRegex.test(branding.backgroundColor)) {
      errors.push('Invalid background color format. Use hex format (e.g., #ffffff)');
    }

    if (branding.textColor && !hexColorRegex.test(branding.textColor)) {
      errors.push('Invalid text color format. Use hex format (e.g., #1f2937)');
    }

    if (branding.logoUrl && !this.isValidUrl(branding.logoUrl)) {
      errors.push('Invalid logo URL');
    }

    if (branding.faviconUrl && !this.isValidUrl(branding.faviconUrl)) {
      errors.push('Invalid favicon URL');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate CSS variables from branding config
   */
  generateCSSVariables(branding: BrandingConfig): string {
    const variables: string[] = [
      `--primary-color: ${branding.primaryColor}`,
      `--accent-color: ${branding.accentColor}`,
    ];

    if (branding.backgroundColor) {
      variables.push(`--background-color: ${branding.backgroundColor}`);
    }

    if (branding.textColor) {
      variables.push(`--text-color: ${branding.textColor}`);
    }

    if (branding.fontFamily) {
      variables.push(`--font-family: ${branding.fontFamily}`);
    }

    return `:root {\n  ${variables.join(';\n  ')};\n}`;
  }

  /**
   * Generate verification record
   */
  private generateVerificationRecord(
    tenantId: string,
    domain: string
  ): { type: 'TXT' | 'CNAME'; name: string; value: string } {
    if (this.config.verificationMethod === 'dns_txt') {
      return {
        type: 'TXT',
        name: `${this.config.dnsRecordPrefix}.${domain}`,
        value: `secureagent-verify=${tenantId}`,
      };
    }

    return {
      type: 'CNAME',
      name: `${this.config.dnsRecordPrefix}.${domain}`,
      value: `verify.secureagent.io`,
    };
  }

  /**
   * Check DNS verification (simulated)
   */
  private async checkDNSVerification(tenantId: string, domain: string): Promise<boolean> {
    // In a real implementation, this would use DNS queries
    // For now, we simulate success after checking configuration exists
    return true;
  }

  /**
   * Validate domain format
   */
  private isValidDomain(domain: string): boolean {
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(domain);
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create white-label service
 */
export function createWhiteLabelService(
  whiteLabelStore: WhiteLabelStore,
  tenantStore: TenantStore,
  licensingService: LicensingService,
  config?: Partial<WhiteLabelServiceConfig>
): WhiteLabelService {
  return new WhiteLabelService(whiteLabelStore, tenantStore, licensingService, config);
}

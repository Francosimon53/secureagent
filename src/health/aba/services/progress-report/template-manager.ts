/**
 * Template Manager
 *
 * Manages progress report templates with customizable sections,
 * formatting, and payer-specific requirements.
 */

import type { PatientId, KeyValueStoreAdapter } from '../../types.js';

// =============================================================================
// Template Types
// =============================================================================

export interface ReportTemplate {
  id: string;
  userId: string;
  name: string;
  description?: string;
  sections: TemplateSection[];
  headerConfig: HeaderConfig;
  footerConfig: FooterConfig;
  styling: TemplateStyling;
  payerRequirements?: PayerRequirements;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TemplateSection {
  id: string;
  name: string;
  type: SectionType;
  order: number;
  required: boolean;
  content?: string;
  dataBinding?: DataBinding;
  conditionalDisplay?: ConditionalDisplay;
}

export type SectionType =
  | 'patient-info'
  | 'diagnosis'
  | 'authorization'
  | 'treatment-summary'
  | 'goals-progress'
  | 'behavior-data'
  | 'skill-acquisition'
  | 'attendance'
  | 'recommendations'
  | 'signature'
  | 'custom-text'
  | 'custom-table'
  | 'chart';

export interface DataBinding {
  source: string;
  field: string;
  format?: string;
  transform?: string;
}

export interface ConditionalDisplay {
  field: string;
  operator: 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'contains' | 'exists';
  value?: string | number | boolean;
}

export interface HeaderConfig {
  includeLogo: boolean;
  logoUrl?: string;
  clinicName: string;
  clinicAddress?: string;
  clinicPhone?: string;
  clinicNPI?: string;
  includeReportDate: boolean;
  includePeriod: boolean;
}

export interface FooterConfig {
  includePageNumbers: boolean;
  includeDisclaimer: boolean;
  disclaimerText?: string;
  includeSignatureLine: boolean;
  signatureLabels?: string[];
}

export interface TemplateStyling {
  fontFamily: string;
  fontSize: number;
  headerFontSize: number;
  lineHeight: number;
  primaryColor: string;
  secondaryColor: string;
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

export interface PayerRequirements {
  payerId: string;
  payerName: string;
  requiredSections: string[];
  formatRequirements?: string[];
  maxPages?: number;
  specificFields?: Array<{
    field: string;
    required: boolean;
    format?: string;
  }>;
}

// =============================================================================
// Default Template Sections
// =============================================================================

export const DEFAULT_SECTIONS: TemplateSection[] = [
  {
    id: 'patient-info',
    name: 'Patient Information',
    type: 'patient-info',
    order: 1,
    required: true,
  },
  {
    id: 'diagnosis',
    name: 'Diagnosis',
    type: 'diagnosis',
    order: 2,
    required: true,
  },
  {
    id: 'authorization',
    name: 'Authorization Information',
    type: 'authorization',
    order: 3,
    required: true,
  },
  {
    id: 'treatment-summary',
    name: 'Treatment Summary',
    type: 'treatment-summary',
    order: 4,
    required: true,
  },
  {
    id: 'goals-progress',
    name: 'Goals & Progress',
    type: 'goals-progress',
    order: 5,
    required: true,
  },
  {
    id: 'behavior-data',
    name: 'Behavior Data',
    type: 'behavior-data',
    order: 6,
    required: false,
  },
  {
    id: 'skill-acquisition',
    name: 'Skill Acquisition',
    type: 'skill-acquisition',
    order: 7,
    required: false,
  },
  {
    id: 'attendance',
    name: 'Attendance Summary',
    type: 'attendance',
    order: 8,
    required: true,
  },
  {
    id: 'recommendations',
    name: 'Recommendations',
    type: 'recommendations',
    order: 9,
    required: true,
  },
  {
    id: 'signature',
    name: 'Signature',
    type: 'signature',
    order: 10,
    required: true,
  },
];

// =============================================================================
// Default Styling
// =============================================================================

export const DEFAULT_STYLING: TemplateStyling = {
  fontFamily: 'Arial, sans-serif',
  fontSize: 11,
  headerFontSize: 14,
  lineHeight: 1.5,
  primaryColor: '#1a365d',
  secondaryColor: '#4a5568',
  margins: {
    top: 72, // 1 inch in points
    bottom: 72,
    left: 72,
    right: 72,
  },
};

// =============================================================================
// Template Manager Options
// =============================================================================

export interface TemplateManagerOptions {
  db?: KeyValueStoreAdapter;
  defaultClinicInfo?: {
    name: string;
    address?: string;
    phone?: string;
    npi?: string;
    logoUrl?: string;
  };
}

// =============================================================================
// Template Manager
// =============================================================================

export class TemplateManager {
  private readonly db?: KeyValueStoreAdapter;
  private readonly templates = new Map<string, ReportTemplate>();
  private readonly defaultClinicInfo?: TemplateManagerOptions['defaultClinicInfo'];

  constructor(options: TemplateManagerOptions = {}) {
    this.db = options.db;
    this.defaultClinicInfo = options.defaultClinicInfo;
  }

  /**
   * Create a new template
   */
  async createTemplate(
    userId: string,
    template: Omit<ReportTemplate, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ): Promise<ReportTemplate> {
    const now = Date.now();
    const newTemplate: ReportTemplate = {
      ...template,
      id: crypto.randomUUID(),
      userId,
      createdAt: now,
      updatedAt: now,
    };

    if (this.db) {
      await this.db.set(`report-template:${newTemplate.id}`, newTemplate);
      await this.addToIndex(userId, newTemplate.id);
    } else {
      this.templates.set(newTemplate.id, newTemplate);
    }

    return newTemplate;
  }

  /**
   * Get template by ID
   */
  async getTemplate(id: string): Promise<ReportTemplate | null> {
    if (this.db) {
      return this.db.get<ReportTemplate>(`report-template:${id}`);
    }
    return this.templates.get(id) ?? null;
  }

  /**
   * Update a template
   */
  async updateTemplate(
    id: string,
    updates: Partial<ReportTemplate>
  ): Promise<ReportTemplate | null> {
    const existing = await this.getTemplate(id);
    if (!existing) return null;

    const updated: ReportTemplate = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    if (this.db) {
      await this.db.set(`report-template:${id}`, updated);
    } else {
      this.templates.set(id, updated);
    }

    return updated;
  }

  /**
   * Delete a template
   */
  async deleteTemplate(id: string): Promise<boolean> {
    const template = await this.getTemplate(id);
    if (!template) return false;

    if (this.db) {
      await this.db.delete(`report-template:${id}`);
      await this.removeFromIndex(template.userId, id);
    } else {
      this.templates.delete(id);
    }

    return true;
  }

  /**
   * List templates for a user
   */
  async listTemplates(userId: string): Promise<ReportTemplate[]> {
    if (this.db) {
      const index = await this.getIndex(userId);
      const templates: ReportTemplate[] = [];

      for (const id of index) {
        const template = await this.getTemplate(id);
        if (template) templates.push(template);
      }

      return templates.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    return Array.from(this.templates.values())
      .filter((t) => t.userId === userId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Get default template for a user
   */
  async getDefaultTemplate(userId: string): Promise<ReportTemplate> {
    const templates = await this.listTemplates(userId);
    const defaultTemplate = templates.find((t) => t.isDefault);

    if (defaultTemplate) return defaultTemplate;

    // Create default template if none exists
    return this.createDefaultTemplate(userId);
  }

  /**
   * Get template for a specific payer
   */
  async getPayerTemplate(userId: string, payerId: string): Promise<ReportTemplate | null> {
    const templates = await this.listTemplates(userId);
    return templates.find((t) => t.payerRequirements?.payerId === payerId) ?? null;
  }

  /**
   * Create default template
   */
  async createDefaultTemplate(userId: string): Promise<ReportTemplate> {
    const headerConfig: HeaderConfig = {
      includeLogo: !!this.defaultClinicInfo?.logoUrl,
      logoUrl: this.defaultClinicInfo?.logoUrl,
      clinicName: this.defaultClinicInfo?.name ?? 'ABA Therapy Center',
      clinicAddress: this.defaultClinicInfo?.address,
      clinicPhone: this.defaultClinicInfo?.phone,
      clinicNPI: this.defaultClinicInfo?.npi,
      includeReportDate: true,
      includePeriod: true,
    };

    const footerConfig: FooterConfig = {
      includePageNumbers: true,
      includeDisclaimer: true,
      disclaimerText:
        'This document contains confidential patient information protected by HIPAA. ' +
        'Unauthorized disclosure is prohibited.',
      includeSignatureLine: true,
      signatureLabels: ['BCBA Signature', 'Date', 'Parent/Guardian Signature', 'Date'],
    };

    return this.createTemplate(userId, {
      name: 'Default Progress Report',
      description: 'Standard progress report template for ABA therapy',
      sections: DEFAULT_SECTIONS,
      headerConfig,
      footerConfig,
      styling: DEFAULT_STYLING,
      isDefault: true,
    });
  }

  /**
   * Create payer-specific template
   */
  async createPayerTemplate(
    userId: string,
    payerId: string,
    payerName: string,
    requirements: Omit<PayerRequirements, 'payerId' | 'payerName'>
  ): Promise<ReportTemplate> {
    const defaultTemplate = await this.getDefaultTemplate(userId);

    // Ensure required sections are included
    const sections = [...defaultTemplate.sections];
    for (const requiredSection of requirements.requiredSections) {
      if (!sections.find((s) => s.type === requiredSection)) {
        sections.push({
          id: requiredSection,
          name: this.getSectionName(requiredSection),
          type: requiredSection as SectionType,
          order: sections.length + 1,
          required: true,
        });
      }
    }

    // Mark required sections
    for (const section of sections) {
      if (requirements.requiredSections.includes(section.type)) {
        section.required = true;
      }
    }

    return this.createTemplate(userId, {
      name: `${payerName} Progress Report`,
      description: `Progress report template with ${payerName} requirements`,
      sections: sections.sort((a, b) => a.order - b.order),
      headerConfig: defaultTemplate.headerConfig,
      footerConfig: defaultTemplate.footerConfig,
      styling: defaultTemplate.styling,
      payerRequirements: {
        payerId,
        payerName,
        ...requirements,
      },
      isDefault: false,
    });
  }

  /**
   * Duplicate a template
   */
  async duplicateTemplate(id: string, newName: string): Promise<ReportTemplate | null> {
    const template = await this.getTemplate(id);
    if (!template) return null;

    return this.createTemplate(template.userId, {
      ...template,
      name: newName,
      isDefault: false,
    });
  }

  /**
   * Add a section to a template
   */
  async addSection(
    templateId: string,
    section: Omit<TemplateSection, 'id' | 'order'>
  ): Promise<ReportTemplate | null> {
    const template = await this.getTemplate(templateId);
    if (!template) return null;

    const newSection: TemplateSection = {
      ...section,
      id: crypto.randomUUID(),
      order: template.sections.length + 1,
    };

    return this.updateTemplate(templateId, {
      sections: [...template.sections, newSection],
    });
  }

  /**
   * Remove a section from a template
   */
  async removeSection(templateId: string, sectionId: string): Promise<ReportTemplate | null> {
    const template = await this.getTemplate(templateId);
    if (!template) return null;

    const sections = template.sections
      .filter((s) => s.id !== sectionId)
      .map((s, i) => ({ ...s, order: i + 1 }));

    return this.updateTemplate(templateId, { sections });
  }

  /**
   * Reorder sections
   */
  async reorderSections(
    templateId: string,
    sectionIds: string[]
  ): Promise<ReportTemplate | null> {
    const template = await this.getTemplate(templateId);
    if (!template) return null;

    const sections = sectionIds
      .map((id, index) => {
        const section = template.sections.find((s) => s.id === id);
        return section ? { ...section, order: index + 1 } : null;
      })
      .filter((s): s is TemplateSection => s !== null);

    return this.updateTemplate(templateId, { sections });
  }

  /**
   * Validate template against payer requirements
   */
  validateTemplate(template: ReportTemplate): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required sections
    const sectionTypes = template.sections.map((s) => s.type);

    if (!sectionTypes.includes('patient-info')) {
      errors.push('Patient Information section is required');
    }
    if (!sectionTypes.includes('goals-progress')) {
      errors.push('Goals & Progress section is required');
    }
    if (!sectionTypes.includes('signature')) {
      warnings.push('Signature section is recommended');
    }

    // Check payer requirements
    if (template.payerRequirements) {
      for (const required of template.payerRequirements.requiredSections) {
        if (!sectionTypes.includes(required as SectionType)) {
          errors.push(`${this.getSectionName(required)} section is required by ${template.payerRequirements.payerName}`);
        }
      }

      if (template.payerRequirements.maxPages) {
        warnings.push(`${template.payerRequirements.payerName} requires reports under ${template.payerRequirements.maxPages} pages`);
      }
    }

    // Check header config
    if (!template.headerConfig.clinicName) {
      errors.push('Clinic name is required in header');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get section display name
   */
  private getSectionName(type: string): string {
    const names: Record<string, string> = {
      'patient-info': 'Patient Information',
      diagnosis: 'Diagnosis',
      authorization: 'Authorization Information',
      'treatment-summary': 'Treatment Summary',
      'goals-progress': 'Goals & Progress',
      'behavior-data': 'Behavior Data',
      'skill-acquisition': 'Skill Acquisition',
      attendance: 'Attendance Summary',
      recommendations: 'Recommendations',
      signature: 'Signature',
      'custom-text': 'Custom Text',
      'custom-table': 'Custom Table',
      chart: 'Chart',
    };

    return names[type] ?? type;
  }

  // Database index helpers
  private async getIndex(userId: string): Promise<string[]> {
    if (!this.db) return [];
    const index = await this.db.get<string[]>(`index:report-templates:${userId}`);
    return index ?? [];
  }

  private async addToIndex(userId: string, id: string): Promise<void> {
    if (!this.db) return;
    const index = await this.getIndex(userId);
    if (!index.includes(id)) {
      index.push(id);
      await this.db.set(`index:report-templates:${userId}`, index);
    }
  }

  private async removeFromIndex(userId: string, id: string): Promise<void> {
    if (!this.db) return;
    const index = await this.getIndex(userId);
    const newIndex = index.filter((i) => i !== id);
    await this.db.set(`index:report-templates:${userId}`, newIndex);
  }
}

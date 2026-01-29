/**
 * Dealer/Vendor Contact Management
 *
 * Manages vendor contacts and communication channels for negotiations.
 */

import type { VendorInfo, VendorCategory } from '../types.js';

/**
 * Known vendor info (simplified for the database)
 */
interface KnownVendorInfo {
  name: string;
  type?: string;
  industry?: string;
  category?: VendorCategory;
}

/**
 * Known vendor contact (simplified)
 */
interface KnownVendorContact {
  vendor: KnownVendorInfo;
  contacts: Array<{
    type: 'email' | 'phone' | 'chat' | 'mail' | 'web-form';
    value: string;
    department?: string;
    verified: boolean;
  }>;
  preferences: {
    preferredMethod: 'email' | 'phone' | 'chat' | 'mail';
    bestTimeToContact?: string;
  };
}

/**
 * Contact method preferences
 */
export interface ContactPreferences {
  preferredMethod: 'email' | 'phone' | 'chat' | 'mail';
  bestTimeToContact?: string;
  timezone?: string;
  language?: string;
}

/**
 * Vendor contact record
 */
export interface VendorContact {
  id: string;
  vendor: VendorInfo;
  contacts: ContactInfo[];
  preferences: ContactPreferences;
  negotiationHistory: NegotiationAttempt[];
  notes: string[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Contact information
 */
export interface ContactInfo {
  type: 'email' | 'phone' | 'chat' | 'mail' | 'web-form';
  value: string;
  department?: string;
  name?: string;
  title?: string;
  verified: boolean;
  lastUsed?: number;
}

/**
 * Record of a negotiation attempt
 */
export interface NegotiationAttempt {
  date: number;
  method: 'email' | 'phone' | 'chat';
  outcome: 'success' | 'partial' | 'rejected' | 'no-response';
  originalAmount: number;
  finalAmount?: number;
  notes?: string;
}

/**
 * Known vendor database for common services
 */
const KNOWN_VENDORS: Map<string, KnownVendorContact> = new Map([
  ['comcast', {
    vendor: {
      name: 'Comcast/Xfinity',
      type: 'telecom',
      industry: 'telecommunications',
    },
    contacts: [
      { type: 'phone', value: '1-800-934-6489', department: 'Customer Retention', verified: true },
      { type: 'chat', value: 'https://www.xfinity.com/support/contact-us', verified: true },
    ],
    preferences: {
      preferredMethod: 'phone',
      bestTimeToContact: 'Early morning or late evening',
    },
  }],
  ['att', {
    vendor: {
      name: 'AT&T',
      type: 'telecom',
      industry: 'telecommunications',
    },
    contacts: [
      { type: 'phone', value: '1-800-288-2020', department: 'Customer Service', verified: true },
      { type: 'phone', value: '1-800-331-0500', department: 'Retention', verified: true },
    ],
    preferences: {
      preferredMethod: 'phone',
      bestTimeToContact: 'Weekday mornings',
    },
  }],
  ['verizon', {
    vendor: {
      name: 'Verizon',
      type: 'telecom',
      industry: 'telecommunications',
    },
    contacts: [
      { type: 'phone', value: '1-800-922-0204', department: 'Customer Service', verified: true },
      { type: 'chat', value: 'https://www.verizon.com/support/contact-us/', verified: true },
    ],
    preferences: {
      preferredMethod: 'chat',
    },
  }],
  ['spectrum', {
    vendor: {
      name: 'Spectrum',
      type: 'telecom',
      industry: 'telecommunications',
    },
    contacts: [
      { type: 'phone', value: '1-833-267-6094', department: 'Customer Service', verified: true },
    ],
    preferences: {
      preferredMethod: 'phone',
    },
  }],
  ['netflix', {
    vendor: {
      name: 'Netflix',
      type: 'streaming',
      industry: 'entertainment',
    },
    contacts: [
      { type: 'phone', value: '1-866-579-7172', department: 'Customer Service', verified: true },
      { type: 'chat', value: 'https://help.netflix.com/contactus', verified: true },
    ],
    preferences: {
      preferredMethod: 'chat',
    },
  }],
  ['adobe', {
    vendor: {
      name: 'Adobe',
      type: 'software',
      industry: 'technology',
    },
    contacts: [
      { type: 'phone', value: '1-800-833-6687', department: 'Customer Service', verified: true },
      { type: 'chat', value: 'https://helpx.adobe.com/contact.html', verified: true },
    ],
    preferences: {
      preferredMethod: 'chat',
      bestTimeToContact: 'Business hours PST',
    },
  }],
  ['sirius', {
    vendor: {
      name: 'SiriusXM',
      type: 'streaming',
      industry: 'entertainment',
    },
    contacts: [
      { type: 'phone', value: '1-866-635-2349', department: 'Customer Retention', verified: true },
    ],
    preferences: {
      preferredMethod: 'phone',
      bestTimeToContact: 'Call and ask for retention department',
    },
  }],
]);

/**
 * Vendor contact manager class
 */
export class VendorContactManager {
  private customContacts: Map<string, VendorContact> = new Map();

  /**
   * Find contact information for a vendor
   */
  findVendor(vendorName: string): VendorContact | null {
    const normalized = this.normalizeVendorName(vendorName);

    // Check custom contacts first
    if (this.customContacts.has(normalized)) {
      return this.customContacts.get(normalized)!;
    }

    // Check known vendors
    for (const [key, partial] of KNOWN_VENDORS) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return this.createFullContact(partial);
      }
    }

    return null;
  }

  /**
   * Add or update a vendor contact
   */
  saveVendorContact(contact: VendorContact): void {
    const normalized = this.normalizeVendorName(contact.vendor.name);
    contact.updatedAt = Date.now();
    this.customContacts.set(normalized, contact);
  }

  /**
   * Add a contact method to a vendor
   */
  addContactMethod(vendorName: string, contact: ContactInfo): VendorContact | null {
    const existing = this.findVendor(vendorName);
    if (!existing) {
      return null;
    }

    // Check if contact already exists
    const existingContact = existing.contacts.find(
      c => c.type === contact.type && c.value === contact.value
    );

    if (!existingContact) {
      existing.contacts.push(contact);
      existing.updatedAt = Date.now();
      this.saveVendorContact(existing);
    }

    return existing;
  }

  /**
   * Record a negotiation attempt
   */
  recordNegotiationAttempt(vendorName: string, attempt: NegotiationAttempt): void {
    let contact = this.findVendor(vendorName);

    if (!contact) {
      // Create a new contact record
      contact = {
        id: crypto.randomUUID(),
        vendor: {
          id: crypto.randomUUID(),
          name: vendorName,
          category: 'other',
          type: 'unknown',
        },
        contacts: [],
        preferences: {
          preferredMethod: 'email',
        },
        negotiationHistory: [],
        notes: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }

    contact.negotiationHistory.push(attempt);
    contact.updatedAt = Date.now();
    this.saveVendorContact(contact);
  }

  /**
   * Get negotiation success rate for a vendor
   */
  getSuccessRate(vendorName: string): { rate: number; attempts: number } | null {
    const contact = this.findVendor(vendorName);
    if (!contact || contact.negotiationHistory.length === 0) {
      return null;
    }

    const successes = contact.negotiationHistory.filter(
      a => a.outcome === 'success' || a.outcome === 'partial'
    ).length;

    return {
      rate: successes / contact.negotiationHistory.length,
      attempts: contact.negotiationHistory.length,
    };
  }

  /**
   * Get average savings for a vendor
   */
  getAverageSavings(vendorName: string): number | null {
    const contact = this.findVendor(vendorName);
    if (!contact) {
      return null;
    }

    const successfulNegotiations = contact.negotiationHistory.filter(
      a => (a.outcome === 'success' || a.outcome === 'partial') && a.finalAmount !== undefined
    );

    if (successfulNegotiations.length === 0) {
      return null;
    }

    const totalSavings = successfulNegotiations.reduce(
      (sum, a) => sum + (a.originalAmount - (a.finalAmount ?? a.originalAmount)),
      0
    );

    return totalSavings / successfulNegotiations.length;
  }

  /**
   * Get best contact method based on history
   */
  getBestContactMethod(vendorName: string): ContactInfo | null {
    const contact = this.findVendor(vendorName);
    if (!contact || contact.contacts.length === 0) {
      return null;
    }

    // Analyze which method has best success rate
    const methodStats = new Map<string, { successes: number; total: number }>();

    for (const attempt of contact.negotiationHistory) {
      const stats = methodStats.get(attempt.method) ?? { successes: 0, total: 0 };
      stats.total++;
      if (attempt.outcome === 'success' || attempt.outcome === 'partial') {
        stats.successes++;
      }
      methodStats.set(attempt.method, stats);
    }

    // Find best method
    let bestMethod = contact.preferences.preferredMethod;
    let bestRate = 0;

    for (const [method, stats] of methodStats) {
      if (stats.total >= 2) {
        const rate = stats.successes / stats.total;
        if (rate > bestRate) {
          bestRate = rate;
          bestMethod = method as 'email' | 'phone' | 'chat';
        }
      }
    }

    // Find contact info for best method
    return contact.contacts.find(c => c.type === bestMethod) ?? contact.contacts[0];
  }

  /**
   * Get tips for negotiating with a vendor
   */
  getNegotiationTips(vendorName: string): string[] {
    const contact = this.findVendor(vendorName);
    const tips: string[] = [];

    if (!contact) {
      return [
        'Research competitor pricing before calling',
        'Be polite but firm about your budget constraints',
        'Ask to speak with the retention department',
        'Mention you\'re considering cancelling',
      ];
    }

    // Add general tips
    if (contact.preferences.bestTimeToContact) {
      tips.push(`Best time to contact: ${contact.preferences.bestTimeToContact}`);
    }

    // Analyze history for insights
    const successRate = this.getSuccessRate(vendorName);
    if (successRate && successRate.rate > 0.5) {
      tips.push(`This vendor has historically been open to negotiation (${Math.round(successRate.rate * 100)}% success rate)`);
    }

    const avgSavings = this.getAverageSavings(vendorName);
    if (avgSavings && avgSavings > 0) {
      tips.push(`Average savings achieved: $${avgSavings.toFixed(2)}`);
    }

    const bestContact = this.getBestContactMethod(vendorName);
    if (bestContact) {
      tips.push(`Recommended contact method: ${bestContact.type}`);
    }

    // Vendor-specific tips
    switch (contact.vendor.type) {
      case 'telecom':
        tips.push('Ask for the retention or loyalty department');
        tips.push('Mention competitor offers (if you have them)');
        tips.push('Be prepared to actually cancel - they often call back with better offers');
        break;
      case 'streaming':
        tips.push('Ask about promotional rates for existing customers');
        tips.push('Consider downgrading temporarily then upgrading later');
        break;
      case 'software':
        tips.push('Ask about education or non-profit discounts');
        tips.push('Check if annual payment gets a discount');
        tips.push('Ask about legacy plans with better pricing');
        break;
    }

    return tips;
  }

  /**
   * Create a full VendorContact from a partial or known vendor
   */
  private createFullContact(partial: Partial<VendorContact> | KnownVendorContact): VendorContact {
    const knownVendor = partial as KnownVendorContact;
    const partialVendor = partial as Partial<VendorContact>;

    // Handle vendor info - could be full VendorInfo or KnownVendorInfo
    let vendor: VendorInfo;
    if (partialVendor.vendor && 'id' in partialVendor.vendor) {
      vendor = partialVendor.vendor;
    } else if (knownVendor.vendor) {
      vendor = {
        id: crypto.randomUUID(),
        name: knownVendor.vendor.name,
        category: knownVendor.vendor.category ?? 'other',
        type: knownVendor.vendor.type,
        industry: knownVendor.vendor.industry,
      };
    } else {
      vendor = { id: crypto.randomUUID(), name: 'Unknown', category: 'other' };
    }

    return {
      id: crypto.randomUUID(),
      vendor,
      contacts: (partial.contacts ?? []) as ContactInfo[],
      preferences: (partial.preferences ?? { preferredMethod: 'email' }) as ContactPreferences,
      negotiationHistory: (partialVendor.negotiationHistory ?? []),
      notes: (partialVendor.notes ?? []),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Normalize vendor name for lookup
   */
  private normalizeVendorName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * List all known vendors
   */
  listKnownVendors(): string[] {
    const vendors = new Set<string>();

    for (const partial of KNOWN_VENDORS.values()) {
      if (partial.vendor?.name) {
        vendors.add(partial.vendor.name);
      }
    }

    for (const contact of this.customContacts.values()) {
      vendors.add(contact.vendor.name);
    }

    return Array.from(vendors).sort();
  }

  /**
   * Search vendors by industry or type
   */
  searchVendors(criteria: {
    industry?: string;
    type?: string;
    hasPhone?: boolean;
    hasChat?: boolean;
  }): VendorContact[] {
    const results: VendorContact[] = [];

    const allVendors = [
      ...Array.from(KNOWN_VENDORS.values()).map(p => this.createFullContact(p)),
      ...Array.from(this.customContacts.values()),
    ];

    for (const contact of allVendors) {
      let matches = true;

      if (criteria.industry && contact.vendor.industry !== criteria.industry) {
        matches = false;
      }

      if (criteria.type && contact.vendor.type !== criteria.type) {
        matches = false;
      }

      if (criteria.hasPhone && !contact.contacts.some(c => c.type === 'phone')) {
        matches = false;
      }

      if (criteria.hasChat && !contact.contacts.some(c => c.type === 'chat')) {
        matches = false;
      }

      if (matches) {
        results.push(contact);
      }
    }

    return results;
  }
}

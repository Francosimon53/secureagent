/**
 * Document Manager
 *
 * Manages supporting documents for insurance claims.
 */

import type { ClaimDocument, ClaimDocumentType } from '../types.js';

/**
 * Document validation result
 */
export interface DocumentValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * Document upload options
 */
export interface UploadOptions {
  maxSizeBytes: number;
  allowedTypes: string[];
  requireDescription: boolean;
}

/**
 * Document requirements by claim type
 */
const DOCUMENT_REQUIREMENTS: Map<string, {
  required: ClaimDocumentType[];
  optional: ClaimDocumentType[];
  notes: string[];
}> = new Map([
  ['auto', {
    required: ['police_report', 'photo', 'estimate'],
    optional: ['receipt', 'medical_record', 'other'],
    notes: [
      'Police report required for accidents involving other vehicles',
      'Photos should show all damage from multiple angles',
      'Repair estimates from at least one certified shop',
    ],
  }],
  ['home', {
    required: ['photo', 'estimate'],
    optional: ['police_report', 'receipt', 'invoice', 'other'],
    notes: [
      'Document damage before any repairs',
      'Keep receipts for any emergency repairs',
      'Get multiple repair estimates if possible',
    ],
  }],
  ['health', {
    required: ['medical_record', 'invoice'],
    optional: ['receipt', 'other', 'other'],
    notes: [
      'Include itemized bills from healthcare providers',
      'Keep copies of explanation of benefits (EOB)',
      'Document any out-of-pocket expenses',
    ],
  }],
  ['travel', {
    required: ['receipt', 'other'],
    optional: ['photo', 'medical_record', 'police_report', 'other'],
    notes: [
      'Keep all travel receipts and booking confirmations',
      'Document any communication with airlines/hotels',
      'Police report required for theft claims',
    ],
  }],
  ['life', {
    required: ['medical_record', 'id_document'],
    optional: ['other'],
    notes: [
      'Death certificate is typically required',
      'Include any relevant medical records',
      'Provide beneficiary identification documents',
    ],
  }],
  ['renters', {
    required: ['photo', 'receipt'],
    optional: ['police_report', 'proof_of_ownership', 'other'],
    notes: [
      'Document all damaged or stolen items',
      'Include receipts or proof of ownership for valuable items',
      'File police report for theft or vandalism claims',
    ],
  }],
]);

/**
 * Document manager class
 */
export class DocumentManager {
  private documents: Map<string, ClaimDocument[]> = new Map();
  private readonly defaultOptions: UploadOptions = {
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/jpeg', 'image/png', 'application/pdf', 'image/heic'],
    requireDescription: true,
  };

  /**
   * Get document requirements for a claim type
   */
  getRequirements(claimType: string): {
    required: ClaimDocumentType[];
    optional: ClaimDocumentType[];
    notes: string[];
  } {
    const requirements = DOCUMENT_REQUIREMENTS.get(claimType);
    if (!requirements) {
      return {
        required: ['photo', 'receipt'],
        optional: ['other', 'other'],
        notes: ['Provide documentation supporting your claim'],
      };
    }
    return requirements;
  }

  /**
   * Add a document to a claim
   */
  addDocument(
    claimId: string,
    document: Omit<ClaimDocument, 'id' | 'uploadedAt' | 'verified'>
  ): ClaimDocument {
    const doc: ClaimDocument = {
      ...document,
      id: crypto.randomUUID(),
      uploadedAt: Date.now(),
      verified: false,
    };

    const existing = this.documents.get(claimId) ?? [];
    existing.push(doc);
    this.documents.set(claimId, existing);

    return doc;
  }

  /**
   * Get documents for a claim
   */
  getDocuments(claimId: string): ClaimDocument[] {
    return this.documents.get(claimId) ?? [];
  }

  /**
   * Get document by ID
   */
  getDocument(claimId: string, documentId: string): ClaimDocument | null {
    const docs = this.documents.get(claimId) ?? [];
    return docs.find(d => d.id === documentId) ?? null;
  }

  /**
   * Remove a document
   */
  removeDocument(claimId: string, documentId: string): boolean {
    const docs = this.documents.get(claimId);
    if (!docs) {
      return false;
    }

    const index = docs.findIndex(d => d.id === documentId);
    if (index === -1) {
      return false;
    }

    docs.splice(index, 1);
    this.documents.set(claimId, docs);
    return true;
  }

  /**
   * Update document verification status
   */
  updateDocumentVerification(
    claimId: string,
    documentId: string,
    verified: boolean
  ): ClaimDocument | null {
    const docs = this.documents.get(claimId);
    if (!docs) {
      return null;
    }

    const doc = docs.find(d => d.id === documentId);
    if (!doc) {
      return null;
    }

    doc.verified = verified;
    this.documents.set(claimId, docs);
    return doc;
  }

  /**
   * Validate a document before upload
   */
  validateDocument(
    file: { name: string; size: number; type: string },
    options?: Partial<UploadOptions>
  ): DocumentValidation {
    const opts = { ...this.defaultOptions, ...options };
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check file size
    if (file.size > opts.maxSizeBytes) {
      const maxMB = opts.maxSizeBytes / (1024 * 1024);
      errors.push(`File size exceeds maximum of ${maxMB}MB`);
    } else if (file.size > opts.maxSizeBytes * 0.8) {
      warnings.push('File is large and may take longer to upload');
    }

    // Check file type
    if (!opts.allowedTypes.includes(file.type)) {
      errors.push(`File type ${file.type} is not allowed`);
      suggestions.push(`Allowed types: ${opts.allowedTypes.join(', ')}`);
    }

    // Check file name
    if (file.name.length > 255) {
      errors.push('File name is too long');
    }

    // Suggestions based on file type
    if (file.type.startsWith('image/')) {
      suggestions.push('Ensure the image is clear and damage is visible');
      if (file.size < 100000) {
        warnings.push('Image may be too small/low quality');
      }
    }

    if (file.type === 'application/pdf') {
      suggestions.push('Ensure PDF is not password protected');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * Check if claim has all required documents
   */
  checkRequiredDocuments(claimId: string, claimType: string): {
    complete: boolean;
    missing: ClaimDocumentType[];
    present: ClaimDocumentType[];
    optional: ClaimDocumentType[];
  } {
    const requirements = this.getRequirements(claimType);
    const docs = this.getDocuments(claimId);
    const presentTypes = new Set(docs.map(d => d.type));

    const missing: ClaimDocumentType[] = [];
    const present: ClaimDocumentType[] = [];

    for (const required of requirements.required) {
      if (presentTypes.has(required)) {
        present.push(required);
      } else {
        missing.push(required);
      }
    }

    const optional = requirements.optional.filter(t => presentTypes.has(t));

    return {
      complete: missing.length === 0,
      missing,
      present,
      optional,
    };
  }

  /**
   * Get document type description
   */
  getDocumentTypeDescription(type: ClaimDocumentType): string {
    const descriptions: Record<ClaimDocumentType, string> = {
      photo: 'Photograph documenting damage or incident',
      receipt: 'Purchase receipt or proof of payment',
      estimate: 'Repair estimate from a qualified professional',
      police_report: 'Official police report of the incident',
      medical_record: 'Medical records or documentation',
      invoice: 'Invoice or bill for services',
      id_document: 'Identification document',
      proof_of_ownership: 'Proof of ownership document',
      other: 'Other supporting documentation',
    };

    return descriptions[type] ?? 'Supporting document';
  }

  /**
   * Generate document checklist for a claim type
   */
  generateChecklist(claimType: string): Array<{
    type: ClaimDocumentType;
    description: string;
    required: boolean;
    tips: string[];
  }> {
    const requirements = this.getRequirements(claimType);
    const checklist: Array<{
      type: ClaimDocumentType;
      description: string;
      required: boolean;
      tips: string[];
    }> = [];

    for (const type of requirements.required) {
      checklist.push({
        type,
        description: this.getDocumentTypeDescription(type),
        required: true,
        tips: this.getDocumentTips(type, claimType),
      });
    }

    for (const type of requirements.optional) {
      checklist.push({
        type,
        description: this.getDocumentTypeDescription(type),
        required: false,
        tips: this.getDocumentTips(type, claimType),
      });
    }

    return checklist;
  }

  /**
   * Get tips for a document type
   */
  private getDocumentTips(type: ClaimDocumentType, claimType: string): string[] {
    const tips: string[] = [];

    switch (type) {
      case 'photo':
        tips.push('Take photos from multiple angles');
        tips.push('Include wide shots and close-ups');
        tips.push('Ensure good lighting');
        if (claimType === 'auto') {
          tips.push('Include photos of the vehicle identification number (VIN)');
          tips.push('Photograph the accident scene if safe to do so');
        }
        if (claimType === 'home') {
          tips.push('Include photos showing the extent of damage');
          tips.push('Photograph any damaged personal property');
        }
        break;

      case 'receipt':
        tips.push('Ensure receipt is legible');
        tips.push('Include date of purchase');
        tips.push('Show itemized costs if applicable');
        break;

      case 'estimate':
        tips.push('Get estimates from licensed professionals');
        tips.push('Include detailed breakdown of costs');
        tips.push('Consider getting multiple estimates');
        break;

      case 'police_report':
        tips.push('Request official copy from police department');
        tips.push('Include case number');
        tips.push('May take several days to obtain');
        break;

      case 'medical_record':
        tips.push('Include treatment dates and descriptions');
        tips.push('Request itemized bills');
        tips.push('Include provider information');
        break;

      case 'invoice':
        tips.push('Ensure invoice is dated');
        tips.push('Include provider contact information');
        tips.push('Show services rendered');
        break;

      case 'id_document':
        tips.push('Provide clear copy of government-issued ID');
        tips.push('Ensure all information is legible');
        break;

      case 'proof_of_ownership':
        tips.push('Include title, deed, or registration documents');
        tips.push('May include purchase receipts for items');
        break;

      case 'other':
        tips.push('Include all relevant supporting documentation');
        tips.push('Keep records of any correspondence');
        break;
    }

    return tips;
  }

  /**
   * Organize documents by type
   */
  organizeByType(claimId: string): Map<ClaimDocumentType, ClaimDocument[]> {
    const docs = this.getDocuments(claimId);
    const organized = new Map<ClaimDocumentType, ClaimDocument[]>();

    for (const doc of docs) {
      const existing = organized.get(doc.type) ?? [];
      existing.push(doc);
      organized.set(doc.type, existing);
    }

    return organized;
  }

  /**
   * Get document summary for a claim
   */
  getDocumentSummary(claimId: string, claimType: string): {
    totalCount: number;
    totalSizeBytes: number;
    byType: Map<ClaimDocumentType, number>;
    requirements: {
      complete: boolean;
      missing: ClaimDocumentType[];
      present: ClaimDocumentType[];
      optional: ClaimDocumentType[];
    };
  } {
    const docs = this.getDocuments(claimId);
    const byType = new Map<ClaimDocumentType, number>();

    let totalSizeBytes = 0;
    for (const doc of docs) {
      const count = byType.get(doc.type) ?? 0;
      byType.set(doc.type, count + 1);
      totalSizeBytes += doc.size ?? 0;
    }

    return {
      totalCount: docs.length,
      totalSizeBytes,
      byType,
      requirements: this.checkRequiredDocuments(claimId, claimType),
    };
  }
}

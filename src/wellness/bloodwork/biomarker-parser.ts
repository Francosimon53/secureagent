/**
 * Biomarker Parser
 *
 * Parses extracted biomarkers and determines status based on reference ranges.
 */

import type {
  ExtractedBiomarker,
  Biomarker,
  BiomarkerStatus,
  BiomarkerCategory,
  ReferenceRange,
} from '../types.js';

// =============================================================================
// Reference Range Definitions
// =============================================================================

interface StandardRange {
  low: number;
  high: number;
  optimalLow?: number;
  optimalHigh?: number;
  unit: string;
  criticalLow?: number;
  criticalHigh?: number;
}

/**
 * Standard reference ranges for common biomarkers
 * Note: These are general guidelines; actual ranges may vary by lab
 */
const STANDARD_RANGES: Record<string, StandardRange> = {
  // Lipid Panel
  'total cholesterol': {
    low: 0,
    high: 200,
    optimalLow: 125,
    optimalHigh: 180,
    unit: 'mg/dL',
    criticalHigh: 300,
  },
  'hdl cholesterol': {
    low: 40,
    high: 100,
    optimalLow: 50,
    optimalHigh: 80,
    unit: 'mg/dL',
    criticalLow: 30,
  },
  'ldl cholesterol': {
    low: 0,
    high: 100,
    optimalLow: 0,
    optimalHigh: 70,
    unit: 'mg/dL',
    criticalHigh: 190,
  },
  triglycerides: {
    low: 0,
    high: 150,
    optimalLow: 0,
    optimalHigh: 100,
    unit: 'mg/dL',
    criticalHigh: 500,
  },

  // Metabolic
  glucose: {
    low: 70,
    high: 100,
    optimalLow: 75,
    optimalHigh: 90,
    unit: 'mg/dL',
    criticalLow: 50,
    criticalHigh: 400,
  },
  hba1c: {
    low: 4.0,
    high: 5.6,
    optimalLow: 4.5,
    optimalHigh: 5.2,
    unit: '%',
    criticalHigh: 10,
  },
  creatinine: {
    low: 0.7,
    high: 1.3,
    unit: 'mg/dL',
    criticalHigh: 10,
  },
  bun: {
    low: 7,
    high: 20,
    unit: 'mg/dL',
    criticalHigh: 100,
  },
  sodium: {
    low: 136,
    high: 145,
    unit: 'mEq/L',
    criticalLow: 120,
    criticalHigh: 160,
  },
  potassium: {
    low: 3.5,
    high: 5.0,
    unit: 'mEq/L',
    criticalLow: 2.5,
    criticalHigh: 6.5,
  },

  // Thyroid
  tsh: {
    low: 0.4,
    high: 4.0,
    optimalLow: 1.0,
    optimalHigh: 2.5,
    unit: 'mIU/L',
    criticalLow: 0.1,
    criticalHigh: 10,
  },
  't4': {
    low: 4.5,
    high: 12.0,
    unit: 'µg/dL',
  },
  't3': {
    low: 80,
    high: 200,
    unit: 'ng/dL',
  },

  // CBC
  hemoglobin: {
    low: 12.0,
    high: 17.5,
    unit: 'g/dL',
    criticalLow: 7,
    criticalHigh: 20,
  },
  hematocrit: {
    low: 36,
    high: 50,
    unit: '%',
    criticalLow: 20,
    criticalHigh: 60,
  },
  wbc: {
    low: 4.5,
    high: 11.0,
    unit: 'K/uL',
    criticalLow: 2,
    criticalHigh: 30,
  },
  rbc: {
    low: 4.0,
    high: 5.5,
    unit: 'M/uL',
  },
  platelet: {
    low: 150,
    high: 400,
    unit: 'K/uL',
    criticalLow: 50,
    criticalHigh: 1000,
  },

  // Liver
  ast: {
    low: 10,
    high: 40,
    unit: 'U/L',
    criticalHigh: 500,
  },
  alt: {
    low: 7,
    high: 56,
    unit: 'U/L',
    criticalHigh: 500,
  },
  'alkaline phosphatase': {
    low: 44,
    high: 147,
    unit: 'U/L',
  },
  'total bilirubin': {
    low: 0.1,
    high: 1.2,
    unit: 'mg/dL',
    criticalHigh: 12,
  },
  albumin: {
    low: 3.5,
    high: 5.0,
    unit: 'g/dL',
    criticalLow: 2,
  },

  // Vitamins
  'vitamin d': {
    low: 30,
    high: 100,
    optimalLow: 40,
    optimalHigh: 70,
    unit: 'ng/mL',
  },
  'vitamin b12': {
    low: 200,
    high: 900,
    optimalLow: 400,
    optimalHigh: 700,
    unit: 'pg/mL',
  },
  ferritin: {
    low: 12,
    high: 300,
    optimalLow: 50,
    optimalHigh: 150,
    unit: 'ng/mL',
  },

  // Inflammation
  'c-reactive protein': {
    low: 0,
    high: 3.0,
    optimalLow: 0,
    optimalHigh: 1.0,
    unit: 'mg/L',
    criticalHigh: 10,
  },
  'hs-crp': {
    low: 0,
    high: 3.0,
    optimalLow: 0,
    optimalHigh: 1.0,
    unit: 'mg/L',
  },
  homocysteine: {
    low: 4,
    high: 15,
    optimalLow: 5,
    optimalHigh: 10,
    unit: 'µmol/L',
    criticalHigh: 50,
  },
};

// =============================================================================
// Biomarker Parser Class
// =============================================================================

export class BiomarkerParser {
  /**
   * Parse extracted biomarkers and determine status
   */
  parseBiomarkers(
    extracted: ExtractedBiomarker[],
    userId: string,
    labReportId: string,
    testDate: number
  ): Omit<Biomarker, 'id' | 'createdAt' | 'updatedAt'>[] {
    return extracted.map((bio) => this.parseSingle(bio, userId, labReportId, testDate));
  }

  /**
   * Parse a single extracted biomarker
   */
  private parseSingle(
    extracted: ExtractedBiomarker,
    userId: string,
    labReportId: string,
    testDate: number
  ): Omit<Biomarker, 'id' | 'createdAt' | 'updatedAt'> {
    const referenceRange = this.getReferenceRange(extracted);
    const status = this.determineStatus(extracted.value, referenceRange);
    const category = extracted.category ?? this.categorizeByName(extracted.name);

    return {
      userId,
      labReportId,
      name: this.normalizeName(extracted.name),
      code: extracted.code,
      category,
      value: extracted.value,
      unit: extracted.unit,
      referenceRange,
      status,
      testDate,
    };
  }

  /**
   * Get reference range for biomarker
   */
  private getReferenceRange(extracted: ExtractedBiomarker): ReferenceRange {
    // Use extracted reference range if available
    if (extracted.referenceRange?.low !== undefined && extracted.referenceRange?.high !== undefined) {
      return {
        low: extracted.referenceRange.low,
        high: extracted.referenceRange.high,
        optimalLow: extracted.referenceRange.optimalLow,
        optimalHigh: extracted.referenceRange.optimalHigh,
        unit: extracted.unit,
      };
    }

    // Fall back to standard ranges
    const normalizedName = extracted.name.toLowerCase().trim();
    const standardRange = this.findStandardRange(normalizedName);

    if (standardRange) {
      return {
        low: standardRange.low,
        high: standardRange.high,
        optimalLow: standardRange.optimalLow,
        optimalHigh: standardRange.optimalHigh,
        unit: standardRange.unit,
      };
    }

    // No range available
    return {
      unit: extracted.unit,
    };
  }

  /**
   * Find standard reference range by name
   */
  private findStandardRange(normalizedName: string): StandardRange | undefined {
    // Direct match
    if (STANDARD_RANGES[normalizedName]) {
      return STANDARD_RANGES[normalizedName];
    }

    // Partial match
    for (const [key, range] of Object.entries(STANDARD_RANGES)) {
      if (normalizedName.includes(key) || key.includes(normalizedName)) {
        return range;
      }
    }

    return undefined;
  }

  /**
   * Determine biomarker status based on value and reference range
   */
  private determineStatus(value: number, referenceRange: ReferenceRange): BiomarkerStatus {
    const normalizedName = '';
    const standardRange = this.findStandardRange(normalizedName);

    // Check for critical values first
    if (standardRange) {
      if (standardRange.criticalLow !== undefined && value < standardRange.criticalLow) {
        return 'critical_low';
      }
      if (standardRange.criticalHigh !== undefined && value > standardRange.criticalHigh) {
        return 'critical_high';
      }
    }

    // Check against reference range
    if (referenceRange.low !== undefined && value < referenceRange.low) {
      // Check if critically low
      if (standardRange?.criticalLow !== undefined && value < standardRange.criticalLow) {
        return 'critical_low';
      }
      return 'low';
    }

    if (referenceRange.high !== undefined && value > referenceRange.high) {
      // Check if critically high
      if (standardRange?.criticalHigh !== undefined && value > standardRange.criticalHigh) {
        return 'critical_high';
      }
      return 'high';
    }

    return 'normal';
  }

  /**
   * Determine status with custom reference range
   */
  determineStatusWithRange(
    value: number,
    referenceRange: ReferenceRange,
    biomarkerName?: string
  ): BiomarkerStatus {
    const normalizedName = biomarkerName?.toLowerCase().trim() ?? '';
    const standardRange = this.findStandardRange(normalizedName);

    // Check for critical values first
    if (standardRange) {
      if (standardRange.criticalLow !== undefined && value < standardRange.criticalLow) {
        return 'critical_low';
      }
      if (standardRange.criticalHigh !== undefined && value > standardRange.criticalHigh) {
        return 'critical_high';
      }
    }

    // Check against reference range
    if (referenceRange.low !== undefined && value < referenceRange.low) {
      return 'low';
    }

    if (referenceRange.high !== undefined && value > referenceRange.high) {
      return 'high';
    }

    return 'normal';
  }

  /**
   * Normalize biomarker name
   */
  private normalizeName(name: string): string {
    return name
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Categorize biomarker by name
   */
  private categorizeByName(name: string): BiomarkerCategory {
    const lower = name.toLowerCase();

    if (
      lower.includes('cholesterol') ||
      lower.includes('hdl') ||
      lower.includes('ldl') ||
      lower.includes('triglyceride')
    ) {
      return 'lipid_panel';
    }

    if (
      lower.includes('glucose') ||
      lower.includes('hba1c') ||
      lower.includes('sodium') ||
      lower.includes('potassium') ||
      lower.includes('chloride') ||
      lower.includes('calcium') ||
      lower.includes('bun') ||
      lower.includes('creatinine')
    ) {
      return 'metabolic_panel';
    }

    if (
      lower.includes('wbc') ||
      lower.includes('rbc') ||
      lower.includes('hemoglobin') ||
      lower.includes('hematocrit') ||
      lower.includes('platelet') ||
      lower.includes('mcv') ||
      lower.includes('mch')
    ) {
      return 'cbc';
    }

    if (lower.includes('tsh') || lower.includes('t3') || lower.includes('t4')) {
      return 'thyroid';
    }

    if (lower.includes('vitamin') || lower.includes('b12') || lower.includes('folate') || lower.includes('iron')) {
      return 'vitamin';
    }

    if (
      lower.includes('testosterone') ||
      lower.includes('estradiol') ||
      lower.includes('cortisol') ||
      lower.includes('dhea')
    ) {
      return 'hormone';
    }

    if (
      lower.includes('ast') ||
      lower.includes('alt') ||
      lower.includes('bilirubin') ||
      lower.includes('albumin') ||
      lower.includes('alkaline')
    ) {
      return 'liver';
    }

    if (lower.includes('uric') || lower.includes('microalbumin') || lower.includes('egfr')) {
      return 'kidney';
    }

    if (lower.includes('crp') || lower.includes('sed rate') || lower.includes('homocysteine')) {
      return 'inflammation';
    }

    return 'other';
  }

  /**
   * Check if value is in optimal range
   */
  isOptimal(value: number, referenceRange: ReferenceRange): boolean {
    if (referenceRange.optimalLow === undefined || referenceRange.optimalHigh === undefined) {
      // No optimal range defined, use reference range
      const isInRange =
        (referenceRange.low === undefined || value >= referenceRange.low) &&
        (referenceRange.high === undefined || value <= referenceRange.high);
      return isInRange;
    }

    return value >= referenceRange.optimalLow && value <= referenceRange.optimalHigh;
  }

  /**
   * Get percentage within reference range
   */
  getPercentileInRange(value: number, referenceRange: ReferenceRange): number | undefined {
    if (referenceRange.low === undefined || referenceRange.high === undefined) {
      return undefined;
    }

    const range = referenceRange.high - referenceRange.low;
    if (range <= 0) return undefined;

    const position = value - referenceRange.low;
    const percentile = (position / range) * 100;

    return Math.max(0, Math.min(100, percentile));
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createBiomarkerParser(): BiomarkerParser {
  return new BiomarkerParser();
}

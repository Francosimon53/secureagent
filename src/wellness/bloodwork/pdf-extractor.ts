/**
 * PDF Extractor
 *
 * Extracts text and structured data from blood work PDF reports.
 * Supports common lab formats (LabCorp, Quest Diagnostics, etc.)
 */

import type { PDFExtractionResult, ExtractedBiomarker, BiomarkerCategory } from '../types.js';

// =============================================================================
// PDF Extraction Configuration
// =============================================================================

export interface PDFExtractorConfig {
  maxFileSizeMB: number;
  parserLibrary: 'pdf-parse' | 'pdf2json';
}

const DEFAULT_CONFIG: PDFExtractorConfig = {
  maxFileSizeMB: 10,
  parserLibrary: 'pdf-parse',
};

// =============================================================================
// Lab Format Patterns
// =============================================================================

interface LabPattern {
  name: string;
  identifiers: RegExp[];
  datePatterns: RegExp[];
  biomarkerPatterns: RegExp[];
  physicianPatterns: RegExp[];
}

const LAB_PATTERNS: LabPattern[] = [
  {
    name: 'LabCorp',
    identifiers: [/labcorp/i, /laboratory corporation/i],
    datePatterns: [
      /collection\s*date[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
      /collected[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    ],
    biomarkerPatterns: [
      /^([A-Za-z][A-Za-z\s,\-\(\)]+?)\s+(\d+\.?\d*)\s+([A-Za-z\/%]+)\s+(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/gm,
    ],
    physicianPatterns: [/ordering\s*physician[:\s]*([A-Za-z\s\.,]+)/i],
  },
  {
    name: 'Quest Diagnostics',
    identifiers: [/quest\s*diagnostics/i, /quest\s*dx/i],
    datePatterns: [
      /specimen\s*collected[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
      /collection\s*date[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    ],
    biomarkerPatterns: [
      /([A-Za-z][A-Za-z\s,\-\(\)]+?)\s+(\d+\.?\d*)\s+([A-Za-z\/%]+)\s+(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/gm,
    ],
    physicianPatterns: [/provider[:\s]*([A-Za-z\s\.,]+)/i],
  },
  {
    name: 'Generic',
    identifiers: [/.*/],
    datePatterns: [
      /date[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
      /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
    ],
    biomarkerPatterns: [
      /([A-Za-z][A-Za-z\s,\-\(\)]+?)\s+(\d+\.?\d*)\s+([A-Za-z\/%]+)\s+(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/gm,
    ],
    physicianPatterns: [/physician[:\s]*([A-Za-z\s\.,]+)/i],
  },
];

// =============================================================================
// Biomarker Name to Category Mapping
// =============================================================================

const BIOMARKER_CATEGORIES: Record<string, BiomarkerCategory> = {
  // Lipid Panel
  'total cholesterol': 'lipid_panel',
  cholesterol: 'lipid_panel',
  'hdl cholesterol': 'lipid_panel',
  hdl: 'lipid_panel',
  'ldl cholesterol': 'lipid_panel',
  ldl: 'lipid_panel',
  triglycerides: 'lipid_panel',
  vldl: 'lipid_panel',

  // Metabolic Panel
  glucose: 'metabolic_panel',
  'fasting glucose': 'metabolic_panel',
  'hba1c': 'metabolic_panel',
  'hemoglobin a1c': 'metabolic_panel',
  bun: 'metabolic_panel',
  'blood urea nitrogen': 'metabolic_panel',
  creatinine: 'metabolic_panel',
  'egfr': 'metabolic_panel',
  sodium: 'metabolic_panel',
  potassium: 'metabolic_panel',
  chloride: 'metabolic_panel',
  'carbon dioxide': 'metabolic_panel',
  co2: 'metabolic_panel',
  calcium: 'metabolic_panel',

  // CBC
  wbc: 'cbc',
  'white blood cell': 'cbc',
  rbc: 'cbc',
  'red blood cell': 'cbc',
  hemoglobin: 'cbc',
  hematocrit: 'cbc',
  mcv: 'cbc',
  mch: 'cbc',
  mchc: 'cbc',
  rdw: 'cbc',
  platelet: 'cbc',
  platelets: 'cbc',
  mpv: 'cbc',

  // Thyroid
  tsh: 'thyroid',
  't3': 'thyroid',
  't4': 'thyroid',
  'free t3': 'thyroid',
  'free t4': 'thyroid',

  // Vitamins
  'vitamin d': 'vitamin',
  '25-hydroxy vitamin d': 'vitamin',
  'vitamin b12': 'vitamin',
  b12: 'vitamin',
  folate: 'vitamin',
  'folic acid': 'vitamin',
  iron: 'vitamin',
  ferritin: 'vitamin',

  // Hormones
  testosterone: 'hormone',
  'free testosterone': 'hormone',
  estradiol: 'hormone',
  progesterone: 'hormone',
  cortisol: 'hormone',
  dhea: 'hormone',
  'dhea-s': 'hormone',
  fsh: 'hormone',
  lh: 'hormone',

  // Liver
  ast: 'liver',
  'sgot': 'liver',
  alt: 'liver',
  'sgpt': 'liver',
  'alkaline phosphatase': 'liver',
  alp: 'liver',
  'total bilirubin': 'liver',
  bilirubin: 'liver',
  albumin: 'liver',
  'total protein': 'liver',
  ggt: 'liver',

  // Kidney
  'uric acid': 'kidney',
  microalbumin: 'kidney',
  'urine creatinine': 'kidney',

  // Inflammation
  'c-reactive protein': 'inflammation',
  crp: 'inflammation',
  'hs-crp': 'inflammation',
  'sed rate': 'inflammation',
  esr: 'inflammation',
  'homocysteine': 'inflammation',
};

// =============================================================================
// LOINC Code Mapping
// =============================================================================

const LOINC_CODES: Record<string, string> = {
  'total cholesterol': '2093-3',
  'hdl cholesterol': '2085-9',
  'ldl cholesterol': '2089-1',
  triglycerides: '2571-8',
  glucose: '2345-7',
  'fasting glucose': '1558-6',
  'hba1c': '4548-4',
  creatinine: '2160-0',
  bun: '3094-0',
  sodium: '2951-2',
  potassium: '2823-3',
  chloride: '2075-0',
  calcium: '17861-6',
  tsh: '3016-3',
  't4': '3026-2',
  't3': '3053-6',
  'vitamin d': '1989-3',
  'vitamin b12': '2132-9',
  hemoglobin: '718-7',
  hematocrit: '4544-3',
  wbc: '6690-2',
  rbc: '789-8',
  platelet: '777-3',
  ast: '1920-8',
  alt: '1742-6',
  'alkaline phosphatase': '6768-6',
  'total bilirubin': '1975-2',
  albumin: '1751-7',
};

// =============================================================================
// PDF Extractor Class
// =============================================================================

export class PDFExtractor {
  private readonly config: PDFExtractorConfig;

  constructor(config: Partial<PDFExtractorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Extract data from a PDF file buffer
   */
  async extract(buffer: Buffer): Promise<PDFExtractionResult> {
    // Validate file size
    const fileSizeMB = buffer.length / (1024 * 1024);
    if (fileSizeMB > this.config.maxFileSizeMB) {
      throw new Error(`File size ${fileSizeMB.toFixed(2)}MB exceeds maximum ${this.config.maxFileSizeMB}MB`);
    }

    // Extract text from PDF
    const rawText = await this.extractText(buffer);

    // Identify lab format
    const labPattern = this.identifyLabFormat(rawText);

    // Extract structured data
    const labName = labPattern.name !== 'Generic' ? labPattern.name : this.extractLabName(rawText);
    const collectionDate = this.extractDate(rawText, labPattern.datePatterns);
    const orderingPhysician = this.extractPhysician(rawText, labPattern.physicianPatterns);
    const biomarkers = this.extractBiomarkers(rawText, labPattern.biomarkerPatterns);

    // Calculate confidence based on extraction quality
    const confidence = this.calculateConfidence(biomarkers, collectionDate, labName);

    return {
      labName,
      orderingPhysician,
      collectionDate,
      reportDate: collectionDate, // Often same as collection date
      biomarkers,
      rawText,
      confidence,
    };
  }

  /**
   * Extract text from PDF buffer
   */
  private async extractText(buffer: Buffer): Promise<string> {
    try {
      // Dynamic import of pdf-parse
      const pdfParse = await import('pdf-parse');
      const data = await pdfParse.default(buffer);
      return data.text;
    } catch (error) {
      // Fallback: return error message as text for now
      // In production, would try alternative parser
      throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Identify which lab format the PDF matches
   */
  private identifyLabFormat(text: string): LabPattern {
    for (const pattern of LAB_PATTERNS) {
      if (pattern.name === 'Generic') continue;

      for (const identifier of pattern.identifiers) {
        if (identifier.test(text)) {
          return pattern;
        }
      }
    }

    // Return generic pattern as fallback
    return LAB_PATTERNS[LAB_PATTERNS.length - 1];
  }

  /**
   * Extract lab name from text
   */
  private extractLabName(text: string): string | undefined {
    const patterns = [
      /^([A-Z][A-Za-z\s]+(?:Lab|Laboratory|Diagnostics|Medical))/m,
      /report\s*from[:\s]*([A-Za-z\s]+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return undefined;
  }

  /**
   * Extract date from text using patterns
   */
  private extractDate(text: string, patterns: RegExp[]): number | undefined {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const dateStr = match[1];
        const parsed = this.parseDate(dateStr);
        if (parsed) {
          return parsed;
        }
      }
    }

    return undefined;
  }

  /**
   * Parse date string to timestamp
   */
  private parseDate(dateStr: string): number | undefined {
    // Try various date formats
    const formats = [
      // MM/DD/YYYY
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
      // MM/DD/YY
      /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,
      // YYYY-MM-DD
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    ];

    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        let year: number;
        let month: number;
        let day: number;

        if (format.source.startsWith('^(\\d{4})')) {
          // YYYY-MM-DD
          year = parseInt(match[1], 10);
          month = parseInt(match[2], 10) - 1;
          day = parseInt(match[3], 10);
        } else {
          // MM/DD/YYYY or MM/DD/YY
          month = parseInt(match[1], 10) - 1;
          day = parseInt(match[2], 10);
          year = parseInt(match[3], 10);

          // Handle 2-digit year
          if (year < 100) {
            year += year > 50 ? 1900 : 2000;
          }
        }

        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          return date.getTime();
        }
      }
    }

    return undefined;
  }

  /**
   * Extract physician name from text
   */
  private extractPhysician(text: string, patterns: RegExp[]): string | undefined {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return undefined;
  }

  /**
   * Extract biomarkers from text
   */
  private extractBiomarkers(text: string, patterns: RegExp[]): ExtractedBiomarker[] {
    const biomarkers: ExtractedBiomarker[] = [];
    const seen = new Set<string>();

    // Normalize text for better matching
    const normalizedText = text
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\s+/g, ' ');

    // Standard pattern: Name Value Unit RefLow-RefHigh
    const standardPattern =
      /([A-Za-z][A-Za-z\s,\-\(\)\/]+?)\s+(\d+\.?\d*)\s+([A-Za-z\/%µ]+(?:\/[A-Za-z]+)?)\s+(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/g;

    let match;
    while ((match = standardPattern.exec(normalizedText)) !== null) {
      const name = match[1].trim();
      const value = parseFloat(match[2]);
      const unit = match[3].trim();
      const refLow = parseFloat(match[4]);
      const refHigh = parseFloat(match[5]);

      // Skip if already seen or invalid
      const key = name.toLowerCase();
      if (seen.has(key) || isNaN(value)) {
        continue;
      }

      // Skip header-like entries
      if (name.toLowerCase().includes('test') && name.toLowerCase().includes('result')) {
        continue;
      }

      seen.add(key);

      biomarkers.push({
        name,
        value,
        unit,
        referenceRange: {
          low: refLow,
          high: refHigh,
          unit,
        },
        category: this.categorizeByName(name),
        code: this.getLOINCCode(name),
      });
    }

    // Try alternative patterns for other formats
    const altPattern = /([A-Za-z][A-Za-z\s\-]+):\s*(\d+\.?\d*)\s*([A-Za-z\/%]+)/g;
    while ((match = altPattern.exec(normalizedText)) !== null) {
      const name = match[1].trim();
      const value = parseFloat(match[2]);
      const unit = match[3].trim();

      const key = name.toLowerCase();
      if (seen.has(key) || isNaN(value)) {
        continue;
      }

      seen.add(key);

      biomarkers.push({
        name,
        value,
        unit,
        category: this.categorizeByName(name),
        code: this.getLOINCCode(name),
      });
    }

    return biomarkers;
  }

  /**
   * Categorize biomarker by name
   */
  private categorizeByName(name: string): BiomarkerCategory {
    const normalizedName = name.toLowerCase().trim();

    // Direct match
    if (BIOMARKER_CATEGORIES[normalizedName]) {
      return BIOMARKER_CATEGORIES[normalizedName];
    }

    // Partial match
    for (const [key, category] of Object.entries(BIOMARKER_CATEGORIES)) {
      if (normalizedName.includes(key) || key.includes(normalizedName)) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * Get LOINC code for biomarker
   */
  private getLOINCCode(name: string): string | undefined {
    const normalizedName = name.toLowerCase().trim();

    if (LOINC_CODES[normalizedName]) {
      return LOINC_CODES[normalizedName];
    }

    for (const [key, code] of Object.entries(LOINC_CODES)) {
      if (normalizedName.includes(key) || key.includes(normalizedName)) {
        return code;
      }
    }

    return undefined;
  }

  /**
   * Calculate extraction confidence score
   */
  private calculateConfidence(
    biomarkers: ExtractedBiomarker[],
    collectionDate: number | undefined,
    labName: string | undefined
  ): number {
    let score = 0;

    // Base score for finding biomarkers
    if (biomarkers.length > 0) {
      score += 0.3;
      // Bonus for more biomarkers
      score += Math.min(biomarkers.length / 20, 0.2);
    }

    // Score for biomarkers with reference ranges
    const withRanges = biomarkers.filter((b) => b.referenceRange?.low !== undefined);
    if (withRanges.length > 0) {
      score += (withRanges.length / biomarkers.length) * 0.2;
    }

    // Score for collection date
    if (collectionDate) {
      score += 0.15;
    }

    // Score for lab name
    if (labName) {
      score += 0.15;
    }

    return Math.min(score, 1);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createPDFExtractor(config?: Partial<PDFExtractorConfig>): PDFExtractor {
  return new PDFExtractor(config);
}

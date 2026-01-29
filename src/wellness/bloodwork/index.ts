/**
 * Bloodwork Service
 *
 * Orchestrates blood work PDF extraction, biomarker parsing, and trend analysis.
 */

import { EventEmitter } from 'events';
import type { BiomarkerStore } from '../stores/biomarker-store.js';
import type {
  LabReport,
  Biomarker,
  BiomarkerTrend,
  PDFExtractionResult,
  BiomarkerCategory,
  WELLNESS_EVENTS,
} from '../types.js';
import { PDFExtractor, createPDFExtractor, type PDFExtractorConfig } from './pdf-extractor.js';
import { BiomarkerParser, createBiomarkerParser } from './biomarker-parser.js';
import { TrendAnalyzer, createTrendAnalyzer, type TrendAnalyzerConfig } from './trend-analyzer.js';

// =============================================================================
// Re-exports
// =============================================================================

export { PDFExtractor, createPDFExtractor, type PDFExtractorConfig } from './pdf-extractor.js';
export { BiomarkerParser, createBiomarkerParser } from './biomarker-parser.js';
export {
  TrendAnalyzer,
  createTrendAnalyzer,
  type TrendAnalyzerConfig,
} from './trend-analyzer.js';

// =============================================================================
// Bloodwork Service Configuration
// =============================================================================

export interface BloodworkServiceConfig {
  enabled: boolean;
  pdfExtractor?: Partial<PDFExtractorConfig>;
  trendAnalyzer?: Partial<TrendAnalyzerConfig>;
  abnormalAlertEnabled: boolean;
  criticalAlertEnabled: boolean;
}

const DEFAULT_CONFIG: BloodworkServiceConfig = {
  enabled: true,
  abnormalAlertEnabled: true,
  criticalAlertEnabled: true,
};

// =============================================================================
// Import Result
// =============================================================================

export interface BloodworkImportResult {
  success: boolean;
  labReport?: LabReport;
  biomarkers: Biomarker[];
  abnormalCount: number;
  criticalCount: number;
  extraction: PDFExtractionResult;
  error?: string;
}

// =============================================================================
// Bloodwork Service
// =============================================================================

export class BloodworkService extends EventEmitter {
  private readonly config: BloodworkServiceConfig;
  private readonly pdfExtractor: PDFExtractor;
  private readonly biomarkerParser: BiomarkerParser;
  private readonly trendAnalyzer: TrendAnalyzer;

  constructor(
    private readonly store: BiomarkerStore,
    config: Partial<BloodworkServiceConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.pdfExtractor = createPDFExtractor(config.pdfExtractor);
    this.biomarkerParser = createBiomarkerParser();
    this.trendAnalyzer = createTrendAnalyzer(config.trendAnalyzer);
  }

  /**
   * Import blood work from PDF
   */
  async importPDF(userId: string, pdfBuffer: Buffer, notes?: string): Promise<BloodworkImportResult> {
    try {
      // Extract data from PDF
      const extraction = await this.pdfExtractor.extract(pdfBuffer);

      if (extraction.biomarkers.length === 0) {
        return {
          success: false,
          biomarkers: [],
          abnormalCount: 0,
          criticalCount: 0,
          extraction,
          error: 'No biomarkers could be extracted from the PDF',
        };
      }

      // Create lab report
      const labReport = await this.store.createLabReport({
        userId,
        labName: extraction.labName,
        orderingPhysician: extraction.orderingPhysician,
        collectionDate: extraction.collectionDate ?? Date.now(),
        reportDate: extraction.reportDate ?? Date.now(),
        biomarkerCount: extraction.biomarkers.length,
        notes,
      });

      // Parse and store biomarkers
      const parsedBiomarkers = this.biomarkerParser.parseBiomarkers(
        extraction.biomarkers,
        userId,
        labReport.id,
        extraction.collectionDate ?? Date.now()
      );

      const storedBiomarkers: Biomarker[] = [];
      let abnormalCount = 0;
      let criticalCount = 0;

      for (const parsed of parsedBiomarkers) {
        const biomarker = await this.store.createBiomarker(parsed);
        storedBiomarkers.push(biomarker);

        // Count abnormal/critical
        if (biomarker.status === 'critical_low' || biomarker.status === 'critical_high') {
          criticalCount++;
          if (this.config.criticalAlertEnabled) {
            this.emit('biomarker:critical', { userId, biomarker });
          }
        } else if (biomarker.status === 'low' || biomarker.status === 'high') {
          abnormalCount++;
          if (this.config.abnormalAlertEnabled) {
            this.emit('biomarker:abnormal', { userId, biomarker });
          }
        }
      }

      // Update lab report with final count
      await this.store.updateLabReport(labReport.id, {
        biomarkerCount: storedBiomarkers.length,
      });

      // Emit import event
      this.emit('lab:imported', {
        userId,
        labReportId: labReport.id,
        biomarkerCount: storedBiomarkers.length,
        abnormalCount,
        criticalCount,
      });

      return {
        success: true,
        labReport,
        biomarkers: storedBiomarkers,
        abnormalCount,
        criticalCount,
        extraction,
      };
    } catch (error) {
      return {
        success: false,
        biomarkers: [],
        abnormalCount: 0,
        criticalCount: 0,
        extraction: {
          biomarkers: [],
          rawText: '',
          confidence: 0,
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get trends for a user's biomarkers
   */
  async getTrends(
    userId: string,
    biomarkerNames?: string[]
  ): Promise<BiomarkerTrend[]> {
    // Get all biomarkers grouped by name
    const biomarkers = await this.store.listBiomarkers(userId, {
      limit: 1000,
      orderDirection: 'asc',
    });

    // Group by name
    const byName = new Map<string, Biomarker[]>();
    for (const biomarker of biomarkers) {
      const name = biomarker.name.toLowerCase();

      // Filter by requested names if specified
      if (biomarkerNames && !biomarkerNames.some((n) => name.includes(n.toLowerCase()))) {
        continue;
      }

      const existing = byName.get(name) ?? [];
      existing.push(biomarker);
      byName.set(name, existing);
    }

    // Analyze trends
    return this.trendAnalyzer.analyzeAll(byName);
  }

  /**
   * Get trend for a specific biomarker
   */
  async getTrendForBiomarker(userId: string, biomarkerName: string): Promise<BiomarkerTrend | null> {
    const history = await this.store.getBiomarkerHistory(userId, biomarkerName, 100);
    return this.trendAnalyzer.analyze(biomarkerName, history);
  }

  /**
   * Get all abnormal biomarkers for a user
   */
  async getAbnormalBiomarkers(userId: string): Promise<Biomarker[]> {
    return this.store.getAbnormalBiomarkers(userId);
  }

  /**
   * Get latest value for each biomarker
   */
  async getLatestValues(userId: string): Promise<Map<string, Biomarker>> {
    const biomarkers = await this.store.listBiomarkers(userId, {
      limit: 1000,
      orderDirection: 'desc',
    });

    const latest = new Map<string, Biomarker>();
    for (const biomarker of biomarkers) {
      const name = biomarker.name.toLowerCase();
      if (!latest.has(name)) {
        latest.set(name, biomarker);
      }
    }

    return latest;
  }

  /**
   * Get biomarkers by category
   */
  async getBiomarkersByCategory(
    userId: string,
    category: BiomarkerCategory
  ): Promise<Biomarker[]> {
    return this.store.listBiomarkers(userId, { category });
  }

  /**
   * Get lab reports
   */
  async getLabReports(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<LabReport[]> {
    return this.store.listLabReports(userId, options);
  }

  /**
   * Get biomarkers for a specific lab report
   */
  async getBiomarkersByLabReport(labReportId: string): Promise<Biomarker[]> {
    return this.store.getBiomarkersByLabReport(labReportId);
  }

  /**
   * Delete a lab report and its biomarkers
   */
  async deleteLabReport(labReportId: string): Promise<boolean> {
    return this.store.deleteLabReport(labReportId);
  }

  /**
   * Get summary statistics
   */
  async getSummary(userId: string): Promise<{
    totalReports: number;
    totalBiomarkers: number;
    abnormalCount: number;
    criticalCount: number;
    lastTestDate?: number;
    trendsSummary: {
      improving: number;
      stable: number;
      declining: number;
    };
  }> {
    const reports = await this.store.listLabReports(userId);
    const abnormal = await this.store.getAbnormalBiomarkers(userId);
    const trends = await this.getTrends(userId);

    const criticalCount = abnormal.filter(
      (b) => b.status === 'critical_low' || b.status === 'critical_high'
    ).length;

    const trendsSummary = this.trendAnalyzer.getSummary(trends);

    return {
      totalReports: reports.length,
      totalBiomarkers: await this.store.countBiomarkers(userId, {}),
      abnormalCount: abnormal.length,
      criticalCount,
      lastTestDate: reports[0]?.collectionDate,
      trendsSummary: {
        improving: trendsSummary.improving,
        stable: trendsSummary.stable,
        declining: trendsSummary.declining,
      },
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createBloodworkService(
  store: BiomarkerStore,
  config?: Partial<BloodworkServiceConfig>
): BloodworkService {
  return new BloodworkService(store, config);
}

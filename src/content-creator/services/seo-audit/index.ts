/**
 * Content Creator Suite - SEO Audit Service
 *
 * Main entry point for SEO analysis, auditing, and recommendations.
 */

export {
  ContentAnalyzerService,
  createContentAnalyzer,
  type ContentAnalyzerConfig,
  type ContentAnalysis,
  type HeadingAnalysis,
  type LinkAnalysis,
  type ImageAnalysis,
  type TitleAnalysis,
  type MetaAnalysis,
} from './content-analyzer.js';

export {
  KeywordSuggesterService,
  createKeywordSuggester,
  type KeywordSuggestion,
  type KeywordSuggesterConfig,
  type KeywordPlacement,
} from './keyword-suggester.js';

export {
  ReportGeneratorService,
  createReportGenerator,
  type SEOReport,
  type ReportSummary,
  type ActionItem,
  type CompetitorComparison,
  type ReportFormat,
} from './report-generator.js';

import type { BlogPost, SEOAuditResult, KeywordAnalysis } from '../../types.js';
import type { SEOAuditConfig } from '../../config.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';

import { createContentAnalyzer, type ContentAnalysis } from './content-analyzer.js';
import { createKeywordSuggester, type KeywordSuggestion, type KeywordPlacement } from './keyword-suggester.js';
import { createReportGenerator, type SEOReport, type ActionItem } from './report-generator.js';

// =============================================================================
// SEO Audit Service (Facade)
// =============================================================================

export interface SEOAuditServiceConfig {
  seoAudit?: SEOAuditConfig;
}

export class SEOAuditService {
  public readonly contentAnalyzer: ReturnType<typeof createContentAnalyzer>;
  public readonly keywordSuggester: ReturnType<typeof createKeywordSuggester>;
  public readonly reportGenerator: ReturnType<typeof createReportGenerator>;

  constructor(
    contentGenerator?: ContentGeneratorProvider,
    config?: SEOAuditServiceConfig
  ) {
    // Initialize content analyzer
    this.contentAnalyzer = createContentAnalyzer(config?.seoAudit);

    // Initialize keyword suggester
    this.keywordSuggester = createKeywordSuggester(contentGenerator);

    // Initialize report generator
    this.reportGenerator = createReportGenerator(this.contentAnalyzer, this.keywordSuggester);
  }

  // ===========================================================================
  // Main Audit Methods
  // ===========================================================================

  /**
   * Perform a full SEO audit on a blog post
   */
  async audit(post: BlogPost): Promise<SEOReport> {
    return this.reportGenerator.generateReport(post);
  }

  /**
   * Quick SEO score check
   */
  quickScore(post: BlogPost): {
    score: number;
    issueCount: number;
    criticalCount: number;
  } {
    const analysis = this.contentAnalyzer.analyzeBlogPost(post);
    const criticalCount = analysis.issues.filter(i => i.severity === 'critical').length;

    return {
      score: analysis.overallScore,
      issueCount: analysis.issues.length,
      criticalCount,
    };
  }

  /**
   * Analyze content only (without full report)
   */
  analyzeContent(content: string, isHtml?: boolean): ContentAnalysis {
    return this.contentAnalyzer.analyzeContent(content, isHtml);
  }

  // ===========================================================================
  // Keyword Methods
  // ===========================================================================

  /**
   * Analyze keyword usage in content
   */
  analyzeKeywords(content: string, focusKeyword?: string): KeywordAnalysis {
    return this.keywordSuggester.analyzeKeywords(content, focusKeyword);
  }

  /**
   * Get keyword placement analysis for a post
   */
  analyzeKeywordPlacement(post: BlogPost): KeywordPlacement[] {
    return this.keywordSuggester.analyzeKeywordPlacement(post);
  }

  /**
   * Check keyword density
   */
  checkKeywordDensity(content: string, keyword: string): {
    density: number;
    status: 'low' | 'optimal' | 'high';
    recommendation: string;
  } {
    return this.keywordSuggester.checkKeywordDensity(content, keyword);
  }

  /**
   * Get keyword suggestions
   */
  getKeywordSuggestions(content: string, focusKeyword?: string): KeywordSuggestion[] {
    const wordFrequency = new Map<string, number>();
    const words = content.toLowerCase().match(/\b[a-z]+\b/g) || [];

    for (const word of words) {
      wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
    }

    return this.keywordSuggester.generateSuggestions(wordFrequency, focusKeyword, content);
  }

  /**
   * Get AI-powered keyword suggestions
   */
  async getAIKeywordSuggestions(
    topic: string,
    existingContent?: string,
    count?: number
  ): Promise<KeywordSuggestion[]> {
    return this.keywordSuggester.getAISuggestions(topic, existingContent, count);
  }

  // ===========================================================================
  // Report Methods
  // ===========================================================================

  /**
   * Get report as Markdown
   */
  getReportAsMarkdown(report: SEOReport): string {
    return this.reportGenerator.formatAsMarkdown(report);
  }

  /**
   * Get report as HTML
   */
  getReportAsHtml(report: SEOReport): string {
    return this.reportGenerator.formatAsHtml(report);
  }

  /**
   * Get action items from a report
   */
  getActionItems(report: SEOReport, priorityFilter?: 1 | 2 | 3): ActionItem[] {
    if (priorityFilter !== undefined) {
      return report.actionPlan.filter(a => a.priority === priorityFilter);
    }
    return report.actionPlan;
  }

  /**
   * Get high-priority action items
   */
  getHighPriorityActions(report: SEOReport): ActionItem[] {
    return this.getActionItems(report, 1);
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Calculate readability score
   */
  calculateReadabilityScore(content: string): number {
    const analysis = this.contentAnalyzer.analyzeContent(content);
    return analysis.readabilityScore;
  }

  /**
   * Get reading level
   */
  getReadingLevel(content: string): string {
    const analysis = this.contentAnalyzer.analyzeContent(content);
    return analysis.readingLevel;
  }

  /**
   * Count words in content
   */
  countWords(content: string): number {
    return this.contentAnalyzer.countWords(content);
  }

  /**
   * Estimate reading time
   */
  estimateReadingTime(content: string, wordsPerMinute: number = 200): number {
    const wordCount = this.countWords(content);
    return Math.ceil(wordCount / wordsPerMinute);
  }

  /**
   * Check if content meets minimum requirements
   */
  meetsMinimumRequirements(post: BlogPost, requirements?: {
    minWordCount?: number;
    requireMetaDescription?: boolean;
    requireFocusKeyword?: boolean;
    requireH1?: boolean;
  }): {
    meets: boolean;
    failures: string[];
  } {
    const failures: string[] = [];
    const analysis = this.contentAnalyzer.analyzeBlogPost(post);

    // Word count
    const minWordCount = requirements?.minWordCount ?? 300;
    if (analysis.content.wordCount < minWordCount) {
      failures.push(`Content has ${analysis.content.wordCount} words, minimum is ${minWordCount}`);
    }

    // Meta description
    if (requirements?.requireMetaDescription !== false && !analysis.metaAnalysis.hasMetaDescription) {
      failures.push('Missing meta description');
    }

    // Focus keyword
    if (requirements?.requireFocusKeyword && !analysis.metaAnalysis.hasFocusKeyword) {
      failures.push('No focus keyword specified');
    }

    // H1 heading
    if (requirements?.requireH1 !== false && analysis.content.headings.h1Count === 0) {
      failures.push('Missing H1 heading');
    }

    return {
      meets: failures.length === 0,
      failures,
    };
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Register event handler
   */
  onEvent(handler: (event: string, data: unknown) => void): () => void {
    return this.reportGenerator.onEvent(handler);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createSEOAuditService(
  contentGenerator?: ContentGeneratorProvider,
  config?: SEOAuditServiceConfig
): SEOAuditService {
  return new SEOAuditService(contentGenerator, config);
}

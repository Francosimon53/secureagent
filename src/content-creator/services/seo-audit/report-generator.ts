/**
 * Content Creator Suite - SEO Report Generator
 *
 * Generates comprehensive SEO audit reports.
 */

import type {
  BlogPost,
  SEOAuditResult,
  SEOCategoryScore,
  SEOIssue,
  SEORecommendation,
  KeywordAnalysis,
} from '../../types.js';
import type { ContentAnalyzerService, ContentAnalysis, TitleAnalysis, MetaAnalysis } from './content-analyzer.js';
import type { KeywordSuggesterService, KeywordPlacement } from './keyword-suggester.js';
import { CONTENT_EVENTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface SEOReport extends SEOAuditResult {
  contentAnalysis: ContentAnalysis;
  titleAnalysis: TitleAnalysis;
  metaAnalysis: MetaAnalysis;
  keywordPlacements: KeywordPlacement[];
  competitorComparison?: CompetitorComparison;
  actionPlan: ActionItem[];
  summary: ReportSummary;
}

export interface ReportSummary {
  totalIssues: number;
  criticalIssues: number;
  warningIssues: number;
  infoIssues: number;
  strengths: string[];
  weaknesses: string[];
  priority: 'high' | 'medium' | 'low';
  estimatedImpact: string;
}

export interface ActionItem {
  id: string;
  priority: 1 | 2 | 3;
  category: SEOCategoryScore['category'];
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'easy' | 'moderate' | 'difficult';
  completed: boolean;
}

export interface CompetitorComparison {
  averageScore: number;
  yourScore: number;
  percentile: number;
  gaps: string[];
  advantages: string[];
}

export type ReportFormat = 'json' | 'markdown' | 'html';

// =============================================================================
// Report Generator Service
// =============================================================================

export class ReportGeneratorService {
  private eventHandlers: ((event: string, data: unknown) => void)[] = [];

  constructor(
    private readonly contentAnalyzer: ContentAnalyzerService,
    private readonly keywordSuggester: KeywordSuggesterService
  ) {}

  /**
   * Generate a full SEO audit report
   */
  async generateReport(post: BlogPost): Promise<SEOReport> {
    this.emit(CONTENT_EVENTS.SEO_AUDIT_STARTED, { postId: post.id });

    // Analyze content
    const blogAnalysis = this.contentAnalyzer.analyzeBlogPost(post);

    // Analyze keyword placements
    const keywordPlacements = this.keywordSuggester.analyzeKeywordPlacement(post);

    // Generate keyword analysis
    const keywordAnalysis = this.keywordSuggester.analyzeKeywords(
      post.content,
      post.seo?.focusKeyword
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      blogAnalysis.issues,
      blogAnalysis.categoryScores,
      keywordPlacements
    );

    // Generate action plan
    const actionPlan = this.generateActionPlan(blogAnalysis.issues, recommendations);

    // Generate summary
    const summary = this.generateSummary(blogAnalysis, keywordPlacements);

    const report: SEOReport = {
      id: crypto.randomUUID(),
      contentId: post.id ?? '',
      url: post.seo?.canonicalUrl,
      overallScore: blogAnalysis.overallScore,
      categories: blogAnalysis.categoryScores,
      issues: blogAnalysis.issues,
      recommendations,
      keywordAnalysis,
      readabilityScore: blogAnalysis.content.readabilityScore,
      auditedAt: Date.now(),
      contentAnalysis: blogAnalysis.content,
      titleAnalysis: blogAnalysis.titleAnalysis,
      metaAnalysis: blogAnalysis.metaAnalysis,
      keywordPlacements,
      actionPlan,
      summary,
    };

    this.emit(CONTENT_EVENTS.SEO_AUDIT_COMPLETED, {
      postId: post.id,
      score: report.overallScore,
      issueCount: report.issues.length,
    });

    this.emit(CONTENT_EVENTS.SEO_SCORE_CALCULATED, {
      postId: post.id,
      score: report.overallScore,
      categories: report.categories,
    });

    return report;
  }

  /**
   * Generate recommendations based on issues
   */
  private generateRecommendations(
    issues: SEOIssue[],
    categoryScores: SEOCategoryScore[],
    keywordPlacements: KeywordPlacement[]
  ): SEORecommendation[] {
    const recommendations: SEORecommendation[] = [];

    // Group issues by category
    const issuesByCategory = new Map<string, SEOIssue[]>();
    for (const issue of issues) {
      const existing = issuesByCategory.get(issue.category) ?? [];
      existing.push(issue);
      issuesByCategory.set(issue.category, existing);
    }

    // Generate recommendations for each category
    for (const [category, categoryIssues] of issuesByCategory) {
      const catScore = categoryScores.find(c => c.category === category);
      const scorePercentage = catScore ? (catScore.score / catScore.maxScore) * 100 : 0;

      if (scorePercentage < 50) {
        recommendations.push(this.createRecommendation(
          'high',
          `Improve ${category} optimization`,
          `Your ${category} score is below 50%. Focus on addressing the ${categoryIssues.length} issues in this category.`,
          `Could improve overall SEO score by ${Math.round(30 - scorePercentage * 0.3)}%`,
          categoryIssues.some(i => i.severity === 'critical') ? 'moderate' : 'easy',
          category as SEOCategoryScore['category']
        ));
      }
    }

    // Keyword placement recommendations
    const missingPlacements = keywordPlacements.filter(p => p.recommended && !p.present);
    if (missingPlacements.length > 0) {
      const locations = missingPlacements.map(p => p.location).join(', ');
      recommendations.push(this.createRecommendation(
        'high',
        'Add focus keyword to key locations',
        `Your focus keyword is missing from: ${locations}. Adding it to these locations will improve relevance signals.`,
        'Significant improvement in keyword targeting',
        'easy',
        'keywords'
      ));
    }

    // Specific recommendations based on common issues
    for (const issue of issues) {
      if (issue.severity === 'critical') {
        recommendations.push(this.createRecommendation(
          'high',
          issue.title,
          issue.description + (issue.recommendedValue ? ` Recommended: ${issue.recommendedValue}` : ''),
          'Critical issue affecting SEO performance',
          'moderate',
          issue.category
        ));
      }
    }

    // Content length recommendation
    const contentScore = categoryScores.find(c => c.category === 'content');
    if (contentScore && contentScore.score < contentScore.maxScore * 0.6) {
      recommendations.push(this.createRecommendation(
        'medium',
        'Expand content depth',
        'Consider adding more comprehensive content with examples, data, and expert insights to increase word count and value.',
        'Longer, more detailed content typically ranks better',
        'moderate',
        'content'
      ));
    }

    // Internal linking recommendation
    const linksScore = categoryScores.find(c => c.category === 'links');
    if (linksScore && linksScore.score < linksScore.maxScore * 0.5) {
      recommendations.push(this.createRecommendation(
        'medium',
        'Improve internal linking',
        'Add more internal links to related content on your site to improve navigation and distribute page authority.',
        'Better internal linking improves site structure and SEO',
        'easy',
        'links'
      ));
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recommendations;
  }

  /**
   * Generate action plan from issues and recommendations
   */
  private generateActionPlan(
    issues: SEOIssue[],
    recommendations: SEORecommendation[]
  ): ActionItem[] {
    const actionItems: ActionItem[] = [];

    // Convert critical issues to priority 1 actions
    for (const issue of issues.filter(i => i.severity === 'critical')) {
      actionItems.push({
        id: crypto.randomUUID(),
        priority: 1,
        category: issue.category,
        title: `Fix: ${issue.title}`,
        description: issue.description + (issue.recommendedValue ? ` Change to: ${issue.recommendedValue}` : ''),
        impact: 'high',
        effort: 'moderate',
        completed: false,
      });
    }

    // Convert high priority recommendations to priority 2 actions
    for (const rec of recommendations.filter(r => r.priority === 'high')) {
      if (!actionItems.some(a => a.title.includes(rec.title))) {
        actionItems.push({
          id: crypto.randomUUID(),
          priority: 2,
          category: rec.category,
          title: rec.title,
          description: rec.description,
          impact: 'high',
          effort: rec.effort,
          completed: false,
        });
      }
    }

    // Convert warning issues to priority 2-3 actions
    for (const issue of issues.filter(i => i.severity === 'warning')) {
      if (!actionItems.some(a => a.title.includes(issue.title))) {
        actionItems.push({
          id: crypto.randomUUID(),
          priority: 2,
          category: issue.category,
          title: `Improve: ${issue.title}`,
          description: issue.description,
          impact: 'medium',
          effort: 'easy',
          completed: false,
        });
      }
    }

    // Add remaining recommendations as priority 3
    for (const rec of recommendations.filter(r => r.priority !== 'high')) {
      if (!actionItems.some(a => a.title.includes(rec.title))) {
        actionItems.push({
          id: crypto.randomUUID(),
          priority: 3,
          category: rec.category,
          title: rec.title,
          description: rec.description,
          impact: rec.priority === 'medium' ? 'medium' : 'low',
          effort: rec.effort,
          completed: false,
        });
      }
    }

    // Sort by priority
    actionItems.sort((a, b) => a.priority - b.priority);

    return actionItems;
  }

  /**
   * Generate report summary
   */
  private generateSummary(
    analysis: {
      overallScore: number;
      categoryScores: SEOCategoryScore[];
      issues: SEOIssue[];
      content: ContentAnalysis;
    },
    keywordPlacements: KeywordPlacement[]
  ): ReportSummary {
    const criticalIssues = analysis.issues.filter(i => i.severity === 'critical').length;
    const warningIssues = analysis.issues.filter(i => i.severity === 'warning').length;
    const infoIssues = analysis.issues.filter(i => i.severity === 'info').length;

    const strengths: string[] = [];
    const weaknesses: string[] = [];

    // Analyze category scores
    for (const cat of analysis.categoryScores) {
      const percentage = (cat.score / cat.maxScore) * 100;
      if (percentage >= 80) {
        strengths.push(`Strong ${cat.category} optimization (${Math.round(percentage)}%)`);
      } else if (percentage < 50) {
        weaknesses.push(`${cat.category.charAt(0).toUpperCase() + cat.category.slice(1)} needs improvement (${Math.round(percentage)}%)`);
      }
    }

    // Check readability
    if (analysis.content.readabilityScore >= 60) {
      strengths.push(`Good readability (${analysis.content.readingLevel})`);
    } else if (analysis.content.readabilityScore < 40) {
      weaknesses.push('Content may be difficult to read');
    }

    // Check word count
    if (analysis.content.wordCount >= 1500) {
      strengths.push('Comprehensive content length');
    } else if (analysis.content.wordCount < 500) {
      weaknesses.push('Content is relatively short');
    }

    // Check keyword placements
    const presentPlacements = keywordPlacements.filter(p => p.present).length;
    const totalPlacements = keywordPlacements.filter(p => p.recommended).length;
    if (presentPlacements >= totalPlacements * 0.8) {
      strengths.push('Good keyword placement coverage');
    } else if (presentPlacements < totalPlacements * 0.5) {
      weaknesses.push('Focus keyword missing from key locations');
    }

    // Determine priority
    let priority: 'high' | 'medium' | 'low';
    if (criticalIssues > 0 || analysis.overallScore < 50) {
      priority = 'high';
    } else if (warningIssues > 3 || analysis.overallScore < 70) {
      priority = 'medium';
    } else {
      priority = 'low';
    }

    // Estimate impact
    let estimatedImpact: string;
    if (analysis.overallScore < 50) {
      estimatedImpact = 'Addressing these issues could significantly improve search visibility';
    } else if (analysis.overallScore < 70) {
      estimatedImpact = 'Fixing the identified issues should improve rankings moderately';
    } else {
      estimatedImpact = 'Minor optimizations could provide incremental improvements';
    }

    return {
      totalIssues: analysis.issues.length,
      criticalIssues,
      warningIssues,
      infoIssues,
      strengths,
      weaknesses,
      priority,
      estimatedImpact,
    };
  }

  /**
   * Format report as markdown
   */
  formatAsMarkdown(report: SEOReport): string {
    const lines: string[] = [
      `# SEO Audit Report`,
      '',
      `**Overall Score:** ${report.overallScore}/100`,
      `**Audited:** ${new Date(report.auditedAt).toLocaleString()}`,
      '',
      '## Summary',
      '',
      `- **Total Issues:** ${report.summary.totalIssues}`,
      `- **Critical:** ${report.summary.criticalIssues}`,
      `- **Warnings:** ${report.summary.warningIssues}`,
      `- **Info:** ${report.summary.infoIssues}`,
      `- **Priority:** ${report.summary.priority.toUpperCase()}`,
      '',
      `**Impact:** ${report.summary.estimatedImpact}`,
      '',
    ];

    if (report.summary.strengths.length > 0) {
      lines.push('### Strengths', '');
      for (const strength of report.summary.strengths) {
        lines.push(`- ${strength}`);
      }
      lines.push('');
    }

    if (report.summary.weaknesses.length > 0) {
      lines.push('### Weaknesses', '');
      for (const weakness of report.summary.weaknesses) {
        lines.push(`- ${weakness}`);
      }
      lines.push('');
    }

    lines.push('## Category Scores', '');
    for (const cat of report.categories) {
      const percentage = Math.round((cat.score / cat.maxScore) * 100);
      const bar = this.generateProgressBar(percentage);
      lines.push(`**${cat.category.charAt(0).toUpperCase() + cat.category.slice(1)}:** ${bar} ${percentage}%`);
    }
    lines.push('');

    if (report.issues.length > 0) {
      lines.push('## Issues', '');

      const criticalIssues = report.issues.filter(i => i.severity === 'critical');
      if (criticalIssues.length > 0) {
        lines.push('### Critical', '');
        for (const issue of criticalIssues) {
          lines.push(`- **${issue.title}**: ${issue.description}`);
        }
        lines.push('');
      }

      const warningIssues = report.issues.filter(i => i.severity === 'warning');
      if (warningIssues.length > 0) {
        lines.push('### Warnings', '');
        for (const issue of warningIssues) {
          lines.push(`- **${issue.title}**: ${issue.description}`);
        }
        lines.push('');
      }
    }

    if (report.recommendations.length > 0) {
      lines.push('## Recommendations', '');
      for (const rec of report.recommendations.slice(0, 5)) {
        lines.push(`### ${rec.title}`, '');
        lines.push(rec.description);
        lines.push(`- **Impact:** ${rec.impact}`);
        lines.push(`- **Effort:** ${rec.effort}`);
        lines.push('');
      }
    }

    if (report.actionPlan.length > 0) {
      lines.push('## Action Plan', '');
      for (const action of report.actionPlan.slice(0, 10)) {
        const checkbox = action.completed ? '[x]' : '[ ]';
        lines.push(`${checkbox} **P${action.priority}** - ${action.title}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format report as HTML
   */
  formatAsHtml(report: SEOReport): string {
    const scoreClass = report.overallScore >= 70 ? 'good' : report.overallScore >= 50 ? 'ok' : 'poor';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SEO Audit Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    .score { font-size: 48px; font-weight: bold; }
    .score.good { color: #22c55e; }
    .score.ok { color: #f59e0b; }
    .score.poor { color: #ef4444; }
    .category { margin: 10px 0; }
    .bar { background: #e5e7eb; height: 20px; border-radius: 10px; overflow: hidden; }
    .bar-fill { height: 100%; background: #3b82f6; }
    .issue { padding: 10px; margin: 5px 0; border-radius: 5px; }
    .critical { background: #fef2f2; border-left: 4px solid #ef4444; }
    .warning { background: #fffbeb; border-left: 4px solid #f59e0b; }
    .info { background: #eff6ff; border-left: 4px solid #3b82f6; }
    .action { padding: 10px; margin: 5px 0; background: #f9fafb; border-radius: 5px; }
  </style>
</head>
<body>
  <h1>SEO Audit Report</h1>
  <p class="score ${scoreClass}">${report.overallScore}/100</p>
  <p>Audited: ${new Date(report.auditedAt).toLocaleString()}</p>

  <h2>Summary</h2>
  <ul>
    <li>Total Issues: ${report.summary.totalIssues}</li>
    <li>Critical: ${report.summary.criticalIssues}</li>
    <li>Warnings: ${report.summary.warningIssues}</li>
  </ul>
  <p><strong>Impact:</strong> ${report.summary.estimatedImpact}</p>

  <h2>Category Scores</h2>
  ${report.categories.map(cat => {
    const percentage = Math.round((cat.score / cat.maxScore) * 100);
    return `
    <div class="category">
      <strong>${cat.category}:</strong> ${percentage}%
      <div class="bar"><div class="bar-fill" style="width: ${percentage}%"></div></div>
    </div>`;
  }).join('')}

  <h2>Issues</h2>
  ${report.issues.map(issue => `
    <div class="issue ${issue.severity}">
      <strong>${issue.title}</strong>
      <p>${issue.description}</p>
    </div>
  `).join('')}

  <h2>Action Plan</h2>
  ${report.actionPlan.slice(0, 10).map(action => `
    <div class="action">
      <input type="checkbox" ${action.completed ? 'checked' : ''}>
      <strong>P${action.priority}</strong> - ${action.title}
      <p>${action.description}</p>
    </div>
  `).join('')}
</body>
</html>`;
  }

  /**
   * Generate progress bar for markdown
   */
  private generateProgressBar(percentage: number): string {
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return '[' + '='.repeat(filled) + '-'.repeat(empty) + ']';
  }

  /**
   * Create a recommendation
   */
  private createRecommendation(
    priority: 'high' | 'medium' | 'low',
    title: string,
    description: string,
    impact: string,
    effort: 'easy' | 'moderate' | 'difficult',
    category: SEOCategoryScore['category']
  ): SEORecommendation {
    return {
      id: crypto.randomUUID(),
      priority,
      title,
      description,
      impact,
      effort,
      category,
    };
  }

  /**
   * Register event handler
   */
  onEvent(handler: (event: string, data: unknown) => void): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index > -1) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Emit event
   */
  private emit(event: string, data: unknown): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event, data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createReportGenerator(
  contentAnalyzer: ContentAnalyzerService,
  keywordSuggester: KeywordSuggesterService
): ReportGeneratorService {
  return new ReportGeneratorService(contentAnalyzer, keywordSuggester);
}

/**
 * Content Creator Suite - Newsletter Formatter
 *
 * Formats newsletter digests into various output formats (HTML, plain text, JSON).
 */

import type {
  GeneratedDigest,
  DigestSection,
  DigestSectionItem,
} from '../services/newsletter-digest/digest-generator.js';
import type { InsightReport, ExtractedInsight, TrendAnalysis } from '../services/newsletter-digest/insight-extractor.js';

// =============================================================================
// Types
// =============================================================================

export interface NewsletterFormatOptions {
  includeUnsubscribe?: boolean;
  includeViewInBrowser?: boolean;
  companyName?: string;
  companyAddress?: string;
  socialLinks?: SocialLink[];
  headerImage?: string;
  footerText?: string;
  accentColor?: string;
  fontFamily?: string;
}

export interface SocialLink {
  platform: 'twitter' | 'linkedin' | 'facebook' | 'instagram' | 'youtube';
  url: string;
}

export type NewsletterFormat = 'html' | 'plaintext' | 'json' | 'mjml' | 'markdown';

// =============================================================================
// Newsletter Formatter Class
// =============================================================================

export class NewsletterFormatter {
  private readonly defaultOptions: NewsletterFormatOptions = {
    includeUnsubscribe: true,
    includeViewInBrowser: true,
    accentColor: '#3182ce',
    fontFamily: 'Arial, Helvetica, sans-serif',
  };

  /**
   * Format newsletter digest
   */
  format(
    digest: GeneratedDigest,
    format: NewsletterFormat,
    options?: NewsletterFormatOptions
  ): string {
    const opts = { ...this.defaultOptions, ...options };

    switch (format) {
      case 'html':
        return this.formatAsHtml(digest, opts);
      case 'plaintext':
        return this.formatAsPlainText(digest, opts);
      case 'json':
        return this.formatAsJson(digest);
      case 'mjml':
        return this.formatAsMjml(digest, opts);
      case 'markdown':
        return this.formatAsMarkdown(digest, opts);
      default:
        return this.formatAsHtml(digest, opts);
    }
  }

  /**
   * Format as HTML email
   */
  private formatAsHtml(digest: GeneratedDigest, options: NewsletterFormatOptions): string {
    const sections = digest.sections.map(section => this.formatSectionHtml(section, options)).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(digest.title)}</title>
  <style>
    body {
      font-family: ${options.fontFamily};
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f7f7f7;
    }
    .container {
      background-color: #ffffff;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px solid ${options.accentColor};
      padding-bottom: 20px;
    }
    h1 {
      color: ${options.accentColor};
      margin: 0 0 10px 0;
      font-size: 28px;
    }
    .preheader {
      color: #666;
      font-size: 14px;
      margin-bottom: 10px;
    }
    .intro {
      font-size: 16px;
      margin-bottom: 30px;
      padding: 15px;
      background-color: #f9f9f9;
      border-left: 4px solid ${options.accentColor};
    }
    .toc {
      margin-bottom: 30px;
      padding: 15px;
      background-color: #f5f5f5;
      border-radius: 4px;
    }
    .toc h3 {
      margin-top: 0;
      color: ${options.accentColor};
    }
    .toc ul {
      margin: 0;
      padding-left: 20px;
    }
    .toc li {
      margin-bottom: 5px;
    }
    .toc a {
      color: #333;
      text-decoration: none;
    }
    .toc a:hover {
      color: ${options.accentColor};
    }
    .section {
      margin-bottom: 30px;
    }
    .section h2 {
      color: ${options.accentColor};
      border-bottom: 1px solid #eee;
      padding-bottom: 10px;
      font-size: 22px;
    }
    .section-intro {
      font-style: italic;
      color: #666;
      margin-bottom: 15px;
    }
    .item {
      margin-bottom: 20px;
      padding: 15px;
      background-color: #fafafa;
      border-radius: 4px;
    }
    .item h3 {
      margin: 0 0 10px 0;
      font-size: 18px;
    }
    .item h3 a {
      color: ${options.accentColor};
      text-decoration: none;
    }
    .item h3 a:hover {
      text-decoration: underline;
    }
    .item p {
      margin: 0;
      color: #555;
    }
    .cta {
      display: inline-block;
      margin-top: 10px;
      padding: 8px 16px;
      background-color: ${options.accentColor};
      color: #fff !important;
      text-decoration: none;
      border-radius: 4px;
      font-size: 14px;
    }
    .outro {
      margin-top: 30px;
      padding: 20px;
      background-color: #f9f9f9;
      border-radius: 4px;
      text-align: center;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      text-align: center;
      font-size: 12px;
      color: #999;
    }
    .social-links {
      margin: 15px 0;
    }
    .social-links a {
      display: inline-block;
      margin: 0 10px;
      color: ${options.accentColor};
      text-decoration: none;
    }
    .unsubscribe {
      margin-top: 10px;
    }
    .unsubscribe a {
      color: #999;
    }
  </style>
</head>
<body>
  <div class="container">
    ${options.headerImage ? `<img src="${options.headerImage}" alt="Newsletter header" style="width:100%;max-width:600px;margin-bottom:20px;">` : ''}

    <div class="header">
      <h1>${this.escapeHtml(digest.title)}</h1>
      ${digest.preheader ? `<p class="preheader">${this.escapeHtml(digest.preheader)}</p>` : ''}
    </div>

    ${digest.intro ? `<div class="intro">${this.escapeHtml(digest.intro)}</div>` : ''}

    ${digest.tableOfContents && digest.tableOfContents.length > 0 ? `
    <div class="toc">
      <h3>In This Issue</h3>
      <ul>
        ${digest.tableOfContents.map(item => `<li><a href="#section-${this.slugify(item)}">${this.escapeHtml(item)}</a></li>`).join('')}
      </ul>
    </div>
    ` : ''}

    ${sections}

    ${digest.outro ? `<div class="outro">${this.escapeHtml(digest.outro)}</div>` : ''}

    <div class="footer">
      ${options.socialLinks && options.socialLinks.length > 0 ? `
      <div class="social-links">
        ${options.socialLinks.map(link => `<a href="${link.url}">${this.capitalizeFirst(link.platform)}</a>`).join('')}
      </div>
      ` : ''}
      ${options.companyName ? `<p>${this.escapeHtml(options.companyName)}</p>` : ''}
      ${options.companyAddress ? `<p>${this.escapeHtml(options.companyAddress)}</p>` : ''}
      ${options.footerText ? `<p>${this.escapeHtml(options.footerText)}</p>` : ''}
      ${options.includeUnsubscribe ? `<p class="unsubscribe"><a href="{{unsubscribe_url}}">Unsubscribe</a></p>` : ''}
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Format section as HTML
   */
  private formatSectionHtml(section: DigestSection, options: NewsletterFormatOptions): string {
    const items = section.items.map(item => this.formatItemHtml(item, options)).join('');

    return `
    <div class="section" id="section-${this.slugify(section.title)}">
      <h2>${this.escapeHtml(section.title)}</h2>
      ${section.intro ? `<p class="section-intro">${this.escapeHtml(section.intro)}</p>` : ''}
      ${items}
    </div>`;
  }

  /**
   * Format item as HTML
   */
  private formatItemHtml(item: DigestSectionItem, options: NewsletterFormatOptions): string {
    return `
    <div class="item">
      <h3>${item.url ? `<a href="${item.url}">${this.escapeHtml(item.title)}</a>` : this.escapeHtml(item.title)}</h3>
      <p>${this.escapeHtml(item.content)}</p>
      ${item.callToAction ? `<a href="${item.url ?? '#'}" class="cta">${this.escapeHtml(item.callToAction)}</a>` : ''}
    </div>`;
  }

  /**
   * Format as plain text
   */
  private formatAsPlainText(digest: GeneratedDigest, options: NewsletterFormatOptions): string {
    const lines: string[] = [];

    // Header
    lines.push('='.repeat(60));
    lines.push(digest.title.toUpperCase());
    lines.push('='.repeat(60));
    lines.push('');

    if (digest.preheader) {
      lines.push(digest.preheader);
      lines.push('');
    }

    if (digest.intro) {
      lines.push(digest.intro);
      lines.push('');
    }

    // Table of contents
    if (digest.tableOfContents && digest.tableOfContents.length > 0) {
      lines.push('IN THIS ISSUE:');
      digest.tableOfContents.forEach((item, index) => {
        lines.push(`${index + 1}. ${item}`);
      });
      lines.push('');
    }

    lines.push('-'.repeat(60));
    lines.push('');

    // Sections
    for (const section of digest.sections) {
      lines.push(section.title.toUpperCase());
      lines.push('-'.repeat(section.title.length));
      lines.push('');

      if (section.intro) {
        lines.push(section.intro);
        lines.push('');
      }

      for (const item of section.items) {
        lines.push(`** ${item.title}`);
        lines.push(item.content);
        if (item.url) {
          lines.push(`Read more: ${item.url}`);
        }
        lines.push('');
      }

      lines.push('-'.repeat(60));
      lines.push('');
    }

    // Outro
    if (digest.outro) {
      lines.push(digest.outro);
      lines.push('');
    }

    // Footer
    lines.push('='.repeat(60));
    if (options.companyName) {
      lines.push(options.companyName);
    }
    if (options.footerText) {
      lines.push(options.footerText);
    }
    if (options.includeUnsubscribe) {
      lines.push('');
      lines.push('To unsubscribe, visit: {{unsubscribe_url}}');
    }

    return lines.join('\n');
  }

  /**
   * Format as JSON
   */
  private formatAsJson(digest: GeneratedDigest): string {
    return JSON.stringify({
      id: digest.id,
      title: digest.title,
      preheader: digest.preheader,
      intro: digest.intro,
      tableOfContents: digest.tableOfContents,
      sections: digest.sections.map(section => ({
        id: section.id,
        title: section.title,
        intro: section.intro,
        items: section.items.map(item => ({
          title: item.title,
          content: item.content,
          url: item.url,
          callToAction: item.callToAction,
        })),
      })),
      outro: digest.outro,
      metadata: {
        wordCount: digest.wordCount,
        generatedAt: new Date(digest.generatedAt).toISOString(),
      },
    }, null, 2);
  }

  /**
   * Format as MJML (email framework)
   */
  private formatAsMjml(digest: GeneratedDigest, options: NewsletterFormatOptions): string {
    const sections = digest.sections.map(section => `
      <mj-section>
        <mj-column>
          <mj-text font-size="20px" color="${options.accentColor}" font-weight="bold">
            ${this.escapeHtml(section.title)}
          </mj-text>
          ${section.intro ? `<mj-text font-style="italic" color="#666666">${this.escapeHtml(section.intro)}</mj-text>` : ''}
          ${section.items.map(item => `
          <mj-text>
            <strong>${item.url ? `<a href="${item.url}" style="color:${options.accentColor}">${this.escapeHtml(item.title)}</a>` : this.escapeHtml(item.title)}</strong><br/>
            ${this.escapeHtml(item.content)}
          </mj-text>
          `).join('')}
        </mj-column>
      </mj-section>
      <mj-divider border-color="#eeeeee" />
    `).join('');

    return `<mjml>
  <mj-head>
    <mj-title>${this.escapeHtml(digest.title)}</mj-title>
    <mj-preview>${this.escapeHtml(digest.preheader ?? '')}</mj-preview>
    <mj-attributes>
      <mj-all font-family="${options.fontFamily}" />
      <mj-text font-size="14px" color="#333333" line-height="1.6" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f7f7f7">
    <mj-section background-color="#ffffff" padding="30px">
      <mj-column>
        <mj-text font-size="28px" color="${options.accentColor}" font-weight="bold" align="center">
          ${this.escapeHtml(digest.title)}
        </mj-text>
        ${digest.preheader ? `<mj-text align="center" color="#666666">${this.escapeHtml(digest.preheader)}</mj-text>` : ''}
      </mj-column>
    </mj-section>

    ${digest.intro ? `
    <mj-section background-color="#f9f9f9">
      <mj-column>
        <mj-text>${this.escapeHtml(digest.intro)}</mj-text>
      </mj-column>
    </mj-section>
    ` : ''}

    ${sections}

    ${digest.outro ? `
    <mj-section background-color="#f9f9f9">
      <mj-column>
        <mj-text align="center">${this.escapeHtml(digest.outro)}</mj-text>
      </mj-column>
    </mj-section>
    ` : ''}

    <mj-section>
      <mj-column>
        ${options.companyName ? `<mj-text align="center" font-size="12px" color="#999999">${this.escapeHtml(options.companyName)}</mj-text>` : ''}
        ${options.includeUnsubscribe ? `<mj-text align="center" font-size="12px" color="#999999"><a href="{{unsubscribe_url}}" style="color:#999999">Unsubscribe</a></mj-text>` : ''}
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
  }

  /**
   * Format as Markdown
   */
  private formatAsMarkdown(digest: GeneratedDigest, options: NewsletterFormatOptions): string {
    const lines: string[] = [];

    lines.push(`# ${digest.title}`);
    lines.push('');

    if (digest.preheader) {
      lines.push(`*${digest.preheader}*`);
      lines.push('');
    }

    if (digest.intro) {
      lines.push(`> ${digest.intro}`);
      lines.push('');
    }

    if (digest.tableOfContents && digest.tableOfContents.length > 0) {
      lines.push('## In This Issue');
      lines.push('');
      digest.tableOfContents.forEach((item, index) => {
        lines.push(`${index + 1}. [${item}](#${this.slugify(item)})`);
      });
      lines.push('');
    }

    lines.push('---');
    lines.push('');

    for (const section of digest.sections) {
      lines.push(`## ${section.title}`);
      lines.push('');

      if (section.intro) {
        lines.push(`*${section.intro}*`);
        lines.push('');
      }

      for (const item of section.items) {
        lines.push(`### ${item.url ? `[${item.title}](${item.url})` : item.title}`);
        lines.push('');
        lines.push(item.content);
        lines.push('');
      }
    }

    if (digest.outro) {
      lines.push('---');
      lines.push('');
      lines.push(digest.outro);
    }

    return lines.join('\n');
  }

  /**
   * Format insight report
   */
  formatInsightReport(report: InsightReport, format: NewsletterFormat): string {
    switch (format) {
      case 'markdown':
        return this.formatInsightReportMarkdown(report);
      case 'html':
        return this.formatInsightReportHtml(report);
      case 'json':
        return JSON.stringify(report, null, 2);
      default:
        return this.formatInsightReportMarkdown(report);
    }
  }

  /**
   * Format insight report as markdown
   */
  private formatInsightReportMarkdown(report: InsightReport): string {
    const lines: string[] = [
      `# ${report.title}`,
      '',
      '## Executive Summary',
      '',
      report.summary,
      '',
    ];

    if (report.insights.length > 0) {
      lines.push('## Key Insights', '');
      for (const insight of report.insights) {
        lines.push(`### ${insight.title}`);
        lines.push('');
        lines.push(insight.summary);
        lines.push('');
        lines.push(`**Significance:** ${insight.significance}`);
        lines.push('');
      }
    }

    if (report.trends.length > 0) {
      lines.push('## Trends', '');
      for (const trend of report.trends) {
        const arrow = trend.direction === 'rising' ? 'up' : trend.direction === 'declining' ? 'down' : 'stable';
        lines.push(`### ${trend.trend} (${arrow})`);
        lines.push('');
        lines.push(`Confidence: ${(trend.confidence * 100).toFixed(0)}%`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Format insight report as HTML
   */
  private formatInsightReportHtml(report: InsightReport): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>${this.escapeHtml(report.title)}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; }
    h2 { color: #555; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
    .insight { background: #f9f9f9; padding: 15px; margin: 10px 0; border-radius: 4px; }
    .trend { display: flex; align-items: center; margin: 10px 0; }
    .trend-arrow { font-size: 24px; margin-right: 10px; }
  </style>
</head>
<body>
  <h1>${this.escapeHtml(report.title)}</h1>
  <p>${this.escapeHtml(report.summary)}</p>

  ${report.insights.length > 0 ? `
  <h2>Key Insights</h2>
  ${report.insights.map(insight => `
  <div class="insight">
    <h3>${this.escapeHtml(insight.title)}</h3>
    <p>${this.escapeHtml(insight.summary)}</p>
    <p><strong>Why it matters:</strong> ${this.escapeHtml(insight.significance)}</p>
  </div>
  `).join('')}
  ` : ''}

  ${report.trends.length > 0 ? `
  <h2>Trends</h2>
  ${report.trends.map(trend => `
  <div class="trend">
    <span class="trend-arrow">${trend.direction === 'rising' ? '↑' : trend.direction === 'declining' ? '↓' : '→'}</span>
    <div>
      <strong>${this.escapeHtml(trend.trend)}</strong>
      <span>(${(trend.confidence * 100).toFixed(0)}% confidence)</span>
    </div>
  </div>
  `).join('')}
  ` : ''}
</body>
</html>`;
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Escape HTML characters
   */
  private escapeHtml(text: string): string {
    const escapeMap: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return text.replace(/[&<>"']/g, char => escapeMap[char]);
  }

  /**
   * Create URL-safe slug
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  /**
   * Capitalize first letter
   */
  private capitalizeFirst(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createNewsletterFormatter(): NewsletterFormatter {
  return new NewsletterFormatter();
}

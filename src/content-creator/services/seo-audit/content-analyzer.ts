/**
 * Content Creator Suite - SEO Content Analyzer
 *
 * Analyzes content for SEO optimization, readability, and structure.
 */

import type {
  BlogPost,
  SEOAuditResult,
  SEOCategoryScore,
  SEOIssue,
  SEOIssueSeverity,
  KeywordAnalysis,
} from '../../types.js';
import type { SEOAuditConfig } from '../../config.js';
import { CONTENT_DEFAULTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface ContentAnalyzerConfig {
  minWordCount: number;
  targetReadabilityScore: number;
  keywordDensity: {
    min: number;
    max: number;
  };
  metaDescription: {
    minLength: number;
    maxLength: number;
  };
  titleTag: {
    minLength: number;
    maxLength: number;
  };
  headingStructure: {
    requireH1: boolean;
    maxH1Count: number;
    requireSubheadings: boolean;
  };
  links: {
    minInternalLinks: number;
    minExternalLinks: number;
  };
  images: {
    requireAltText: boolean;
  };
}

export interface ContentAnalysis {
  wordCount: number;
  characterCount: number;
  sentenceCount: number;
  paragraphCount: number;
  averageSentenceLength: number;
  readabilityScore: number;
  readingLevel: string;
  headings: HeadingAnalysis;
  links: LinkAnalysis;
  images: ImageAnalysis;
  issues: SEOIssue[];
}

export interface HeadingAnalysis {
  h1Count: number;
  h2Count: number;
  h3Count: number;
  h4Count: number;
  h5Count: number;
  h6Count: number;
  headings: { level: number; text: string }[];
  hasProperHierarchy: boolean;
}

export interface LinkAnalysis {
  internalLinks: string[];
  externalLinks: string[];
  brokenLinks: string[];
  noFollowLinks: string[];
  totalLinks: number;
}

export interface ImageAnalysis {
  totalImages: number;
  imagesWithAlt: number;
  imagesWithoutAlt: number;
  images: { src: string; alt: string | null }[];
}

// =============================================================================
// Content Analyzer Service
// =============================================================================

export class ContentAnalyzerService {
  private readonly config: ContentAnalyzerConfig;

  constructor(config?: SEOAuditConfig) {
    this.config = {
      minWordCount: config?.minWordCount ?? CONTENT_DEFAULTS.BLOG_MIN_WORD_COUNT,
      targetReadabilityScore: config?.targetReadabilityScore ?? 60,
      keywordDensity: {
        min: config?.keywordDensity?.min ?? CONTENT_DEFAULTS.KEYWORD_DENSITY_MIN,
        max: config?.keywordDensity?.max ?? CONTENT_DEFAULTS.KEYWORD_DENSITY_MAX,
      },
      metaDescription: {
        minLength: config?.metaDescription?.minLength ?? CONTENT_DEFAULTS.META_DESCRIPTION_MIN,
        maxLength: config?.metaDescription?.maxLength ?? CONTENT_DEFAULTS.META_DESCRIPTION_MAX,
      },
      titleTag: {
        minLength: config?.titleTag?.minLength ?? CONTENT_DEFAULTS.META_TITLE_MIN,
        maxLength: config?.titleTag?.maxLength ?? CONTENT_DEFAULTS.META_TITLE_MAX,
      },
      headingStructure: {
        requireH1: config?.headingStructure?.requireH1 ?? true,
        maxH1Count: config?.headingStructure?.maxH1Count ?? 1,
        requireSubheadings: config?.headingStructure?.requireSubheadings ?? true,
      },
      links: {
        minInternalLinks: config?.links?.minInternalLinks ?? 2,
        minExternalLinks: config?.links?.minExternalLinks ?? 1,
      },
      images: {
        requireAltText: config?.images?.requireAltText ?? true,
      },
    };
  }

  /**
   * Perform full content analysis
   */
  analyzeContent(content: string, isHtml: boolean = true): ContentAnalysis {
    const plainText = isHtml ? this.stripHtml(content) : content;

    const wordCount = this.countWords(plainText);
    const characterCount = plainText.length;
    const sentenceCount = this.countSentences(plainText);
    const paragraphCount = this.countParagraphs(isHtml ? content : plainText);
    const averageSentenceLength = sentenceCount > 0 ? wordCount / sentenceCount : 0;

    const readabilityScore = this.calculateReadabilityScore(plainText);
    const readingLevel = this.getReadingLevel(readabilityScore);

    const headings = this.analyzeHeadings(content);
    const links = this.analyzeLinks(content);
    const images = this.analyzeImages(content);

    const issues = this.identifyIssues({
      wordCount,
      sentenceCount,
      averageSentenceLength,
      readabilityScore,
      headings,
      links,
      images,
    });

    return {
      wordCount,
      characterCount,
      sentenceCount,
      paragraphCount,
      averageSentenceLength,
      readabilityScore,
      readingLevel,
      headings,
      links,
      images,
      issues,
    };
  }

  /**
   * Analyze a blog post
   */
  analyzeBlogPost(post: BlogPost): {
    content: ContentAnalysis;
    titleAnalysis: TitleAnalysis;
    metaAnalysis: MetaAnalysis;
    categoryScores: SEOCategoryScore[];
    overallScore: number;
    issues: SEOIssue[];
  } {
    const contentAnalysis = this.analyzeContent(post.content);
    const titleAnalysis = this.analyzeTitle(post.title, post.seo?.focusKeyword);
    const metaAnalysis = this.analyzeMetaData(post);

    const issues = [
      ...contentAnalysis.issues,
      ...titleAnalysis.issues,
      ...metaAnalysis.issues,
    ];

    const categoryScores = this.calculateCategoryScores({
      content: contentAnalysis,
      title: titleAnalysis,
      meta: metaAnalysis,
    });

    const overallScore = this.calculateOverallScore(categoryScores);

    return {
      content: contentAnalysis,
      titleAnalysis,
      metaAnalysis,
      categoryScores,
      overallScore,
      issues,
    };
  }

  // ===========================================================================
  // Text Analysis
  // ===========================================================================

  /**
   * Count words in text
   */
  countWords(text: string): number {
    const cleanText = text.replace(/\s+/g, ' ').trim();
    if (cleanText.length === 0) return 0;
    return cleanText.split(' ').filter(w => w.length > 0).length;
  }

  /**
   * Count sentences in text
   */
  countSentences(text: string): number {
    const sentences = text.match(/[^.!?]+[.!?]+/g);
    return sentences ? sentences.length : 0;
  }

  /**
   * Count paragraphs
   */
  countParagraphs(content: string): number {
    if (content.includes('<p')) {
      const matches = content.match(/<p[^>]*>/gi);
      return matches ? matches.length : 0;
    }
    return content.split(/\n\n+/).filter(p => p.trim().length > 0).length;
  }

  /**
   * Calculate Flesch-Kincaid readability score
   */
  calculateReadabilityScore(text: string): number {
    const words = this.countWords(text);
    const sentences = this.countSentences(text);
    const syllables = this.countSyllables(text);

    if (words === 0 || sentences === 0) return 0;

    // Flesch Reading Ease formula
    const score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Count syllables in text (approximation)
   */
  private countSyllables(text: string): number {
    const words = text.toLowerCase().match(/[a-z]+/g) || [];
    let totalSyllables = 0;

    for (const word of words) {
      totalSyllables += this.countWordSyllables(word);
    }

    return totalSyllables;
  }

  /**
   * Count syllables in a single word
   */
  private countWordSyllables(word: string): number {
    word = word.toLowerCase();
    if (word.length <= 3) return 1;

    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');

    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  }

  /**
   * Get reading level from score
   */
  getReadingLevel(score: number): string {
    if (score >= 90) return '5th grade';
    if (score >= 80) return '6th grade';
    if (score >= 70) return '7th grade';
    if (score >= 60) return '8th-9th grade';
    if (score >= 50) return '10th-12th grade';
    if (score >= 30) return 'College';
    return 'College graduate';
  }

  // ===========================================================================
  // Structure Analysis
  // ===========================================================================

  /**
   * Analyze headings structure
   */
  analyzeHeadings(content: string): HeadingAnalysis {
    const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
    const headings: { level: number; text: string }[] = [];

    let match;
    while ((match = headingRegex.exec(content)) !== null) {
      headings.push({
        level: parseInt(match[1], 10),
        text: this.stripHtml(match[2]),
      });
    }

    const counts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
    for (const heading of headings) {
      counts[`h${heading.level}` as keyof typeof counts]++;
    }

    // Check for proper hierarchy
    let hasProperHierarchy = true;
    let prevLevel = 0;
    for (const heading of headings) {
      if (heading.level > prevLevel + 1 && prevLevel !== 0) {
        hasProperHierarchy = false;
        break;
      }
      prevLevel = heading.level;
    }

    return {
      h1Count: counts.h1,
      h2Count: counts.h2,
      h3Count: counts.h3,
      h4Count: counts.h4,
      h5Count: counts.h5,
      h6Count: counts.h6,
      headings,
      hasProperHierarchy,
    };
  }

  /**
   * Analyze links in content
   */
  analyzeLinks(content: string): LinkAnalysis {
    const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
    const internalLinks: string[] = [];
    const externalLinks: string[] = [];
    const noFollowLinks: string[] = [];

    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const href = match[1];
      const fullTag = match[0];

      if (href.startsWith('http://') || href.startsWith('https://')) {
        externalLinks.push(href);
      } else if (href.startsWith('/') || href.startsWith('#')) {
        internalLinks.push(href);
      } else {
        internalLinks.push(href);
      }

      if (fullTag.includes('rel="nofollow"') || fullTag.includes("rel='nofollow'")) {
        noFollowLinks.push(href);
      }
    }

    return {
      internalLinks,
      externalLinks,
      brokenLinks: [], // Would require actual link checking
      noFollowLinks,
      totalLinks: internalLinks.length + externalLinks.length,
    };
  }

  /**
   * Analyze images in content
   */
  analyzeImages(content: string): ImageAnalysis {
    const imgRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
    const images: { src: string; alt: string | null }[] = [];

    let match;
    while ((match = imgRegex.exec(content)) !== null) {
      const src = match[1];
      const altMatch = match[0].match(/alt=["']([^"']*)["']/i);
      const alt = altMatch ? altMatch[1] : null;

      images.push({ src, alt });
    }

    const imagesWithAlt = images.filter(img => img.alt !== null && img.alt.length > 0).length;

    return {
      totalImages: images.length,
      imagesWithAlt,
      imagesWithoutAlt: images.length - imagesWithAlt,
      images,
    };
  }

  // ===========================================================================
  // Title and Meta Analysis
  // ===========================================================================

  /**
   * Analyze title
   */
  analyzeTitle(title: string, focusKeyword?: string): TitleAnalysis {
    const issues: SEOIssue[] = [];
    const length = title.length;

    if (length < this.config.titleTag.minLength) {
      issues.push(this.createIssue(
        'meta',
        'warning',
        'Title too short',
        `Title should be at least ${this.config.titleTag.minLength} characters`,
        'title',
        String(length),
        `${this.config.titleTag.minLength}+ characters`
      ));
    }

    if (length > this.config.titleTag.maxLength) {
      issues.push(this.createIssue(
        'meta',
        'warning',
        'Title too long',
        `Title should be under ${this.config.titleTag.maxLength} characters`,
        'title',
        String(length),
        `< ${this.config.titleTag.maxLength} characters`
      ));
    }

    const hasKeyword = focusKeyword
      ? title.toLowerCase().includes(focusKeyword.toLowerCase())
      : false;

    if (focusKeyword && !hasKeyword) {
      issues.push(this.createIssue(
        'keywords',
        'warning',
        'Focus keyword not in title',
        'Including your focus keyword in the title improves SEO',
        'title'
      ));
    }

    // Check if title starts with keyword
    const keywordAtStart = focusKeyword
      ? title.toLowerCase().startsWith(focusKeyword.toLowerCase())
      : false;

    return {
      length,
      isOptimalLength: length >= this.config.titleTag.minLength && length <= this.config.titleTag.maxLength,
      hasKeyword,
      keywordAtStart,
      issues,
    };
  }

  /**
   * Analyze meta data
   */
  analyzeMetaData(post: BlogPost): MetaAnalysis {
    const issues: SEOIssue[] = [];
    const metaDescription = post.seo?.metaDescription ?? post.excerpt ?? '';
    const descLength = metaDescription.length;

    if (descLength === 0) {
      issues.push(this.createIssue(
        'meta',
        'critical',
        'Missing meta description',
        'A meta description is essential for SEO and click-through rates',
        'meta_description'
      ));
    } else if (descLength < this.config.metaDescription.minLength) {
      issues.push(this.createIssue(
        'meta',
        'warning',
        'Meta description too short',
        `Meta description should be at least ${this.config.metaDescription.minLength} characters`,
        'meta_description',
        String(descLength),
        `${this.config.metaDescription.minLength}+ characters`
      ));
    } else if (descLength > this.config.metaDescription.maxLength) {
      issues.push(this.createIssue(
        'meta',
        'warning',
        'Meta description too long',
        `Meta description should be under ${this.config.metaDescription.maxLength} characters`,
        'meta_description',
        String(descLength),
        `< ${this.config.metaDescription.maxLength} characters`
      ));
    }

    const focusKeyword = post.seo?.focusKeyword;
    const hasKeywordInDescription = focusKeyword
      ? metaDescription.toLowerCase().includes(focusKeyword.toLowerCase())
      : false;

    if (focusKeyword && !hasKeywordInDescription) {
      issues.push(this.createIssue(
        'keywords',
        'info',
        'Focus keyword not in meta description',
        'Including your focus keyword in the meta description can improve relevance',
        'meta_description'
      ));
    }

    return {
      hasMetaDescription: descLength > 0,
      metaDescriptionLength: descLength,
      isOptimalLength: descLength >= this.config.metaDescription.minLength && descLength <= this.config.metaDescription.maxLength,
      hasKeywordInDescription,
      hasFocusKeyword: !!focusKeyword,
      hasCanonicalUrl: !!post.seo?.canonicalUrl,
      hasOgData: !!(post.seo?.ogTitle || post.seo?.ogDescription),
      issues,
    };
  }

  // ===========================================================================
  // Issue Identification
  // ===========================================================================

  /**
   * Identify content issues
   */
  private identifyIssues(analysis: {
    wordCount: number;
    sentenceCount: number;
    averageSentenceLength: number;
    readabilityScore: number;
    headings: HeadingAnalysis;
    links: LinkAnalysis;
    images: ImageAnalysis;
  }): SEOIssue[] {
    const issues: SEOIssue[] = [];

    // Word count
    if (analysis.wordCount < this.config.minWordCount) {
      issues.push(this.createIssue(
        'content',
        'warning',
        'Content too short',
        `Content should be at least ${this.config.minWordCount} words for better SEO`,
        'content',
        String(analysis.wordCount),
        `${this.config.minWordCount}+ words`
      ));
    }

    // Readability
    if (analysis.readabilityScore < this.config.targetReadabilityScore) {
      issues.push(this.createIssue(
        'content',
        'info',
        'Readability could be improved',
        'Consider using shorter sentences and simpler words',
        'content',
        String(analysis.readabilityScore),
        `${this.config.targetReadabilityScore}+`
      ));
    }

    // Sentence length
    if (analysis.averageSentenceLength > 25) {
      issues.push(this.createIssue(
        'content',
        'info',
        'Sentences are long',
        'Average sentence length is high. Consider breaking up long sentences.',
        'content',
        `${Math.round(analysis.averageSentenceLength)} words/sentence`,
        '< 25 words/sentence'
      ));
    }

    // Headings
    if (this.config.headingStructure.requireH1 && analysis.headings.h1Count === 0) {
      issues.push(this.createIssue(
        'structure',
        'critical',
        'Missing H1 heading',
        'Every page should have exactly one H1 heading',
        'headings'
      ));
    }

    if (analysis.headings.h1Count > this.config.headingStructure.maxH1Count) {
      issues.push(this.createIssue(
        'structure',
        'warning',
        'Multiple H1 headings',
        `Should have only ${this.config.headingStructure.maxH1Count} H1 heading`,
        'headings',
        String(analysis.headings.h1Count),
        String(this.config.headingStructure.maxH1Count)
      ));
    }

    if (this.config.headingStructure.requireSubheadings &&
        analysis.headings.h2Count === 0 &&
        analysis.wordCount > 500) {
      issues.push(this.createIssue(
        'structure',
        'warning',
        'No subheadings',
        'Long content should use H2 subheadings to improve readability',
        'headings'
      ));
    }

    if (!analysis.headings.hasProperHierarchy) {
      issues.push(this.createIssue(
        'structure',
        'warning',
        'Improper heading hierarchy',
        'Headings should follow a logical hierarchy (H1 > H2 > H3)',
        'headings'
      ));
    }

    // Links
    if (analysis.links.internalLinks.length < this.config.links.minInternalLinks) {
      issues.push(this.createIssue(
        'links',
        'info',
        'Few internal links',
        `Consider adding at least ${this.config.links.minInternalLinks} internal links`,
        'links',
        String(analysis.links.internalLinks.length),
        `${this.config.links.minInternalLinks}+ internal links`
      ));
    }

    if (analysis.links.externalLinks.length < this.config.links.minExternalLinks) {
      issues.push(this.createIssue(
        'links',
        'info',
        'No external links',
        'Linking to authoritative external sources can improve credibility',
        'links'
      ));
    }

    // Images
    if (this.config.images.requireAltText && analysis.images.imagesWithoutAlt > 0) {
      issues.push(this.createIssue(
        'technical',
        'warning',
        'Images missing alt text',
        `${analysis.images.imagesWithoutAlt} image(s) don't have alt text`,
        'images',
        String(analysis.images.imagesWithoutAlt),
        '0'
      ));
    }

    return issues;
  }

  // ===========================================================================
  // Scoring
  // ===========================================================================

  /**
   * Calculate category scores
   */
  private calculateCategoryScores(analysis: {
    content: ContentAnalysis;
    title: TitleAnalysis;
    meta: MetaAnalysis;
  }): SEOCategoryScore[] {
    return [
      this.scoreContentCategory(analysis.content),
      this.scoreStructureCategory(analysis.content.headings),
      this.scoreMetaCategory(analysis.title, analysis.meta),
      this.scoreLinksCategory(analysis.content.links),
      this.scoreTechnicalCategory(analysis.content.images),
    ];
  }

  private scoreContentCategory(content: ContentAnalysis): SEOCategoryScore {
    let score = 0;
    const maxScore = 30;

    // Word count (max 10)
    if (content.wordCount >= 1500) score += 10;
    else if (content.wordCount >= 1000) score += 8;
    else if (content.wordCount >= 500) score += 5;
    else if (content.wordCount >= 300) score += 3;

    // Readability (max 10)
    if (content.readabilityScore >= 60) score += 10;
    else if (content.readabilityScore >= 50) score += 7;
    else if (content.readabilityScore >= 40) score += 5;
    else score += 2;

    // Paragraph structure (max 10)
    if (content.paragraphCount >= 5) score += 10;
    else if (content.paragraphCount >= 3) score += 7;
    else score += 3;

    const issues = content.issues.filter(i => i.category === 'content').length;

    return { category: 'content', score, maxScore, issues };
  }

  private scoreStructureCategory(headings: HeadingAnalysis): SEOCategoryScore {
    let score = 0;
    const maxScore = 20;

    // H1 present (max 5)
    if (headings.h1Count === 1) score += 5;
    else if (headings.h1Count > 0) score += 2;

    // Subheadings (max 10)
    if (headings.h2Count >= 3) score += 10;
    else if (headings.h2Count >= 2) score += 7;
    else if (headings.h2Count >= 1) score += 4;

    // Proper hierarchy (max 5)
    if (headings.hasProperHierarchy) score += 5;

    const issues = (headings.h1Count !== 1 ? 1 : 0) +
                   (headings.h2Count < 2 ? 1 : 0) +
                   (!headings.hasProperHierarchy ? 1 : 0);

    return { category: 'structure', score, maxScore, issues };
  }

  private scoreMetaCategory(title: TitleAnalysis, meta: MetaAnalysis): SEOCategoryScore {
    let score = 0;
    const maxScore = 25;

    // Title optimization (max 10)
    if (title.isOptimalLength) score += 5;
    if (title.hasKeyword) score += 3;
    if (title.keywordAtStart) score += 2;

    // Meta description (max 10)
    if (meta.hasMetaDescription) score += 5;
    if (meta.isOptimalLength) score += 3;
    if (meta.hasKeywordInDescription) score += 2;

    // Focus keyword (max 5)
    if (meta.hasFocusKeyword) score += 3;
    if (meta.hasCanonicalUrl) score += 1;
    if (meta.hasOgData) score += 1;

    const issues = title.issues.length + meta.issues.length;

    return { category: 'meta', score, maxScore, issues };
  }

  private scoreLinksCategory(links: LinkAnalysis): SEOCategoryScore {
    let score = 0;
    const maxScore = 15;

    // Internal links (max 8)
    if (links.internalLinks.length >= 5) score += 8;
    else if (links.internalLinks.length >= 3) score += 6;
    else if (links.internalLinks.length >= 1) score += 3;

    // External links (max 7)
    if (links.externalLinks.length >= 3) score += 7;
    else if (links.externalLinks.length >= 1) score += 5;

    const issues = (links.internalLinks.length < 2 ? 1 : 0) +
                   (links.externalLinks.length < 1 ? 1 : 0);

    return { category: 'links', score, maxScore, issues };
  }

  private scoreTechnicalCategory(images: ImageAnalysis): SEOCategoryScore {
    let score = 0;
    const maxScore = 10;

    if (images.totalImages === 0) {
      score = 5; // No penalty if no images
    } else {
      const altPercentage = images.imagesWithAlt / images.totalImages;
      score = Math.round(altPercentage * 10);
    }

    const issues = images.imagesWithoutAlt > 0 ? 1 : 0;

    return { category: 'technical', score, maxScore, issues };
  }

  /**
   * Calculate overall score
   */
  private calculateOverallScore(categories: SEOCategoryScore[]): number {
    const totalScore = categories.reduce((sum, cat) => sum + cat.score, 0);
    const maxScore = categories.reduce((sum, cat) => sum + cat.maxScore, 0);

    return Math.round((totalScore / maxScore) * 100);
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Strip HTML tags from text
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Create an SEO issue
   */
  private createIssue(
    category: SEOCategoryScore['category'],
    severity: SEOIssueSeverity,
    title: string,
    description: string,
    affectedElement?: string,
    currentValue?: string,
    recommendedValue?: string
  ): SEOIssue {
    return {
      id: crypto.randomUUID(),
      category,
      severity,
      title,
      description,
      affectedElement,
      currentValue,
      recommendedValue,
    };
  }
}

// =============================================================================
// Types
// =============================================================================

export interface TitleAnalysis {
  length: number;
  isOptimalLength: boolean;
  hasKeyword: boolean;
  keywordAtStart: boolean;
  issues: SEOIssue[];
}

export interface MetaAnalysis {
  hasMetaDescription: boolean;
  metaDescriptionLength: number;
  isOptimalLength: boolean;
  hasKeywordInDescription: boolean;
  hasFocusKeyword: boolean;
  hasCanonicalUrl: boolean;
  hasOgData: boolean;
  issues: SEOIssue[];
}

// =============================================================================
// Factory Function
// =============================================================================

export function createContentAnalyzer(config?: SEOAuditConfig): ContentAnalyzerService {
  return new ContentAnalyzerService(config);
}

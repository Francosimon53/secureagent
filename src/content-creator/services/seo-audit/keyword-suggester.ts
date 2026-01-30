/**
 * Content Creator Suite - Keyword Suggester
 *
 * Analyzes content for keyword usage and suggests optimizations.
 */

import type { KeywordAnalysis, BlogPost } from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import { CONTENT_DEFAULTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface KeywordSuggestion {
  keyword: string;
  type: 'primary' | 'secondary' | 'long-tail' | 'lsi';
  relevanceScore: number;
  searchVolume?: 'high' | 'medium' | 'low';
  difficulty?: 'easy' | 'moderate' | 'hard';
  reason: string;
}

export interface KeywordSuggesterConfig {
  minKeywordLength: number;
  maxSuggestions: number;
  minFrequency: number;
  excludeCommonWords: boolean;
  densityMin: number;
  densityMax: number;
}

export interface KeywordPlacement {
  location: 'title' | 'h1' | 'h2' | 'meta_description' | 'first_paragraph' | 'body' | 'url' | 'image_alt';
  present: boolean;
  count: number;
  recommended: boolean;
}

// =============================================================================
// Keyword Suggester Service
// =============================================================================

export class KeywordSuggesterService {
  private readonly config: KeywordSuggesterConfig;
  private readonly commonWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'over', 'after',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'this', 'that',
    'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what',
    'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'each',
    'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
    'also', 'now', 'here', 'there', 'then', 'if', 'because', 'as', 'until',
    'while', 'although', 'though', 'even', 'still', 'yet', 'however', 'your',
    'their', 'our', 'its', 'his', 'her', 'my', 'like', 'get', 'make', 'go',
    'see', 'know', 'take', 'come', 'think', 'look', 'want', 'give', 'use',
    'find', 'tell', 'ask', 'work', 'seem', 'feel', 'try', 'leave', 'call',
  ]);

  constructor(
    private readonly contentGenerator?: ContentGeneratorProvider,
    config?: Partial<KeywordSuggesterConfig>
  ) {
    this.config = {
      minKeywordLength: config?.minKeywordLength ?? 3,
      maxSuggestions: config?.maxSuggestions ?? 10,
      minFrequency: config?.minFrequency ?? 2,
      excludeCommonWords: config?.excludeCommonWords ?? true,
      densityMin: config?.densityMin ?? CONTENT_DEFAULTS.KEYWORD_DENSITY_MIN,
      densityMax: config?.densityMax ?? CONTENT_DEFAULTS.KEYWORD_DENSITY_MAX,
    };
  }

  /**
   * Analyze keyword usage in content
   */
  analyzeKeywords(content: string, focusKeyword?: string): KeywordAnalysis {
    const plainText = this.stripHtml(content);
    const words = this.extractWords(plainText);
    const wordCount = words.length;

    // Calculate keyword frequency
    const wordFrequency = this.calculateWordFrequency(words);

    // Find related keywords based on frequency
    const relatedKeywords = this.findRelatedKeywords(wordFrequency, wordCount);

    // Analyze focus keyword if provided
    let keywordDensity = 0;
    let keywordInTitle = false;
    let keywordInHeadings = false;
    let keywordInFirstParagraph = false;
    let keywordInMetaDescription = false;

    if (focusKeyword) {
      const focusLower = focusKeyword.toLowerCase();
      const focusCount = this.countKeywordOccurrences(plainText.toLowerCase(), focusLower);
      keywordDensity = wordCount > 0 ? (focusCount / wordCount) * 100 : 0;

      // Check first paragraph
      const firstParagraph = this.extractFirstParagraph(content);
      keywordInFirstParagraph = firstParagraph.toLowerCase().includes(focusLower);

      // Check headings
      const headings = this.extractHeadings(content);
      keywordInHeadings = headings.some(h => h.toLowerCase().includes(focusLower));
    }

    // Generate suggested keywords
    const suggestedKeywords = this.generateSuggestions(
      wordFrequency,
      focusKeyword,
      plainText
    ).map(s => s.keyword);

    return {
      focusKeyword,
      keywordDensity: Math.round(keywordDensity * 100) / 100,
      keywordInTitle,
      keywordInHeadings,
      keywordInFirstParagraph,
      keywordInMetaDescription,
      relatedKeywords,
      suggestedKeywords,
    };
  }

  /**
   * Analyze keyword placement in blog post
   */
  analyzeKeywordPlacement(post: BlogPost): KeywordPlacement[] {
    const focusKeyword = post.seo?.focusKeyword;
    if (!focusKeyword) {
      return [];
    }

    const focusLower = focusKeyword.toLowerCase();
    const placements: KeywordPlacement[] = [];

    // Title
    placements.push({
      location: 'title',
      present: post.title.toLowerCase().includes(focusLower),
      count: this.countKeywordOccurrences(post.title.toLowerCase(), focusLower),
      recommended: true,
    });

    // H1 (assuming title is H1 or check content)
    const h1s = this.extractH1s(post.content);
    placements.push({
      location: 'h1',
      present: h1s.some(h => h.toLowerCase().includes(focusLower)),
      count: h1s.filter(h => h.toLowerCase().includes(focusLower)).length,
      recommended: true,
    });

    // H2s
    const h2s = this.extractH2s(post.content);
    placements.push({
      location: 'h2',
      present: h2s.some(h => h.toLowerCase().includes(focusLower)),
      count: h2s.filter(h => h.toLowerCase().includes(focusLower)).length,
      recommended: true,
    });

    // Meta description
    const metaDesc = post.seo?.metaDescription ?? post.excerpt ?? '';
    placements.push({
      location: 'meta_description',
      present: metaDesc.toLowerCase().includes(focusLower),
      count: this.countKeywordOccurrences(metaDesc.toLowerCase(), focusLower),
      recommended: true,
    });

    // First paragraph
    const firstParagraph = this.extractFirstParagraph(post.content);
    placements.push({
      location: 'first_paragraph',
      present: firstParagraph.toLowerCase().includes(focusLower),
      count: this.countKeywordOccurrences(firstParagraph.toLowerCase(), focusLower),
      recommended: true,
    });

    // Body
    const bodyText = this.stripHtml(post.content).toLowerCase();
    placements.push({
      location: 'body',
      present: bodyText.includes(focusLower),
      count: this.countKeywordOccurrences(bodyText, focusLower),
      recommended: true,
    });

    // URL/Slug
    if (post.slug) {
      placements.push({
        location: 'url',
        present: post.slug.toLowerCase().includes(focusLower.replace(/\s+/g, '-')),
        count: post.slug.toLowerCase().includes(focusLower.replace(/\s+/g, '-')) ? 1 : 0,
        recommended: true,
      });
    }

    // Image alt text
    const imageAlts = this.extractImageAlts(post.content);
    const altsWithKeyword = imageAlts.filter(alt => alt.toLowerCase().includes(focusLower));
    placements.push({
      location: 'image_alt',
      present: altsWithKeyword.length > 0,
      count: altsWithKeyword.length,
      recommended: imageAlts.length > 0,
    });

    return placements;
  }

  /**
   * Generate keyword suggestions
   */
  generateSuggestions(
    wordFrequency: Map<string, number>,
    focusKeyword?: string,
    content?: string
  ): KeywordSuggestion[] {
    const suggestions: KeywordSuggestion[] = [];

    // Get high-frequency words as potential keywords
    const frequencyArray = Array.from(wordFrequency.entries())
      .filter(([word]) => word.length >= this.config.minKeywordLength)
      .filter(([word]) => !this.config.excludeCommonWords || !this.commonWords.has(word))
      .sort((a, b) => b[1] - a[1]);

    // Add primary/secondary keywords based on frequency
    for (const [word, frequency] of frequencyArray.slice(0, this.config.maxSuggestions)) {
      if (frequency >= this.config.minFrequency) {
        const type = suggestions.length < 3 ? 'secondary' : 'long-tail';
        suggestions.push({
          keyword: word,
          type,
          relevanceScore: Math.min(1, frequency / 10),
          reason: `Appears ${frequency} times in content`,
        });
      }
    }

    // Add two-word phrases
    if (content) {
      const phrases = this.extractPhrases(content, 2);
      for (const [phrase, frequency] of phrases.slice(0, 5)) {
        if (frequency >= 2 && !suggestions.some(s => s.keyword === phrase)) {
          suggestions.push({
            keyword: phrase,
            type: 'long-tail',
            relevanceScore: Math.min(1, frequency / 5),
            reason: `Phrase appears ${frequency} times`,
          });
        }
      }
    }

    // If we have a focus keyword, suggest LSI keywords
    if (focusKeyword && content) {
      const lsiKeywords = this.findLSIKeywords(focusKeyword, content);
      for (const lsi of lsiKeywords.slice(0, 5)) {
        if (!suggestions.some(s => s.keyword === lsi)) {
          suggestions.push({
            keyword: lsi,
            type: 'lsi',
            relevanceScore: 0.7,
            reason: 'Semantically related to focus keyword',
          });
        }
      }
    }

    return suggestions.slice(0, this.config.maxSuggestions);
  }

  /**
   * Get keyword suggestions using AI
   */
  async getAISuggestions(
    topic: string,
    existingContent?: string,
    count: number = 10
  ): Promise<KeywordSuggestion[]> {
    if (!this.contentGenerator || !this.contentGenerator.isInitialized()) {
      return [];
    }

    const prompt = `Generate ${count} SEO keywords for content about: "${topic}"
${existingContent ? `\nExisting content preview: ${existingContent.substring(0, 500)}...` : ''}

For each keyword, provide:
1. The keyword or phrase
2. Type: primary, secondary, long-tail, or lsi
3. Estimated search volume: high, medium, or low
4. Estimated difficulty: easy, moderate, or hard
5. Brief reason why it's a good keyword

Format as JSON array with objects: { keyword, type, searchVolume, difficulty, reason }`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You are an SEO expert. Provide practical, actionable keyword suggestions.',
      maxTokens: 1000,
    });

    if (!result.success) {
      return [];
    }

    try {
      // Extract JSON from response
      const jsonMatch = result.data.content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        keyword: string;
        type: string;
        searchVolume: string;
        difficulty: string;
        reason: string;
      }>;

      return parsed.map(item => ({
        keyword: item.keyword,
        type: (item.type as KeywordSuggestion['type']) || 'secondary',
        relevanceScore: 0.8,
        searchVolume: item.searchVolume as 'high' | 'medium' | 'low',
        difficulty: item.difficulty as 'easy' | 'moderate' | 'hard',
        reason: item.reason,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Check keyword density
   */
  checkKeywordDensity(
    content: string,
    keyword: string
  ): {
    density: number;
    status: 'low' | 'optimal' | 'high';
    recommendation: string;
  } {
    const plainText = this.stripHtml(content);
    const wordCount = this.extractWords(plainText).length;
    const keywordCount = this.countKeywordOccurrences(plainText.toLowerCase(), keyword.toLowerCase());

    const density = wordCount > 0 ? (keywordCount / wordCount) * 100 : 0;

    let status: 'low' | 'optimal' | 'high';
    let recommendation: string;

    if (density < this.config.densityMin) {
      status = 'low';
      recommendation = `Consider adding "${keyword}" more times. Current density: ${density.toFixed(2)}%. Target: ${this.config.densityMin}%-${this.config.densityMax}%`;
    } else if (density > this.config.densityMax) {
      status = 'high';
      recommendation = `Keyword appears too frequently. Current density: ${density.toFixed(2)}%. This may be seen as keyword stuffing. Target: ${this.config.densityMin}%-${this.config.densityMax}%`;
    } else {
      status = 'optimal';
      recommendation = `Keyword density is optimal at ${density.toFixed(2)}%`;
    }

    return { density, status, recommendation };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Extract words from text
   */
  private extractWords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);
  }

  /**
   * Calculate word frequency
   */
  private calculateWordFrequency(words: string[]): Map<string, number> {
    const frequency = new Map<string, number>();

    for (const word of words) {
      if (this.config.excludeCommonWords && this.commonWords.has(word)) {
        continue;
      }
      if (word.length < this.config.minKeywordLength) {
        continue;
      }

      frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }

    return frequency;
  }

  /**
   * Find related keywords based on frequency
   */
  private findRelatedKeywords(
    frequency: Map<string, number>,
    totalWords: number
  ): { keyword: string; frequency: number }[] {
    return Array.from(frequency.entries())
      .filter(([, count]) => count >= this.config.minFrequency)
      .map(([keyword, count]) => ({ keyword, frequency: count }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20);
  }

  /**
   * Extract phrases (n-grams) from text
   */
  private extractPhrases(content: string, n: number): [string, number][] {
    const words = this.extractWords(this.stripHtml(content));
    const phrases = new Map<string, number>();

    for (let i = 0; i <= words.length - n; i++) {
      const phrase = words.slice(i, i + n).join(' ');
      const hasCommon = phrase.split(' ').some(w => this.commonWords.has(w));

      if (!hasCommon) {
        phrases.set(phrase, (phrases.get(phrase) ?? 0) + 1);
      }
    }

    return Array.from(phrases.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1]);
  }

  /**
   * Find LSI (Latent Semantic Indexing) keywords
   */
  private findLSIKeywords(focusKeyword: string, content: string): string[] {
    const words = this.extractWords(this.stripHtml(content));
    const focusWords = new Set(focusKeyword.toLowerCase().split(/\s+/));

    // Find words that frequently appear near the focus keyword
    const nearbyWords = new Map<string, number>();
    const windowSize = 5;

    for (let i = 0; i < words.length; i++) {
      if (focusWords.has(words[i])) {
        for (let j = Math.max(0, i - windowSize); j < Math.min(words.length, i + windowSize); j++) {
          if (i !== j && !focusWords.has(words[j]) && !this.commonWords.has(words[j])) {
            nearbyWords.set(words[j], (nearbyWords.get(words[j]) ?? 0) + 1);
          }
        }
      }
    }

    return Array.from(nearbyWords.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Count keyword occurrences
   */
  private countKeywordOccurrences(text: string, keyword: string): number {
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  }

  /**
   * Extract first paragraph from HTML content
   */
  private extractFirstParagraph(content: string): string {
    const match = content.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (match) {
      return this.stripHtml(match[1]);
    }

    // Fallback to first block of text
    const plainText = this.stripHtml(content);
    const paragraphs = plainText.split(/\n\n+/);
    return paragraphs[0] ?? '';
  }

  /**
   * Extract headings from content
   */
  private extractHeadings(content: string): string[] {
    const regex = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
    const headings: string[] = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      headings.push(this.stripHtml(match[1]));
    }

    return headings;
  }

  /**
   * Extract H1 headings
   */
  private extractH1s(content: string): string[] {
    const regex = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
    const h1s: string[] = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      h1s.push(this.stripHtml(match[1]));
    }

    return h1s;
  }

  /**
   * Extract H2 headings
   */
  private extractH2s(content: string): string[] {
    const regex = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
    const h2s: string[] = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      h2s.push(this.stripHtml(match[1]));
    }

    return h2s;
  }

  /**
   * Extract image alt texts
   */
  private extractImageAlts(content: string): string[] {
    const regex = /<img[^>]*alt=["']([^"']*)["'][^>]*>/gi;
    const alts: string[] = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (match[1]) {
        alts.push(match[1]);
      }
    }

    return alts;
  }

  /**
   * Strip HTML tags
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createKeywordSuggester(
  contentGenerator?: ContentGeneratorProvider,
  config?: Partial<KeywordSuggesterConfig>
): KeywordSuggesterService {
  return new KeywordSuggesterService(contentGenerator, config);
}

/**
 * Content Creator Suite - Newsletter Curation Engine
 *
 * Automatically curates and ranks content for newsletter inclusion.
 */

import type { ServiceResult } from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';

// =============================================================================
// Types
// =============================================================================

export interface CurationOptions {
  maxItems?: number;
  minRelevanceScore?: number;
  categories?: string[];
  excludeCategories?: string[];
  diversityWeight?: number;
  recencyWeight?: number;
  qualityWeight?: number;
  audienceProfile?: AudienceProfile;
}

export interface AudienceProfile {
  interests: string[];
  expertiseLevel: 'beginner' | 'intermediate' | 'expert';
  preferredLength: 'brief' | 'detailed';
  preferredTopics: string[];
}

export interface CandidateContent {
  id: string;
  title: string;
  content: string;
  url?: string;
  source?: string;
  publishedAt?: string;
  category?: string;
  tags?: string[];
  author?: string;
  readTime?: number;
  engagement?: {
    views?: number;
    shares?: number;
    comments?: number;
  };
}

export interface CuratedContent extends CandidateContent {
  curationScore: number;
  relevanceScore: number;
  qualityScore: number;
  diversityContribution: number;
  curationReason: string;
  suggestedPosition: 'featured' | 'primary' | 'secondary';
}

export interface CurationResult {
  id: string;
  curated: CuratedContent[];
  excluded: { content: CandidateContent; reason: string }[];
  stats: CurationStats;
  createdAt: number;
}

export interface CurationStats {
  totalCandidates: number;
  selectedCount: number;
  averageRelevance: number;
  averageQuality: number;
  categoryDistribution: Record<string, number>;
  sourceDistribution: Record<string, number>;
}

// =============================================================================
// Curation Engine Service
// =============================================================================

export class CurationEngineService {
  constructor(private readonly contentGenerator: ContentGeneratorProvider) {}

  /**
   * Curate content for newsletter
   */
  async curateContent(
    candidates: CandidateContent[],
    options?: CurationOptions
  ): Promise<ServiceResult<CurationResult>> {
    const opts = {
      maxItems: options?.maxItems ?? 10,
      minRelevanceScore: options?.minRelevanceScore ?? 0.3,
      categories: options?.categories ?? [],
      excludeCategories: options?.excludeCategories ?? [],
      diversityWeight: options?.diversityWeight ?? 0.2,
      recencyWeight: options?.recencyWeight ?? 0.3,
      qualityWeight: options?.qualityWeight ?? 0.5,
      audienceProfile: options?.audienceProfile,
    };

    try {
      // Filter by categories
      let filtered = this.filterByCategories(candidates, opts);

      // Score all content
      const scored = await this.scoreContent(filtered, opts);

      // Select diverse set
      const selected = this.selectDiverseSet(scored, opts);

      // Assign positions
      const positioned = this.assignPositions(selected);

      // Track excluded
      const excluded = this.trackExcluded(candidates, positioned, opts);

      // Calculate stats
      const stats = this.calculateStats(candidates, positioned);

      const result: CurationResult = {
        id: crypto.randomUUID(),
        curated: positioned,
        excluded,
        stats,
        createdAt: Date.now(),
      };

      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to curate content';
      return { success: false, error: message };
    }
  }

  /**
   * Score a single piece of content
   */
  async scoreContent(
    candidates: CandidateContent[],
    options: {
      diversityWeight: number;
      recencyWeight: number;
      qualityWeight: number;
      audienceProfile?: AudienceProfile;
    }
  ): Promise<CuratedContent[]> {
    const scored: CuratedContent[] = [];

    // Score in batches to avoid too many API calls
    const batchSize = 5;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      const batchScores = await this.scoreBatch(batch, options);
      scored.push(...batchScores);
    }

    return scored;
  }

  /**
   * Score a batch of content
   */
  private async scoreBatch(
    batch: CandidateContent[],
    options: {
      qualityWeight: number;
      recencyWeight: number;
      audienceProfile?: AudienceProfile;
    }
  ): Promise<CuratedContent[]> {
    const audienceContext = options.audienceProfile
      ? `\nTARGET AUDIENCE:
- Interests: ${options.audienceProfile.interests.join(', ')}
- Level: ${options.audienceProfile.expertiseLevel}
- Preferred topics: ${options.audienceProfile.preferredTopics.join(', ')}`
      : '';

    const contentList = batch.map((c, i) =>
      `ITEM ${i + 1}:
Title: ${c.title}
Category: ${c.category ?? 'uncategorized'}
Content preview: ${c.content.substring(0, 300)}...`
    ).join('\n\n');

    const prompt = `Rate these content items for newsletter inclusion:

${contentList}
${audienceContext}

For each item, provide:
- Relevance (0.0-1.0): How relevant to the audience
- Quality (0.0-1.0): Content quality and depth
- Reason: Brief explanation (1 sentence)

Format:
ITEM 1:
Relevance: [score]
Quality: [score]
Reason: [reason]

ITEM 2:
...`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You evaluate content quality and relevance for newsletters.',
      maxTokens: 600,
    });

    const scores = this.parseScores(result.success ? result.data.content : '');

    return batch.map((content, index) => {
      const score = scores[index] ?? { relevance: 0.5, quality: 0.5, reason: 'Default score' };
      const recencyScore = this.calculateRecencyScore(content.publishedAt);

      const curationScore =
        score.relevance * (1 - options.recencyWeight - options.qualityWeight) +
        score.quality * options.qualityWeight +
        recencyScore * options.recencyWeight;

      return {
        ...content,
        curationScore,
        relevanceScore: score.relevance,
        qualityScore: score.quality,
        diversityContribution: 0, // Calculated later
        curationReason: score.reason,
        suggestedPosition: 'secondary' as const,
      };
    });
  }

  /**
   * Parse scores from AI response
   */
  private parseScores(content: string): { relevance: number; quality: number; reason: string }[] {
    const scores: { relevance: number; quality: number; reason: string }[] = [];
    const itemRegex = /ITEM \d+:\s*\nRelevance:\s*([\d.]+)\s*\nQuality:\s*([\d.]+)\s*\nReason:\s*(.+?)(?=\nITEM|\n$|$)/gis;
    let match;

    while ((match = itemRegex.exec(content)) !== null) {
      scores.push({
        relevance: parseFloat(match[1]) || 0.5,
        quality: parseFloat(match[2]) || 0.5,
        reason: match[3].trim(),
      });
    }

    return scores;
  }

  /**
   * Calculate recency score
   */
  private calculateRecencyScore(publishedAt?: string): number {
    if (!publishedAt) return 0.5;

    const published = new Date(publishedAt);
    const now = new Date();
    const hoursDiff = (now.getTime() - published.getTime()) / (1000 * 60 * 60);

    if (hoursDiff < 24) return 1.0;
    if (hoursDiff < 48) return 0.9;
    if (hoursDiff < 72) return 0.8;
    if (hoursDiff < 168) return 0.6; // 1 week
    if (hoursDiff < 336) return 0.4; // 2 weeks
    return 0.2;
  }

  /**
   * Select diverse set of content
   */
  private selectDiverseSet(
    scored: CuratedContent[],
    options: { maxItems: number; minRelevanceScore: number; diversityWeight: number }
  ): CuratedContent[] {
    // Filter by minimum relevance
    const eligible = scored.filter(c => c.relevanceScore >= options.minRelevanceScore);

    // Sort by curation score
    const sorted = [...eligible].sort((a, b) => b.curationScore - a.curationScore);

    const selected: CuratedContent[] = [];
    const selectedCategories = new Map<string, number>();
    const selectedSources = new Map<string, number>();

    for (const content of sorted) {
      if (selected.length >= options.maxItems) break;

      // Calculate diversity contribution
      const categoryCount = selectedCategories.get(content.category ?? 'uncategorized') ?? 0;
      const sourceCount = selectedSources.get(content.source ?? 'unknown') ?? 0;

      const diversityPenalty = (categoryCount * 0.1) + (sourceCount * 0.15);
      const adjustedScore = content.curationScore - (diversityPenalty * options.diversityWeight);

      // Only add if still good enough after diversity penalty
      if (adjustedScore >= options.minRelevanceScore * 0.8 || selected.length < 3) {
        content.diversityContribution = 1 - diversityPenalty;
        selected.push(content);

        // Track for diversity
        selectedCategories.set(
          content.category ?? 'uncategorized',
          categoryCount + 1
        );
        selectedSources.set(content.source ?? 'unknown', sourceCount + 1);
      }
    }

    return selected;
  }

  /**
   * Assign positions (featured, primary, secondary)
   */
  private assignPositions(content: CuratedContent[]): CuratedContent[] {
    const sorted = [...content].sort((a, b) => b.curationScore - a.curationScore);

    return sorted.map((item, index) => ({
      ...item,
      suggestedPosition: index === 0
        ? 'featured'
        : index < 3
          ? 'primary'
          : 'secondary',
    }));
  }

  /**
   * Filter by categories
   */
  private filterByCategories(
    candidates: CandidateContent[],
    options: { categories: string[]; excludeCategories: string[] }
  ): CandidateContent[] {
    let filtered = candidates;

    // Include only specified categories
    if (options.categories.length > 0) {
      const categoriesLower = options.categories.map(c => c.toLowerCase());
      filtered = filtered.filter(c =>
        categoriesLower.includes((c.category ?? '').toLowerCase())
      );
    }

    // Exclude specified categories
    if (options.excludeCategories.length > 0) {
      const excludeLower = options.excludeCategories.map(c => c.toLowerCase());
      filtered = filtered.filter(c =>
        !excludeLower.includes((c.category ?? '').toLowerCase())
      );
    }

    return filtered;
  }

  /**
   * Track excluded content
   */
  private trackExcluded(
    candidates: CandidateContent[],
    selected: CuratedContent[],
    options: { minRelevanceScore: number; excludeCategories: string[] }
  ): { content: CandidateContent; reason: string }[] {
    const selectedIds = new Set(selected.map(s => s.id));

    return candidates
      .filter(c => !selectedIds.has(c.id))
      .map(content => {
        let reason = 'Lower curation score than selected items';

        if (options.excludeCategories.includes(content.category ?? '')) {
          reason = 'Category excluded from curation';
        }

        return { content, reason };
      });
  }

  /**
   * Calculate curation statistics
   */
  private calculateStats(
    candidates: CandidateContent[],
    selected: CuratedContent[]
  ): CurationStats {
    const categoryDistribution: Record<string, number> = {};
    const sourceDistribution: Record<string, number> = {};

    for (const item of selected) {
      const category = item.category ?? 'uncategorized';
      const source = item.source ?? 'unknown';

      categoryDistribution[category] = (categoryDistribution[category] ?? 0) + 1;
      sourceDistribution[source] = (sourceDistribution[source] ?? 0) + 1;
    }

    const totalRelevance = selected.reduce((sum, c) => sum + c.relevanceScore, 0);
    const totalQuality = selected.reduce((sum, c) => sum + c.qualityScore, 0);

    return {
      totalCandidates: candidates.length,
      selectedCount: selected.length,
      averageRelevance: selected.length > 0 ? totalRelevance / selected.length : 0,
      averageQuality: selected.length > 0 ? totalQuality / selected.length : 0,
      categoryDistribution,
      sourceDistribution,
    };
  }

  /**
   * Re-rank content based on new criteria
   */
  async rerank(
    content: CuratedContent[],
    criteria: { boostCategories?: string[]; boostSources?: string[]; boostKeywords?: string[] }
  ): Promise<CuratedContent[]> {
    return content.map(item => {
      let boost = 0;

      if (criteria.boostCategories?.includes(item.category ?? '')) {
        boost += 0.1;
      }

      if (criteria.boostSources?.includes(item.source ?? '')) {
        boost += 0.1;
      }

      if (criteria.boostKeywords) {
        const contentLower = (item.title + ' ' + item.content).toLowerCase();
        const keywordMatches = criteria.boostKeywords.filter(k =>
          contentLower.includes(k.toLowerCase())
        ).length;
        boost += keywordMatches * 0.05;
      }

      return {
        ...item,
        curationScore: Math.min(1, item.curationScore + boost),
      };
    }).sort((a, b) => b.curationScore - a.curationScore);
  }

  /**
   * Get curation explanation
   */
  async explainCuration(content: CuratedContent): Promise<string> {
    const factors = [
      `Relevance score: ${(content.relevanceScore * 100).toFixed(0)}%`,
      `Quality score: ${(content.qualityScore * 100).toFixed(0)}%`,
      `Position: ${content.suggestedPosition}`,
    ];

    if (content.diversityContribution > 0.8) {
      factors.push('Adds topic diversity');
    }

    return `**Why this was selected:**\n${content.curationReason}\n\n**Factors:**\n${factors.map(f => `- ${f}`).join('\n')}`;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createCurationEngine(
  contentGenerator: ContentGeneratorProvider
): CurationEngineService {
  return new CurationEngineService(contentGenerator);
}

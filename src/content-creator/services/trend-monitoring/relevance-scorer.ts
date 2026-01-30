/**
 * Content Creator Suite - Relevance Scorer
 *
 * Scores trend relevance based on user preferences and content history.
 */

import type { TrendItem, VoiceProfile, GeneratedContent } from '../../types.js';
import type { ContentStore } from '../../stores/content-store.js';
import type { VoiceProfileStore } from '../../stores/voice-profile-store.js';

// =============================================================================
// Types
// =============================================================================

export interface RelevanceScore {
  overall: number;
  topicMatch: number;
  audienceMatch: number;
  engagementPotential: number;
  timeliness: number;
  contentOpportunity: number;
  factors: RelevanceFactor[];
}

export interface RelevanceFactor {
  name: string;
  score: number;
  weight: number;
  reason: string;
}

export interface UserContext {
  userId: string;
  voiceProfileIds?: string[];
  interests?: string[];
  targetAudience?: string[];
  contentHistory?: GeneratedContent[];
}

export interface ScorerConfig {
  topicMatchWeight: number;
  audienceMatchWeight: number;
  engagementWeight: number;
  timelinessWeight: number;
  contentOpportunityWeight: number;
  minScoreThreshold: number;
}

// =============================================================================
// Relevance Scorer Service
// =============================================================================

export class RelevanceScorerService {
  constructor(
    private readonly contentStore: ContentStore,
    private readonly voiceProfileStore: VoiceProfileStore,
    private readonly config: ScorerConfig
  ) {}

  /**
   * Score trend relevance for a user
   */
  async scoreTrend(
    trend: TrendItem,
    context: UserContext
  ): Promise<RelevanceScore> {
    const factors: RelevanceFactor[] = [];

    // Get user's voice profiles for topic analysis
    const profiles = await this.getUserProfiles(context);
    const contentHistory = context.contentHistory ?? await this.getRecentContent(context.userId);

    // 1. Topic Match Score
    const topicMatch = this.calculateTopicMatch(trend, profiles, context.interests ?? []);
    factors.push({
      name: 'Topic Match',
      score: topicMatch,
      weight: this.config.topicMatchWeight,
      reason: this.getTopicMatchReason(topicMatch, trend),
    });

    // 2. Audience Match Score
    const audienceMatch = this.calculateAudienceMatch(trend, context.targetAudience ?? []);
    factors.push({
      name: 'Audience Match',
      score: audienceMatch,
      weight: this.config.audienceMatchWeight,
      reason: this.getAudienceMatchReason(audienceMatch, trend),
    });

    // 3. Engagement Potential Score
    const engagementPotential = this.calculateEngagementPotential(trend);
    factors.push({
      name: 'Engagement Potential',
      score: engagementPotential,
      weight: this.config.engagementWeight,
      reason: this.getEngagementReason(engagementPotential, trend),
    });

    // 4. Timeliness Score
    const timeliness = this.calculateTimeliness(trend);
    factors.push({
      name: 'Timeliness',
      score: timeliness,
      weight: this.config.timelinessWeight,
      reason: this.getTimelinessReason(timeliness, trend),
    });

    // 5. Content Opportunity Score
    const contentOpportunity = this.calculateContentOpportunity(trend, contentHistory);
    factors.push({
      name: 'Content Opportunity',
      score: contentOpportunity,
      weight: this.config.contentOpportunityWeight,
      reason: this.getContentOpportunityReason(contentOpportunity, trend, contentHistory),
    });

    // Calculate weighted overall score
    const overall = this.calculateOverallScore(factors);

    return {
      overall,
      topicMatch,
      audienceMatch,
      engagementPotential,
      timeliness,
      contentOpportunity,
      factors,
    };
  }

  /**
   * Score multiple trends and sort by relevance
   */
  async scoreTrends(
    trends: TrendItem[],
    context: UserContext
  ): Promise<{ trend: TrendItem; score: RelevanceScore }[]> {
    const scored = await Promise.all(
      trends.map(async trend => ({
        trend,
        score: await this.scoreTrend(trend, context),
      }))
    );

    // Sort by overall score descending
    return scored.sort((a, b) => b.score.overall - a.score.overall);
  }

  /**
   * Filter trends by minimum relevance score
   */
  async filterRelevantTrends(
    trends: TrendItem[],
    context: UserContext,
    minScore?: number
  ): Promise<TrendItem[]> {
    const threshold = minScore ?? this.config.minScoreThreshold;
    const scored = await this.scoreTrends(trends, context);

    return scored
      .filter(item => item.score.overall >= threshold)
      .map(item => item.trend);
  }

  /**
   * Get content suggestions based on trending topics
   */
  async getContentSuggestions(
    trends: TrendItem[],
    context: UserContext,
    limit: number = 5
  ): Promise<{
    trend: TrendItem;
    score: RelevanceScore;
    suggestion: string;
  }[]> {
    const scored = await this.scoreTrends(trends, context);
    const relevant = scored.filter(
      item => item.score.overall >= this.config.minScoreThreshold
    );

    return relevant.slice(0, limit).map(item => ({
      ...item,
      suggestion: this.generateContentSuggestion(item.trend, item.score),
    }));
  }

  /**
   * Get user's voice profiles
   */
  private async getUserProfiles(context: UserContext): Promise<VoiceProfile[]> {
    if (context.voiceProfileIds && context.voiceProfileIds.length > 0) {
      const profiles: VoiceProfile[] = [];
      for (const id of context.voiceProfileIds) {
        const profile = await this.voiceProfileStore.getProfile(id);
        if (profile) {
          profiles.push(profile);
        }
      }
      return profiles;
    }

    return this.voiceProfileStore.getProfilesByUser(context.userId);
  }

  /**
   * Get recent content for a user
   */
  private async getRecentContent(userId: string): Promise<GeneratedContent[]> {
    return this.contentStore.list({
      userId,
      limit: 50,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  }

  /**
   * Calculate topic match score
   */
  private calculateTopicMatch(
    trend: TrendItem,
    profiles: VoiceProfile[],
    interests: string[]
  ): number {
    const trendWords = this.extractKeywords(trend.title + ' ' + (trend.description ?? ''));

    // Check against profile expertise
    let expertiseMatch = 0;
    for (const profile of profiles) {
      for (const topic of profile.topicExpertise) {
        const topicWords = this.extractKeywords(topic);
        const overlap = trendWords.filter(w => topicWords.includes(w)).length;
        if (overlap > 0) {
          expertiseMatch += overlap / Math.max(trendWords.length, topicWords.length);
        }
      }
    }

    // Check against interests
    let interestMatch = 0;
    for (const interest of interests) {
      const interestWords = this.extractKeywords(interest);
      const overlap = trendWords.filter(w => interestWords.includes(w)).length;
      if (overlap > 0) {
        interestMatch += overlap / Math.max(trendWords.length, interestWords.length);
      }
    }

    // Combine scores
    const profileScore = profiles.length > 0 ? expertiseMatch / profiles.length : 0;
    const interestScore = interests.length > 0 ? interestMatch / interests.length : 0;

    return Math.min(1, (profileScore + interestScore) / 2 + 0.2); // Base score of 0.2
  }

  /**
   * Calculate audience match score
   */
  private calculateAudienceMatch(trend: TrendItem, targetAudience: string[]): number {
    if (targetAudience.length === 0) {
      return 0.5; // Neutral score
    }

    // Map trend sources and categories to audience types
    const audienceMap: Record<string, string[]> = {
      twitter: ['general', 'social media users', 'consumers'],
      reddit: ['tech-savvy', 'enthusiasts', 'niche communities'],
      hackernews: ['developers', 'tech professionals', 'startups'],
    };

    const categoryAudienceMap: Record<string, string[]> = {
      technology: ['developers', 'tech professionals', 'early adopters'],
      programming: ['developers', 'engineers', 'students'],
      news: ['general', 'informed citizens', 'professionals'],
      ask: ['curious minds', 'learners', 'community'],
      show: ['makers', 'entrepreneurs', 'developers'],
    };

    const trendAudiences = new Set([
      ...(audienceMap[trend.source] ?? []),
      ...(categoryAudienceMap[trend.category ?? ''] ?? []),
    ]);

    const audienceLower = targetAudience.map(a => a.toLowerCase());

    let matches = 0;
    for (const audience of trendAudiences) {
      if (audienceLower.some(a => audience.toLowerCase().includes(a) || a.includes(audience.toLowerCase()))) {
        matches++;
      }
    }

    return trendAudiences.size > 0 ? matches / trendAudiences.size : 0.3;
  }

  /**
   * Calculate engagement potential score
   */
  private calculateEngagementPotential(trend: TrendItem): number {
    // Factors: velocity, volume, sentiment

    // Velocity score (0-1)
    const velocityScore = Math.min(trend.velocity / 80, 1);

    // Volume score (0-1, log scale)
    const volumeScore = trend.volume
      ? Math.min(Math.log10(Math.max(trend.volume, 1)) / 5, 1)
      : 0.3;

    // Sentiment bonus
    let sentimentScore = 0.5;
    if (trend.sentiment === 'positive') sentimentScore = 0.8;
    else if (trend.sentiment === 'negative') sentimentScore = 0.3;
    else if (trend.sentiment === 'mixed') sentimentScore = 0.6;

    return velocityScore * 0.5 + volumeScore * 0.3 + sentimentScore * 0.2;
  }

  /**
   * Calculate timeliness score
   */
  private calculateTimeliness(trend: TrendItem): number {
    const ageHours = (Date.now() - trend.fetchedAt) / (1000 * 60 * 60);

    // Fresh trends (< 1 hour) get high score
    if (ageHours < 1) return 1;
    // Recent trends (< 6 hours) get good score
    if (ageHours < 6) return 0.9 - ageHours * 0.05;
    // Older trends (< 24 hours) get moderate score
    if (ageHours < 24) return 0.6 - (ageHours - 6) * 0.02;
    // Old trends get low score
    return Math.max(0.1, 0.2 - (ageHours - 24) * 0.005);
  }

  /**
   * Calculate content opportunity score
   */
  private calculateContentOpportunity(
    trend: TrendItem,
    contentHistory: GeneratedContent[]
  ): number {
    if (contentHistory.length === 0) {
      return 0.8; // High opportunity if no content history
    }

    const trendWords = this.extractKeywords(trend.title);

    // Check if we've already covered this topic
    let recentCoverage = 0;
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const content of contentHistory) {
      if (content.createdAt < oneWeekAgo) continue;

      const contentWords = this.extractKeywords(content.content);
      const overlap = trendWords.filter(w => contentWords.includes(w)).length;

      if (overlap / trendWords.length > 0.5) {
        recentCoverage++;
      }
    }

    // Higher score if we haven't covered the topic recently
    if (recentCoverage === 0) return 1;
    if (recentCoverage === 1) return 0.6;
    if (recentCoverage === 2) return 0.3;
    return 0.1;
  }

  /**
   * Calculate overall weighted score
   */
  private calculateOverallScore(factors: RelevanceFactor[]): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const factor of factors) {
      weightedSum += factor.score * factor.weight;
      totalWeight += factor.weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'that', 'which', 'who',
      'what', 'how', 'why', 'when', 'where', 'this', 'these', 'those', 'it',
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Generate content suggestion for a trend
   */
  private generateContentSuggestion(trend: TrendItem, score: RelevanceScore): string {
    const suggestions: string[] = [];

    if (score.engagementPotential > 0.7) {
      suggestions.push(`This trend has high engagement potential - consider creating timely content.`);
    }

    if (score.topicMatch > 0.6) {
      suggestions.push(`Aligns well with your expertise - share your unique perspective.`);
    }

    if (score.contentOpportunity > 0.8) {
      suggestions.push(`You haven't covered this topic recently - opportunity for fresh content.`);
    }

    if (trend.source === 'hackernews') {
      suggestions.push(`Tech-focused audience - consider educational or technical angle.`);
    } else if (trend.source === 'twitter') {
      suggestions.push(`Fast-moving platform - quick, punchy content works well.`);
    } else if (trend.source === 'reddit') {
      suggestions.push(`In-depth discussion - consider long-form or detailed content.`);
    }

    return suggestions.length > 0
      ? suggestions.join(' ')
      : 'Consider creating content around this trending topic.';
  }

  // Reason generators
  private getTopicMatchReason(score: number, trend: TrendItem): string {
    if (score > 0.7) return 'Strong alignment with your expertise and interests';
    if (score > 0.4) return 'Moderate relevance to your content focus';
    return 'Limited direct connection to your typical topics';
  }

  private getAudienceMatchReason(score: number, trend: TrendItem): string {
    if (score > 0.7) return `${trend.source} trends align well with your target audience`;
    if (score > 0.4) return 'Some overlap with your target demographic';
    return 'May reach a different audience segment';
  }

  private getEngagementReason(score: number, trend: TrendItem): string {
    if (score > 0.7) return `High velocity (${Math.round(trend.velocity)}) and strong volume`;
    if (score > 0.4) return 'Moderate engagement indicators';
    return 'Lower engagement potential';
  }

  private getTimelinessReason(score: number, trend: TrendItem): string {
    const ageHours = (Date.now() - trend.fetchedAt) / (1000 * 60 * 60);
    if (score > 0.8) return 'Very fresh trend - act quickly';
    if (score > 0.5) return `Trending for ${Math.round(ageHours)} hours - still relevant`;
    return 'Trend may be cooling down';
  }

  private getContentOpportunityReason(
    score: number,
    trend: TrendItem,
    history: GeneratedContent[]
  ): string {
    if (score > 0.8) return 'Fresh topic you haven\'t covered recently';
    if (score > 0.5) return 'Some related content exists - offer new angle';
    return 'You\'ve recently covered similar topics';
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createRelevanceScorer(
  contentStore: ContentStore,
  voiceProfileStore: VoiceProfileStore,
  config?: Partial<ScorerConfig>
): RelevanceScorerService {
  const defaultConfig: ScorerConfig = {
    topicMatchWeight: 0.25,
    audienceMatchWeight: 0.2,
    engagementWeight: 0.25,
    timelinessWeight: 0.15,
    contentOpportunityWeight: 0.15,
    minScoreThreshold: 0.4,
    ...config,
  };

  return new RelevanceScorerService(contentStore, voiceProfileStore, defaultConfig);
}

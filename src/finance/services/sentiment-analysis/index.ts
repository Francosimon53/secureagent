/**
 * Sentiment Analysis Service
 *
 * Aggregates sentiment from multiple sources and generates trading signals.
 */

import { EventEmitter } from 'events';
import type {
  SentimentScore,
  SentimentSourceScore,
  SentimentSignal,
  SentimentTrend,
  Asset,
  SentimentSource,
} from '../../types.js';
import type { SentimentConfig } from '../../config.js';
import { FINANCE_EVENTS, SENTIMENT_WEIGHTS, FINANCE_DEFAULTS } from '../../constants.js';
import {
  TwitterSentimentProvider,
  RedditSentimentProvider,
  NewsSentimentProvider,
} from '../../providers/sentiment/index.js';

// =============================================================================
// Service Interface
// =============================================================================

export interface SentimentAnalysisService {
  // Analysis
  getSentiment(asset: Asset): Promise<SentimentScore | null>;
  getSentimentBySource(asset: Asset, source: SentimentSource): Promise<SentimentSourceScore | null>;
  getTrend(asset: Asset): SentimentTrend | null;

  // Signals
  getSignals(asset?: Asset): SentimentSignal[];
  generateSignals(asset: Asset): Promise<SentimentSignal[]>;

  // Cache management
  clearCache(asset?: Asset): void;
  getCacheStats(): { hits: number; misses: number; size: number };

  // Events
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
}

// =============================================================================
// Implementation
// =============================================================================

interface CacheEntry {
  data: SentimentScore;
  timestamp: number;
}

export class SentimentAnalysisServiceImpl extends EventEmitter implements SentimentAnalysisService {
  private config: SentimentConfig;
  private cache = new Map<string, CacheEntry>();
  private trends = new Map<Asset, SentimentTrend>();
  private signals = new Map<string, SentimentSignal>();
  private cacheHits = 0;
  private cacheMisses = 0;

  private twitterProvider?: TwitterSentimentProvider;
  private redditProvider?: RedditSentimentProvider;
  private newsProvider?: NewsSentimentProvider;

  constructor(config?: Partial<SentimentConfig>) {
    super();
    this.config = {
      enabled: true,
      aggregationIntervalMinutes: 15,
      signalThresholdStrength: 0.6,
      signalExpirationMinutes: 60,
      cacheResultsMinutes: 5,
      ...config,
    };
  }

  async getSentiment(asset: Asset): Promise<SentimentScore | null> {
    const cacheKey = `sentiment:${asset}`;
    const cached = this.cache.get(cacheKey);

    if (cached && this.isCacheValid(cached)) {
      this.cacheHits++;
      return cached.data;
    }

    this.cacheMisses++;

    // Fetch from all enabled sources
    const sources: SentimentSourceScore[] = [];

    const sourcePromises: Promise<void>[] = [];

    if (this.config.twitter?.enabled && this.twitterProvider) {
      sourcePromises.push(
        this.twitterProvider.getSentimentScore(asset).then(result => {
          if (result.success && result.data) {
            sources.push(result.data);
          }
        })
      );
    }

    if (this.config.reddit?.enabled && this.redditProvider) {
      sourcePromises.push(
        this.redditProvider.getSentimentScore(asset).then(result => {
          if (result.success && result.data) {
            sources.push(result.data);
          }
        })
      );
    }

    if (this.config.news?.enabled && this.newsProvider) {
      sourcePromises.push(
        this.newsProvider.getSentimentScore(asset).then(result => {
          if (result.success && result.data) {
            sources.push(result.data);
          }
        })
      );
    }

    await Promise.all(sourcePromises);

    if (sources.length === 0) {
      return null;
    }

    // Aggregate scores
    const sentiment = this.aggregateScores(asset, sources);

    // Cache result
    this.cache.set(cacheKey, {
      data: sentiment,
      timestamp: Date.now(),
    });

    // Update trend
    this.updateTrend(asset, sentiment);

    this.emit(FINANCE_EVENTS.SENTIMENT_UPDATED, sentiment);

    return sentiment;
  }

  async getSentimentBySource(
    asset: Asset,
    source: SentimentSource
  ): Promise<SentimentSourceScore | null> {
    let provider;

    switch (source) {
      case 'twitter':
        provider = this.twitterProvider;
        break;
      case 'reddit':
        provider = this.redditProvider;
        break;
      case 'news':
        provider = this.newsProvider;
        break;
      default:
        return null;
    }

    if (!provider) {
      return null;
    }

    const result = await provider.getSentimentScore(asset);
    return result.success ? result.data ?? null : null;
  }

  getTrend(asset: Asset): SentimentTrend | null {
    return this.trends.get(asset) ?? null;
  }

  getSignals(asset?: Asset): SentimentSignal[] {
    const now = Date.now();
    const signals: SentimentSignal[] = [];

    for (const signal of this.signals.values()) {
      if (signal.expiresAt < now) {
        this.signals.delete(signal.id);
        continue;
      }

      if (!asset || signal.asset === asset) {
        signals.push(signal);
      }
    }

    return signals.sort((a, b) => b.strength - a.strength);
  }

  async generateSignals(asset: Asset): Promise<SentimentSignal[]> {
    const sentiment = await this.getSentiment(asset);
    if (!sentiment) {
      return [];
    }

    const signals: SentimentSignal[] = [];
    const threshold = this.config.signalThresholdStrength ?? FINANCE_DEFAULTS.SENTIMENT_SIGNAL_THRESHOLD;

    // Generate signal if strength exceeds threshold
    if (Math.abs(sentiment.score) >= threshold && sentiment.confidence >= 0.5) {
      const signal: SentimentSignal = {
        id: `${asset}-${Date.now()}`,
        asset,
        type: sentiment.score > 0 ? 'bullish' : 'bearish',
        strength: Math.abs(sentiment.score),
        confidence: sentiment.confidence,
        sources: sentiment.sources.map(s => s.source),
        trigger: `Aggregate sentiment ${sentiment.label}`,
        timestamp: Date.now(),
        expiresAt: Date.now() + (this.config.signalExpirationMinutes ?? 60) * 60 * 1000,
      };

      this.signals.set(signal.id, signal);
      signals.push(signal);

      this.emit(FINANCE_EVENTS.SENTIMENT_SIGNAL_GENERATED, signal);
    }

    // Check for reversal signals
    const trend = this.trends.get(asset);
    if (trend && trend.direction !== 'stable') {
      const isReversal =
        (trend.direction === 'improving' && sentiment.score < trend.previousScore - 0.3) ||
        (trend.direction === 'declining' && sentiment.score > trend.previousScore + 0.3);

      if (isReversal) {
        const reversalSignal: SentimentSignal = {
          id: `${asset}-reversal-${Date.now()}`,
          asset,
          type: 'reversal',
          strength: Math.abs(sentiment.score - trend.previousScore),
          confidence: sentiment.confidence * 0.8, // Lower confidence for reversals
          sources: sentiment.sources.map(s => s.source),
          trigger: `Sentiment reversal detected`,
          timestamp: Date.now(),
          expiresAt: Date.now() + (this.config.signalExpirationMinutes ?? 60) * 60 * 1000,
        };

        this.signals.set(reversalSignal.id, reversalSignal);
        signals.push(reversalSignal);

        this.emit(FINANCE_EVENTS.SENTIMENT_TREND_CHANGE, { asset, from: trend.direction, to: 'reversal' });
      }
    }

    return signals;
  }

  clearCache(asset?: Asset): void {
    if (asset) {
      this.cache.delete(`sentiment:${asset}`);
    } else {
      this.cache.clear();
    }
  }

  getCacheStats(): { hits: number; misses: number; size: number } {
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      size: this.cache.size,
    };
  }

  private isCacheValid(entry: CacheEntry): boolean {
    const maxAge = (this.config.cacheResultsMinutes ?? 5) * 60 * 1000;
    return Date.now() - entry.timestamp < maxAge;
  }

  private aggregateScores(asset: Asset, sources: SentimentSourceScore[]): SentimentScore {
    let weightedSum = 0;
    let totalWeight = 0;
    let totalSampleSize = 0;

    for (const source of sources) {
      const weightKey = source.source as keyof typeof SENTIMENT_WEIGHTS;
      const weight = (weightKey in SENTIMENT_WEIGHTS) ? SENTIMENT_WEIGHTS[weightKey] : 0.33;
      weightedSum += source.score * source.confidence * weight;
      totalWeight += source.confidence * weight;
      totalSampleSize += source.sampleSize;
    }

    const score = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const confidence = sources.reduce((sum, s) => sum + s.confidence, 0) / sources.length;

    // Determine label
    let label: SentimentScore['label'] = 'neutral';
    if (score >= 0.6) label = 'very_bullish';
    else if (score >= 0.2) label = 'bullish';
    else if (score <= -0.6) label = 'very_bearish';
    else if (score <= -0.2) label = 'bearish';

    return {
      asset,
      score,
      label,
      confidence,
      sources,
      sampleSize: totalSampleSize,
      timestamp: Date.now(),
      timeframe: '24h',
    };
  }

  private updateTrend(asset: Asset, sentiment: SentimentScore): void {
    const existing = this.trends.get(asset);
    const previousScore = existing?.currentScore ?? 0;

    let direction: 'improving' | 'stable' | 'declining' = 'stable';
    if (sentiment.score > previousScore + 0.1) direction = 'improving';
    else if (sentiment.score < previousScore - 0.1) direction = 'declining';

    const trend: SentimentTrend = {
      asset,
      currentScore: sentiment.score,
      previousScore,
      change: sentiment.score - previousScore,
      direction,
      momentum: existing ? sentiment.score - existing.currentScore : 0,
      volatility: 0, // Would need history to calculate
      dataPoints: [
        ...(existing?.dataPoints ?? []).slice(-20),
        { timestamp: Date.now(), score: sentiment.score },
      ],
    };

    this.trends.set(asset, trend);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createSentimentAnalysisService(
  config?: Partial<SentimentConfig>
): SentimentAnalysisService {
  return new SentimentAnalysisServiceImpl(config);
}

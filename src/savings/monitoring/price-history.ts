/**
 * Price History Analyzer
 *
 * Analyzes historical price data for trends and patterns.
 */

import type { PricePoint } from '../types.js';

/**
 * Price trend direction
 */
export type PriceTrend = 'increasing' | 'decreasing' | 'stable' | 'volatile';

/**
 * Price analysis result
 */
export interface PriceAnalysis {
  currentPrice: number;
  lowestPrice: number;
  highestPrice: number;
  averagePrice: number;
  medianPrice: number;
  priceRange: number;
  trend: PriceTrend;
  trendStrength: number; // 0-1, how strong the trend is
  volatility: number; // Standard deviation as percentage of mean
  priceChanges: {
    day: number | null;
    week: number | null;
    month: number | null;
  };
  percentChanges: {
    day: number | null;
    week: number | null;
    month: number | null;
  };
  predictedDirection: 'up' | 'down' | 'stable';
  confidenceScore: number;
  recommendation: 'buy-now' | 'wait' | 'set-alert';
  reasonForRecommendation: string;
}

/**
 * Price history analyzer
 */
export class PriceHistoryAnalyzer {
  /**
   * Analyze price history
   */
  analyze(history: PricePoint[], targetPrice?: number): PriceAnalysis {
    if (history.length === 0) {
      throw new Error('Price history is empty');
    }

    // Sort by timestamp
    const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
    const prices = sorted.map(p => p.price);

    const currentPrice = prices[prices.length - 1];
    const lowestPrice = Math.min(...prices);
    const highestPrice = Math.max(...prices);
    const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const medianPrice = this.calculateMedian(prices);
    const priceRange = highestPrice - lowestPrice;

    // Calculate volatility
    const volatility = this.calculateVolatility(prices);

    // Determine trend
    const { trend, trendStrength } = this.determineTrend(sorted);

    // Calculate price changes over different periods
    const priceChanges = this.calculatePriceChanges(sorted);
    const percentChanges = this.calculatePercentChanges(sorted);

    // Predict direction
    const { direction: predictedDirection, confidence: confidenceScore } =
      this.predictDirection(sorted, trend, volatility);

    // Generate recommendation
    const { recommendation, reason: reasonForRecommendation } =
      this.generateRecommendation(
        currentPrice,
        lowestPrice,
        highestPrice,
        averagePrice,
        trend,
        volatility,
        predictedDirection,
        targetPrice
      );

    return {
      currentPrice,
      lowestPrice,
      highestPrice,
      averagePrice,
      medianPrice,
      priceRange,
      trend,
      trendStrength,
      volatility,
      priceChanges,
      percentChanges,
      predictedDirection,
      confidenceScore,
      recommendation,
      reasonForRecommendation,
    };
  }

  /**
   * Calculate median price
   */
  private calculateMedian(prices: number[]): number {
    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  /**
   * Calculate volatility (coefficient of variation)
   */
  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;

    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const squaredDiffs = prices.map(p => Math.pow(p - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
    const stdDev = Math.sqrt(variance);

    return (stdDev / mean) * 100;
  }

  /**
   * Determine price trend using linear regression
   */
  private determineTrend(history: PricePoint[]): { trend: PriceTrend; trendStrength: number } {
    if (history.length < 3) {
      return { trend: 'stable', trendStrength: 0 };
    }

    // Simple linear regression
    const n = history.length;
    const xMean = (n - 1) / 2; // Using indices as x values
    const yMean = history.reduce((sum, p) => sum + p.price, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (history[i].price - yMean);
      denominator += Math.pow(i - xMean, 2);
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;

    // Calculate R-squared for trend strength
    const predictions = history.map((_, i) => yMean + slope * (i - xMean));
    const ssRes = history.reduce((sum, p, i) => sum + Math.pow(p.price - predictions[i], 2), 0);
    const ssTot = history.reduce((sum, p) => sum + Math.pow(p.price - yMean, 2), 0);
    const rSquared = ssTot !== 0 ? 1 - (ssRes / ssTot) : 0;

    // Normalize slope relative to price range
    const priceRange = Math.max(...history.map(p => p.price)) - Math.min(...history.map(p => p.price));
    const normalizedSlope = priceRange !== 0 ? (slope * n) / priceRange : 0;

    // Determine trend based on slope and volatility
    const volatility = this.calculateVolatility(history.map(p => p.price));

    if (volatility > 15) {
      return { trend: 'volatile', trendStrength: Math.min(rSquared, 1) };
    }

    if (Math.abs(normalizedSlope) < 0.05) {
      return { trend: 'stable', trendStrength: Math.min(rSquared, 1) };
    }

    return {
      trend: normalizedSlope > 0 ? 'increasing' : 'decreasing',
      trendStrength: Math.min(rSquared, 1),
    };
  }

  /**
   * Calculate price changes over different periods
   */
  private calculatePriceChanges(history: PricePoint[]): {
    day: number | null;
    week: number | null;
    month: number | null;
  } {
    const now = Date.now();
    const currentPrice = history[history.length - 1].price;

    const dayAgo = now - (24 * 60 * 60 * 1000);
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const monthAgo = now - (30 * 24 * 60 * 60 * 1000);

    const findPriceNear = (timestamp: number): number | null => {
      const point = history.find(p => p.timestamp <= timestamp);
      return point?.price ?? null;
    };

    const dayPrice = findPriceNear(dayAgo);
    const weekPrice = findPriceNear(weekAgo);
    const monthPrice = findPriceNear(monthAgo);

    return {
      day: dayPrice !== null ? currentPrice - dayPrice : null,
      week: weekPrice !== null ? currentPrice - weekPrice : null,
      month: monthPrice !== null ? currentPrice - monthPrice : null,
    };
  }

  /**
   * Calculate percent changes over different periods
   */
  private calculatePercentChanges(history: PricePoint[]): {
    day: number | null;
    week: number | null;
    month: number | null;
  } {
    const now = Date.now();
    const currentPrice = history[history.length - 1].price;

    const dayAgo = now - (24 * 60 * 60 * 1000);
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const monthAgo = now - (30 * 24 * 60 * 60 * 1000);

    const findPriceNear = (timestamp: number): number | null => {
      const point = history.find(p => p.timestamp <= timestamp);
      return point?.price ?? null;
    };

    const calcPercent = (oldPrice: number | null): number | null => {
      if (oldPrice === null || oldPrice === 0) return null;
      return ((currentPrice - oldPrice) / oldPrice) * 100;
    };

    return {
      day: calcPercent(findPriceNear(dayAgo)),
      week: calcPercent(findPriceNear(weekAgo)),
      month: calcPercent(findPriceNear(monthAgo)),
    };
  }

  /**
   * Predict future price direction
   */
  private predictDirection(
    history: PricePoint[],
    trend: PriceTrend,
    volatility: number
  ): { direction: 'up' | 'down' | 'stable'; confidence: number } {
    if (history.length < 5) {
      return { direction: 'stable', confidence: 0.3 };
    }

    // Use recent momentum
    const recentPrices = history.slice(-5).map(p => p.price);
    const momentum = (recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0];

    // Base confidence on volatility (lower volatility = higher confidence)
    let confidence = Math.max(0.3, 1 - (volatility / 50));

    // Adjust based on trend consistency
    if (trend === 'stable') {
      return { direction: 'stable', confidence: confidence * 0.8 };
    }

    if (trend === 'volatile') {
      confidence *= 0.5;
    }

    if (momentum > 0.02) {
      return { direction: 'up', confidence };
    } else if (momentum < -0.02) {
      return { direction: 'down', confidence };
    }

    return { direction: 'stable', confidence: confidence * 0.7 };
  }

  /**
   * Generate a buying recommendation
   */
  private generateRecommendation(
    currentPrice: number,
    lowestPrice: number,
    highestPrice: number,
    averagePrice: number,
    trend: PriceTrend,
    volatility: number,
    predictedDirection: 'up' | 'down' | 'stable',
    targetPrice?: number
  ): { recommendation: 'buy-now' | 'wait' | 'set-alert'; reason: string } {
    const priceRange = highestPrice - lowestPrice;
    const pricePosition = priceRange > 0 ? (currentPrice - lowestPrice) / priceRange : 0.5;

    // If we have a target price and current price is at or below it
    if (targetPrice && currentPrice <= targetPrice) {
      return {
        recommendation: 'buy-now',
        reason: `Price is at or below your target of ${targetPrice}`,
      };
    }

    // If price is near all-time low
    if (pricePosition < 0.1) {
      return {
        recommendation: 'buy-now',
        reason: 'Price is near all-time low',
      };
    }

    // If price is decreasing and we predict further drops
    if (trend === 'decreasing' && predictedDirection === 'down' && volatility < 20) {
      return {
        recommendation: 'wait',
        reason: 'Price trend is decreasing, may drop further',
      };
    }

    // If price is below average and stable/decreasing
    if (currentPrice < averagePrice && (trend === 'stable' || trend === 'decreasing')) {
      return {
        recommendation: 'buy-now',
        reason: `Price is ${((averagePrice - currentPrice) / averagePrice * 100).toFixed(1)}% below average`,
      };
    }

    // If price is increasing
    if (trend === 'increasing' && predictedDirection === 'up') {
      if (currentPrice < averagePrice) {
        return {
          recommendation: 'buy-now',
          reason: 'Price is rising but still below average - buy before it goes higher',
        };
      }
      return {
        recommendation: 'set-alert',
        reason: 'Price is rising. Set an alert for price drops',
      };
    }

    // If highly volatile
    if (volatility > 20) {
      return {
        recommendation: 'set-alert',
        reason: 'Price is volatile. Set an alert to catch the next dip',
      };
    }

    // Default
    return {
      recommendation: 'set-alert',
      reason: 'Set an alert to be notified of significant price changes',
    };
  }

  /**
   * Get price at specific percentile
   */
  getPriceAtPercentile(history: PricePoint[], percentile: number): number {
    if (history.length === 0) return 0;

    const prices = [...history.map(p => p.price)].sort((a, b) => a - b);
    const index = Math.floor((percentile / 100) * (prices.length - 1));
    return prices[index];
  }

  /**
   * Find the best time to buy based on historical patterns
   */
  findBestBuyingTimes(history: PricePoint[]): {
    dayOfWeek: number | null;
    hourOfDay: number | null;
    averageSavings: number;
  } {
    if (history.length < 30) {
      return { dayOfWeek: null, hourOfDay: null, averageSavings: 0 };
    }

    // Group prices by day of week and hour
    const byDayOfWeek: Map<number, number[]> = new Map();
    const byHourOfDay: Map<number, number[]> = new Map();

    for (const point of history) {
      const date = new Date(point.timestamp);
      const dow = date.getDay();
      const hour = date.getHours();

      if (!byDayOfWeek.has(dow)) byDayOfWeek.set(dow, []);
      if (!byHourOfDay.has(hour)) byHourOfDay.set(hour, []);

      byDayOfWeek.get(dow)!.push(point.price);
      byHourOfDay.get(hour)!.push(point.price);
    }

    // Find lowest average day/hour
    let lowestDayAvg = Infinity;
    let bestDay: number | null = null;

    for (const [day, prices] of byDayOfWeek) {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      if (avg < lowestDayAvg) {
        lowestDayAvg = avg;
        bestDay = day;
      }
    }

    let lowestHourAvg = Infinity;
    let bestHour: number | null = null;

    for (const [hour, prices] of byHourOfDay) {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      if (avg < lowestHourAvg) {
        lowestHourAvg = avg;
        bestHour = hour;
      }
    }

    // Calculate potential savings
    const overallAverage = history.reduce((sum, p) => sum + p.price, 0) / history.length;
    const averageSavings = overallAverage - lowestDayAvg;

    return {
      dayOfWeek: bestDay,
      hourOfDay: bestHour,
      averageSavings,
    };
  }
}

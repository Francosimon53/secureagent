/**
 * Counter-Offer Strategy Engine
 *
 * Generates and evaluates counter-offer strategies for negotiations.
 */

import type {
  NegotiationSession,
  CounterOffer,
  CounterOfferStrategy,
  VendorInfo,
} from '../types.js';

/**
 * Counter offer suggestion (without id, proposedAt, status - these are added when saved)
 */
export interface CounterOfferSuggestion {
  amount: number;
  justification: string;
  strategy: CounterOfferStrategy;
  confidence: number;
  metadata?: Record<string, unknown>;
}

/**
 * Market data for competitive analysis
 */
export interface MarketData {
  competitorPrices: CompetitorPrice[];
  industryAveragePrice?: number;
  priceHistory?: PriceHistoryPoint[];
  promotions?: Promotion[];
}

/**
 * Competitor price information
 */
export interface CompetitorPrice {
  competitor: string;
  price: number;
  features?: string[];
  url?: string;
  verifiedAt?: number;
}

/**
 * Price history point
 */
export interface PriceHistoryPoint {
  date: number;
  price: number;
  note?: string;
}

/**
 * Available promotion
 */
export interface Promotion {
  name: string;
  discount: number;
  discountType: 'percent' | 'fixed';
  requirements?: string[];
  expiresAt?: number;
}

/**
 * Strategy evaluation result
 */
export interface StrategyEvaluation {
  strategy: CounterOfferStrategy;
  applicability: number; // 0-1
  expectedSuccessRate: number; // 0-1
  expectedSavings: number;
  risks: string[];
  requirements: string[];
}

/**
 * Counter-offer engine class
 */
export class CounterOfferEngine {
  /**
   * Generate counter-offer strategies for a session
   */
  generateStrategies(
    session: NegotiationSession,
    marketData?: MarketData
  ): CounterOfferSuggestion[] {
    const strategies: CounterOfferSuggestion[] = [];

    // Competitor match strategy
    if (marketData?.competitorPrices && marketData.competitorPrices.length > 0) {
      const competitorStrategy = this.createCompetitorMatchStrategy(session, marketData);
      if (competitorStrategy) {
        strategies.push(competitorStrategy);
      }
    }

    // Loyalty strategy
    if (session.vendor.customerSince) {
      const loyaltyStrategy = this.createLoyaltyStrategy(session);
      if (loyaltyStrategy) {
        strategies.push(loyaltyStrategy);
      }
    }

    // Bulk/bundle strategy
    const bulkStrategy = this.createBulkStrategy(session);
    if (bulkStrategy) {
      strategies.push(bulkStrategy);
    }

    // Timing strategy
    const timingStrategy = this.createTimingStrategy(session, marketData);
    if (timingStrategy) {
      strategies.push(timingStrategy);
    }

    // Cancellation threat strategy
    const cancellationStrategy = this.createCancellationStrategy(session);
    strategies.push(cancellationStrategy);

    // Downgrade strategy
    const downgradeStrategy = this.createDowngradeStrategy(session);
    if (downgradeStrategy) {
      strategies.push(downgradeStrategy);
    }

    // Sort by confidence
    strategies.sort((a, b) => b.confidence - a.confidence);

    return strategies;
  }

  /**
   * Select the best counter-offer strategy
   */
  selectBestStrategy(
    session: NegotiationSession,
    marketData?: MarketData
  ): CounterOfferSuggestion {
    const strategies = this.generateStrategies(session, marketData);

    if (strategies.length === 0) {
      // Fallback strategy
      return {
        amount: session.currentAmount * 0.85,
        justification: 'Requesting a 15% discount based on market conditions',
        strategy: 'loyalty',
        confidence: 0.3,
      };
    }

    return strategies[0];
  }

  /**
   * Evaluate a specific strategy
   */
  evaluateStrategy(
    strategy: CounterOfferStrategy,
    session: NegotiationSession,
    marketData?: MarketData
  ): StrategyEvaluation {
    switch (strategy) {
      case 'competitor-match':
        return this.evaluateCompetitorMatch(session, marketData);
      case 'loyalty':
        return this.evaluateLoyalty(session);
      case 'bulk':
        return this.evaluateBulk(session);
      case 'timing':
        return this.evaluateTiming(session, marketData);
      default:
        return {
          strategy,
          applicability: 0.5,
          expectedSuccessRate: 0.3,
          expectedSavings: session.currentAmount * 0.1,
          risks: ['Strategy not well documented'],
          requirements: [],
        };
    }
  }

  /**
   * Calculate a reasonable target price
   */
  calculateTargetPrice(
    currentPrice: number,
    marketData?: MarketData,
    vendorInfo?: VendorInfo
  ): { target: number; floor: number; ceiling: number } {
    let target = currentPrice * 0.85; // Default 15% reduction
    let floor = currentPrice * 0.7; // Maximum 30% reduction
    const ceiling = currentPrice * 0.95; // Minimum 5% reduction

    // Adjust based on competitor data
    if (marketData?.competitorPrices && marketData.competitorPrices.length > 0) {
      const lowestCompetitor = Math.min(...marketData.competitorPrices.map(c => c.price));
      const avgCompetitor = marketData.competitorPrices.reduce((s, c) => s + c.price, 0) /
        marketData.competitorPrices.length;

      target = Math.min(target, avgCompetitor);
      floor = Math.min(floor, lowestCompetitor);
    }

    // Adjust based on industry average
    if (marketData?.industryAveragePrice) {
      target = Math.min(target, marketData.industryAveragePrice);
    }

    // Adjust based on price history
    if (marketData?.priceHistory && marketData.priceHistory.length > 0) {
      const lowestHistorical = Math.min(...marketData.priceHistory.map(p => p.price));
      floor = Math.min(floor, lowestHistorical);
    }

    // Ensure floor < target < ceiling
    target = Math.max(floor, Math.min(target, ceiling));

    return {
      target: Math.round(target * 100) / 100,
      floor: Math.round(floor * 100) / 100,
      ceiling: Math.round(ceiling * 100) / 100,
    };
  }

  /**
   * Generate counter-offer based on vendor response
   */
  generateCounterToResponse(
    session: NegotiationSession,
    vendorOffer: number,
    vendorReason?: string
  ): CounterOfferSuggestion {
    const targetRange = this.calculateTargetPrice(session.currentAmount);

    // If vendor offer is at or below our target, accept
    if (vendorOffer <= targetRange.target) {
      return {
        amount: vendorOffer,
        justification: 'Accepting offer',
        strategy: 'loyalty',
        confidence: 1.0,
      };
    }

    // If vendor offer is above ceiling, make aggressive counter
    if (vendorOffer >= targetRange.ceiling) {
      const counterAmount = (vendorOffer + targetRange.target) / 2;
      return {
        amount: Math.round(counterAmount * 100) / 100,
        justification: `I appreciate the offer, but I was hoping for something closer to $${targetRange.target.toFixed(2)}. Can we meet in the middle at $${counterAmount.toFixed(2)}?`,
        strategy: 'loyalty',
        confidence: 0.6,
      };
    }

    // Vendor offer is between target and ceiling, try to push lower
    const pushAmount = vendorOffer * 0.95;
    const counterAmount = Math.max(targetRange.target, pushAmount);

    return {
      amount: Math.round(counterAmount * 100) / 100,
      justification: `Thank you for the offer. Would you be able to do $${counterAmount.toFixed(2)} instead?`,
      strategy: 'loyalty',
      confidence: 0.7,
    };
  }

  // Private strategy creation methods

  private createCompetitorMatchStrategy(
    session: NegotiationSession,
    marketData: MarketData
  ): CounterOfferSuggestion | null {
    if (!marketData.competitorPrices || marketData.competitorPrices.length === 0) {
      return null;
    }

    const lowestPrice = Math.min(...marketData.competitorPrices.map(c => c.price));
    const lowestCompetitor = marketData.competitorPrices.find(c => c.price === lowestPrice);

    if (lowestPrice >= session.currentAmount) {
      return null;
    }

    const savings = session.currentAmount - lowestPrice;
    const savingsPercent = (savings / session.currentAmount) * 100;

    return {
      amount: lowestPrice,
      justification: `${lowestCompetitor?.competitor ?? 'A competitor'} is offering the same service for $${lowestPrice.toFixed(2)}, which is ${savingsPercent.toFixed(1)}% less than my current rate. I'd like to stay with you, but I need a price match to justify it.`,
      strategy: 'competitor-match',
      confidence: 0.85,
      metadata: {
        competitor: lowestCompetitor?.competitor,
        competitorPrice: lowestPrice,
        competitorUrl: lowestCompetitor?.url,
      },
    };
  }

  private createLoyaltyStrategy(session: NegotiationSession): CounterOfferSuggestion | null {
    if (!session.vendor.customerSince) {
      return null;
    }

    const yearsAsCustomer = Math.floor(
      (Date.now() - session.vendor.customerSince) / (365 * 24 * 60 * 60 * 1000)
    );

    if (yearsAsCustomer < 1) {
      return null;
    }

    // More years = bigger discount request
    const discountPercent = Math.min(5 + yearsAsCustomer * 2, 20);
    const targetAmount = session.currentAmount * (1 - discountPercent / 100);

    return {
      amount: Math.round(targetAmount * 100) / 100,
      justification: `I've been a loyal customer for ${yearsAsCustomer} years and have always paid on time. I'd like to continue our relationship, but I need a loyalty discount of ${discountPercent}% to stay within my budget.`,
      strategy: 'loyalty',
      confidence: 0.6 + Math.min(yearsAsCustomer * 0.05, 0.2),
      metadata: {
        yearsAsCustomer,
        discountPercent,
      },
    };
  }

  private createBulkStrategy(session: NegotiationSession): CounterOfferSuggestion | null {
    // Suggest bundling services or prepaying for a year
    const annualDiscount = 0.15; // 15% for annual prepay
    const targetAmount = session.currentAmount * (1 - annualDiscount);

    return {
      amount: Math.round(targetAmount * 100) / 100,
      justification: `I'm willing to prepay for a full year or bundle additional services if you can offer me a 15% discount on my current rate.`,
      strategy: 'bulk',
      confidence: 0.55,
      metadata: {
        discountType: 'annual-prepay',
        discountPercent: annualDiscount * 100,
      },
    };
  }

  private createTimingStrategy(
    session: NegotiationSession,
    marketData?: MarketData
  ): CounterOfferSuggestion | null {
    const now = new Date();
    const month = now.getMonth();
    const isEndOfQuarter = month === 2 || month === 5 || month === 8 || month === 11;
    const isHolidaySeason = month === 10 || month === 11;

    if (!isEndOfQuarter && !isHolidaySeason) {
      return null;
    }

    const discountPercent = isEndOfQuarter ? 10 : 15;
    const targetAmount = session.currentAmount * (1 - discountPercent / 100);

    let reason: string;
    if (isEndOfQuarter) {
      reason = `I understand this is the end of the quarter, and I'm prepared to commit today if you can offer me a ${discountPercent}% discount.`;
    } else {
      reason = `With the holiday season, I'm looking to reduce expenses. If you can offer me a ${discountPercent}% discount, I'll stay on as a customer.`;
    }

    return {
      amount: Math.round(targetAmount * 100) / 100,
      justification: reason,
      strategy: 'timing',
      confidence: isEndOfQuarter ? 0.65 : 0.5,
      metadata: {
        timing: isEndOfQuarter ? 'end-of-quarter' : 'holiday-season',
        discountPercent,
      },
    };
  }

  private createCancellationStrategy(session: NegotiationSession): CounterOfferSuggestion {
    const discountPercent = 20;
    const targetAmount = session.currentAmount * (1 - discountPercent / 100);

    return {
      amount: Math.round(targetAmount * 100) / 100,
      justification: `I'm seriously considering cancelling my service. The current price doesn't fit my budget. If you can reduce it by ${discountPercent}%, I'll stay. Otherwise, I'll need to cancel.`,
      strategy: 'loyalty',
      confidence: 0.7,
      metadata: {
        threatLevel: 'high',
        discountPercent,
        note: 'Only use if genuinely willing to cancel',
      },
    };
  }

  private createDowngradeStrategy(session: NegotiationSession): CounterOfferSuggestion | null {
    // Suggest downgrading to a lower tier while keeping current price
    const reducedAmount = session.currentAmount * 0.7;

    return {
      amount: Math.round(reducedAmount * 100) / 100,
      justification: `I'd be interested in downgrading to a lower service tier at around $${reducedAmount.toFixed(2)}/month. Alternatively, can you match this price for my current plan?`,
      strategy: 'bulk',
      confidence: 0.5,
      metadata: {
        approach: 'downgrade-threat',
      },
    };
  }

  // Evaluation methods

  private evaluateCompetitorMatch(
    session: NegotiationSession,
    marketData?: MarketData
  ): StrategyEvaluation {
    const hasCompetitorData = marketData?.competitorPrices && marketData.competitorPrices.length > 0;
    const lowestCompetitor = hasCompetitorData
      ? Math.min(...marketData!.competitorPrices!.map(c => c.price))
      : session.currentAmount;

    return {
      strategy: 'competitor-match',
      applicability: hasCompetitorData ? 0.9 : 0.1,
      expectedSuccessRate: hasCompetitorData ? 0.75 : 0.2,
      expectedSavings: session.currentAmount - lowestCompetitor,
      risks: [
        'Vendor may ask for proof of competitor offer',
        'Competitor offer may have different terms',
      ],
      requirements: [
        'Documented competitor pricing',
        'Comparable service levels',
      ],
    };
  }

  private evaluateLoyalty(session: NegotiationSession): StrategyEvaluation {
    const yearsAsCustomer = session.vendor.customerSince
      ? Math.floor((Date.now() - session.vendor.customerSince) / (365 * 24 * 60 * 60 * 1000))
      : 0;

    return {
      strategy: 'loyalty',
      applicability: yearsAsCustomer >= 2 ? 0.8 : 0.4,
      expectedSuccessRate: Math.min(0.3 + yearsAsCustomer * 0.1, 0.7),
      expectedSavings: session.currentAmount * (0.05 + yearsAsCustomer * 0.02),
      risks: [
        'Vendor may not value loyalty as much as new customer acquisition',
      ],
      requirements: [
        'Multiple years as customer',
        'Good payment history',
      ],
    };
  }

  private evaluateBulk(session: NegotiationSession): StrategyEvaluation {
    return {
      strategy: 'bulk',
      applicability: 0.7,
      expectedSuccessRate: 0.6,
      expectedSavings: session.currentAmount * 0.15,
      risks: [
        'Requires upfront payment commitment',
        'Less flexibility if service quality declines',
      ],
      requirements: [
        'Available funds for prepayment',
        'Commitment to continue service',
      ],
    };
  }

  private evaluateTiming(
    session: NegotiationSession,
    marketData?: MarketData
  ): StrategyEvaluation {
    const now = new Date();
    const month = now.getMonth();
    const isEndOfQuarter = month === 2 || month === 5 || month === 8 || month === 11;

    return {
      strategy: 'timing',
      applicability: isEndOfQuarter ? 0.7 : 0.3,
      expectedSuccessRate: isEndOfQuarter ? 0.5 : 0.25,
      expectedSavings: session.currentAmount * (isEndOfQuarter ? 0.1 : 0.05),
      risks: [
        'Timing advantage is not guaranteed',
        'Sales rep may not have quarter-end pressure',
      ],
      requirements: [
        'Flexibility on when to negotiate',
        'Willingness to wait for optimal timing',
      ],
    };
  }
}

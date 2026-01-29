/**
 * Settlement Tracker
 *
 * Tracks and optimizes settlements between group members.
 */

import type { Settlement, GroupBalance } from '../types.js';

/**
 * Settlement summary
 */
export interface SettlementSummary {
  totalSettlements: number;
  completedSettlements: number;
  pendingSettlements: number;
  totalAmountSettled: number;
  totalAmountPending: number;
  averageSettlementTime: number | null; // in milliseconds
  settlementsThisMonth: number;
}

/**
 * Optimized settlement plan
 */
export interface SettlementPlan {
  settlements: Settlement[];
  totalTransactions: number;
  originalTransactions: number;
  transactionsSaved: number;
  simplificationRatio: number; // 0-1, higher is better
}

/**
 * Settlement tracker class
 */
export class SettlementTracker {
  private readonly roundingPrecision: number;

  constructor(roundingPrecision = 2) {
    this.roundingPrecision = roundingPrecision;
  }

  /**
   * Calculate optimal settlements to minimize number of transactions
   */
  calculateOptimalSettlements(balances: GroupBalance[]): SettlementPlan {
    // First, calculate what the naive approach would require
    let naiveTransactions = 0;
    for (const balance of balances) {
      naiveTransactions += balance.owes.size;
    }

    // Separate into debtors and creditors
    const debtors: Array<{ userId: string; userName: string; amount: number }> = [];
    const creditors: Array<{ userId: string; userName: string; amount: number }> = [];

    for (const balance of balances) {
      if (balance.balance < -0.01) {
        // Owes money
        debtors.push({
          userId: balance.userId,
          userName: balance.userName,
          amount: Math.abs(balance.balance),
        });
      } else if (balance.balance > 0.01) {
        // Owed money
        creditors.push({
          userId: balance.userId,
          userName: balance.userName,
          amount: balance.balance,
        });
      }
    }

    // Sort by amount (descending) for greedy algorithm
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    // Greedy matching algorithm
    const settlements: Settlement[] = [];
    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];

      const amount = Math.min(debtor.amount, creditor.amount);

      if (amount > 0.01) {
        settlements.push({
          id: crypto.randomUUID(),
          fromUserId: debtor.userId,
          fromName: debtor.userName,
          toUserId: creditor.userId,
          toName: creditor.userName,
          amount: this.round(amount),
          currency: 'USD',
          status: 'pending',
          createdAt: Date.now(),
        });
      }

      debtor.amount = this.round(debtor.amount - amount);
      creditor.amount = this.round(creditor.amount - amount);

      if (debtor.amount < 0.01) i++;
      if (creditor.amount < 0.01) j++;
    }

    const simplificationRatio = naiveTransactions > 0
      ? 1 - (settlements.length / naiveTransactions)
      : 1;

    return {
      settlements,
      totalTransactions: settlements.length,
      originalTransactions: naiveTransactions,
      transactionsSaved: naiveTransactions - settlements.length,
      simplificationRatio,
    };
  }

  /**
   * Generate settlement summary
   */
  generateSummary(settlements: Settlement[]): SettlementSummary {
    const now = Date.now();
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    let completedCount = 0;
    let pendingCount = 0;
    let totalSettled = 0;
    let totalPending = 0;
    let totalSettlementTime = 0;
    let settledWithTime = 0;
    let thisMonthCount = 0;

    for (const settlement of settlements) {
      if (settlement.status === 'completed') {
        completedCount++;
        totalSettled += settlement.amount;

        if (settlement.completedAt) {
          totalSettlementTime += settlement.completedAt - settlement.createdAt;
          settledWithTime++;
        }
      } else if (settlement.status === 'pending') {
        pendingCount++;
        totalPending += settlement.amount;
      }

      if (settlement.createdAt >= monthStart.getTime()) {
        thisMonthCount++;
      }
    }

    return {
      totalSettlements: settlements.length,
      completedSettlements: completedCount,
      pendingSettlements: pendingCount,
      totalAmountSettled: this.round(totalSettled),
      totalAmountPending: this.round(totalPending),
      averageSettlementTime: settledWithTime > 0
        ? totalSettlementTime / settledWithTime
        : null,
      settlementsThisMonth: thisMonthCount,
    };
  }

  /**
   * Find the simplest path to settle between two people
   */
  findSettlementPath(
    fromUserId: string,
    toUserId: string,
    balances: GroupBalance[]
  ): Settlement[] {
    // Direct path
    const fromBalance = balances.find(b => b.userId === fromUserId);
    const toBalance = balances.find(b => b.userId === toUserId);

    if (!fromBalance || !toBalance) {
      return [];
    }

    // Check if there's a direct debt
    const directDebt = fromBalance.owes.get(toUserId) ?? 0;
    if (directDebt > 0) {
      return [{
        id: crypto.randomUUID(),
        fromUserId,
        fromName: fromBalance.userName,
        toUserId,
        toName: toBalance.userName,
        amount: this.round(directDebt),
        currency: 'USD',
        status: 'pending',
        createdAt: Date.now(),
      }];
    }

    return [];
  }

  /**
   * Suggest the best payment method based on amount
   */
  suggestPaymentMethod(amount: number): {
    method: string;
    reason: string;
  } {
    if (amount < 5) {
      return {
        method: 'cash',
        reason: 'For small amounts, cash is simplest',
      };
    }

    if (amount < 50) {
      return {
        method: 'venmo',
        reason: 'Venmo is quick and fee-free for small amounts',
      };
    }

    if (amount < 500) {
      return {
        method: 'zelle',
        reason: 'Zelle is fast and fee-free for bank transfers',
      };
    }

    return {
      method: 'bank-transfer',
      reason: 'Bank transfer is safest for larger amounts',
    };
  }

  /**
   * Calculate settlement priority
   */
  calculatePriority(settlement: Settlement): {
    priority: 'low' | 'medium' | 'high';
    score: number;
    factors: string[];
  } {
    const factors: string[] = [];
    let score = 50; // Start at medium

    // Amount factor
    if (settlement.amount > 100) {
      score += 20;
      factors.push('Large amount');
    } else if (settlement.amount < 10) {
      score -= 10;
      factors.push('Small amount');
    }

    // Age factor
    const ageInDays = (Date.now() - settlement.createdAt) / (24 * 60 * 60 * 1000);
    if (ageInDays > 14) {
      score += 30;
      factors.push('Outstanding for over 2 weeks');
    } else if (ageInDays > 7) {
      score += 15;
      factors.push('Outstanding for over 1 week');
    }

    // Determine priority level
    let priority: 'low' | 'medium' | 'high';
    if (score >= 70) {
      priority = 'high';
    } else if (score >= 40) {
      priority = 'medium';
    } else {
      priority = 'low';
    }

    return { priority, score, factors };
  }

  /**
   * Group settlements by user for easier viewing
   */
  groupByUser(
    settlements: Settlement[],
    userId: string
  ): {
    toReceive: Array<{ from: string; amount: number; settlements: Settlement[] }>;
    toPay: Array<{ to: string; amount: number; settlements: Settlement[] }>;
  } {
    const toReceiveMap = new Map<string, { amount: number; settlements: Settlement[] }>();
    const toPayMap = new Map<string, { amount: number; settlements: Settlement[] }>();

    for (const settlement of settlements) {
      if (settlement.toUserId === userId && settlement.status === 'pending') {
        const existing = toReceiveMap.get(settlement.fromUserId) ?? { amount: 0, settlements: [] };
        existing.amount += settlement.amount;
        existing.settlements.push(settlement);
        toReceiveMap.set(settlement.fromUserId, existing);
      }

      if (settlement.fromUserId === userId && settlement.status === 'pending') {
        const existing = toPayMap.get(settlement.toUserId) ?? { amount: 0, settlements: [] };
        existing.amount += settlement.amount;
        existing.settlements.push(settlement);
        toPayMap.set(settlement.toUserId, existing);
      }
    }

    const toReceive = Array.from(toReceiveMap.entries()).map(([from, data]) => ({
      from,
      ...data,
    }));

    const toPay = Array.from(toPayMap.entries()).map(([to, data]) => ({
      to,
      ...data,
    }));

    return { toReceive, toPay };
  }

  /**
   * Generate a reminder message for a settlement
   */
  generateReminderMessage(settlement: Settlement): string {
    const ageInDays = Math.floor(
      (Date.now() - settlement.createdAt) / (24 * 60 * 60 * 1000)
    );

    let urgency = '';
    if (ageInDays > 14) {
      urgency = 'This has been outstanding for over 2 weeks. ';
    } else if (ageInDays > 7) {
      urgency = 'This has been outstanding for over a week. ';
    }

    return `Hi ${settlement.fromName}! ${urgency}Just a friendly reminder that you owe ${settlement.toName} $${settlement.amount.toFixed(2)}. Thanks!`;
  }

  /**
   * Check if settlements can be simplified
   */
  canSimplify(settlements: Settlement[]): boolean {
    // Check if there are circular debts that can be eliminated
    const debts = new Map<string, Map<string, number>>();

    for (const settlement of settlements) {
      if (settlement.status !== 'pending') continue;

      if (!debts.has(settlement.fromUserId)) {
        debts.set(settlement.fromUserId, new Map());
      }
      const fromDebts = debts.get(settlement.fromUserId)!;
      const current = fromDebts.get(settlement.toUserId) ?? 0;
      fromDebts.set(settlement.toUserId, current + settlement.amount);
    }

    // Check for circular debts
    for (const [from, toMap] of debts) {
      for (const [to] of toMap) {
        // Check if there's a reverse debt
        const reverseDebt = debts.get(to)?.get(from) ?? 0;
        if (reverseDebt > 0) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Round to precision
   */
  private round(value: number): number {
    const factor = Math.pow(10, this.roundingPrecision);
    return Math.round(value * factor) / factor;
  }
}

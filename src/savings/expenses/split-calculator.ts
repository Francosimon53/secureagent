/**
 * Split Calculator
 *
 * Calculates expense splits with various methods.
 */

import type { SplitType, GroupMember } from '../types.js';

/**
 * Split calculation result
 */
export interface SplitResult {
  memberId: string;
  memberName: string;
  amount: number;
  percentage: number;
  shares?: number;
}

/**
 * Split calculation options
 */
export interface SplitOptions {
  type: SplitType;
  totalAmount: number;
  members: GroupMember[];
  customValues?: Map<string, number>; // For percentage, exact, or shares
  includeOwner?: boolean;
  ownerName?: string;
  roundingPrecision?: number;
}

/**
 * Split calculator class
 */
export class SplitCalculator {
  private readonly precision: number;

  constructor(roundingPrecision = 2) {
    this.precision = roundingPrecision;
  }

  /**
   * Calculate split for all members
   */
  calculate(options: SplitOptions): SplitResult[] {
    const {
      type,
      totalAmount,
      members,
      customValues,
      includeOwner = true,
      ownerName = 'You',
    } = options;

    switch (type) {
      case 'equal':
        return this.calculateEqual(totalAmount, members, includeOwner, ownerName);
      case 'percentage':
        return this.calculatePercentage(totalAmount, members, customValues, includeOwner, ownerName);
      case 'exact':
        return this.calculateExact(totalAmount, members, customValues, includeOwner, ownerName);
      case 'shares':
        return this.calculateShares(totalAmount, members, customValues, includeOwner, ownerName);
      default:
        return this.calculateEqual(totalAmount, members, includeOwner, ownerName);
    }
  }

  /**
   * Calculate equal split
   */
  private calculateEqual(
    totalAmount: number,
    members: GroupMember[],
    includeOwner: boolean,
    ownerName: string
  ): SplitResult[] {
    const totalPeople = members.length + (includeOwner ? 1 : 0);
    const perPerson = this.round(totalAmount / totalPeople);
    const percentage = 100 / totalPeople;

    const results: SplitResult[] = [];

    // Add owner first if included
    if (includeOwner) {
      results.push({
        memberId: 'owner',
        memberName: ownerName,
        amount: perPerson,
        percentage: this.round(percentage),
      });
    }

    // Add other members
    for (const member of members) {
      results.push({
        memberId: member.id,
        memberName: member.name,
        amount: perPerson,
        percentage: this.round(percentage),
      });
    }

    // Adjust for rounding to ensure total matches
    return this.adjustForRounding(results, totalAmount);
  }

  /**
   * Calculate percentage-based split
   */
  private calculatePercentage(
    totalAmount: number,
    members: GroupMember[],
    customValues?: Map<string, number>,
    includeOwner?: boolean,
    ownerName?: string
  ): SplitResult[] {
    const results: SplitResult[] = [];

    // Calculate owner's percentage (remainder after all members)
    let usedPercentage = 0;
    for (const member of members) {
      usedPercentage += customValues?.get(member.id) ?? customValues?.get(member.name) ?? 0;
    }

    if (includeOwner) {
      const ownerPercentage = Math.max(0, 100 - usedPercentage);
      results.push({
        memberId: 'owner',
        memberName: ownerName ?? 'You',
        amount: this.round((totalAmount * ownerPercentage) / 100),
        percentage: this.round(ownerPercentage),
      });
    }

    for (const member of members) {
      const percentage = customValues?.get(member.id) ?? customValues?.get(member.name) ?? 0;
      results.push({
        memberId: member.id,
        memberName: member.name,
        amount: this.round((totalAmount * percentage) / 100),
        percentage: this.round(percentage),
      });
    }

    return this.adjustForRounding(results, totalAmount);
  }

  /**
   * Calculate exact amount split
   */
  private calculateExact(
    totalAmount: number,
    members: GroupMember[],
    customValues?: Map<string, number>,
    includeOwner?: boolean,
    ownerName?: string
  ): SplitResult[] {
    const results: SplitResult[] = [];

    // Calculate total assigned to members
    let assignedAmount = 0;
    for (const member of members) {
      assignedAmount += customValues?.get(member.id) ?? customValues?.get(member.name) ?? 0;
    }

    if (includeOwner) {
      const ownerAmount = Math.max(0, totalAmount - assignedAmount);
      results.push({
        memberId: 'owner',
        memberName: ownerName ?? 'You',
        amount: this.round(ownerAmount),
        percentage: this.round((ownerAmount / totalAmount) * 100),
      });
    }

    for (const member of members) {
      const amount = customValues?.get(member.id) ?? customValues?.get(member.name) ?? 0;
      results.push({
        memberId: member.id,
        memberName: member.name,
        amount: this.round(amount),
        percentage: this.round((amount / totalAmount) * 100),
      });
    }

    return results;
  }

  /**
   * Calculate shares-based split
   */
  private calculateShares(
    totalAmount: number,
    members: GroupMember[],
    customValues?: Map<string, number>,
    includeOwner?: boolean,
    ownerName?: string
  ): SplitResult[] {
    const results: SplitResult[] = [];

    // Calculate total shares
    let totalShares = includeOwner ? 1 : 0; // Owner gets 1 share by default
    for (const member of members) {
      totalShares += customValues?.get(member.id) ??
                     customValues?.get(member.name) ??
                     member.defaultShare ?? 1;
    }

    const valuePerShare = totalAmount / totalShares;

    if (includeOwner) {
      const ownerShares = 1;
      const ownerAmount = this.round(valuePerShare * ownerShares);
      results.push({
        memberId: 'owner',
        memberName: ownerName ?? 'You',
        amount: ownerAmount,
        percentage: this.round((ownerShares / totalShares) * 100),
        shares: ownerShares,
      });
    }

    for (const member of members) {
      const shares = customValues?.get(member.id) ??
                     customValues?.get(member.name) ??
                     member.defaultShare ?? 1;
      const amount = this.round(valuePerShare * shares);
      results.push({
        memberId: member.id,
        memberName: member.name,
        amount,
        percentage: this.round((shares / totalShares) * 100),
        shares,
      });
    }

    return this.adjustForRounding(results, totalAmount);
  }

  /**
   * Adjust amounts to account for rounding errors
   */
  private adjustForRounding(results: SplitResult[], totalAmount: number): SplitResult[] {
    const currentTotal = results.reduce((sum, r) => sum + r.amount, 0);
    const difference = this.round(totalAmount - currentTotal);

    if (difference !== 0 && results.length > 0) {
      // Add difference to the last person (usually smallest impact)
      results[results.length - 1].amount = this.round(
        results[results.length - 1].amount + difference
      );
    }

    return results;
  }

  /**
   * Round to precision
   */
  private round(value: number): number {
    const factor = Math.pow(10, this.precision);
    return Math.round(value * factor) / factor;
  }

  /**
   * Validate that a split is valid
   */
  validateSplit(results: SplitResult[], totalAmount: number): {
    isValid: boolean;
    totalCalculated: number;
    difference: number;
    errors: string[];
  } {
    const errors: string[] = [];
    const totalCalculated = results.reduce((sum, r) => sum + r.amount, 0);
    const difference = Math.abs(totalAmount - totalCalculated);

    // Check for negative amounts
    for (const result of results) {
      if (result.amount < 0) {
        errors.push(`${result.memberName} has negative amount: ${result.amount}`);
      }
    }

    // Check total matches (within small tolerance for rounding)
    if (difference > 0.01) {
      errors.push(`Total mismatch: expected ${totalAmount}, got ${totalCalculated}`);
    }

    return {
      isValid: errors.length === 0,
      totalCalculated,
      difference,
      errors,
    };
  }

  /**
   * Suggest the fairest way to split
   */
  suggestSplitType(
    members: GroupMember[],
    hasUnequalIncomes: boolean,
    isRecurring: boolean
  ): {
    recommended: SplitType;
    reason: string;
  } {
    if (hasUnequalIncomes) {
      return {
        recommended: 'percentage',
        reason: 'Percentage split is fairer when incomes vary',
      };
    }

    if (members.some(m => m.defaultShare !== undefined && m.defaultShare !== 1)) {
      return {
        recommended: 'shares',
        reason: 'Members have different default shares defined',
      };
    }

    if (isRecurring) {
      return {
        recommended: 'percentage',
        reason: 'Percentage is easier to maintain for recurring expenses',
      };
    }

    return {
      recommended: 'equal',
      reason: 'Equal split is simplest when everyone pays the same',
    };
  }

  /**
   * Calculate tip split
   */
  calculateWithTip(
    subtotal: number,
    tipPercent: number,
    members: GroupMember[],
    splitType: SplitType = 'equal'
  ): {
    subtotalPerPerson: SplitResult[];
    tipPerPerson: SplitResult[];
    totalPerPerson: SplitResult[];
    tipAmount: number;
    grandTotal: number;
  } {
    const tipAmount = this.round((subtotal * tipPercent) / 100);
    const grandTotal = subtotal + tipAmount;

    const subtotalSplit = this.calculate({
      type: splitType,
      totalAmount: subtotal,
      members,
    });

    const tipSplit = this.calculate({
      type: splitType,
      totalAmount: tipAmount,
      members,
    });

    const totalSplit = subtotalSplit.map((s, i) => ({
      ...s,
      amount: this.round(s.amount + tipSplit[i].amount),
    }));

    return {
      subtotalPerPerson: subtotalSplit,
      tipPerPerson: tipSplit,
      totalPerPerson: totalSplit,
      tipAmount,
      grandTotal,
    };
  }

  /**
   * Calculate itemized split
   */
  calculateItemized(
    items: Array<{
      name: string;
      price: number;
      sharedBy: string[]; // member IDs who share this item
    }>,
    sharedItems: {
      tax?: number;
      tip?: number;
      serviceFee?: number;
    } = {}
  ): Map<string, number> {
    const memberTotals = new Map<string, number>();

    // Calculate per-item costs
    for (const item of items) {
      const perPerson = this.round(item.price / item.sharedBy.length);
      for (const memberId of item.sharedBy) {
        const current = memberTotals.get(memberId) ?? 0;
        memberTotals.set(memberId, current + perPerson);
      }
    }

    // Add shared costs (split equally among all who have items)
    const allMembers = Array.from(memberTotals.keys());
    const sharedTotal = (sharedItems.tax ?? 0) + (sharedItems.tip ?? 0) + (sharedItems.serviceFee ?? 0);

    if (sharedTotal > 0 && allMembers.length > 0) {
      const sharedPerPerson = this.round(sharedTotal / allMembers.length);
      for (const memberId of allMembers) {
        const current = memberTotals.get(memberId) ?? 0;
        memberTotals.set(memberId, current + sharedPerPerson);
      }
    }

    return memberTotals;
  }
}

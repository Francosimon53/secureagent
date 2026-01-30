/**
 * Data Aggregator
 *
 * Aggregates session data for progress report generation.
 * Calculates statistics, trends, and goal progress metrics.
 */

import type { ProgressReportStore } from '../../stores/progress-report-store.js';
import type { PatientStore } from '../../stores/patient-store.js';
import type {
  SessionData,
  PatientId,
  BehaviorGoal,
} from '../../types.js';

// Local type for goal progress tracking
export interface GoalProgress {
  goalId: string;
  goalName: string;
  domain: string;
  baselineValue: number;
  targetValue: number;
  currentValue: number;
  progressPercent: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  dataPoints: Array<{ date: number; value: number }>;
  status: 'not-started' | 'in-progress' | 'approaching-mastery' | 'mastered';
}

// =============================================================================
// Aggregation Types
// =============================================================================

export interface AggregatedData {
  patientId: PatientId;
  periodStart: number;
  periodEnd: number;
  totalSessions: number;
  totalHours: number;
  sessionTypes: Record<string, number>;
  goalProgress: GoalProgress[];
  behaviorSummary: BehaviorSummary;
  attendanceSummary: AttendanceSummary;
  skillAcquisitionSummary: SkillAcquisitionSummary;
}

export interface BehaviorSummary {
  targetBehaviors: Array<{
    name: string;
    baselineRate: number;
    currentRate: number;
    changePercent: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    dataPoints: Array<{ date: number; value: number }>;
  }>;
  replacementBehaviors: Array<{
    name: string;
    acquisitionRate: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    dataPoints: Array<{ date: number; value: number }>;
  }>;
}

export interface AttendanceSummary {
  scheduledSessions: number;
  completedSessions: number;
  cancelledSessions: number;
  noShowSessions: number;
  attendanceRate: number;
  cancellationReasons: Record<string, number>;
}

export interface SkillAcquisitionSummary {
  totalGoals: number;
  masteredGoals: number;
  inProgressGoals: number;
  notStartedGoals: number;
  averageProgress: number;
  skillsByDomain: Record<string, {
    total: number;
    mastered: number;
    averageProgress: number;
  }>;
}

// =============================================================================
// Data Aggregator Options
// =============================================================================

export interface DataAggregatorOptions {
  progressReportStore: ProgressReportStore;
  patientStore: PatientStore;
}

// =============================================================================
// Data Aggregator
// =============================================================================

export class DataAggregator {
  private readonly progressReportStore: ProgressReportStore;
  private readonly patientStore: PatientStore;

  constructor(options: DataAggregatorOptions) {
    this.progressReportStore = options.progressReportStore;
    this.patientStore = options.patientStore;
  }

  /**
   * Aggregate session data for a reporting period
   */
  async aggregateSessionData(
    userId: string,
    patientId: PatientId,
    periodStart: number,
    periodEnd: number
  ): Promise<AggregatedData> {
    // Get all session data for the period
    const sessions = await this.progressReportStore.getSessionDataForReport(
      userId,
      patientId,
      periodStart,
      periodEnd
    );

    // Get patient's current goals from their progress reports
    // Note: In a real implementation, goals would be stored separately or in the patient record
    // For now, we extract them from historical reports
    const reports = await this.progressReportStore.listReports(userId, { patientId });
    const goals: BehaviorGoal[] = reports.length > 0 ? (reports[0].goals as BehaviorGoal[]) : [];

    // Calculate aggregations
    const sessionTypes = this.aggregateSessionTypes(sessions);
    const totalHours = this.calculateTotalHours(sessions);
    const goalProgress = await this.calculateGoalProgress(userId, patientId, goals, sessions);
    const behaviorSummary = this.aggregateBehaviorData(sessions, goals);
    const attendanceSummary = this.calculateAttendance(sessions);
    const skillAcquisitionSummary = this.calculateSkillAcquisition(goals, goalProgress);

    return {
      patientId,
      periodStart,
      periodEnd,
      totalSessions: sessions.length,
      totalHours,
      sessionTypes,
      goalProgress,
      behaviorSummary,
      attendanceSummary,
      skillAcquisitionSummary,
    };
  }

  /**
   * Calculate goal progress for all goals
   */
  async calculateGoalProgress(
    userId: string,
    patientId: PatientId,
    goals: BehaviorGoal[],
    sessions: SessionData[]
  ): Promise<GoalProgress[]> {
    const progress: GoalProgress[] = [];

    for (const goal of goals) {
      // Get historical progress data
      const historicalData = await this.progressReportStore.getGoalProgress(
        userId,
        patientId,
        goal.id
      );

      // Calculate current performance from recent sessions
      const goalSessions = sessions.filter((s) =>
        s.goalsWorked?.some((g) => g.goalId === goal.id)
      );

      let currentValue = goal.baseline.value;
      let trials = 0;
      let correct = 0;

      for (const session of goalSessions) {
        const goalData = session.goalsWorked?.find((g) => g.goalId === goal.id);
        if (goalData) {
          trials += goalData.trials ?? 0;
          correct += goalData.correct ?? 0;
        }
      }

      if (trials > 0) {
        currentValue = (correct / trials) * 100;
      } else if (historicalData.length > 0) {
        currentValue = historicalData[historicalData.length - 1].value * 100;
      }

      // Calculate trend
      const trend = this.calculateTrend(historicalData.map((h) => h.value * 100));

      // Calculate progress percentage toward target
      const progressPercent = this.calculateProgressPercent(
        goal.baseline.value,
        goal.target.value,
        currentValue
      );

      progress.push({
        goalId: goal.id,
        goalName: goal.name,
        domain: goal.domain,
        baselineValue: goal.baseline.value,
        targetValue: goal.target.value,
        currentValue,
        progressPercent,
        trend,
        dataPoints: historicalData,
        status: this.determineGoalStatus(progressPercent, 80),
      });
    }

    return progress;
  }

  /**
   * Aggregate behavior data from sessions
   */
  private aggregateBehaviorData(
    sessions: SessionData[],
    goals: BehaviorGoal[]
  ): BehaviorSummary {
    const targetBehaviors: BehaviorSummary['targetBehaviors'] = [];
    const replacementBehaviors: BehaviorSummary['replacementBehaviors'] = [];

    // Group behavior data by behavior name
    const behaviorData = new Map<string, Array<{ date: number; value: number }>>();

    for (const session of sessions) {
      for (const behavior of session.problemBehaviors ?? []) {
        const existing = behaviorData.get(behavior.behaviorName) ?? [];
        existing.push({
          date: session.sessionDate,
          value: behavior.frequency ?? behavior.duration ?? 0,
        });
        behaviorData.set(behavior.behaviorName, existing);
      }
    }

    // Process target behaviors (from goals with behavior-reduction domain)
    const targetBehaviorGoals = goals.filter((g) => g.domain === 'behavior-reduction');
    for (const goal of targetBehaviorGoals) {
      const data = behaviorData.get(goal.name) ?? [];
      if (data.length === 0) continue;

      const sortedData = data.sort((a, b) => a.date - b.date);
      const values = sortedData.map((d) => d.value);
      const currentRate = values.length > 0 ? values[values.length - 1] : goal.baseline.value;
      const changePercent = goal.baseline.value > 0
        ? ((currentRate - goal.baseline.value) / goal.baseline.value) * 100
        : 0;

      targetBehaviors.push({
        name: goal.name,
        baselineRate: goal.baseline.value,
        currentRate,
        changePercent,
        trend: this.calculateTrend(values),
        dataPoints: sortedData,
      });
    }

    // Process replacement behaviors (from goals with other acquisition domains)
    const replacementGoals = goals.filter((g) => g.domain !== 'behavior-reduction');
    for (const goal of replacementGoals) {
      const data = behaviorData.get(goal.name) ?? [];
      if (data.length === 0) continue;

      const sortedData = data.sort((a, b) => a.date - b.date);
      const values = sortedData.map((d) => d.value);
      const acquisitionRate = values.length > 0 ? values[values.length - 1] : 0;

      replacementBehaviors.push({
        name: goal.name,
        acquisitionRate,
        trend: this.calculateTrend(values),
        dataPoints: sortedData,
      });
    }

    return { targetBehaviors, replacementBehaviors };
  }

  /**
   * Calculate attendance summary
   */
  private calculateAttendance(sessions: SessionData[]): AttendanceSummary {
    const cancellationReasons: Record<string, number> = {};
    // SessionData doesn't have a status field, so we count all sessions as completed
    // In a real implementation, status would come from associated appointments
    const completed = sessions.length;
    const cancelled = 0;
    const noShow = 0;

    const total = sessions.length;
    const attendanceRate = total > 0 ? (completed / total) * 100 : 0;

    return {
      scheduledSessions: total,
      completedSessions: completed,
      cancelledSessions: cancelled,
      noShowSessions: noShow,
      attendanceRate,
      cancellationReasons,
    };
  }

  /**
   * Calculate skill acquisition summary
   */
  private calculateSkillAcquisition(
    goals: BehaviorGoal[],
    progress: GoalProgress[]
  ): SkillAcquisitionSummary {
    const skillsByDomain: SkillAcquisitionSummary['skillsByDomain'] = {};
    let mastered = 0;
    let inProgress = 0;
    let notStarted = 0;
    let totalProgress = 0;

    for (const goal of goals) {
      const goalProgress = progress.find((p) => p.goalId === goal.id);
      const progressPercent = goalProgress?.progressPercent ?? 0;

      // Track domain stats
      const domain = goal.domain ?? 'General';
      if (!skillsByDomain[domain]) {
        skillsByDomain[domain] = { total: 0, mastered: 0, averageProgress: 0 };
      }
      skillsByDomain[domain].total++;
      skillsByDomain[domain].averageProgress += progressPercent;

      // Track overall stats
      totalProgress += progressPercent;

      if (goal.status === 'mastered' || progressPercent >= 100) {
        mastered++;
        skillsByDomain[domain].mastered++;
      } else if (goal.status === 'not-started' || progressPercent === 0) {
        notStarted++;
      } else {
        inProgress++;
      }
    }

    // Calculate domain averages
    for (const domain of Object.keys(skillsByDomain)) {
      skillsByDomain[domain].averageProgress /= skillsByDomain[domain].total;
    }

    return {
      totalGoals: goals.length,
      masteredGoals: mastered,
      inProgressGoals: inProgress,
      notStartedGoals: notStarted,
      averageProgress: goals.length > 0 ? totalProgress / goals.length : 0,
      skillsByDomain,
    };
  }

  /**
   * Aggregate session types
   */
  private aggregateSessionTypes(sessions: SessionData[]): Record<string, number> {
    const types: Record<string, number> = {};

    for (const session of sessions) {
      const type = session.serviceCode ?? 'direct';
      types[type] = (types[type] ?? 0) + 1;
    }

    return types;
  }

  /**
   * Calculate total hours from sessions
   */
  private calculateTotalHours(sessions: SessionData[]): number {
    let totalMinutes = 0;

    for (const session of sessions) {
      if (session.durationMinutes) {
        totalMinutes += session.durationMinutes;
      }
    }

    return Math.round((totalMinutes / 60) * 100) / 100;
  }

  /**
   * Calculate trend from data points
   */
  private calculateTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 3) return 'stable';

    // Use linear regression to determine trend
    const n = values.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgValue = sumY / n;

    // Consider stable if slope is less than 5% of average value
    const threshold = Math.abs(avgValue) * 0.05;

    if (slope > threshold) return 'increasing';
    if (slope < -threshold) return 'decreasing';
    return 'stable';
  }

  /**
   * Calculate progress percentage toward target
   */
  private calculateProgressPercent(
    baseline: number,
    target: number,
    current: number
  ): number {
    const range = target - baseline;
    if (range === 0) return current >= target ? 100 : 0;

    const progress = ((current - baseline) / range) * 100;
    return Math.max(0, Math.min(100, progress));
  }

  /**
   * Determine goal status based on progress
   */
  private determineGoalStatus(
    progressPercent: number,
    masteryThreshold: number
  ): 'not-started' | 'in-progress' | 'approaching-mastery' | 'mastered' {
    if (progressPercent >= 100) return 'mastered';
    if (progressPercent >= masteryThreshold) return 'approaching-mastery';
    if (progressPercent > 0) return 'in-progress';
    return 'not-started';
  }
}

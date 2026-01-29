/**
 * Research Summarizer
 *
 * Generates weekly summaries of family project research progress.
 */

import type {
  FamilyProject,
  ResearchTopic,
  TopicStatus,
  TopicUpdate,
  WeeklyResearchSummary,
} from '../types.js';
import type { WeeklySummaryStore } from '../stores/project-store.js';

// ============================================================================
// Configuration
// ============================================================================

export interface ResearchSummarizerConfig {
  includeHighlights: boolean;
  includeNextSteps: boolean;
  maxHighlights: number;
  maxNextSteps: number;
}

// ============================================================================
// Research Summarizer
// ============================================================================

export class ResearchSummarizer {
  private readonly summaryStore: WeeklySummaryStore;
  private readonly config: ResearchSummarizerConfig;

  constructor(
    summaryStore: WeeklySummaryStore,
    config?: Partial<ResearchSummarizerConfig>
  ) {
    this.summaryStore = summaryStore;
    this.config = {
      includeHighlights: config?.includeHighlights ?? true,
      includeNextSteps: config?.includeNextSteps ?? true,
      maxHighlights: config?.maxHighlights || 5,
      maxNextSteps: config?.maxNextSteps || 5,
    };
  }

  /**
   * Generate a weekly summary for a project
   */
  async generateSummary(
    project: FamilyProject,
    previousSnapshot?: TopicSnapshot[]
  ): Promise<WeeklyResearchSummary> {
    const weekStartDate = this.getWeekStart(new Date()).getTime();

    // Check if summary already exists for this week
    const existing = await this.summaryStore.getSummaryByWeek(project.id, weekStartDate);
    if (existing) {
      return existing;
    }

    // Calculate topic updates
    const topicUpdates = this.calculateTopicUpdates(project.topics, previousSnapshot);

    // Generate highlights
    const highlights = this.config.includeHighlights
      ? this.generateHighlights(project, topicUpdates)
      : undefined;

    // Generate next steps
    const nextSteps = this.config.includeNextSteps
      ? this.generateNextSteps(project, topicUpdates)
      : undefined;

    // Create summary
    const summary = await this.summaryStore.createSummary({
      projectId: project.id,
      weekStartDate,
      topicUpdates,
      highlights,
      nextSteps,
      generatedAt: Date.now(),
    });

    return summary;
  }

  /**
   * Get summary for a specific week
   */
  async getSummary(projectId: string, weekStartDate?: Date): Promise<WeeklyResearchSummary | null> {
    if (weekStartDate) {
      const normalizedDate = this.getWeekStart(weekStartDate).getTime();
      return this.summaryStore.getSummaryByWeek(projectId, normalizedDate);
    }
    return this.summaryStore.getLatestSummary(projectId);
  }

  /**
   * List summaries for a project
   */
  async listSummaries(projectId: string, limit?: number): Promise<WeeklyResearchSummary[]> {
    return this.summaryStore.listSummaries(projectId, limit);
  }

  /**
   * Create a snapshot of current topic state (for comparison later)
   */
  createSnapshot(project: FamilyProject): TopicSnapshot[] {
    return project.topics.map(topic => ({
      id: topic.id,
      title: topic.title,
      status: topic.status,
      notesCount: topic.notes.length,
      linksCount: topic.links.length,
      updatedAt: topic.updatedAt,
    }));
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private calculateTopicUpdates(
    currentTopics: ResearchTopic[],
    previousSnapshot?: TopicSnapshot[]
  ): TopicUpdate[] {
    const updates: TopicUpdate[] = [];
    const previousMap = new Map(previousSnapshot?.map(s => [s.id, s]) || []);

    for (const topic of currentTopics) {
      const previous = previousMap.get(topic.id);

      // Calculate changes
      const notesAdded = previous
        ? topic.notes.length - previous.notesCount
        : topic.notes.length;

      const linksAdded = previous
        ? topic.links.length - previous.linksCount
        : topic.links.length;

      // Determine status change
      let statusChange: TopicUpdate['statusChange'] | undefined;
      if (previous && previous.status !== topic.status) {
        statusChange = {
          from: previous.status,
          to: topic.status,
        };
      }

      // Generate summary for this topic
      const summary = this.generateTopicSummary(topic, notesAdded, linksAdded, statusChange);

      updates.push({
        topicId: topic.id,
        topicTitle: topic.title,
        notesAdded: Math.max(0, notesAdded),
        linksAdded: Math.max(0, linksAdded),
        statusChange,
        summary,
      });
    }

    return updates;
  }

  private generateTopicSummary(
    topic: ResearchTopic,
    notesAdded: number,
    linksAdded: number,
    statusChange?: { from: TopicStatus; to: TopicStatus }
  ): string {
    const parts: string[] = [];

    // Status change
    if (statusChange) {
      parts.push(`Status changed from ${this.formatStatus(statusChange.from)} to ${this.formatStatus(statusChange.to)}.`);
    }

    // Activity summary
    if (notesAdded > 0 || linksAdded > 0) {
      const activities: string[] = [];
      if (notesAdded > 0) {
        activities.push(`${notesAdded} new note${notesAdded > 1 ? 's' : ''}`);
      }
      if (linksAdded > 0) {
        activities.push(`${linksAdded} new link${linksAdded > 1 ? 's' : ''}`);
      }
      parts.push(`Added ${activities.join(' and ')}.`);
    }

    // Recent note preview
    if (topic.notes.length > 0) {
      const recentNote = topic.notes[topic.notes.length - 1];
      const preview = recentNote.content.slice(0, 100);
      const truncated = preview.length < recentNote.content.length;
      parts.push(`Latest note: "${preview}${truncated ? '...' : ''}"`);
    }

    if (parts.length === 0) {
      parts.push('No changes this week.');
    }

    return parts.join(' ');
  }

  private generateHighlights(
    project: FamilyProject,
    updates: TopicUpdate[]
  ): string[] | undefined {
    const highlights: string[] = [];

    // Highlight completed topics
    const completedTopics = updates.filter(
      u => u.statusChange?.to === 'completed'
    );
    if (completedTopics.length > 0) {
      highlights.push(
        `Completed ${completedTopics.length} topic${completedTopics.length > 1 ? 's' : ''}: ` +
        completedTopics.map(t => t.topicTitle).join(', ')
      );
    }

    // Highlight topics with most activity
    const activeTopics = updates
      .filter(u => u.notesAdded > 0 || u.linksAdded > 0)
      .sort((a, b) => (b.notesAdded + b.linksAdded) - (a.notesAdded + a.linksAdded))
      .slice(0, 3);

    for (const topic of activeTopics) {
      const totalActivity = topic.notesAdded + topic.linksAdded;
      highlights.push(
        `"${topic.topicTitle}" had ${totalActivity} new contribution${totalActivity > 1 ? 's' : ''}`
      );
    }

    // Highlight new topics started
    const newTopics = updates.filter(
      u => u.statusChange?.to === 'in_progress' && u.statusChange.from === 'not_started'
    );
    if (newTopics.length > 0) {
      highlights.push(
        `Started researching: ${newTopics.map(t => t.topicTitle).join(', ')}`
      );
    }

    return highlights.length > 0 ? highlights.slice(0, this.config.maxHighlights) : undefined;
  }

  private generateNextSteps(
    project: FamilyProject,
    updates: TopicUpdate[]
  ): string[] | undefined {
    const nextSteps: string[] = [];

    // Find topics not yet started
    const notStartedTopics = project.topics.filter(t => t.status === 'not_started');
    if (notStartedTopics.length > 0) {
      nextSteps.push(
        `Start research on: ${notStartedTopics.slice(0, 3).map(t => t.title).join(', ')}`
      );
    }

    // Find topics in progress that need attention
    const inProgressTopics = project.topics.filter(t => t.status === 'in_progress');
    for (const topic of inProgressTopics) {
      if (topic.notes.length < 3) {
        nextSteps.push(`Add more research notes to "${topic.title}"`);
      }
      if (topic.links.length === 0) {
        nextSteps.push(`Find reference links for "${topic.title}"`);
      }
    }

    // Suggest review if many topics completed
    const completedCount = project.topics.filter(t => t.status === 'completed').length;
    if (completedCount >= 3 && completedCount < project.topics.length) {
      nextSteps.push('Review completed topics and consolidate findings');
    }

    // Check if project deadline is approaching
    if (project.deadline) {
      const daysUntilDeadline = Math.ceil(
        (project.deadline - Date.now()) / (24 * 60 * 60 * 1000)
      );
      if (daysUntilDeadline <= 7 && daysUntilDeadline > 0) {
        nextSteps.push(`Project deadline in ${daysUntilDeadline} days - prioritize remaining topics`);
      }
    }

    return nextSteps.length > 0 ? nextSteps.slice(0, this.config.maxNextSteps) : undefined;
  }

  private formatStatus(status: TopicStatus): string {
    switch (status) {
      case 'not_started':
        return 'not started';
      case 'in_progress':
        return 'in progress';
      case 'completed':
        return 'completed';
    }
  }

  private getWeekStart(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    const diff = date.getDate() - day;
    result.setDate(diff);
    result.setHours(0, 0, 0, 0);
    return result;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface TopicSnapshot {
  id: string;
  title: string;
  status: TopicStatus;
  notesCount: number;
  linksCount: number;
  updatedAt: number;
}

// ============================================================================
// Factory Function
// ============================================================================

export function createResearchSummarizer(
  summaryStore: WeeklySummaryStore,
  config?: Partial<ResearchSummarizerConfig>
): ResearchSummarizer {
  return new ResearchSummarizer(summaryStore, config);
}

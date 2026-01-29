/**
 * Family Project Service
 *
 * Service for managing family projects and research topics.
 */

import type {
  FamilyProject,
  ProjectMember,
  ProjectQueryOptions,
  ProjectStatus,
  ResearchTopic,
  TopicNote,
  TopicStatus,
  WeeklyResearchSummary,
} from '../types.js';
import type { ProjectStore, WeeklySummaryStore } from '../stores/project-store.js';
import {
  ResearchSummarizer,
  type ResearchSummarizerConfig,
  type TopicSnapshot,
} from './research-summarizer.js';

// ============================================================================
// Service Configuration
// ============================================================================

export interface FamilyProjectServiceConfig {
  maxTopicsPerProject: number;
  maxNotesPerTopic: number;
  enableWeeklySummaries: boolean;
  researchSummarizer?: Partial<ResearchSummarizerConfig>;
}

// ============================================================================
// Family Project Service
// ============================================================================

export class FamilyProjectService {
  private readonly projectStore: ProjectStore;
  private readonly summaryStore: WeeklySummaryStore;
  private readonly researchSummarizer: ResearchSummarizer;
  private readonly config: FamilyProjectServiceConfig;

  // Store snapshots for summary generation
  private readonly projectSnapshots = new Map<string, TopicSnapshot[]>();

  constructor(
    projectStore: ProjectStore,
    summaryStore: WeeklySummaryStore,
    config?: Partial<FamilyProjectServiceConfig>
  ) {
    this.projectStore = projectStore;
    this.summaryStore = summaryStore;
    this.config = {
      maxTopicsPerProject: config?.maxTopicsPerProject || 20,
      maxNotesPerTopic: config?.maxNotesPerTopic || 100,
      enableWeeklySummaries: config?.enableWeeklySummaries ?? true,
      researchSummarizer: config?.researchSummarizer,
    };
    this.researchSummarizer = new ResearchSummarizer(
      summaryStore,
      config?.researchSummarizer
    );
  }

  // ============================================================================
  // Project Management
  // ============================================================================

  /**
   * Create a new project
   */
  async createProject(
    project: Omit<FamilyProject, 'id' | 'createdAt' | 'updatedAt' | 'topics' | 'members'>
  ): Promise<FamilyProject> {
    const created = await this.projectStore.createProject({
      ...project,
      topics: [],
      members: [
        {
          userId: project.createdBy,
          role: 'owner',
          joinedAt: Date.now(),
        },
      ],
    });

    // Initialize snapshot for summary tracking
    if (this.config.enableWeeklySummaries) {
      this.projectSnapshots.set(created.id, []);
    }

    return created;
  }

  /**
   * Get a project
   */
  async getProject(id: string): Promise<FamilyProject | null> {
    return this.projectStore.getProject(id);
  }

  /**
   * Update a project
   */
  async updateProject(
    id: string,
    updates: Partial<Pick<FamilyProject, 'name' | 'description' | 'deadline'>>
  ): Promise<FamilyProject | null> {
    return this.projectStore.updateProject(id, updates);
  }

  /**
   * Delete a project
   */
  async deleteProject(id: string): Promise<boolean> {
    this.projectSnapshots.delete(id);
    return this.projectStore.deleteProject(id);
  }

  /**
   * List projects for a family
   */
  async listProjects(options: ProjectQueryOptions): Promise<FamilyProject[]> {
    return this.projectStore.listProjects(options);
  }

  /**
   * Get active projects
   */
  async getActiveProjects(familyGroupId: string): Promise<FamilyProject[]> {
    return this.projectStore.getActiveProjects(familyGroupId);
  }

  /**
   * Update project status
   */
  async updateStatus(id: string, status: ProjectStatus): Promise<FamilyProject | null> {
    // Generate summary before archiving
    if (status === 'archived' && this.config.enableWeeklySummaries) {
      const project = await this.projectStore.getProject(id);
      if (project) {
        await this.generateWeeklySummary(id);
      }
    }

    return this.projectStore.updateStatus(id, status);
  }

  // ============================================================================
  // Topic Management
  // ============================================================================

  /**
   * Add a topic to a project
   */
  async addTopic(
    projectId: string,
    topic: Pick<ResearchTopic, 'title' | 'description' | 'assignedTo'>
  ): Promise<FamilyProject | null> {
    const project = await this.projectStore.getProject(projectId);
    if (!project) return null;

    if (project.topics.length >= this.config.maxTopicsPerProject) {
      throw new Error(`Maximum topics per project (${this.config.maxTopicsPerProject}) reached`);
    }

    return this.projectStore.addTopic(projectId, {
      ...topic,
      status: 'not_started',
      notes: [],
      links: [],
    });
  }

  /**
   * Update a topic
   */
  async updateTopic(
    projectId: string,
    topicId: string,
    updates: Partial<Pick<ResearchTopic, 'title' | 'description' | 'assignedTo' | 'status'>>
  ): Promise<FamilyProject | null> {
    return this.projectStore.updateTopic(projectId, topicId, updates);
  }

  /**
   * Remove a topic
   */
  async removeTopic(projectId: string, topicId: string): Promise<FamilyProject | null> {
    return this.projectStore.removeTopic(projectId, topicId);
  }

  /**
   * Update topic status
   */
  async updateTopicStatus(
    projectId: string,
    topicId: string,
    status: TopicStatus
  ): Promise<FamilyProject | null> {
    return this.projectStore.updateTopic(projectId, topicId, { status });
  }

  /**
   * Assign a topic to a member
   */
  async assignTopic(
    projectId: string,
    topicId: string,
    userId: string
  ): Promise<FamilyProject | null> {
    return this.projectStore.updateTopic(projectId, topicId, { assignedTo: userId });
  }

  // ============================================================================
  // Note Management
  // ============================================================================

  /**
   * Add a note to a topic
   */
  async addNote(
    projectId: string,
    topicId: string,
    note: Pick<TopicNote, 'authorId' | 'content' | 'sources'>
  ): Promise<FamilyProject | null> {
    const project = await this.projectStore.getProject(projectId);
    if (!project) return null;

    const topic = project.topics.find(t => t.id === topicId);
    if (!topic) return null;

    if (topic.notes.length >= this.config.maxNotesPerTopic) {
      throw new Error(`Maximum notes per topic (${this.config.maxNotesPerTopic}) reached`);
    }

    return this.projectStore.addNote(projectId, topicId, note);
  }

  /**
   * Add a link to a topic
   */
  async addLink(projectId: string, topicId: string, link: string): Promise<FamilyProject | null> {
    // Validate URL
    try {
      new URL(link);
    } catch {
      throw new Error('Invalid URL');
    }

    return this.projectStore.addLink(projectId, topicId, link);
  }

  // ============================================================================
  // Member Management
  // ============================================================================

  /**
   * Add a member to a project
   */
  async addMember(
    projectId: string,
    userId: string,
    role: ProjectMember['role'] = 'contributor'
  ): Promise<FamilyProject | null> {
    return this.projectStore.addMember(projectId, { userId, role });
  }

  /**
   * Remove a member from a project
   */
  async removeMember(projectId: string, userId: string): Promise<FamilyProject | null> {
    return this.projectStore.removeMember(projectId, userId);
  }

  /**
   * Update member role
   */
  async updateMemberRole(
    projectId: string,
    userId: string,
    role: ProjectMember['role']
  ): Promise<FamilyProject | null> {
    return this.projectStore.updateMemberRole(projectId, userId, role);
  }

  /**
   * Check if user is a member of a project
   */
  async isMember(projectId: string, userId: string): Promise<boolean> {
    const project = await this.projectStore.getProject(projectId);
    if (!project) return false;
    return project.members.some(m => m.userId === userId);
  }

  /**
   * Get user's role in a project
   */
  async getMemberRole(projectId: string, userId: string): Promise<ProjectMember['role'] | null> {
    const project = await this.projectStore.getProject(projectId);
    if (!project) return null;
    const member = project.members.find(m => m.userId === userId);
    return member?.role ?? null;
  }

  // ============================================================================
  // Weekly Summaries
  // ============================================================================

  /**
   * Generate weekly summary for a project
   */
  async generateWeeklySummary(projectId: string): Promise<WeeklyResearchSummary | null> {
    if (!this.config.enableWeeklySummaries) return null;

    const project = await this.projectStore.getProject(projectId);
    if (!project) return null;

    const previousSnapshot = this.projectSnapshots.get(projectId);
    const summary = await this.researchSummarizer.generateSummary(project, previousSnapshot);

    // Update snapshot for next summary
    this.projectSnapshots.set(projectId, this.researchSummarizer.createSnapshot(project));

    return summary;
  }

  /**
   * Get latest summary for a project
   */
  async getLatestSummary(projectId: string): Promise<WeeklyResearchSummary | null> {
    return this.researchSummarizer.getSummary(projectId);
  }

  /**
   * Get summary for a specific week
   */
  async getSummaryByWeek(projectId: string, weekStartDate: Date): Promise<WeeklyResearchSummary | null> {
    return this.researchSummarizer.getSummary(projectId, weekStartDate);
  }

  /**
   * List summaries for a project
   */
  async listSummaries(projectId: string, limit?: number): Promise<WeeklyResearchSummary[]> {
    return this.researchSummarizer.listSummaries(projectId, limit);
  }

  // ============================================================================
  // Progress Tracking
  // ============================================================================

  /**
   * Get project progress statistics
   */
  async getProjectProgress(projectId: string): Promise<ProjectProgress | null> {
    const project = await this.projectStore.getProject(projectId);
    if (!project) return null;

    const totalTopics = project.topics.length;
    const completedTopics = project.topics.filter(t => t.status === 'completed').length;
    const inProgressTopics = project.topics.filter(t => t.status === 'in_progress').length;
    const notStartedTopics = project.topics.filter(t => t.status === 'not_started').length;

    const totalNotes = project.topics.reduce((sum, t) => sum + t.notes.length, 0);
    const totalLinks = project.topics.reduce((sum, t) => sum + t.links.length, 0);

    let daysRemaining: number | undefined;
    if (project.deadline) {
      daysRemaining = Math.max(
        0,
        Math.ceil((project.deadline - Date.now()) / (24 * 60 * 60 * 1000))
      );
    }

    return {
      projectId: project.id,
      projectName: project.name,
      status: project.status,
      totalTopics,
      completedTopics,
      inProgressTopics,
      notStartedTopics,
      completionPercentage: totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0,
      totalNotes,
      totalLinks,
      totalContributors: project.members.length,
      daysRemaining,
      lastUpdated: project.updatedAt,
    };
  }

  /**
   * Get topics assigned to a user
   */
  async getUserTopics(projectId: string, userId: string): Promise<ResearchTopic[]> {
    const project = await this.projectStore.getProject(projectId);
    if (!project) return [];
    return project.topics.filter(t => t.assignedTo === userId);
  }
}

// ============================================================================
// Types
// ============================================================================

export interface ProjectProgress {
  projectId: string;
  projectName: string;
  status: ProjectStatus;
  totalTopics: number;
  completedTopics: number;
  inProgressTopics: number;
  notStartedTopics: number;
  completionPercentage: number;
  totalNotes: number;
  totalLinks: number;
  totalContributors: number;
  daysRemaining?: number;
  lastUpdated: number;
}

// ============================================================================
// Exports
// ============================================================================

export {
  ResearchSummarizer,
  type ResearchSummarizerConfig,
  type TopicSnapshot,
  createResearchSummarizer,
} from './research-summarizer.js';

export function createFamilyProjectService(
  projectStore: ProjectStore,
  summaryStore: WeeklySummaryStore,
  config?: Partial<FamilyProjectServiceConfig>
): FamilyProjectService {
  return new FamilyProjectService(projectStore, summaryStore, config);
}

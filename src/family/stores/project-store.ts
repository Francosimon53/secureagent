/**
 * Project Store
 *
 * Persistence layer for family projects and research summaries.
 */

import { randomUUID } from 'crypto';
import type {
  DatabaseAdapter,
  FamilyProject,
  ProjectMember,
  ProjectQueryOptions,
  ProjectStatus,
  ResearchTopic,
  TopicNote,
  TopicStatus,
  TopicUpdate,
  WeeklyResearchSummary,
} from '../types.js';

// ============================================================================
// Project Store Interface
// ============================================================================

export interface ProjectStore {
  initialize(): Promise<void>;

  // Project CRUD
  createProject(project: Omit<FamilyProject, 'id' | 'createdAt' | 'updatedAt'>): Promise<FamilyProject>;
  getProject(id: string): Promise<FamilyProject | null>;
  updateProject(id: string, updates: Partial<Omit<FamilyProject, 'id' | 'createdAt'>>): Promise<FamilyProject | null>;
  deleteProject(id: string): Promise<boolean>;

  // Query
  listProjects(options: ProjectQueryOptions): Promise<FamilyProject[]>;
  getActiveProjects(familyGroupId: string): Promise<FamilyProject[]>;

  // Topic Management
  addTopic(projectId: string, topic: Omit<ResearchTopic, 'id' | 'updatedAt'>): Promise<FamilyProject | null>;
  updateTopic(projectId: string, topicId: string, updates: Partial<Omit<ResearchTopic, 'id'>>): Promise<FamilyProject | null>;
  removeTopic(projectId: string, topicId: string): Promise<FamilyProject | null>;

  // Topic Notes
  addNote(projectId: string, topicId: string, note: Omit<TopicNote, 'id' | 'createdAt'>): Promise<FamilyProject | null>;
  addLink(projectId: string, topicId: string, link: string): Promise<FamilyProject | null>;

  // Member Management
  addMember(projectId: string, member: Omit<ProjectMember, 'joinedAt'>): Promise<FamilyProject | null>;
  removeMember(projectId: string, userId: string): Promise<FamilyProject | null>;
  updateMemberRole(projectId: string, userId: string, role: ProjectMember['role']): Promise<FamilyProject | null>;

  // Status
  updateStatus(projectId: string, status: ProjectStatus): Promise<FamilyProject | null>;
}

// ============================================================================
// Weekly Summary Store Interface
// ============================================================================

export interface WeeklySummaryStore {
  initialize(): Promise<void>;

  // CRUD
  createSummary(summary: Omit<WeeklyResearchSummary, 'id'>): Promise<WeeklyResearchSummary>;
  getSummary(id: string): Promise<WeeklyResearchSummary | null>;
  deleteSummary(id: string): Promise<boolean>;

  // Query
  listSummaries(projectId: string, limit?: number): Promise<WeeklyResearchSummary[]>;
  getSummaryByWeek(projectId: string, weekStartDate: number): Promise<WeeklyResearchSummary | null>;
  getLatestSummary(projectId: string): Promise<WeeklyResearchSummary | null>;
}

// ============================================================================
// Database Row Types
// ============================================================================

interface ProjectRow {
  id: string;
  family_group_id: string;
  created_by: string;
  name: string;
  description: string | null;
  status: string;
  topics: string;
  members: string;
  deadline: number | null;
  created_at: number;
  updated_at: number;
}

interface SummaryRow {
  id: string;
  project_id: string;
  week_start_date: number;
  topic_updates: string;
  highlights: string | null;
  next_steps: string | null;
  generated_at: number;
}

// ============================================================================
// Database Project Store
// ============================================================================

export class DatabaseProjectStore implements ProjectStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS family_projects (
        id TEXT PRIMARY KEY,
        family_group_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'planning',
        topics TEXT NOT NULL,
        members TEXT NOT NULL,
        deadline INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_projects_family ON family_projects(family_group_id, status)
    `);
  }

  async createProject(project: Omit<FamilyProject, 'id' | 'createdAt' | 'updatedAt'>): Promise<FamilyProject> {
    const now = Date.now();
    const id = randomUUID();

    const newProject: FamilyProject = {
      ...project,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO family_projects (
        id, family_group_id, created_by, name, description, status, topics, members, deadline, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newProject.id,
        newProject.familyGroupId,
        newProject.createdBy,
        newProject.name,
        newProject.description ?? null,
        newProject.status,
        JSON.stringify(newProject.topics),
        JSON.stringify(newProject.members),
        newProject.deadline ?? null,
        newProject.createdAt,
        newProject.updatedAt,
      ]
    );

    return newProject;
  }

  async getProject(id: string): Promise<FamilyProject | null> {
    const { rows } = await this.db.query<ProjectRow>(
      'SELECT * FROM family_projects WHERE id = ?',
      [id]
    );

    if (rows.length === 0) return null;
    return this.rowToProject(rows[0]);
  }

  async updateProject(id: string, updates: Partial<Omit<FamilyProject, 'id' | 'createdAt'>>): Promise<FamilyProject | null> {
    const existing = await this.getProject(id);
    if (!existing) return null;

    const updated: FamilyProject = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.db.execute(
      `UPDATE family_projects SET
        name = ?, description = ?, status = ?, topics = ?, members = ?, deadline = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.name,
        updated.description ?? null,
        updated.status,
        JSON.stringify(updated.topics),
        JSON.stringify(updated.members),
        updated.deadline ?? null,
        updated.updatedAt,
        id,
      ]
    );

    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM family_projects WHERE id = ?', [id]);
    return result.changes > 0;
  }

  async listProjects(options: ProjectQueryOptions): Promise<FamilyProject[]> {
    let sql = 'SELECT * FROM family_projects WHERE family_group_id = ?';
    const params: unknown[] = [options.familyGroupId];

    if (options.status) {
      sql += ' AND status = ?';
      params.push(options.status);
    }

    if (options.createdBy) {
      sql += ' AND created_by = ?';
      params.push(options.createdBy);
    }

    const orderDir = options.orderDirection || 'desc';
    sql += ` ORDER BY created_at ${orderDir}`;

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const { rows } = await this.db.query<ProjectRow>(sql, params);
    return rows.map(row => this.rowToProject(row));
  }

  async getActiveProjects(familyGroupId: string): Promise<FamilyProject[]> {
    return this.listProjects({
      familyGroupId,
      status: 'active',
    });
  }

  async addTopic(projectId: string, topic: Omit<ResearchTopic, 'id' | 'updatedAt'>): Promise<FamilyProject | null> {
    const project = await this.getProject(projectId);
    if (!project) return null;

    const newTopic: ResearchTopic = {
      ...topic,
      id: randomUUID(),
      updatedAt: Date.now(),
    };

    project.topics.push(newTopic);
    return this.updateProject(projectId, { topics: project.topics });
  }

  async updateTopic(projectId: string, topicId: string, updates: Partial<Omit<ResearchTopic, 'id'>>): Promise<FamilyProject | null> {
    const project = await this.getProject(projectId);
    if (!project) return null;

    const topicIndex = project.topics.findIndex(t => t.id === topicId);
    if (topicIndex === -1) return null;

    project.topics[topicIndex] = {
      ...project.topics[topicIndex],
      ...updates,
      updatedAt: Date.now(),
    };

    return this.updateProject(projectId, { topics: project.topics });
  }

  async removeTopic(projectId: string, topicId: string): Promise<FamilyProject | null> {
    const project = await this.getProject(projectId);
    if (!project) return null;

    project.topics = project.topics.filter(t => t.id !== topicId);
    return this.updateProject(projectId, { topics: project.topics });
  }

  async addNote(projectId: string, topicId: string, note: Omit<TopicNote, 'id' | 'createdAt'>): Promise<FamilyProject | null> {
    const project = await this.getProject(projectId);
    if (!project) return null;

    const topicIndex = project.topics.findIndex(t => t.id === topicId);
    if (topicIndex === -1) return null;

    const newNote: TopicNote = {
      ...note,
      id: randomUUID(),
      createdAt: Date.now(),
    };

    project.topics[topicIndex].notes.push(newNote);
    project.topics[topicIndex].updatedAt = Date.now();

    return this.updateProject(projectId, { topics: project.topics });
  }

  async addLink(projectId: string, topicId: string, link: string): Promise<FamilyProject | null> {
    const project = await this.getProject(projectId);
    if (!project) return null;

    const topicIndex = project.topics.findIndex(t => t.id === topicId);
    if (topicIndex === -1) return null;

    if (!project.topics[topicIndex].links.includes(link)) {
      project.topics[topicIndex].links.push(link);
      project.topics[topicIndex].updatedAt = Date.now();
    }

    return this.updateProject(projectId, { topics: project.topics });
  }

  async addMember(projectId: string, member: Omit<ProjectMember, 'joinedAt'>): Promise<FamilyProject | null> {
    const project = await this.getProject(projectId);
    if (!project) return null;

    if (project.members.some(m => m.userId === member.userId)) {
      return project;
    }

    const newMember: ProjectMember = {
      ...member,
      joinedAt: Date.now(),
    };

    project.members.push(newMember);
    return this.updateProject(projectId, { members: project.members });
  }

  async removeMember(projectId: string, userId: string): Promise<FamilyProject | null> {
    const project = await this.getProject(projectId);
    if (!project) return null;

    project.members = project.members.filter(m => m.userId !== userId);
    return this.updateProject(projectId, { members: project.members });
  }

  async updateMemberRole(projectId: string, userId: string, role: ProjectMember['role']): Promise<FamilyProject | null> {
    const project = await this.getProject(projectId);
    if (!project) return null;

    const memberIndex = project.members.findIndex(m => m.userId === userId);
    if (memberIndex === -1) return null;

    project.members[memberIndex].role = role;
    return this.updateProject(projectId, { members: project.members });
  }

  async updateStatus(projectId: string, status: ProjectStatus): Promise<FamilyProject | null> {
    return this.updateProject(projectId, { status });
  }

  private rowToProject(row: ProjectRow): FamilyProject {
    return {
      id: row.id,
      familyGroupId: row.family_group_id,
      createdBy: row.created_by,
      name: row.name,
      description: row.description ?? undefined,
      status: row.status as ProjectStatus,
      topics: JSON.parse(row.topics) as ResearchTopic[],
      members: JSON.parse(row.members) as ProjectMember[],
      deadline: row.deadline ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// ============================================================================
// Database Weekly Summary Store
// ============================================================================

export class DatabaseWeeklySummaryStore implements WeeklySummaryStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS weekly_research_summaries (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        week_start_date INTEGER NOT NULL,
        topic_updates TEXT NOT NULL,
        highlights TEXT,
        next_steps TEXT,
        generated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_summaries_project ON weekly_research_summaries(project_id, week_start_date)
    `);
  }

  async createSummary(summary: Omit<WeeklyResearchSummary, 'id'>): Promise<WeeklyResearchSummary> {
    const id = randomUUID();

    const newSummary: WeeklyResearchSummary = {
      ...summary,
      id,
    };

    await this.db.execute(
      `INSERT INTO weekly_research_summaries (
        id, project_id, week_start_date, topic_updates, highlights, next_steps, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        newSummary.id,
        newSummary.projectId,
        newSummary.weekStartDate,
        JSON.stringify(newSummary.topicUpdates),
        newSummary.highlights ? JSON.stringify(newSummary.highlights) : null,
        newSummary.nextSteps ? JSON.stringify(newSummary.nextSteps) : null,
        newSummary.generatedAt,
      ]
    );

    return newSummary;
  }

  async getSummary(id: string): Promise<WeeklyResearchSummary | null> {
    const { rows } = await this.db.query<SummaryRow>(
      'SELECT * FROM weekly_research_summaries WHERE id = ?',
      [id]
    );

    if (rows.length === 0) return null;
    return this.rowToSummary(rows[0]);
  }

  async deleteSummary(id: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM weekly_research_summaries WHERE id = ?', [id]);
    return result.changes > 0;
  }

  async listSummaries(projectId: string, limit = 10): Promise<WeeklyResearchSummary[]> {
    const { rows } = await this.db.query<SummaryRow>(
      'SELECT * FROM weekly_research_summaries WHERE project_id = ? ORDER BY week_start_date DESC LIMIT ?',
      [projectId, limit]
    );

    return rows.map(row => this.rowToSummary(row));
  }

  async getSummaryByWeek(projectId: string, weekStartDate: number): Promise<WeeklyResearchSummary | null> {
    const { rows } = await this.db.query<SummaryRow>(
      'SELECT * FROM weekly_research_summaries WHERE project_id = ? AND week_start_date = ?',
      [projectId, weekStartDate]
    );

    if (rows.length === 0) return null;
    return this.rowToSummary(rows[0]);
  }

  async getLatestSummary(projectId: string): Promise<WeeklyResearchSummary | null> {
    const { rows } = await this.db.query<SummaryRow>(
      'SELECT * FROM weekly_research_summaries WHERE project_id = ? ORDER BY week_start_date DESC LIMIT 1',
      [projectId]
    );

    if (rows.length === 0) return null;
    return this.rowToSummary(rows[0]);
  }

  private rowToSummary(row: SummaryRow): WeeklyResearchSummary {
    return {
      id: row.id,
      projectId: row.project_id,
      weekStartDate: row.week_start_date,
      topicUpdates: JSON.parse(row.topic_updates) as TopicUpdate[],
      highlights: row.highlights ? (JSON.parse(row.highlights) as string[]) : undefined,
      nextSteps: row.next_steps ? (JSON.parse(row.next_steps) as string[]) : undefined,
      generatedAt: row.generated_at,
    };
  }
}

// ============================================================================
// In-Memory Implementations
// ============================================================================

export class InMemoryProjectStore implements ProjectStore {
  private projects = new Map<string, FamilyProject>();

  async initialize(): Promise<void> {}

  async createProject(project: Omit<FamilyProject, 'id' | 'createdAt' | 'updatedAt'>): Promise<FamilyProject> {
    const now = Date.now();
    const id = randomUUID();

    const newProject: FamilyProject = {
      ...project,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.projects.set(id, newProject);
    return newProject;
  }

  async getProject(id: string): Promise<FamilyProject | null> {
    return this.projects.get(id) ?? null;
  }

  async updateProject(id: string, updates: Partial<Omit<FamilyProject, 'id' | 'createdAt'>>): Promise<FamilyProject | null> {
    const existing = this.projects.get(id);
    if (!existing) return null;

    const updated: FamilyProject = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.projects.set(id, updated);
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }

  async listProjects(options: ProjectQueryOptions): Promise<FamilyProject[]> {
    let projects = Array.from(this.projects.values())
      .filter(p => p.familyGroupId === options.familyGroupId);

    if (options.status) {
      projects = projects.filter(p => p.status === options.status);
    }

    if (options.createdBy) {
      projects = projects.filter(p => p.createdBy === options.createdBy);
    }

    const orderDir = options.orderDirection || 'desc';
    projects.sort((a, b) => orderDir === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);

    if (options.offset) {
      projects = projects.slice(options.offset);
    }
    if (options.limit) {
      projects = projects.slice(0, options.limit);
    }

    return projects;
  }

  async getActiveProjects(familyGroupId: string): Promise<FamilyProject[]> {
    return this.listProjects({ familyGroupId, status: 'active' });
  }

  async addTopic(projectId: string, topic: Omit<ResearchTopic, 'id' | 'updatedAt'>): Promise<FamilyProject | null> {
    const project = this.projects.get(projectId);
    if (!project) return null;

    const newTopic: ResearchTopic = {
      ...topic,
      id: randomUUID(),
      updatedAt: Date.now(),
    };

    project.topics.push(newTopic);
    project.updatedAt = Date.now();
    return project;
  }

  async updateTopic(projectId: string, topicId: string, updates: Partial<Omit<ResearchTopic, 'id'>>): Promise<FamilyProject | null> {
    const project = this.projects.get(projectId);
    if (!project) return null;

    const topicIndex = project.topics.findIndex(t => t.id === topicId);
    if (topicIndex === -1) return null;

    project.topics[topicIndex] = {
      ...project.topics[topicIndex],
      ...updates,
      updatedAt: Date.now(),
    };
    project.updatedAt = Date.now();

    return project;
  }

  async removeTopic(projectId: string, topicId: string): Promise<FamilyProject | null> {
    const project = this.projects.get(projectId);
    if (!project) return null;

    project.topics = project.topics.filter(t => t.id !== topicId);
    project.updatedAt = Date.now();
    return project;
  }

  async addNote(projectId: string, topicId: string, note: Omit<TopicNote, 'id' | 'createdAt'>): Promise<FamilyProject | null> {
    const project = this.projects.get(projectId);
    if (!project) return null;

    const topicIndex = project.topics.findIndex(t => t.id === topicId);
    if (topicIndex === -1) return null;

    const newNote: TopicNote = {
      ...note,
      id: randomUUID(),
      createdAt: Date.now(),
    };

    project.topics[topicIndex].notes.push(newNote);
    project.topics[topicIndex].updatedAt = Date.now();
    project.updatedAt = Date.now();

    return project;
  }

  async addLink(projectId: string, topicId: string, link: string): Promise<FamilyProject | null> {
    const project = this.projects.get(projectId);
    if (!project) return null;

    const topicIndex = project.topics.findIndex(t => t.id === topicId);
    if (topicIndex === -1) return null;

    if (!project.topics[topicIndex].links.includes(link)) {
      project.topics[topicIndex].links.push(link);
      project.topics[topicIndex].updatedAt = Date.now();
      project.updatedAt = Date.now();
    }

    return project;
  }

  async addMember(projectId: string, member: Omit<ProjectMember, 'joinedAt'>): Promise<FamilyProject | null> {
    const project = this.projects.get(projectId);
    if (!project) return null;

    if (project.members.some(m => m.userId === member.userId)) {
      return project;
    }

    const newMember: ProjectMember = {
      ...member,
      joinedAt: Date.now(),
    };

    project.members.push(newMember);
    project.updatedAt = Date.now();
    return project;
  }

  async removeMember(projectId: string, userId: string): Promise<FamilyProject | null> {
    const project = this.projects.get(projectId);
    if (!project) return null;

    project.members = project.members.filter(m => m.userId !== userId);
    project.updatedAt = Date.now();
    return project;
  }

  async updateMemberRole(projectId: string, userId: string, role: ProjectMember['role']): Promise<FamilyProject | null> {
    const project = this.projects.get(projectId);
    if (!project) return null;

    const memberIndex = project.members.findIndex(m => m.userId === userId);
    if (memberIndex === -1) return null;

    project.members[memberIndex].role = role;
    project.updatedAt = Date.now();
    return project;
  }

  async updateStatus(projectId: string, status: ProjectStatus): Promise<FamilyProject | null> {
    const project = this.projects.get(projectId);
    if (!project) return null;

    project.status = status;
    project.updatedAt = Date.now();
    return project;
  }
}

export class InMemoryWeeklySummaryStore implements WeeklySummaryStore {
  private summaries = new Map<string, WeeklyResearchSummary>();

  async initialize(): Promise<void> {}

  async createSummary(summary: Omit<WeeklyResearchSummary, 'id'>): Promise<WeeklyResearchSummary> {
    const id = randomUUID();

    const newSummary: WeeklyResearchSummary = {
      ...summary,
      id,
    };

    this.summaries.set(id, newSummary);
    return newSummary;
  }

  async getSummary(id: string): Promise<WeeklyResearchSummary | null> {
    return this.summaries.get(id) ?? null;
  }

  async deleteSummary(id: string): Promise<boolean> {
    return this.summaries.delete(id);
  }

  async listSummaries(projectId: string, limit = 10): Promise<WeeklyResearchSummary[]> {
    return Array.from(this.summaries.values())
      .filter(s => s.projectId === projectId)
      .sort((a, b) => b.weekStartDate - a.weekStartDate)
      .slice(0, limit);
  }

  async getSummaryByWeek(projectId: string, weekStartDate: number): Promise<WeeklyResearchSummary | null> {
    return Array.from(this.summaries.values()).find(
      s => s.projectId === projectId && s.weekStartDate === weekStartDate
    ) ?? null;
  }

  async getLatestSummary(projectId: string): Promise<WeeklyResearchSummary | null> {
    const summaries = Array.from(this.summaries.values())
      .filter(s => s.projectId === projectId)
      .sort((a, b) => b.weekStartDate - a.weekStartDate);

    return summaries[0] ?? null;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createProjectStore(
  type: 'memory' | 'database',
  dbAdapter?: DatabaseAdapter
): ProjectStore {
  if (type === 'database' && dbAdapter) {
    return new DatabaseProjectStore(dbAdapter);
  }
  return new InMemoryProjectStore();
}

export function createWeeklySummaryStore(
  type: 'memory' | 'database',
  dbAdapter?: DatabaseAdapter
): WeeklySummaryStore {
  if (type === 'database' && dbAdapter) {
    return new DatabaseWeeklySummaryStore(dbAdapter);
  }
  return new InMemoryWeeklySummaryStore();
}

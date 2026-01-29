/**
 * Productivity Module Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Stores
  createTodoStore,
  createCacheStore,
  InMemoryTodoStore,
  InMemoryCacheStore,

  // Task Scoring
  TaskScoringService,
  classifyTask,
  generateEisenhowerSummary,

  // Types
  type TodoItem,
  type TaskScore,
  type EisenhowerClassification,
} from '../../src/productivity/index.js';

describe('Productivity Module', () => {
  describe('TodoStore', () => {
    let store: InMemoryTodoStore;

    beforeEach(async () => {
      store = createTodoStore('memory');
      await store.initialize();
    });

    it('should create and retrieve a todo item', async () => {
      const todo = await store.create({
        userId: 'user-1',
        title: 'Test task',
        status: 'pending',
        priority: 'medium',
        context: 'work',
        tags: ['test'],
      });

      expect(todo.id).toBeDefined();
      expect(todo.title).toBe('Test task');
      expect(todo.status).toBe('pending');
      expect(todo.createdAt).toBeDefined();

      const retrieved = await store.get(todo.id);
      expect(retrieved).toEqual(todo);
    });

    it('should update a todo item', async () => {
      const todo = await store.create({
        userId: 'user-1',
        title: 'Original title',
        status: 'pending',
        priority: 'low',
        context: 'personal',
        tags: [],
      });

      const updated = await store.update(todo.id, {
        title: 'Updated title',
        status: 'completed',
      });

      expect(updated?.title).toBe('Updated title');
      expect(updated?.status).toBe('completed');
      expect(updated?.completedAt).toBeDefined();
    });

    it('should list todos with filters', async () => {
      await store.create({
        userId: 'user-1',
        title: 'Task 1',
        status: 'pending',
        priority: 'high',
        context: 'work',
        tags: [],
      });

      await store.create({
        userId: 'user-1',
        title: 'Task 2',
        status: 'completed',
        priority: 'low',
        context: 'work',
        tags: [],
      });

      await store.create({
        userId: 'user-2',
        title: 'Task 3',
        status: 'pending',
        priority: 'high',
        context: 'work',
        tags: [],
      });

      const user1Todos = await store.list('user-1');
      expect(user1Todos.length).toBe(2);

      const pendingTodos = await store.list('user-1', { status: ['pending'] });
      expect(pendingTodos.length).toBe(1);
      expect(pendingTodos[0].title).toBe('Task 1');

      const highPriorityTodos = await store.list('user-1', { priority: ['high'] });
      expect(highPriorityTodos.length).toBe(1);
    });

    it('should delete a todo item', async () => {
      const todo = await store.create({
        userId: 'user-1',
        title: 'To delete',
        status: 'pending',
        priority: 'medium',
        context: 'work',
        tags: [],
      });

      const deleted = await store.delete(todo.id);
      expect(deleted).toBe(true);

      const retrieved = await store.get(todo.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('CacheStore', () => {
    let cache: InMemoryCacheStore;

    beforeEach(async () => {
      cache = createCacheStore('memory');
      await cache.initialize();
    });

    it('should set and get cached values', async () => {
      const data = { temperature: 72, condition: 'Sunny' };
      await cache.set('weather:nyc', 'weather', data, 3600);

      const cached = await cache.get<typeof data>('weather:nyc');
      expect(cached).toBeDefined();
      expect(cached?.data).toEqual(data);
      expect(cached?.provider).toBe('weather');
    });

    it('should return null for expired entries', async () => {
      await cache.set('temp-key', 'test', { value: 1 }, -1); // Already expired

      const cached = await cache.get('temp-key');
      expect(cached).toBeNull();
    });

    it('should clear expired entries', async () => {
      await cache.set('key1', 'test', { v: 1 }, 3600);
      await cache.set('key2', 'test', { v: 2 }, -1); // Expired

      const cleared = await cache.clearExpired();
      expect(cleared).toBe(1);

      const stats = await cache.getStats();
      expect(stats.totalEntries).toBe(1);
    });
  });

  describe('TaskScoringService', () => {
    let store: InMemoryTodoStore;
    let scoringService: TaskScoringService;

    beforeEach(async () => {
      store = createTodoStore('memory');
      await store.initialize();
      scoringService = new TaskScoringService(store);
    });

    it('should calculate task score', async () => {
      const todo = await store.create({
        userId: 'user-1',
        title: 'Urgent task',
        status: 'pending',
        priority: 'high',
        dueDate: Date.now() + 24 * 60 * 60 * 1000, // Due tomorrow
        context: 'work',
        tags: [],
      });

      const score = scoringService.calculateScore(todo);

      expect(score.total).toBeGreaterThan(0);
      expect(score.total).toBeLessThanOrEqual(1);
      expect(score.urgency).toBeGreaterThan(0.5); // High urgency for tomorrow
      expect(score.importance).toBe(0.8); // High priority
      expect(score.computedAt).toBeDefined();
    });

    it('should score task higher when due sooner', async () => {
      const soonTask = await store.create({
        userId: 'user-1',
        title: 'Due soon',
        status: 'pending',
        priority: 'medium',
        dueDate: Date.now() + 12 * 60 * 60 * 1000, // 12 hours
        context: 'work',
        tags: [],
      });

      const laterTask = await store.create({
        userId: 'user-1',
        title: 'Due later',
        status: 'pending',
        priority: 'medium',
        dueDate: Date.now() + 7 * 24 * 60 * 60 * 1000, // 1 week
        context: 'work',
        tags: [],
      });

      const soonScore = scoringService.calculateScore(soonTask);
      const laterScore = scoringService.calculateScore(laterTask);

      expect(soonScore.urgency).toBeGreaterThan(laterScore.urgency);
    });

    it('should get top tasks sorted by score', async () => {
      // Create tasks with different priorities and due dates
      await store.create({
        userId: 'user-1',
        title: 'Low priority, no due date',
        status: 'pending',
        priority: 'low',
        context: 'work',
        tags: [],
      });

      await store.create({
        userId: 'user-1',
        title: 'Critical, due today',
        status: 'pending',
        priority: 'critical',
        dueDate: Date.now() + 6 * 60 * 60 * 1000,
        context: 'work',
        tags: [],
      });

      await store.create({
        userId: 'user-1',
        title: 'Medium priority, due tomorrow',
        status: 'pending',
        priority: 'medium',
        dueDate: Date.now() + 24 * 60 * 60 * 1000,
        context: 'work',
        tags: [],
      });

      const topTasks = await scoringService.getTopTasks('user-1', 3);

      expect(topTasks.length).toBe(3);
      // Critical task due today should be first
      expect(topTasks[0].title).toBe('Critical, due today');
      // Low priority should be last
      expect(topTasks[2].title).toBe('Low priority, no due date');
    });
  });

  describe('Eisenhower Matrix', () => {
    it('should classify urgent and important tasks as do-first', () => {
      const task: TodoItem = {
        id: '1',
        userId: 'user-1',
        title: 'Urgent important task',
        status: 'pending',
        priority: 'critical',
        dueDate: Date.now() + 12 * 60 * 60 * 1000, // Due in 12 hours
        context: 'work',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const classification = classifyTask(task);

      expect(classification.quadrant).toBe('do-first');
      expect(classification.urgencyScore).toBeGreaterThan(0.5);
      expect(classification.importanceScore).toBeGreaterThan(0.5);
    });

    it('should classify important but not urgent as schedule', () => {
      const task: TodoItem = {
        id: '2',
        userId: 'user-1',
        title: 'Important long-term task',
        status: 'pending',
        priority: 'high',
        dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000, // Due in 30 days
        context: 'work',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const classification = classifyTask(task);

      expect(classification.quadrant).toBe('schedule');
      expect(classification.importanceScore).toBeGreaterThan(0.5);
      expect(classification.urgencyScore).toBeLessThan(0.5);
    });

    it('should generate summary for task list', () => {
      const tasks: TodoItem[] = [
        {
          id: '1',
          userId: 'user-1',
          title: 'Urgent important',
          status: 'pending',
          priority: 'critical',
          dueDate: Date.now() + 6 * 60 * 60 * 1000,
          context: 'work',
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: '2',
          userId: 'user-1',
          title: 'Important not urgent',
          status: 'pending',
          priority: 'high',
          context: 'work',
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: '3',
          userId: 'user-1',
          title: 'Low priority',
          status: 'pending',
          priority: 'low',
          context: 'personal',
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const summary = generateEisenhowerSummary(tasks);

      expect(summary.total).toBe(3);
      expect(summary.doFirst).toBeGreaterThanOrEqual(1);
      expect(summary.recommendations.length).toBeGreaterThan(0);
      expect(summary.healthScore).toBeDefined();
    });
  });
});

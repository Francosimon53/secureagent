/**
 * Collaboration Session Manager
 * Manages multi-agent collaboration sessions
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  CollaborationSession,
  SessionStatus,
  AgentMessage,
  HandoffRequest,
} from '../types.js';
import type { SessionStore } from '../stores/session-store.js';
import type { ChannelManager } from './channel-manager.js';
import type { MessageRouter } from './message-router.js';
import { createHandoffRequest, createHandoffMessage } from './protocol.js';
import { ORCHESTRATION_EVENTS } from '../events.js';

/**
 * Session creation options
 */
export interface CreateSessionOptions {
  /** Session name */
  name: string;
  /** Session objective */
  objective: string;
  /** Coordinator agent ID */
  coordinatorAgentId: string;
  /** Initial participant IDs (including coordinator) */
  participantAgentIds: string[];
  /** Initial shared context */
  sharedContext?: Record<string, unknown>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Session manager configuration
 */
export interface CollaborationSessionConfig {
  /** Maximum participants per session */
  maxParticipants: number;
  /** Maximum session duration in hours */
  maxDurationHours: number;
  /** Auto-cleanup completed sessions after hours */
  cleanupAfterHours: number;
}

/**
 * Default configuration
 */
const DEFAULT_SESSION_CONFIG: CollaborationSessionConfig = {
  maxParticipants: 10,
  maxDurationHours: 24,
  cleanupAfterHours: 48,
};

/**
 * Handoff result
 */
export interface HandoffResult {
  /** Handoff request */
  request: HandoffRequest;
  /** Whether handoff was accepted */
  accepted: boolean;
  /** Reason for rejection if not accepted */
  rejectionReason?: string;
}

/**
 * Session manager events
 */
export interface CollaborationSessionEvents {
  'session:created': (session: CollaborationSession) => void;
  'session:started': (session: CollaborationSession) => void;
  'session:paused': (sessionId: string) => void;
  'session:resumed': (sessionId: string) => void;
  'session:completed': (session: CollaborationSession, result: unknown) => void;
  'session:failed': (sessionId: string, error: string) => void;
  'handoff:requested': (request: HandoffRequest) => void;
  'handoff:accepted': (request: HandoffRequest) => void;
  'handoff:rejected': (request: HandoffRequest, reason: string) => void;
  'handoff:completed': (request: HandoffRequest) => void;
}

/**
 * Manages collaboration sessions
 */
export class CollaborationSessionManager extends EventEmitter {
  private config: CollaborationSessionConfig;
  private pendingHandoffs: Map<string, HandoffRequest> = new Map();

  constructor(
    private store: SessionStore,
    private channelManager: ChannelManager,
    private messageRouter: MessageRouter,
    config?: Partial<CollaborationSessionConfig>
  ) {
    super();
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
  }

  /**
   * Create a new collaboration session
   */
  async createSession(options: CreateSessionOptions): Promise<CollaborationSession> {
    // Validate participant count
    if (options.participantAgentIds.length > this.config.maxParticipants) {
      throw new Error(
        `Exceeded maximum participants (${this.config.maxParticipants})`
      );
    }

    // Ensure coordinator is in participants
    if (!options.participantAgentIds.includes(options.coordinatorAgentId)) {
      options.participantAgentIds.push(options.coordinatorAgentId);
    }

    // Create communication channel for the session
    const channel = await this.channelManager.createChannel({
      name: `session-${options.name}`,
      participantIds: options.participantAgentIds,
      metadata: {
        sessionName: options.name,
        objective: options.objective,
      },
    });

    const session: CollaborationSession = {
      id: randomUUID(),
      name: options.name,
      channelId: channel.id,
      participantAgentIds: options.participantAgentIds,
      coordinatorAgentId: options.coordinatorAgentId,
      objective: options.objective,
      status: 'active',
      messageHistory: [],
      sharedContext: options.sharedContext || {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.store.saveSession(session);

    this.emit('session:created', session);
    this.emit('session:started', session);
    this.emit(ORCHESTRATION_EVENTS.SESSION_STARTED, {
      sessionId: session.id,
      status: session.status,
      participantCount: session.participantAgentIds.length,
      objective: session.objective,
      timestamp: Date.now(),
      source: 'collaboration-session',
    });

    return session;
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<CollaborationSession | null> {
    return this.store.getSession(sessionId);
  }

  /**
   * Get all sessions
   */
  async getAllSessions(): Promise<CollaborationSession[]> {
    return this.store.getAllSessions();
  }

  /**
   * Get active sessions
   */
  async getActiveSessions(): Promise<CollaborationSession[]> {
    return this.store.getSessionsByStatus('active');
  }

  /**
   * Get sessions for an agent
   */
  async getSessionsForAgent(agentId: string): Promise<CollaborationSession[]> {
    return this.store.getSessionsForAgent(agentId);
  }

  /**
   * Pause a session
   */
  async pauseSession(sessionId: string): Promise<boolean> {
    const session = await this.store.getSession(sessionId);
    if (!session || session.status !== 'active') {
      return false;
    }

    await this.store.updateSessionStatus(sessionId, 'paused');

    this.emit('session:paused', sessionId);
    this.emit(ORCHESTRATION_EVENTS.SESSION_PAUSED, {
      sessionId,
      status: 'paused',
      participantCount: session.participantAgentIds.length,
      timestamp: Date.now(),
      source: 'collaboration-session',
    });

    return true;
  }

  /**
   * Resume a session
   */
  async resumeSession(sessionId: string): Promise<boolean> {
    const session = await this.store.getSession(sessionId);
    if (!session || session.status !== 'paused') {
      return false;
    }

    await this.store.updateSessionStatus(sessionId, 'active');

    this.emit('session:resumed', sessionId);
    this.emit(ORCHESTRATION_EVENTS.SESSION_RESUMED, {
      sessionId,
      status: 'active',
      participantCount: session.participantAgentIds.length,
      timestamp: Date.now(),
      source: 'collaboration-session',
    });

    return true;
  }

  /**
   * Complete a session
   */
  async completeSession(sessionId: string, result?: unknown): Promise<boolean> {
    const session = await this.store.getSession(sessionId);
    if (!session) {
      return false;
    }

    await this.store.updateSessionStatus(sessionId, 'completed', result);

    // Close the channel
    await this.channelManager.closeChannel(session.channelId);

    // Update session reference
    session.status = 'completed';
    session.result = result;
    session.completedAt = Date.now();

    this.emit('session:completed', session, result);
    this.emit(ORCHESTRATION_EVENTS.SESSION_COMPLETED, {
      sessionId,
      status: 'completed',
      participantCount: session.participantAgentIds.length,
      result,
      timestamp: Date.now(),
      source: 'collaboration-session',
    });

    return true;
  }

  /**
   * Fail a session
   */
  async failSession(sessionId: string, error: string): Promise<boolean> {
    const session = await this.store.getSession(sessionId);
    if (!session) {
      return false;
    }

    await this.store.updateSessionStatus(sessionId, 'failed', undefined, error);

    // Close the channel
    await this.channelManager.closeChannel(session.channelId);

    this.emit('session:failed', sessionId, error);
    this.emit(ORCHESTRATION_EVENTS.SESSION_FAILED, {
      sessionId,
      status: 'failed',
      participantCount: session.participantAgentIds.length,
      error,
      timestamp: Date.now(),
      source: 'collaboration-session',
    });

    return true;
  }

  /**
   * Add a message to session history
   */
  async addMessage(sessionId: string, message: AgentMessage): Promise<void> {
    await this.store.addMessageToSession(sessionId, message);
  }

  /**
   * Update shared context
   */
  async updateSharedContext(
    sessionId: string,
    context: Record<string, unknown>
  ): Promise<void> {
    await this.store.updateSharedContext(sessionId, context);
  }

  /**
   * Get shared context
   */
  async getSharedContext(sessionId: string): Promise<Record<string, unknown> | null> {
    const session = await this.store.getSession(sessionId);
    return session?.sharedContext || null;
  }

  /**
   * Add participant to session
   */
  async addParticipant(sessionId: string, agentId: string): Promise<boolean> {
    const session = await this.store.getSession(sessionId);
    if (!session || session.status !== 'active') {
      return false;
    }

    if (session.participantAgentIds.length >= this.config.maxParticipants) {
      throw new Error(`Session has reached maximum participants`);
    }

    if (session.participantAgentIds.includes(agentId)) {
      return false; // Already a participant
    }

    session.participantAgentIds.push(agentId);
    await this.store.saveSession(session);

    // Add to channel
    await this.channelManager.joinChannel(session.channelId, agentId);

    return true;
  }

  /**
   * Remove participant from session
   */
  async removeParticipant(sessionId: string, agentId: string): Promise<boolean> {
    const session = await this.store.getSession(sessionId);
    if (!session) {
      return false;
    }

    // Can't remove coordinator
    if (agentId === session.coordinatorAgentId) {
      throw new Error('Cannot remove session coordinator');
    }

    const index = session.participantAgentIds.indexOf(agentId);
    if (index === -1) {
      return false;
    }

    session.participantAgentIds.splice(index, 1);
    await this.store.saveSession(session);

    // Remove from channel
    await this.channelManager.leaveChannel(session.channelId, agentId);

    return true;
  }

  /**
   * Request a task handoff
   */
  async requestHandoff(
    sessionId: string,
    fromAgentId: string,
    toAgentId: string,
    task: string,
    reason: string,
    context: Record<string, unknown> = {}
  ): Promise<HandoffRequest> {
    const session = await this.store.getSession(sessionId);
    if (!session || session.status !== 'active') {
      throw new Error('Session not found or not active');
    }

    // Verify both agents are participants
    if (!session.participantAgentIds.includes(fromAgentId)) {
      throw new Error(`Agent '${fromAgentId}' is not a session participant`);
    }
    if (!session.participantAgentIds.includes(toAgentId)) {
      throw new Error(`Agent '${toAgentId}' is not a session participant`);
    }

    const request = createHandoffRequest(fromAgentId, toAgentId, task, reason, context);
    this.pendingHandoffs.set(request.id, request);

    // Send handoff message
    const message = createHandoffMessage(fromAgentId, toAgentId, session.channelId, request);
    await this.messageRouter.route(message);

    this.emit('handoff:requested', request);
    this.emit(ORCHESTRATION_EVENTS.HANDOFF_REQUESTED, {
      handoffId: request.id,
      fromAgentId,
      toAgentId,
      task,
      timestamp: Date.now(),
      source: 'collaboration-session',
    });

    return request;
  }

  /**
   * Accept a handoff
   */
  async acceptHandoff(handoffId: string): Promise<HandoffResult> {
    const request = this.pendingHandoffs.get(handoffId);
    if (!request) {
      throw new Error(`Handoff '${handoffId}' not found`);
    }

    request.accepted = true;
    request.completedAt = Date.now();
    this.pendingHandoffs.delete(handoffId);

    this.emit('handoff:accepted', request);
    this.emit(ORCHESTRATION_EVENTS.HANDOFF_ACCEPTED, {
      handoffId: request.id,
      fromAgentId: request.fromAgentId,
      toAgentId: request.toAgentId,
      task: request.task,
      accepted: true,
      timestamp: Date.now(),
      source: 'collaboration-session',
    });

    this.emit('handoff:completed', request);
    this.emit(ORCHESTRATION_EVENTS.HANDOFF_COMPLETED, {
      handoffId: request.id,
      fromAgentId: request.fromAgentId,
      toAgentId: request.toAgentId,
      task: request.task,
      accepted: true,
      timestamp: Date.now(),
      source: 'collaboration-session',
    });

    return { request, accepted: true };
  }

  /**
   * Reject a handoff
   */
  async rejectHandoff(handoffId: string, reason: string): Promise<HandoffResult> {
    const request = this.pendingHandoffs.get(handoffId);
    if (!request) {
      throw new Error(`Handoff '${handoffId}' not found`);
    }

    request.accepted = false;
    request.completedAt = Date.now();
    this.pendingHandoffs.delete(handoffId);

    this.emit('handoff:rejected', request, reason);
    this.emit(ORCHESTRATION_EVENTS.HANDOFF_REJECTED, {
      handoffId: request.id,
      fromAgentId: request.fromAgentId,
      toAgentId: request.toAgentId,
      task: request.task,
      accepted: false,
      reason,
      timestamp: Date.now(),
      source: 'collaboration-session',
    });

    return { request, accepted: false, rejectionReason: reason };
  }

  /**
   * Get pending handoffs for an agent
   */
  getPendingHandoffsForAgent(agentId: string): HandoffRequest[] {
    const pending: HandoffRequest[] = [];
    for (const request of this.pendingHandoffs.values()) {
      if (request.toAgentId === agentId) {
        pending.push(request);
      }
    }
    return pending;
  }

  /**
   * Get session metrics
   */
  async getSessionMetrics(sessionId: string) {
    return this.store.getSessionMetrics(sessionId);
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const session = await this.store.getSession(sessionId);
    if (!session) {
      return false;
    }

    // Delete channel
    await this.channelManager.deleteChannel(session.channelId);

    // Delete session
    return this.store.deleteSession(sessionId);
  }

  /**
   * Cleanup old completed/failed sessions
   */
  async cleanup(): Promise<number> {
    const cutoff = Date.now() - this.config.cleanupAfterHours * 60 * 60 * 1000;
    const sessions = await this.store.getAllSessions();

    let count = 0;
    for (const session of sessions) {
      if (
        (session.status === 'completed' || session.status === 'failed') &&
        session.completedAt &&
        session.completedAt < cutoff
      ) {
        await this.deleteSession(session.id);
        count++;
      }
    }

    return count;
  }
}

/**
 * Create a collaboration session manager
 */
export function createCollaborationSessionManager(
  store: SessionStore,
  channelManager: ChannelManager,
  messageRouter: MessageRouter,
  config?: Partial<CollaborationSessionConfig>
): CollaborationSessionManager {
  return new CollaborationSessionManager(store, channelManager, messageRouter, config);
}

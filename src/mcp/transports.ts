import { createInterface, Interface as ReadlineInterface } from 'readline';
import { randomBytes } from 'crypto';
import type { Readable, Writable } from 'stream';
import { getLogger, getAuditLogger } from '../observability/logger.js';
import type { MCPResponse } from './protocol.js';

const logger = getLogger().child({ module: 'MCPTransport' });
const auditLogger = getAuditLogger();

// ============================================================================
// Transport Interface
// ============================================================================

/**
 * Message handler callback
 */
export type MessageHandler = (message: unknown) => Promise<MCPResponse>;

/**
 * Base transport interface for MCP communication
 */
export interface MCPTransport {
  /** Start the transport */
  start(): Promise<void>;
  /** Stop the transport */
  stop(): Promise<void>;
  /** Send a message (notification or response) */
  send(message: unknown): Promise<void>;
  /** Set the message handler */
  onMessage(handler: MessageHandler): void;
  /** Check if transport is connected */
  isConnected(): boolean;
}

// ============================================================================
// Stdio Transport - For local MCP clients
// ============================================================================

/**
 * Configuration for stdio transport
 */
export interface StdioTransportConfig {
  /** Input stream (default: process.stdin) */
  input?: Readable;
  /** Output stream (default: process.stdout) */
  output?: Writable;
  /** Error stream for logging (default: process.stderr) */
  errorOutput?: Writable;
  /** Session ID for this connection */
  sessionId?: string;
}

/**
 * Stdio Transport for MCP
 *
 * Implements JSON-RPC over stdio with newline-delimited messages.
 * This is the standard transport for local MCP clients like Claude Desktop.
 */
export class StdioTransport implements MCPTransport {
  private readonly input: Readable;
  private readonly output: Writable;
  private readonly errorOutput: Writable;
  private readonly sessionId: string;
  private readline: ReadlineInterface | null = null;
  private messageHandler: MessageHandler | null = null;
  private connected = false;
  private buffer = '';

  constructor(config: StdioTransportConfig = {}) {
    this.input = config.input ?? process.stdin;
    this.output = config.output ?? process.stdout;
    this.errorOutput = config.errorOutput ?? process.stderr;
    this.sessionId = config.sessionId ?? randomBytes(16).toString('hex');
  }

  async start(): Promise<void> {
    if (this.connected) {
      throw new Error('Transport already started');
    }

    this.readline = createInterface({
      input: this.input,
      terminal: false,
    });

    this.readline.on('line', async (line) => {
      await this.handleLine(line);
    });

    this.readline.on('close', () => {
      this.connected = false;
      logger.info({ sessionId: this.sessionId }, 'Stdio transport closed');
    });

    this.readline.on('error', (error) => {
      logger.error({ error, sessionId: this.sessionId }, 'Stdio transport error');
    });

    this.connected = true;
    logger.info({ sessionId: this.sessionId }, 'Stdio transport started');

    auditLogger.log({
      eventId: randomBytes(16).toString('hex'),
      timestamp: Date.now(),
      eventType: 'mcp',
      severity: 'info',
      actor: {},
      resource: { type: 'transport', name: 'stdio' },
      action: 'connect',
      outcome: 'success',
      details: { sessionId: this.sessionId },
    });
  }

  async stop(): Promise<void> {
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }
    this.connected = false;
    logger.info({ sessionId: this.sessionId }, 'Stdio transport stopped');
  }

  async send(message: unknown): Promise<void> {
    if (!this.connected) {
      throw new Error('Transport not connected');
    }

    const json = JSON.stringify(message);

    return new Promise((resolve, reject) => {
      this.output.write(json + '\n', 'utf-8', (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async handleLine(line: string): Promise<void> {
    if (!line.trim()) return;

    try {
      const message = JSON.parse(line);

      if (this.messageHandler) {
        const response = await this.messageHandler(message);
        await this.send(response);
      }
    } catch (error) {
      logger.error({ error, line: line.slice(0, 100) }, 'Failed to parse message');

      // Send parse error response
      await this.send({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error',
        },
      });
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }
}

// ============================================================================
// SSE Transport - Server-Sent Events for HTTP streaming
// ============================================================================

/**
 * Configuration for SSE transport
 */
export interface SSETransportConfig {
  /** Send function for SSE events */
  sendEvent: (event: string, data: string) => void;
  /** Close function */
  close: () => void;
  /** Session ID */
  sessionId?: string;
}

/**
 * SSE Transport for MCP
 *
 * Implements server-to-client streaming via Server-Sent Events.
 * Used alongside HTTP POST for client-to-server messages.
 */
export class SSETransport implements MCPTransport {
  private readonly sendEvent: (event: string, data: string) => void;
  private readonly closeConnection: () => void;
  private readonly sessionId: string;
  private messageHandler: MessageHandler | null = null;
  private connected = false;

  constructor(config: SSETransportConfig) {
    this.sendEvent = config.sendEvent;
    this.closeConnection = config.close;
    this.sessionId = config.sessionId ?? randomBytes(16).toString('hex');
  }

  async start(): Promise<void> {
    this.connected = true;

    // Send initial connection event
    this.sendEvent('connected', JSON.stringify({
      sessionId: this.sessionId,
      timestamp: Date.now(),
    }));

    logger.info({ sessionId: this.sessionId }, 'SSE transport started');
  }

  async stop(): Promise<void> {
    this.connected = false;
    this.closeConnection();
    logger.info({ sessionId: this.sessionId }, 'SSE transport stopped');
  }

  async send(message: unknown): Promise<void> {
    if (!this.connected) {
      throw new Error('Transport not connected');
    }

    this.sendEvent('message', JSON.stringify(message));
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Handle incoming HTTP POST message
   */
  async handleIncomingMessage(message: unknown): Promise<MCPResponse> {
    if (!this.messageHandler) {
      return {
        jsonrpc: '2.0',
        id: 0,
        error: {
          code: -32603,
          message: 'No message handler configured',
        },
      };
    }

    return this.messageHandler(message);
  }

  getSessionId(): string {
    return this.sessionId;
  }
}

// ============================================================================
// Buffered Transport - For testing and message queuing
// ============================================================================

/**
 * Buffered transport for testing
 */
export class BufferedTransport implements MCPTransport {
  private readonly sessionId: string;
  private messageHandler: MessageHandler | null = null;
  private connected = false;
  private readonly outgoing: unknown[] = [];
  private readonly incoming: unknown[] = [];

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? randomBytes(16).toString('hex');
  }

  async start(): Promise<void> {
    this.connected = true;
  }

  async stop(): Promise<void> {
    this.connected = false;
  }

  async send(message: unknown): Promise<void> {
    this.outgoing.push(message);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Simulate receiving a message
   */
  async receive(message: unknown): Promise<MCPResponse | undefined> {
    this.incoming.push(message);

    if (this.messageHandler) {
      return this.messageHandler(message);
    }
    return undefined;
  }

  /**
   * Get all outgoing messages
   */
  getOutgoing(): unknown[] {
    return [...this.outgoing];
  }

  /**
   * Clear outgoing messages
   */
  clearOutgoing(): void {
    this.outgoing.length = 0;
  }

  /**
   * Get all incoming messages
   */
  getIncoming(): unknown[] {
    return [...this.incoming];
  }

  getSessionId(): string {
    return this.sessionId;
  }
}

// ============================================================================
// Multiplexed Transport - Handle multiple concurrent sessions
// ============================================================================

/**
 * Session info for multiplexed transport
 */
interface MultiplexSession {
  id: string;
  transport: MCPTransport;
  createdAt: number;
  lastActivityAt: number;
  clientInfo?: { name: string; version: string };
}

/**
 * Multiplexed transport for handling multiple MCP sessions
 */
export class MultiplexedTransport {
  private readonly sessions = new Map<string, MultiplexSession>();
  private readonly maxSessions: number;
  private readonly sessionTimeout: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: {
    maxSessions?: number;
    sessionTimeout?: number; // ms
  } = {}) {
    this.maxSessions = options.maxSessions ?? 100;
    this.sessionTimeout = options.sessionTimeout ?? 3600000; // 1 hour
  }

  /**
   * Start the multiplexer
   */
  start(): void {
    // Cleanup stale sessions every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Stop the multiplexer
   */
  async stop(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Stop all sessions
    const stopPromises = Array.from(this.sessions.values()).map(session =>
      session.transport.stop().catch(() => {})
    );
    await Promise.all(stopPromises);
    this.sessions.clear();
  }

  /**
   * Add a new session
   */
  addSession(sessionId: string, transport: MCPTransport): boolean {
    if (this.sessions.size >= this.maxSessions) {
      logger.warn({ maxSessions: this.maxSessions }, 'Max sessions reached');
      return false;
    }

    this.sessions.set(sessionId, {
      id: sessionId,
      transport,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    });

    return true;
  }

  /**
   * Get a session
   */
  getSession(sessionId: string): MultiplexSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = Date.now();
    }
    return session;
  }

  /**
   * Remove a session
   */
  async removeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.transport.stop();
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get all session IDs
   */
  getSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Broadcast a message to all sessions
   */
  async broadcast(message: unknown): Promise<void> {
    const sendPromises = Array.from(this.sessions.values()).map(session =>
      session.transport.send(message).catch(error => {
        logger.error({ error, sessionId: session.id }, 'Broadcast send failed');
      })
    );
    await Promise.all(sendPromises);
  }

  /**
   * Cleanup stale sessions
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivityAt > this.sessionTimeout) {
        session.transport.stop().catch(() => {});
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug({ cleaned }, 'Cleaned up stale MCP sessions');
    }
  }
}

// ============================================================================
// Transport Factory
// ============================================================================

export type TransportType = 'stdio' | 'sse' | 'buffered';

/**
 * Create a transport instance
 */
export function createTransport(
  type: 'stdio',
  config?: StdioTransportConfig
): StdioTransport;
export function createTransport(
  type: 'sse',
  config: SSETransportConfig
): SSETransport;
export function createTransport(
  type: 'buffered',
  config?: { sessionId?: string }
): BufferedTransport;
export function createTransport(
  type: TransportType,
  config?: StdioTransportConfig | SSETransportConfig | { sessionId?: string }
): MCPTransport {
  switch (type) {
    case 'stdio':
      return new StdioTransport(config as StdioTransportConfig);
    case 'sse':
      return new SSETransport(config as SSETransportConfig);
    case 'buffered':
      return new BufferedTransport((config as { sessionId?: string })?.sessionId);
    default:
      throw new Error(`Unknown transport type: ${type}`);
  }
}

/**
 * Test Fix Loop Service
 *
 * Service for running recursive test-fix loops until tests pass or max iterations reached.
 */

import { spawn } from 'child_process';
import type {
  TestFixSession,
  TestFixStatus,
  TestRunResult,
  TestFailure,
  AppliedFix,
  TestFixRequest,
  TestFixResult,
  TestFixSessionQueryOptions,
  AgentSpawnRequest,
} from '../types.js';
import type { TestFixLoopConfig } from '../config.js';
import type { TestFixSessionStore } from '../stores/test-fix-session-store.js';

// =============================================================================
// Types
// =============================================================================

export interface TestFixLoopServiceConfig extends TestFixLoopConfig {
  agentSpawner?: AgentSpawner;
}

export type AgentSpawner = (request: AgentSpawnRequest) => Promise<{ id: string; output?: string }>;

// =============================================================================
// Test Fix Loop Service
// =============================================================================

/**
 * Service for running test-fix loops
 */
export class TestFixLoopService {
  private readonly store: TestFixSessionStore;
  private readonly config: TestFixLoopServiceConfig;
  private readonly agentSpawner?: AgentSpawner;
  private initialized = false;
  private activeSessions = new Set<string>();

  constructor(store: TestFixSessionStore, config?: Partial<TestFixLoopServiceConfig>) {
    this.store = store;
    this.config = {
      enabled: config?.enabled ?? true,
      defaultTestCommand: config?.defaultTestCommand ?? 'npm test',
      maxIterations: config?.maxIterations ?? 5,
      timeoutPerIteration: config?.timeoutPerIteration ?? 120000,
      fixGenerationTimeout: config?.fixGenerationTimeout ?? 180000,
      autoCommitFixes: config?.autoCommitFixes ?? false,
      stopOnFirstSuccess: config?.stopOnFirstSuccess ?? true,
      preserveTestOrder: config?.preserveTestOrder ?? true,
      agentSpawner: config?.agentSpawner,
    };
    this.agentSpawner = this.config.agentSpawner;
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.store.initialize();
    this.initialized = true;
  }

  /**
   * Check if service is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Start a test-fix loop
   */
  async startFixLoop(request: TestFixRequest): Promise<TestFixResult> {
    this.ensureInitialized();

    if (!this.agentSpawner) {
      return {
        session: null as unknown as TestFixSession,
        success: false,
        message: 'No agent spawner configured',
        totalFixesApplied: 0,
      };
    }

    // Create session
    const session = await this.store.create({
      userId: request.userId,
      testCommand: request.testCommand ?? this.config.defaultTestCommand,
      maxIterations: request.maxIterations ?? this.config.maxIterations,
      currentIteration: 0,
      status: 'running',
      testResults: [],
      fixesApplied: [],
      workingDirectory: request.workingDirectory,
    });

    this.activeSessions.add(session.id);

    // Run loop in background
    this.runLoop(session).catch(error => {
      console.error(`Test fix loop error for session ${session.id}:`, error);
    });

    return {
      session,
      success: true,
      message: 'Test fix loop started',
      totalFixesApplied: 0,
    };
  }

  /**
   * Get a session
   */
  async getSession(sessionId: string): Promise<TestFixSession | null> {
    this.ensureInitialized();
    return this.store.get(sessionId);
  }

  /**
   * List sessions
   */
  async listSessions(options?: TestFixSessionQueryOptions): Promise<TestFixSession[]> {
    this.ensureInitialized();
    return this.store.list(options);
  }

  /**
   * List sessions for a user
   */
  async listUserSessions(userId: string, options?: TestFixSessionQueryOptions): Promise<TestFixSession[]> {
    this.ensureInitialized();
    return this.store.listByUser(userId, options);
  }

  /**
   * Cancel a running session
   */
  async cancelSession(sessionId: string): Promise<boolean> {
    this.ensureInitialized();

    if (!this.activeSessions.has(sessionId)) {
      return false;
    }

    this.activeSessions.delete(sessionId);
    await this.store.updateStatus(sessionId, 'cancelled');

    return true;
  }

  /**
   * Get the final result of a session
   */
  async getResult(sessionId: string): Promise<TestFixResult | null> {
    this.ensureInitialized();

    const session = await this.store.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      session,
      success: session.status === 'succeeded',
      message: this.getStatusMessage(session.status),
      totalFixesApplied: session.fixesApplied.length,
      finalTestResult: session.testResults[session.testResults.length - 1],
    };
  }

  /**
   * Wait for a session to complete
   */
  async waitForSession(sessionId: string, timeoutMs?: number): Promise<TestFixResult> {
    this.ensureInitialized();

    const timeout = timeoutMs ?? (this.config.maxIterations * (this.config.timeoutPerIteration + this.config.fixGenerationTimeout));
    const startTime = Date.now();

    while (true) {
      const session = await this.store.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      if (!['running'].includes(session.status)) {
        return {
          session,
          success: session.status === 'succeeded',
          message: this.getStatusMessage(session.status),
          totalFixesApplied: session.fixesApplied.length,
          finalTestResult: session.testResults[session.testResults.length - 1],
        };
      }

      if (Date.now() - startTime > timeout) {
        throw new Error(`Timeout waiting for session ${sessionId}`);
      }

      await this.sleep(1000);
    }
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    // Cancel all active sessions
    for (const sessionId of this.activeSessions) {
      await this.store.updateStatus(sessionId, 'cancelled');
    }
    this.activeSessions.clear();
    this.initialized = false;
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private async runLoop(session: TestFixSession): Promise<void> {
    try {
      while (session.currentIteration < session.maxIterations) {
        if (!this.activeSessions.has(session.id)) {
          // Session was cancelled
          return;
        }

        // Run tests
        const testResult = await this.runTests(session);
        await this.store.addTestResult(session.id, testResult);

        // Check if tests pass
        if (testResult.failed === 0 && testResult.errors === 0) {
          await this.store.updateStatus(session.id, 'succeeded');
          return;
        }

        // Check if we've reached max iterations
        if (session.currentIteration + 1 >= session.maxIterations) {
          await this.store.updateStatus(session.id, 'max-iterations');
          return;
        }

        // Generate and apply fix
        const fix = await this.generateFix(session, testResult);
        if (fix) {
          await this.store.addAppliedFix(session.id, fix);
        }

        // Increment iteration
        await this.store.incrementIteration(session.id);
        session.currentIteration++;

        // Refresh session data
        const updated = await this.store.get(session.id);
        if (updated) {
          session.testResults = updated.testResults;
          session.fixesApplied = updated.fixesApplied;
        }
      }

      await this.store.updateStatus(session.id, 'max-iterations');
    } catch (error) {
      console.error(`Error in test fix loop for session ${session.id}:`, error);
      await this.store.updateStatus(session.id, 'failed');
    } finally {
      this.activeSessions.delete(session.id);
    }
  }

  private async runTests(session: TestFixSession): Promise<TestRunResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const proc = spawn('sh', ['-c', session.testCommand], {
        cwd: session.workingDirectory ?? process.cwd(),
        timeout: this.config.timeoutPerIteration,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        const duration = Date.now() - startTime;
        const output = stdout + stderr;

        // Parse test results
        const parsed = this.parseTestOutput(output);

        resolve({
          iteration: session.currentIteration,
          passed: parsed.passed,
          failed: parsed.failed,
          errors: parsed.errors,
          skipped: parsed.skipped,
          total: parsed.total,
          failures: parsed.failures,
          duration,
          output,
          timestamp: Date.now(),
        });
      });

      proc.on('error', (error) => {
        const duration = Date.now() - startTime;

        resolve({
          iteration: session.currentIteration,
          passed: 0,
          failed: 0,
          errors: 1,
          skipped: 0,
          total: 0,
          failures: [{
            testName: 'Test execution',
            testFile: '',
            errorMessage: error.message,
          }],
          duration,
          output: error.message,
          timestamp: Date.now(),
        });
      });
    });
  }

  private async generateFix(session: TestFixSession, testResult: TestRunResult): Promise<AppliedFix | null> {
    if (!this.agentSpawner || testResult.failures.length === 0) {
      return null;
    }

    // Generate fix prompt
    const prompt = this.generateFixPrompt(session, testResult);

    try {
      const agentResult = await this.agentSpawner({
        userId: session.userId,
        agentType: 'claude-code',
        prompt,
        workingDirectory: session.workingDirectory,
        timeout: this.config.fixGenerationTimeout,
      });

      return {
        iteration: session.currentIteration,
        targetFile: this.extractTargetFile(testResult.failures),
        description: `Fix for ${testResult.failures.length} failing test(s)`,
        patch: agentResult.output ?? '',
        fixedTests: testResult.failures.map(f => f.testName),
        agentJobId: agentResult.id,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Error generating fix:', error);
      return null;
    }
  }

  private generateFixPrompt(session: TestFixSession, testResult: TestRunResult): string {
    let prompt = `The following tests are failing. Please analyze and fix them:\n\n`;
    prompt += `Test Command: ${session.testCommand}\n`;
    prompt += `Iteration: ${session.currentIteration + 1}/${session.maxIterations}\n\n`;
    prompt += `Failed Tests (${testResult.failed}):\n`;

    for (const failure of testResult.failures) {
      prompt += `\n- Test: ${failure.testName}\n`;
      prompt += `  File: ${failure.testFile}\n`;
      prompt += `  Error: ${failure.errorMessage}\n`;
      if (failure.expected && failure.actual) {
        prompt += `  Expected: ${failure.expected}\n`;
        prompt += `  Actual: ${failure.actual}\n`;
      }
      if (failure.stackTrace) {
        prompt += `  Stack:\n${failure.stackTrace.split('\n').slice(0, 5).join('\n')}\n`;
      }
    }

    if (session.fixesApplied.length > 0) {
      prompt += `\n\nPrevious fix attempts (${session.fixesApplied.length}):\n`;
      for (const fix of session.fixesApplied) {
        prompt += `- Iteration ${fix.iteration}: ${fix.description}\n`;
      }
    }

    prompt += '\n\nPlease implement a fix for these failing tests.';

    return prompt;
  }

  private parseTestOutput(output: string): {
    passed: number;
    failed: number;
    errors: number;
    skipped: number;
    total: number;
    failures: TestFailure[];
  } {
    // Try to parse common test framework outputs
    const failures: TestFailure[] = [];

    // Jest/Vitest pattern
    const jestMatch = output.match(/Tests:\s+(\d+)\s+failed.*?(\d+)\s+passed.*?(\d+)\s+total/i);
    if (jestMatch) {
      return {
        passed: parseInt(jestMatch[2], 10),
        failed: parseInt(jestMatch[1], 10),
        errors: 0,
        skipped: 0,
        total: parseInt(jestMatch[3], 10),
        failures: this.parseJestFailures(output),
      };
    }

    // Mocha pattern
    const mochaMatch = output.match(/(\d+)\s+passing.*?(\d+)\s+failing/i);
    if (mochaMatch) {
      return {
        passed: parseInt(mochaMatch[1], 10),
        failed: parseInt(mochaMatch[2], 10),
        errors: 0,
        skipped: 0,
        total: parseInt(mochaMatch[1], 10) + parseInt(mochaMatch[2], 10),
        failures: this.parseMochaFailures(output),
      };
    }

    // Generic pattern - look for FAIL/PASS counts
    const passMatch = output.match(/(\d+)\s+(?:tests?\s+)?pass(?:ed|ing)?/i);
    const failMatch = output.match(/(\d+)\s+(?:tests?\s+)?fail(?:ed|ing|ure)?/i);

    const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
    const failed = failMatch ? parseInt(failMatch[1], 10) : (output.toLowerCase().includes('fail') ? 1 : 0);

    return {
      passed,
      failed,
      errors: 0,
      skipped: 0,
      total: passed + failed,
      failures: failed > 0 ? this.parseGenericFailures(output) : [],
    };
  }

  private parseJestFailures(output: string): TestFailure[] {
    const failures: TestFailure[] = [];
    const failureRegex = /FAIL\s+(.+?)\n.*?●\s+(.+?)\n\s*(.+?)(?=\n\n|\n\s+●|$)/gs;

    let match;
    while ((match = failureRegex.exec(output)) !== null) {
      failures.push({
        testName: match[2].trim(),
        testFile: match[1].trim(),
        errorMessage: match[3].trim(),
      });
    }

    return failures;
  }

  private parseMochaFailures(output: string): TestFailure[] {
    const failures: TestFailure[] = [];
    const failureRegex = /\d+\)\s+(.+?)\n\s+(.+?)(?=\n\n|\n\s+\d+\)|$)/gs;

    let match;
    while ((match = failureRegex.exec(output)) !== null) {
      failures.push({
        testName: match[1].trim(),
        testFile: '',
        errorMessage: match[2].trim(),
      });
    }

    return failures;
  }

  private parseGenericFailures(output: string): TestFailure[] {
    // Generic failure parsing
    const failures: TestFailure[] = [];
    const errorRegex = /(?:Error|AssertionError|TypeError|ReferenceError):\s*(.+?)(?=\n|$)/gi;

    let match;
    while ((match = errorRegex.exec(output)) !== null) {
      failures.push({
        testName: 'Unknown',
        testFile: '',
        errorMessage: match[1].trim(),
      });
    }

    return failures.length > 0 ? failures : [{
      testName: 'Test',
      testFile: '',
      errorMessage: 'Tests failed. See output for details.',
    }];
  }

  private extractTargetFile(failures: TestFailure[]): string {
    for (const failure of failures) {
      if (failure.testFile) {
        return failure.testFile;
      }
    }
    return '';
  }

  private getStatusMessage(status: TestFixStatus): string {
    switch (status) {
      case 'succeeded':
        return 'All tests passing';
      case 'failed':
        return 'Test fix loop failed';
      case 'max-iterations':
        return 'Maximum iterations reached';
      case 'cancelled':
        return 'Test fix loop cancelled';
      case 'running':
        return 'Test fix loop in progress';
      default:
        return 'Unknown status';
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('TestFixLoopService not initialized. Call initialize() first.');
    }
  }
}

/**
 * Create a test fix loop service
 */
export function createTestFixLoopService(
  store: TestFixSessionStore,
  config?: Partial<TestFixLoopServiceConfig>
): TestFixLoopService {
  return new TestFixLoopService(store, config);
}

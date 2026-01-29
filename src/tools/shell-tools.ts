import { z } from 'zod';
import { spawn, execSync } from 'child_process';
import { defineTool, type ToolDefinition } from './registry.js';
import type { ToolExecutionContext } from '../security/types.js';

// ============================================================================
// Shell Tools - Command execution with sandbox support
// ============================================================================

/**
 * Execute shell command
 * Risk: Critical - Can execute arbitrary commands
 */
export const shellExec = defineTool({
  name: 'shell_exec',
  description: 'Execute a shell command and return its output. Must be run in a sandboxed environment.',
  version: '1.0.0',
  parameters: z.object({
    command: z.string().min(1).max(10000),
    args: z.array(z.string().max(1000)).max(100).optional().default([]),
    cwd: z.string().max(4096).optional(),
    env: z.record(z.string()).optional(),
    timeout: z.number().int().min(1000).max(300000).optional().default(30000),
    stdin: z.string().max(1024 * 1024).optional(),
    shell: z.boolean().optional().default(false),
    captureStderr: z.boolean().optional().default(true),
  }),
  riskLevel: 'critical',
  requiresApproval: true,
  sandboxed: true,
  timeout: 300000,
  rateLimit: { maxCalls: 30, windowMs: 60000 },
  requiredRoles: ['admin', 'operator'],
  async execute(params, context) {
    // Validate that we're in a sandbox
    if (!context.sandboxed) {
      throw new Error('Shell execution requires sandboxed environment');
    }

    // Validate command against blocklist
    validateCommand(params.command, params.args ?? []);

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const spawnOptions: {
        cwd?: string;
        env?: NodeJS.ProcessEnv;
        shell?: boolean;
        timeout?: number;
      } = {
        cwd: params.cwd,
        env: params.env ? { ...process.env, ...params.env } : process.env,
        shell: params.shell,
      };

      const child = spawn(params.command, params.args, spawnOptions);

      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, params.timeout);

      if (params.stdin && child.stdin) {
        child.stdin.write(params.stdin);
        child.stdin.end();
      }

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
        // Limit output size
        if (stdout.length > 10 * 1024 * 1024) {
          child.kill('SIGKILL');
        }
      });

      if (params.captureStderr) {
        child.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
          if (stderr.length > 10 * 1024 * 1024) {
            child.kill('SIGKILL');
          }
        });
      }

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });

      child.on('close', (code, signal) => {
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;

        resolve({
          success: code === 0,
          exitCode: code,
          signal,
          stdout: stdout.slice(0, 1024 * 1024),
          stderr: params.captureStderr ? stderr.slice(0, 1024 * 1024) : undefined,
          durationMs,
          timedOut,
          truncated: stdout.length > 1024 * 1024 || stderr.length > 1024 * 1024,
        });
      });
    });
  },
});

/**
 * Execute a script
 * Risk: Critical - Executes script content
 */
export const shellScript = defineTool({
  name: 'shell_script',
  description: 'Execute a shell script. The script content is executed via the specified interpreter.',
  version: '1.0.0',
  parameters: z.object({
    script: z.string().min(1).max(1024 * 1024),
    interpreter: z.enum(['bash', 'sh', 'python3', 'python', 'node', 'ruby', 'perl']).optional().default('bash'),
    args: z.array(z.string().max(1000)).max(100).optional().default([]),
    cwd: z.string().max(4096).optional(),
    env: z.record(z.string()).optional(),
    timeout: z.number().int().min(1000).max(300000).optional().default(30000),
  }),
  riskLevel: 'critical',
  requiresApproval: true,
  sandboxed: true,
  timeout: 300000,
  rateLimit: { maxCalls: 20, windowMs: 60000 },
  requiredRoles: ['admin', 'operator'],
  async execute(params, context) {
    if (!context.sandboxed) {
      throw new Error('Script execution requires sandboxed environment');
    }

    const interpreterPaths: Record<string, string> = {
      bash: '/bin/bash',
      sh: '/bin/sh',
      python3: '/usr/bin/python3',
      python: '/usr/bin/python',
      node: '/usr/bin/node',
      ruby: '/usr/bin/ruby',
      perl: '/usr/bin/perl',
    };

    const interpreterKey = params.interpreter ?? 'bash';
    const interpreter = interpreterPaths[interpreterKey] ?? interpreterKey;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const args = ['-c', params.script, '--', ...(params.args ?? [])];

      const child = spawn(interpreter, args, {
        cwd: params.cwd,
        env: params.env ? { ...process.env, ...params.env } : process.env,
      });

      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, params.timeout);

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
        if (stdout.length > 10 * 1024 * 1024) {
          child.kill('SIGKILL');
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
        if (stderr.length > 10 * 1024 * 1024) {
          child.kill('SIGKILL');
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });

      child.on('close', (code, signal) => {
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;

        resolve({
          success: code === 0,
          exitCode: code,
          signal,
          stdout: stdout.slice(0, 1024 * 1024),
          stderr: stderr.slice(0, 1024 * 1024),
          durationMs,
          timedOut,
          interpreter: params.interpreter,
        });
      });
    });
  },
});

/**
 * Get environment variable
 * Risk: Medium - Can read environment
 */
export const getEnv = defineTool({
  name: 'shell_env_get',
  description: 'Get the value of an environment variable.',
  version: '1.0.0',
  parameters: z.object({
    name: z.string().min(1).max(256).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  }),
  riskLevel: 'medium',
  requiresApproval: false,
  sandboxed: true,
  timeout: 1000,
  rateLimit: { maxCalls: 100, windowMs: 60000 },
  async execute(params, context) {
    // Filter sensitive environment variables
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /key/i,
      /credential/i,
      /auth/i,
      /api_key/i,
      /private/i,
    ];

    for (const pattern of sensitivePatterns) {
      if (pattern.test(params.name)) {
        return {
          name: params.name,
          exists: false,
          redacted: true,
          reason: 'Sensitive environment variable',
        };
      }
    }

    const value = process.env[params.name];

    return {
      name: params.name,
      exists: value !== undefined,
      value: value,
    };
  },
});

/**
 * List environment variables
 * Risk: Medium - Can list environment
 */
export const listEnv = defineTool({
  name: 'shell_env_list',
  description: 'List all non-sensitive environment variable names.',
  version: '1.0.0',
  parameters: z.object({
    pattern: z.string().max(100).optional(),
  }),
  riskLevel: 'medium',
  requiresApproval: false,
  sandboxed: true,
  timeout: 1000,
  rateLimit: { maxCalls: 30, windowMs: 60000 },
  async execute(params) {
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /key/i,
      /credential/i,
      /auth/i,
      /api_key/i,
      /private/i,
    ];

    const regex = params.pattern ? new RegExp(params.pattern, 'i') : null;

    const variables: Array<{ name: string; redacted: boolean }> = [];

    for (const name of Object.keys(process.env)) {
      if (regex && !regex.test(name)) continue;

      const isSensitive = sensitivePatterns.some(p => p.test(name));
      variables.push({
        name,
        redacted: isSensitive,
      });
    }

    variables.sort((a, b) => a.name.localeCompare(b.name));

    return {
      count: variables.length,
      variables,
    };
  },
});

/**
 * Check if command exists
 * Risk: Low - Read-only check
 */
export const commandExists = defineTool({
  name: 'shell_which',
  description: 'Check if a command exists and return its path.',
  version: '1.0.0',
  parameters: z.object({
    command: z.string().min(1).max(256).regex(/^[a-zA-Z0-9_-]+$/),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: true,
  timeout: 5000,
  rateLimit: { maxCalls: 100, windowMs: 60000 },
  async execute(params) {
    try {
      const result = execSync(`which ${params.command}`, {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return {
        exists: true,
        command: params.command,
        path: result.trim(),
      };
    } catch {
      return {
        exists: false,
        command: params.command,
      };
    }
  },
});

/**
 * Get current working directory
 * Risk: Low - Read-only
 */
export const getCwd = defineTool({
  name: 'shell_pwd',
  description: 'Get the current working directory.',
  version: '1.0.0',
  parameters: z.object({}),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: true,
  timeout: 1000,
  rateLimit: { maxCalls: 100, windowMs: 60000 },
  async execute() {
    return {
      cwd: process.cwd(),
    };
  },
});

/**
 * Get system information
 * Risk: Low - Read-only system info
 */
export const systemInfo = defineTool({
  name: 'shell_sysinfo',
  description: 'Get basic system information (OS, architecture, memory, etc.).',
  version: '1.0.0',
  parameters: z.object({}),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: true,
  timeout: 5000,
  rateLimit: { maxCalls: 30, windowMs: 60000 },
  async execute() {
    const os = await import('os');

    return {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
      uptime: os.uptime(),
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        usagePercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100),
      },
      cpus: os.cpus().length,
      loadAverage: os.loadavg(),
      tmpDir: os.tmpdir(),
      homeDir: os.homedir(),
      user: os.userInfo().username,
    };
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

function validateCommand(command: string, args: string[]): void {
  // Blocklist of dangerous commands
  const blockedCommands = [
    'rm',
    'rmdir',
    'mkfs',
    'dd',
    'format',
    'fdisk',
    'mount',
    'umount',
    'shutdown',
    'reboot',
    'init',
    'systemctl',
    'service',
    'kill',
    'killall',
    'pkill',
    'su',
    'sudo',
    'passwd',
    'useradd',
    'userdel',
    'usermod',
    'groupadd',
    'groupdel',
    'chown',
    'chmod',
    'chgrp',
    'iptables',
    'firewall-cmd',
    'ufw',
    'nc',
    'netcat',
    'ncat',
    'curl',
    'wget',
  ];

  // Check command name
  const commandBase = command.split('/').pop() ?? command;
  if (blockedCommands.includes(commandBase.toLowerCase())) {
    throw new Error(`Command '${commandBase}' is blocked for security reasons`);
  }

  // Check for shell injection patterns
  const dangerousPatterns = [
    /[;&|`$()]/, // Shell metacharacters
    /\.\.\//,    // Path traversal
    /\/etc\//,   // System config access
    /\/proc\//,  // Process info access
    /\/sys\//,   // System info access
    /\/dev\//,   // Device access
  ];

  const fullCommand = `${command} ${args.join(' ')}`;
  for (const pattern of dangerousPatterns) {
    if (pattern.test(fullCommand)) {
      throw new Error('Potentially dangerous command pattern detected');
    }
  }
}

// ============================================================================
// Export all shell tools
// ============================================================================

export const shellTools: ToolDefinition<unknown, unknown>[] = [
  shellExec as ToolDefinition<unknown, unknown>,
  shellScript as ToolDefinition<unknown, unknown>,
  getEnv as ToolDefinition<unknown, unknown>,
  listEnv as ToolDefinition<unknown, unknown>,
  commandExists as ToolDefinition<unknown, unknown>,
  getCwd as ToolDefinition<unknown, unknown>,
  systemInfo as ToolDefinition<unknown, unknown>,
];

import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import { randomBytes } from 'crypto';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

export interface SandboxConfig {
  // Resource limits
  memory: string;           // e.g., '256Mi'
  cpu: string;              // e.g., '0.5'
  timeoutMs: number;        // Execution timeout
  maxOutputBytes: number;   // Max stdout/stderr size

  // Network isolation
  network: 'none' | 'host' | 'restricted';
  allowedHosts?: string[];  // For 'restricted' network

  // Filesystem
  readOnly: boolean;
  workDir?: string;
  allowedPaths?: string[];

  // Execution
  user?: string;            // Run as specific user
  capabilities?: string[];  // Linux capabilities to drop/add
}

export interface ExecutionRequest {
  command: string;
  args: string[];
  env?: Record<string, string>;
  stdin?: string;
  workDir?: string;
}

export interface ExecutionResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  killed: boolean;
  durationMs: number;
  resourceUsage?: {
    memoryBytes?: number;
    cpuTimeMs?: number;
  };
  error?: string;
}

export interface SandboxRuntime {
  name: string;
  available: boolean;
  version?: string;
}

// Check available sandbox runtimes
export async function detectRuntimes(): Promise<SandboxRuntime[]> {
  const runtimes: SandboxRuntime[] = [];
  const currentPlatform = (await import('os')).platform();

  // Check for runsc (gVisor) - Linux only
  if (currentPlatform === 'linux') {
    try {
      const version = await execCommand('runsc', ['--version']);
      runtimes.push({
        name: 'gvisor',
        available: true,
        version: version.stdout.trim(),
      });
    } catch {
      runtimes.push({ name: 'gvisor', available: false });
    }
  } else {
    runtimes.push({ name: 'gvisor', available: false });
  }

  // Check for nsjail - Linux only
  if (currentPlatform === 'linux') {
    try {
      const version = await execCommand('nsjail', ['--version']);
      runtimes.push({
        name: 'nsjail',
        available: true,
        version: version.stdout.trim(),
      });
    } catch {
      runtimes.push({ name: 'nsjail', available: false });
    }
  } else {
    runtimes.push({ name: 'nsjail', available: false });
  }

  // Check for Docker
  try {
    const version = await execCommand('docker', ['--version']);
    runtimes.push({
      name: 'docker',
      available: true,
      version: version.stdout.trim(),
    });
  } catch {
    runtimes.push({ name: 'docker', available: false });
  }

  // Check for Podman
  try {
    const version = await execCommand('podman', ['--version']);
    runtimes.push({
      name: 'podman',
      available: true,
      version: version.stdout.trim(),
    });
  } catch {
    runtimes.push({ name: 'podman', available: false });
  }

  // Check for Bubblewrap - Linux only
  if (currentPlatform === 'linux') {
    try {
      const version = await execCommand('bwrap', ['--version']);
      runtimes.push({
        name: 'bubblewrap',
        available: true,
        version: version.stdout.trim(),
      });
    } catch {
      runtimes.push({ name: 'bubblewrap', available: false });
    }
  } else {
    runtimes.push({ name: 'bubblewrap', available: false });
  }

  // Check for Firejail - Linux only
  if (currentPlatform === 'linux') {
    try {
      const version = await execCommand('firejail', ['--version']);
      runtimes.push({
        name: 'firejail',
        available: true,
        version: version.stdout.split('\n')[0]?.trim(),
      });
    } catch {
      runtimes.push({ name: 'firejail', available: false });
    }
  } else {
    runtimes.push({ name: 'firejail', available: false });
  }

  // Check for macOS sandbox-exec - macOS only
  if (currentPlatform === 'darwin') {
    try {
      await execCommand('which', ['sandbox-exec']);
      runtimes.push({
        name: 'macos',
        available: true,
        version: 'built-in',
      });
    } catch {
      runtimes.push({ name: 'macos', available: false });
    }
  } else {
    runtimes.push({ name: 'macos', available: false });
  }

  return runtimes;
}

async function execCommand(
  command: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => { stdout += data; });
    proc.stderr?.on('data', (data) => { stderr += data; });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    proc.on('error', reject);

    // Timeout for version checks
    setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Command timed out'));
    }, 5000);
  });
}

export class GVisorSandbox {
  private readonly config: SandboxConfig;
  private readonly sandboxId: string;
  private tempDir: string | null = null;

  constructor(config: SandboxConfig) {
    this.config = config;
    this.sandboxId = `sandbox-${randomBytes(8).toString('hex')}`;
  }

  async initialize(): Promise<void> {
    // Create temp directory for sandbox
    this.tempDir = join(tmpdir(), this.sandboxId);
    await mkdir(this.tempDir, { recursive: true });
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now();

    if (!this.tempDir) {
      await this.initialize();
    }

    // Build runsc arguments
    const runscArgs = this.buildRunscArgs(request);

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let killed = false;

      const proc: ChildProcess = spawn('runsc', runscArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...request.env,
        },
      });

      // Handle timeout
      const timeout = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGKILL');
      }, this.config.timeoutMs);

      // Handle stdin
      if (request.stdin && proc.stdin) {
        proc.stdin.write(request.stdin);
        proc.stdin.end();
      }

      // Collect stdout with size limit
      proc.stdout?.on('data', (data: Buffer) => {
        if (stdout.length < this.config.maxOutputBytes) {
          stdout += data.toString().slice(0, this.config.maxOutputBytes - stdout.length);
        }
      });

      // Collect stderr with size limit
      proc.stderr?.on('data', (data: Buffer) => {
        if (stderr.length < this.config.maxOutputBytes) {
          stderr += data.toString().slice(0, this.config.maxOutputBytes - stderr.length);
        }
      });

      proc.on('close', (exitCode, signal) => {
        clearTimeout(timeout);

        if (signal === 'SIGKILL' && !timedOut) {
          killed = true;
        }

        const durationMs = Date.now() - startTime;

        resolve({
          success: exitCode === 0 && !timedOut && !killed,
          exitCode: exitCode ?? -1,
          stdout,
          stderr,
          timedOut,
          killed,
          durationMs,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);

        resolve({
          success: false,
          exitCode: -1,
          stdout,
          stderr,
          timedOut: false,
          killed: false,
          durationMs: Date.now() - startTime,
          error: err.message,
        });
      });
    });
  }

  private buildRunscArgs(request: ExecutionRequest): string[] {
    const args: string[] = [
      'run',
      '--rootless',
      `--network=${this.config.network}`,
    ];

    // Resource limits
    if (this.config.memory) {
      args.push(`--memory=${this.config.memory}`);
    }

    if (this.config.cpu) {
      args.push(`--cpu=${this.config.cpu}`);
    }

    // Filesystem options
    if (this.config.readOnly) {
      args.push('--read-only');
    }

    // Working directory
    if (request.workDir || this.config.workDir) {
      args.push(`--cwd=${request.workDir || this.config.workDir}`);
    }

    // Container ID
    args.push(`--name=${this.sandboxId}`);

    // Add separator and command
    args.push('--');
    args.push(request.command);
    args.push(...request.args);

    return args;
  }

  async cleanup(): Promise<void> {
    if (this.tempDir) {
      try {
        await rm(this.tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      this.tempDir = null;
    }
  }

  static async isAvailable(): Promise<boolean> {
    try {
      await execCommand('runsc', ['--version']);
      return true;
    } catch {
      return false;
    }
  }
}

// Fallback sandbox using nsjail
export class NsjailSandbox {
  private readonly config: SandboxConfig;
  private readonly sandboxId: string;
  private configFile: string | null = null;
  private tempDir: string | null = null;

  constructor(config: SandboxConfig) {
    this.config = config;
    this.sandboxId = `nsjail-${randomBytes(8).toString('hex')}`;
  }

  async initialize(): Promise<void> {
    this.tempDir = join(tmpdir(), this.sandboxId);
    await mkdir(this.tempDir, { recursive: true });

    // Generate nsjail config
    const nsjailConfig = this.generateConfig();
    this.configFile = join(this.tempDir, 'nsjail.cfg');
    await writeFile(this.configFile, nsjailConfig);
  }

  private generateConfig(): string {
    const memoryBytes = this.parseMemory(this.config.memory);

    return `
name: "${this.sandboxId}"
mode: ONCE
hostname: "sandbox"
time_limit: ${Math.ceil(this.config.timeoutMs / 1000)}

rlimit_as: ${memoryBytes}
rlimit_cpu: ${Math.ceil(parseFloat(this.config.cpu) * 60)}
rlimit_fsize: ${this.config.maxOutputBytes}
rlimit_nofile: 32

clone_newnet: ${this.config.network === 'none'}
clone_newuser: true
clone_newns: true
clone_newpid: true
clone_newipc: true
clone_newuts: true

mount {
  src: "/bin"
  dst: "/bin"
  is_bind: true
  rw: false
}

mount {
  src: "/lib"
  dst: "/lib"
  is_bind: true
  rw: false
}

mount {
  src: "/lib64"
  dst: "/lib64"
  is_bind: true
  rw: false
  mandatory: false
}

mount {
  src: "/usr"
  dst: "/usr"
  is_bind: true
  rw: false
}

mount {
  dst: "/tmp"
  fstype: "tmpfs"
  rw: ${!this.config.readOnly}
}

mount {
  dst: "/dev/null"
  fstype: "tmpfs"
  rw: true
}

seccomp_string: "ALLOW {"
seccomp_string: "  read, write, openat, close, stat, fstat, lseek,"
seccomp_string: "  mmap, mprotect, munmap, brk, rt_sigaction,"
seccomp_string: "  rt_sigprocmask, ioctl, access, pipe, select,"
seccomp_string: "  sched_yield, mremap, mincore, madvise, dup, dup2,"
seccomp_string: "  nanosleep, getpid, socket, connect, sendto, recvfrom,"
seccomp_string: "  shutdown, getsockname, getpeername, clone, fork, vfork,"
seccomp_string: "  execve, exit, wait4, kill, uname, fcntl, flock,"
seccomp_string: "  fsync, fdatasync, truncate, ftruncate, getdents,"
seccomp_string: "  getcwd, chdir, mkdir, rmdir, creat, unlink, chmod,"
seccomp_string: "  lchown, getuid, getgid, geteuid, getegid, getppid,"
seccomp_string: "  setpgid, getpgrp, setsid, setreuid, setregid,"
seccomp_string: "  arch_prctl, set_tid_address, set_robust_list,"
seccomp_string: "  exit_group, clock_gettime, clock_getres, clock_nanosleep,"
seccomp_string: "  getrandom, prlimit64, newfstatat, readlinkat"
seccomp_string: "}"
seccomp_string: "DEFAULT KILL"
`;
  }

  private parseMemory(memory: string): number {
    const match = memory.match(/^(\d+)(Mi|Gi|Ki)?$/);
    if (!match) return 256 * 1024 * 1024; // Default 256MB

    const value = parseInt(match[1], 10);
    const unit = match[2] || 'Mi';

    switch (unit) {
      case 'Ki': return value * 1024;
      case 'Mi': return value * 1024 * 1024;
      case 'Gi': return value * 1024 * 1024 * 1024;
      default: return value;
    }
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now();

    if (!this.configFile) {
      await this.initialize();
    }

    const args = [
      '--config', this.configFile!,
      '--',
      request.command,
      ...request.args,
    ];

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let killed = false;

      const proc = spawn('nsjail', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: request.env,
      });

      const timeout = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGKILL');
      }, this.config.timeoutMs);

      if (request.stdin && proc.stdin) {
        proc.stdin.write(request.stdin);
        proc.stdin.end();
      }

      proc.stdout?.on('data', (data: Buffer) => {
        if (stdout.length < this.config.maxOutputBytes) {
          stdout += data.toString().slice(0, this.config.maxOutputBytes - stdout.length);
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        if (stderr.length < this.config.maxOutputBytes) {
          stderr += data.toString().slice(0, this.config.maxOutputBytes - stderr.length);
        }
      });

      proc.on('close', (exitCode, signal) => {
        clearTimeout(timeout);
        killed = signal === 'SIGKILL' && !timedOut;

        resolve({
          success: exitCode === 0 && !timedOut && !killed,
          exitCode: exitCode ?? -1,
          stdout,
          stderr,
          timedOut,
          killed,
          durationMs: Date.now() - startTime,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          exitCode: -1,
          stdout,
          stderr,
          timedOut: false,
          killed: false,
          durationMs: Date.now() - startTime,
          error: err.message,
        });
      });
    });
  }

  async cleanup(): Promise<void> {
    if (this.tempDir) {
      try {
        await rm(this.tempDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
      this.tempDir = null;
      this.configFile = null;
    }
  }

  static async isAvailable(): Promise<boolean> {
    try {
      await execCommand('nsjail', ['--version']);
      return true;
    } catch {
      return false;
    }
  }
}

// Docker-based sandbox (fallback)
export class DockerSandbox {
  private readonly config: SandboxConfig;
  private readonly containerId: string;

  constructor(config: SandboxConfig) {
    this.config = config;
    this.containerId = `sandbox-${randomBytes(8).toString('hex')}`;
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now();

    const args = [
      'run',
      '--rm',
      `--name=${this.containerId}`,
      `--memory=${this.config.memory}`,
      `--cpus=${this.config.cpu}`,
      '--network=none',
      '--read-only',
      '--security-opt=no-new-privileges',
      '--cap-drop=ALL',
      '--pids-limit=64',
      '-i', // For stdin
      'alpine:latest', // Base image
      request.command,
      ...request.args,
    ];

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const proc = spawn('docker', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timeout = setTimeout(() => {
        timedOut = true;
        spawn('docker', ['kill', this.containerId]);
      }, this.config.timeoutMs);

      if (request.stdin && proc.stdin) {
        proc.stdin.write(request.stdin);
        proc.stdin.end();
      }

      proc.stdout?.on('data', (data: Buffer) => {
        if (stdout.length < this.config.maxOutputBytes) {
          stdout += data.toString().slice(0, this.config.maxOutputBytes - stdout.length);
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        if (stderr.length < this.config.maxOutputBytes) {
          stderr += data.toString().slice(0, this.config.maxOutputBytes - stderr.length);
        }
      });

      proc.on('close', (exitCode) => {
        clearTimeout(timeout);

        resolve({
          success: exitCode === 0 && !timedOut,
          exitCode: exitCode ?? -1,
          stdout,
          stderr,
          timedOut,
          killed: false,
          durationMs: Date.now() - startTime,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          exitCode: -1,
          stdout,
          stderr,
          timedOut: false,
          killed: false,
          durationMs: Date.now() - startTime,
          error: err.message,
        });
      });
    });
  }

  async cleanup(): Promise<void> {
    // Docker --rm handles cleanup
  }

  static async isAvailable(): Promise<boolean> {
    try {
      await execCommand('docker', ['--version']);
      return true;
    } catch {
      return false;
    }
  }
}

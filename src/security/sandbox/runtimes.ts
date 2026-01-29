import { spawn, ChildProcess } from 'child_process';
import { randomBytes } from 'crypto';
import { mkdir, rm, writeFile, readFile, chmod } from 'fs/promises';
import { join } from 'path';
import { tmpdir, platform, homedir } from 'os';
import type { SandboxConfig, ExecutionRequest, ExecutionResult } from './gvisor.js';

// ============================================================================
// Podman Sandbox - Rootless container alternative to Docker
// ============================================================================

export class PodmanSandbox {
  private readonly config: SandboxConfig;
  private readonly containerId: string;
  private tempDir: string | null = null;

  constructor(config: SandboxConfig) {
    this.config = config;
    this.containerId = `sandbox-${randomBytes(8).toString('hex')}`;
  }

  async initialize(): Promise<void> {
    this.tempDir = join(tmpdir(), this.containerId);
    await mkdir(this.tempDir, { recursive: true });
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now();

    if (!this.tempDir) {
      await this.initialize();
    }

    const args = this.buildPodmanArgs(request);

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let killed = false;

      const proc = spawn('podman', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timeout = setTimeout(() => {
        timedOut = true;
        // Podman kill
        spawn('podman', ['kill', this.containerId], { stdio: 'ignore' });
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
        if (signal === 'SIGKILL' && !timedOut) {
          killed = true;
        }

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

  private buildPodmanArgs(request: ExecutionRequest): string[] {
    const args = [
      'run',
      '--rm',
      `--name=${this.containerId}`,
      // Resource limits
      `--memory=${this.config.memory}`,
      `--cpus=${this.config.cpu}`,
      '--pids-limit=128',
      // Security options
      '--security-opt=no-new-privileges:true',
      '--cap-drop=ALL',
      '--userns=keep-id',
      // Network
      `--network=${this.config.network === 'none' ? 'none' : this.config.network === 'host' ? 'host' : 'slirp4netns'}`,
    ];

    // Read-only root filesystem
    if (this.config.readOnly) {
      args.push('--read-only');
      args.push('--tmpfs=/tmp:rw,noexec,nosuid,size=64m');
    }

    // Working directory
    if (request.workDir || this.config.workDir) {
      args.push(`--workdir=${request.workDir || this.config.workDir}`);
    }

    // Mount working directory if specified
    if (this.tempDir) {
      args.push(`-v=${this.tempDir}:/workspace:Z`);
    }

    // Allowed paths
    if (this.config.allowedPaths) {
      for (const path of this.config.allowedPaths) {
        args.push(`-v=${path}:${path}:ro`);
      }
    }

    // Environment variables
    if (request.env) {
      for (const [key, value] of Object.entries(request.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    // stdin
    args.push('-i');

    // Use Alpine as base image
    args.push('alpine:latest');

    // Command
    args.push(request.command);
    args.push(...request.args);

    return args;
  }

  async cleanup(): Promise<void> {
    // Force remove container if still exists
    try {
      await execCommand('podman', ['rm', '-f', this.containerId]);
    } catch {
      // Container may already be removed
    }

    if (this.tempDir) {
      try {
        await rm(this.tempDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
      this.tempDir = null;
    }
  }

  static async isAvailable(): Promise<boolean> {
    try {
      await execCommand('podman', ['--version']);
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Bubblewrap Sandbox - Lightweight Linux-only sandboxing
// ============================================================================

export class BubblewrapSandbox {
  private readonly config: SandboxConfig;
  private readonly sandboxId: string;
  private tempDir: string | null = null;

  constructor(config: SandboxConfig) {
    this.config = config;
    this.sandboxId = `bwrap-${randomBytes(8).toString('hex')}`;
  }

  async initialize(): Promise<void> {
    if (platform() !== 'linux') {
      throw new Error('Bubblewrap is only available on Linux');
    }

    this.tempDir = join(tmpdir(), this.sandboxId);
    await mkdir(this.tempDir, { recursive: true });
    await mkdir(join(this.tempDir, 'tmp'), { recursive: true });
    await mkdir(join(this.tempDir, 'home'), { recursive: true });
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now();

    if (!this.tempDir) {
      await this.initialize();
    }

    const args = this.buildBwrapArgs(request);

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let killed = false;

      const proc = spawn('bwrap', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...request.env,
        },
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
        if (signal === 'SIGKILL' && !timedOut) {
          killed = true;
        }

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

  private buildBwrapArgs(request: ExecutionRequest): string[] {
    const args: string[] = [
      // Create new namespaces
      '--unshare-all',
      '--share-net', // We'll control network separately if needed

      // Die with parent
      '--die-with-parent',

      // Basic filesystem setup
      '--ro-bind', '/usr', '/usr',
      '--ro-bind', '/bin', '/bin',
      '--ro-bind', '/lib', '/lib',
      '--symlink', '/usr/lib64', '/lib64',
      '--ro-bind', '/etc/resolv.conf', '/etc/resolv.conf',
      '--ro-bind', '/etc/ssl', '/etc/ssl',

      // Proc and dev
      '--proc', '/proc',
      '--dev', '/dev',

      // Tmp directory
      '--bind', join(this.tempDir!, 'tmp'), '/tmp',

      // Home directory
      '--bind', join(this.tempDir!, 'home'), '/home/sandbox',
      '--setenv', 'HOME', '/home/sandbox',

      // Hostname
      '--hostname', 'sandbox',

      // User mapping
      '--uid', '1000',
      '--gid', '1000',
    ];

    // Network isolation
    if (this.config.network === 'none') {
      // Remove --share-net and add --unshare-net
      const shareNetIndex = args.indexOf('--share-net');
      if (shareNetIndex !== -1) {
        args.splice(shareNetIndex, 1);
      }
    }

    // Working directory
    const workDir = request.workDir || this.config.workDir || '/tmp';
    args.push('--chdir', workDir);

    // Allowed paths (read-only)
    if (this.config.allowedPaths) {
      for (const path of this.config.allowedPaths) {
        if (this.config.readOnly) {
          args.push('--ro-bind', path, path);
        } else {
          args.push('--bind', path, path);
        }
      }
    }

    // Environment variables
    if (request.env) {
      for (const [key, value] of Object.entries(request.env)) {
        args.push('--setenv', key, value);
      }
    }

    // Add command and arguments
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
        // Ignore
      }
      this.tempDir = null;
    }
  }

  static async isAvailable(): Promise<boolean> {
    if (platform() !== 'linux') {
      return false;
    }

    try {
      await execCommand('bwrap', ['--version']);
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Firejail Sandbox - Linux security sandbox
// ============================================================================

export class FirejailSandbox {
  private readonly config: SandboxConfig;
  private readonly sandboxId: string;
  private profilePath: string | null = null;
  private tempDir: string | null = null;

  constructor(config: SandboxConfig) {
    this.config = config;
    this.sandboxId = `firejail-${randomBytes(8).toString('hex')}`;
  }

  async initialize(): Promise<void> {
    if (platform() !== 'linux') {
      throw new Error('Firejail is only available on Linux');
    }

    this.tempDir = join(tmpdir(), this.sandboxId);
    await mkdir(this.tempDir, { recursive: true });

    // Create a custom profile
    this.profilePath = join(this.tempDir, 'sandbox.profile');
    await writeFile(this.profilePath, this.generateProfile());
  }

  private generateProfile(): string {
    const memoryKb = this.parseMemory(this.config.memory) / 1024;

    let profile = `
# SecureAgent Firejail Profile
# Auto-generated sandbox profile

# Blacklist sensitive locations
blacklist /boot
blacklist /media
blacklist /mnt
blacklist /opt
blacklist /root
blacklist /srv
blacklist /sys/firmware

# Home directory
private

# Temporary directory
private-tmp

# No new privileges
no-new-privs

# Seccomp filtering
seccomp

# Disable sound
nosound

# Disable webcam/video
novideo

# Disable D-Bus
dbus-user none
dbus-system none

# Resource limits
rlimit-as ${memoryKb}
rlimit-cpu ${Math.ceil(parseFloat(this.config.cpu) * 60)}
rlimit-fsize ${this.config.maxOutputBytes}
rlimit-nproc 64
rlimit-nofile 128

# Caps
caps.drop all
`;

    // Network
    if (this.config.network === 'none') {
      profile += '\nnet none';
    } else if (this.config.network === 'restricted' && this.config.allowedHosts) {
      profile += '\nnetfilter';
      // Note: Firejail's netfilter requires a filter file, simplified here
    }

    // Read-only
    if (this.config.readOnly) {
      profile += '\nread-only ${HOME}';
      profile += '\nread-only /tmp';
    }

    // Whitelist allowed paths
    if (this.config.allowedPaths) {
      for (const path of this.config.allowedPaths) {
        profile += `\nwhitelist ${path}`;
        if (this.config.readOnly) {
          profile += `\nread-only ${path}`;
        }
      }
    }

    return profile;
  }

  private parseMemory(memory: string): number {
    const match = memory.match(/^(\d+)(Mi|Gi|Ki)?$/);
    if (!match) return 256 * 1024 * 1024;

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

    if (!this.profilePath) {
      await this.initialize();
    }

    const args = this.buildFirejailArgs(request);

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let killed = false;

      const proc = spawn('firejail', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...request.env,
        },
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
        if (signal === 'SIGKILL' && !timedOut) {
          killed = true;
        }

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

  private buildFirejailArgs(request: ExecutionRequest): string[] {
    const args = [
      `--profile=${this.profilePath}`,
      '--quiet',
      `--name=${this.sandboxId}`,
      '--deterministic-exit-code',
    ];

    // Timeout (firejail has built-in timeout)
    args.push(`--timeout=${Math.ceil(this.config.timeoutMs / 1000)}:${Math.ceil(this.config.timeoutMs / 1000)}`);

    // Working directory
    if (request.workDir || this.config.workDir) {
      args.push(`--private-cwd=${request.workDir || this.config.workDir}`);
    }

    // Environment variables
    if (request.env) {
      for (const [key, value] of Object.entries(request.env)) {
        args.push(`--env=${key}=${value}`);
      }
    }

    // Command and args
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
        // Ignore
      }
      this.tempDir = null;
      this.profilePath = null;
    }
  }

  static async isAvailable(): Promise<boolean> {
    if (platform() !== 'linux') {
      return false;
    }

    try {
      await execCommand('firejail', ['--version']);
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// macOS Sandbox - Using sandbox-exec (deprecated but available)
// ============================================================================

export class MacOSSandbox {
  private readonly config: SandboxConfig;
  private readonly sandboxId: string;
  private profilePath: string | null = null;
  private tempDir: string | null = null;

  constructor(config: SandboxConfig) {
    this.config = config;
    this.sandboxId = `macos-${randomBytes(8).toString('hex')}`;
  }

  async initialize(): Promise<void> {
    if (platform() !== 'darwin') {
      throw new Error('macOS sandbox is only available on macOS');
    }

    this.tempDir = join(tmpdir(), this.sandboxId);
    await mkdir(this.tempDir, { recursive: true });

    // Create sandbox profile
    this.profilePath = join(this.tempDir, 'sandbox.sb');
    await writeFile(this.profilePath, this.generateProfile());
  }

  private generateProfile(): string {
    // Sandbox profile in Apple's sandbox profile language (SBPL)
    let profile = `
(version 1)

; Deny everything by default
(deny default)

; Allow basic process operations
(allow process-fork)
(allow process-exec)

; Allow reading from system locations
(allow file-read*
  (subpath "/usr")
  (subpath "/bin")
  (subpath "/sbin")
  (subpath "/System")
  (subpath "/Library/Frameworks")
  (subpath "/private/var/db/dyld")
  (literal "/dev/null")
  (literal "/dev/zero")
  (literal "/dev/random")
  (literal "/dev/urandom"))

; Allow temp directory access
(allow file-read* file-write*
  (subpath "${this.tempDir}"))

; Allow reading /tmp
(allow file-read*
  (subpath "/tmp")
  (subpath "/private/tmp"))

; Mach services needed for basic operation
(allow mach-lookup
  (global-name "com.apple.system.logger"))

; Allow sysctl reads
(allow sysctl-read)

; Signal handling
(allow signal (target self))
`;

    // Network control
    if (this.config.network === 'none') {
      profile += '\n; Network disabled\n(deny network*)';
    } else if (this.config.network === 'restricted') {
      profile += '\n; Restricted network\n(allow network-outbound (remote tcp "*:80") (remote tcp "*:443"))';
    } else {
      profile += '\n; Network allowed\n(allow network*)';
    }

    // Allowed paths
    if (this.config.allowedPaths) {
      for (const path of this.config.allowedPaths) {
        if (this.config.readOnly) {
          profile += `\n(allow file-read* (subpath "${path}"))`;
        } else {
          profile += `\n(allow file-read* file-write* (subpath "${path}"))`;
        }
      }
    }

    return profile;
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now();

    if (!this.profilePath) {
      await this.initialize();
    }

    const args = [
      '-f', this.profilePath!,
      request.command,
      ...request.args,
    ];

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let killed = false;

      const proc = spawn('sandbox-exec', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: request.workDir || this.config.workDir,
        env: {
          ...process.env,
          ...request.env,
        },
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
        if (signal === 'SIGKILL' && !timedOut) {
          killed = true;
        }

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
      this.profilePath = null;
    }
  }

  static async isAvailable(): Promise<boolean> {
    if (platform() !== 'darwin') {
      return false;
    }

    try {
      // sandbox-exec exists on macOS
      await execCommand('which', ['sandbox-exec']);
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

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

    setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Command timed out'));
    }, 5000);
  });
}

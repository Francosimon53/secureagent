/**
 * Docker Container Manager
 *
 * Manages Docker container lifecycle for secure code execution.
 * Security-critical: Implements complete isolation using Docker security features.
 */

import { spawn, execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import {
  ContainerManager,
  ContainerInfo,
  ContainerState,
  ExecutionRequest,
  SandboxConfig,
  SandboxError,
  SANDBOX_ERROR_CODES,
  SANDBOX_EVENTS,
  LANGUAGE_IMAGES,
  LANGUAGE_COMMANDS,
  SupportedLanguage,
} from './types.js';

// =============================================================================
// Seccomp Profile for Sandbox
// =============================================================================

const SECCOMP_PROFILE = {
  defaultAction: 'SCMP_ACT_ERRNO',
  architectures: ['SCMP_ARCH_X86_64', 'SCMP_ARCH_X86', 'SCMP_ARCH_AARCH64'],
  syscalls: [
    // Process management
    { names: ['exit', 'exit_group'], action: 'SCMP_ACT_ALLOW' },
    { names: ['read', 'write', 'close'], action: 'SCMP_ACT_ALLOW' },
    { names: ['fstat', 'stat', 'lstat', 'newfstatat'], action: 'SCMP_ACT_ALLOW' },
    { names: ['lseek', 'pread64', 'pwrite64'], action: 'SCMP_ACT_ALLOW' },
    { names: ['mmap', 'mprotect', 'munmap'], action: 'SCMP_ACT_ALLOW' },
    { names: ['brk', 'sbrk'], action: 'SCMP_ACT_ALLOW' },
    { names: ['rt_sigaction', 'rt_sigprocmask', 'rt_sigreturn'], action: 'SCMP_ACT_ALLOW' },
    { names: ['ioctl'], action: 'SCMP_ACT_ALLOW' },
    { names: ['access', 'faccessat', 'faccessat2'], action: 'SCMP_ACT_ALLOW' },
    { names: ['openat', 'open'], action: 'SCMP_ACT_ALLOW' },
    { names: ['getdents64', 'getdents'], action: 'SCMP_ACT_ALLOW' },
    { names: ['fcntl', 'dup', 'dup2', 'dup3'], action: 'SCMP_ACT_ALLOW' },
    { names: ['getcwd', 'chdir'], action: 'SCMP_ACT_ALLOW' },
    { names: ['readlink', 'readlinkat'], action: 'SCMP_ACT_ALLOW' },
    { names: ['getpid', 'getppid', 'gettid'], action: 'SCMP_ACT_ALLOW' },
    { names: ['getuid', 'getgid', 'geteuid', 'getegid'], action: 'SCMP_ACT_ALLOW' },
    { names: ['uname'], action: 'SCMP_ACT_ALLOW' },
    { names: ['clock_gettime', 'clock_getres', 'gettimeofday'], action: 'SCMP_ACT_ALLOW' },
    { names: ['nanosleep', 'clock_nanosleep'], action: 'SCMP_ACT_ALLOW' },
    { names: ['futex'], action: 'SCMP_ACT_ALLOW' },
    { names: ['set_tid_address', 'set_robust_list'], action: 'SCMP_ACT_ALLOW' },
    { names: ['getrandom'], action: 'SCMP_ACT_ALLOW' },
    { names: ['prlimit64', 'getrlimit'], action: 'SCMP_ACT_ALLOW' },
    { names: ['arch_prctl', 'prctl'], action: 'SCMP_ACT_ALLOW' },
    { names: ['pipe', 'pipe2'], action: 'SCMP_ACT_ALLOW' },
    { names: ['poll', 'ppoll', 'select', 'pselect6'], action: 'SCMP_ACT_ALLOW' },
    { names: ['epoll_create', 'epoll_create1', 'epoll_ctl', 'epoll_wait', 'epoll_pwait'], action: 'SCMP_ACT_ALLOW' },
    { names: ['eventfd', 'eventfd2'], action: 'SCMP_ACT_ALLOW' },
    { names: ['wait4', 'waitid'], action: 'SCMP_ACT_ALLOW' },
    { names: ['clone', 'clone3'], action: 'SCMP_ACT_ALLOW' },
    { names: ['execve', 'execveat'], action: 'SCMP_ACT_ALLOW' },
    { names: ['kill', 'tgkill'], action: 'SCMP_ACT_ALLOW' },
    { names: ['madvise', 'mremap'], action: 'SCMP_ACT_ALLOW' },
    { names: ['sched_yield', 'sched_getaffinity'], action: 'SCMP_ACT_ALLOW' },
    { names: ['sigaltstack'], action: 'SCMP_ACT_ALLOW' },
    { names: ['rseq'], action: 'SCMP_ACT_ALLOW' },
    { names: ['memfd_create'], action: 'SCMP_ACT_ALLOW' },
    { names: ['statx'], action: 'SCMP_ACT_ALLOW' },
    { names: ['fadvise64'], action: 'SCMP_ACT_ALLOW' },
    // Writing files (for output)
    { names: ['unlink', 'unlinkat', 'rename', 'renameat', 'renameat2'], action: 'SCMP_ACT_ALLOW' },
    { names: ['mkdir', 'mkdirat'], action: 'SCMP_ACT_ALLOW' },
    { names: ['ftruncate'], action: 'SCMP_ACT_ALLOW' },
    { names: ['fsync', 'fdatasync'], action: 'SCMP_ACT_ALLOW' },
    // Network (only if enabled)
    { names: ['socket', 'connect', 'sendto', 'recvfrom', 'sendmsg', 'recvmsg'], action: 'SCMP_ACT_ALLOW' },
    { names: ['bind', 'listen', 'accept', 'accept4'], action: 'SCMP_ACT_ALLOW' },
    { names: ['getsockopt', 'setsockopt', 'getsockname', 'getpeername'], action: 'SCMP_ACT_ALLOW' },
  ],
};

// =============================================================================
// Container Manager Implementation
// =============================================================================

export interface DockerContainerManagerConfig {
  /** Container name prefix */
  containerPrefix: string;

  /** Seccomp profile path */
  seccompProfilePath?: string;

  /** Custom Docker socket path */
  dockerSocket?: string;

  /** Enable debug logging */
  debug?: boolean;
}

const DEFAULT_CONFIG: DockerContainerManagerConfig = {
  containerPrefix: 'sandbox',
  debug: false,
};

export class DockerContainerManager extends EventEmitter implements ContainerManager {
  private config: DockerContainerManagerConfig;
  private activeContainers: Map<string, ContainerInfo> = new Map();
  private initialized = false;
  private seccompProfilePath?: string;

  constructor(config?: Partial<DockerContainerManagerConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Check Docker availability
    const available = await this.isDockerAvailable();
    if (!available) {
      throw new SandboxError(
        SANDBOX_ERROR_CODES.DOCKER_NOT_AVAILABLE,
        'Docker is not available. Ensure Docker daemon is running.'
      );
    }

    // Create seccomp profile file
    await this.createSeccompProfile();

    this.initialized = true;
    this.log('Container manager initialized');
  }

  async shutdown(): Promise<void> {
    // Stop and remove all active containers
    const containerIds = Array.from(this.activeContainers.keys());
    for (const id of containerIds) {
      try {
        await this.stopContainer(id);
        await this.removeContainer(id);
      } catch {
        // Ignore errors during shutdown
      }
    }

    this.activeContainers.clear();
    this.initialized = false;
    this.log('Container manager shut down');
  }

  async isDockerAvailable(): Promise<boolean> {
    try {
      execSync('docker info', { stdio: 'pipe', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async pullImage(image: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', ['pull', image], { stdio: 'pipe' });

      let stderr = '';
      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          this.log(`Image pulled: ${image}`);
          resolve();
        } else {
          reject(
            new SandboxError(
              SANDBOX_ERROR_CODES.IMAGE_PULL_FAILED,
              `Failed to pull image ${image}: ${stderr}`
            )
          );
        }
      });

      proc.on('error', (err) => {
        reject(
          new SandboxError(
            SANDBOX_ERROR_CODES.IMAGE_PULL_FAILED,
            `Failed to pull image ${image}`,
            undefined,
            err
          )
        );
      });
    });
  }

  async hasImage(image: string): Promise<boolean> {
    try {
      execSync(`docker image inspect ${image}`, { stdio: 'pipe', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async createContainer(request: ExecutionRequest, config: SandboxConfig): Promise<string> {
    const executionId = request.executionId || randomUUID();
    const containerName = `${this.config.containerPrefix}-${executionId.slice(0, 8)}`;
    const image = LANGUAGE_IMAGES[request.language];
    const command = LANGUAGE_COMMANDS[request.language];

    // Build Docker run arguments
    const args = this.buildDockerArgs(containerName, image, command, request, config);

    return new Promise((resolve, reject) => {
      const proc = spawn('docker', ['create', ...args], { stdio: 'pipe' });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          const containerId = stdout.trim();
          const containerInfo: ContainerInfo = {
            id: containerId,
            name: containerName,
            image,
            state: 'created',
            executionId,
            language: request.language,
            createdAt: Date.now(),
          };

          this.activeContainers.set(containerId, containerInfo);
          this.emit(SANDBOX_EVENTS.CONTAINER_CREATED, containerInfo);
          this.log(`Container created: ${containerId.slice(0, 12)}`);
          resolve(containerId);
        } else {
          reject(
            new SandboxError(
              SANDBOX_ERROR_CODES.CONTAINER_CREATE_FAILED,
              `Failed to create container: ${stderr}`,
              executionId
            )
          );
        }
      });

      proc.on('error', (err) => {
        reject(
          new SandboxError(
            SANDBOX_ERROR_CODES.CONTAINER_CREATE_FAILED,
            'Failed to create container',
            executionId,
            err
          )
        );
      });
    });
  }

  async startContainer(containerId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', ['start', containerId], { stdio: 'pipe' });

      let stderr = '';
      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          const info = this.activeContainers.get(containerId);
          if (info) {
            info.state = 'running';
            info.startedAt = Date.now();
            this.emit(SANDBOX_EVENTS.CONTAINER_STARTED, info);
          }
          this.log(`Container started: ${containerId.slice(0, 12)}`);
          resolve();
        } else {
          reject(
            new SandboxError(
              SANDBOX_ERROR_CODES.CONTAINER_START_FAILED,
              `Failed to start container: ${stderr}`,
              this.activeContainers.get(containerId)?.executionId
            )
          );
        }
      });

      proc.on('error', (err) => {
        reject(
          new SandboxError(
            SANDBOX_ERROR_CODES.CONTAINER_START_FAILED,
            'Failed to start container',
            this.activeContainers.get(containerId)?.executionId,
            err
          )
        );
      });
    });
  }

  async waitForContainer(
    containerId: string,
    timeoutMs: number
  ): Promise<{ exitCode: number; oomKilled: boolean }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(
          new SandboxError(
            SANDBOX_ERROR_CODES.EXECUTION_TIMEOUT,
            `Container execution timed out after ${timeoutMs}ms`,
            this.activeContainers.get(containerId)?.executionId
          )
        );
      }, timeoutMs);

      const proc = spawn('docker', ['wait', containerId], { stdio: 'pipe' });

      let stdout = '';
      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.on('close', async (code) => {
        clearTimeout(timeout);

        if (code === 0) {
          const exitCode = parseInt(stdout.trim(), 10) || 0;
          const oomKilled = await this.checkOomKilled(containerId);

          const info = this.activeContainers.get(containerId);
          if (info) {
            info.state = 'stopped';
            info.finishedAt = Date.now();
            info.exitCode = exitCode;
            this.emit(SANDBOX_EVENTS.CONTAINER_STOPPED, info);
          }

          this.log(`Container finished: ${containerId.slice(0, 12)} (exit: ${exitCode}, oom: ${oomKilled})`);
          resolve({ exitCode, oomKilled });
        } else {
          reject(
            new SandboxError(
              SANDBOX_ERROR_CODES.EXECUTION_FAILED,
              'Container wait failed',
              this.activeContainers.get(containerId)?.executionId
            )
          );
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(
          new SandboxError(
            SANDBOX_ERROR_CODES.EXECUTION_FAILED,
            'Container wait failed',
            this.activeContainers.get(containerId)?.executionId,
            err
          )
        );
      });
    });
  }

  async getContainerLogs(containerId: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      // Get stdout
      const stdoutProc = spawn('docker', ['logs', '--stdout', containerId], { stdio: 'pipe' });
      let stdout = '';
      stdoutProc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      // Get stderr
      const stderrProc = spawn('docker', ['logs', '--stderr', containerId], { stdio: 'pipe' });
      let stderr = '';
      stderrProc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      let completed = 0;
      const checkComplete = () => {
        completed++;
        if (completed === 2) {
          resolve({ stdout, stderr });
        }
      };

      stdoutProc.on('close', checkComplete);
      stderrProc.on('close', checkComplete);

      stdoutProc.on('error', (err) => {
        reject(
          new SandboxError(
            SANDBOX_ERROR_CODES.INTERNAL_ERROR,
            'Failed to get container logs',
            undefined,
            err
          )
        );
      });
    });
  }

  async getContainerStats(containerId: string): Promise<{ memoryUsedBytes: number }> {
    try {
      const output = execSync(
        `docker inspect --format='{{.State.OOMKilled}} {{.HostConfig.Memory}}' ${containerId}`,
        { stdio: 'pipe', timeout: 5000 }
      ).toString();

      // Try to get memory stats from docker stats
      try {
        const statsOutput = execSync(
          `docker stats ${containerId} --no-stream --format '{{.MemUsage}}'`,
          { stdio: 'pipe', timeout: 5000 }
        ).toString();

        const memMatch = statsOutput.match(/(\d+(?:\.\d+)?)\s*(MiB|GiB|KiB|B)/i);
        if (memMatch) {
          const value = parseFloat(memMatch[1]);
          const unit = memMatch[2].toLowerCase();
          const multipliers: Record<string, number> = {
            b: 1,
            kib: 1024,
            mib: 1024 * 1024,
            gib: 1024 * 1024 * 1024,
          };
          return { memoryUsedBytes: Math.round(value * (multipliers[unit] || 1)) };
        }
      } catch {
        // Container might have stopped
      }

      return { memoryUsedBytes: 0 };
    } catch {
      return { memoryUsedBytes: 0 };
    }
  }

  async stopContainer(containerId: string): Promise<void> {
    try {
      execSync(`docker stop -t 1 ${containerId}`, { stdio: 'pipe', timeout: 5000 });

      const info = this.activeContainers.get(containerId);
      if (info) {
        info.state = 'stopped';
        info.finishedAt = Date.now();
      }

      this.log(`Container stopped: ${containerId.slice(0, 12)}`);
    } catch {
      // Container might already be stopped
    }
  }

  async removeContainer(containerId: string): Promise<void> {
    try {
      execSync(`docker rm -f ${containerId}`, { stdio: 'pipe', timeout: 5000 });

      const info = this.activeContainers.get(containerId);
      if (info) {
        info.state = 'removed';
        this.emit(SANDBOX_EVENTS.CONTAINER_REMOVED, info);
      }

      this.activeContainers.delete(containerId);
      this.log(`Container removed: ${containerId.slice(0, 12)}`);
    } catch {
      // Container might already be removed
      this.activeContainers.delete(containerId);
    }
  }

  async listContainers(): Promise<ContainerInfo[]> {
    return Array.from(this.activeContainers.values());
  }

  async cleanupStaleContainers(maxAgeMs: number): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, info] of this.activeContainers) {
      if (now - info.createdAt > maxAgeMs) {
        try {
          await this.stopContainer(id);
          await this.removeContainer(id);
          cleaned++;
        } catch {
          // Ignore errors
        }
      }
    }

    this.log(`Cleaned up ${cleaned} stale containers`);
    return cleaned;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private buildDockerArgs(
    containerName: string,
    image: string,
    command: string[],
    request: ExecutionRequest,
    config: SandboxConfig
  ): string[] {
    const args: string[] = [];

    // Container name
    args.push('--name', containerName);

    // Resource limits
    args.push('--memory', `${config.resources.memoryBytes}`);
    args.push('--memory-swap', `${config.resources.memorySwapBytes}`);
    args.push('--cpus', `${config.resources.cpus}`);
    args.push('--pids-limit', `${config.resources.pidsLimit}`);

    // Security: Drop all capabilities
    if (config.dropAllCapabilities) {
      args.push('--cap-drop', 'ALL');
    }

    // Security: Read-only root filesystem
    if (config.readOnlyRootFs) {
      args.push('--read-only');
      // Add tmpfs for /tmp
      args.push('--tmpfs', '/tmp:rw,noexec,nosuid,size=64m');
    }

    // Security: Run as non-root
    if (config.runAsNonRoot) {
      args.push('--user', `${config.userId}:${config.groupId}`);
    }

    // Security: Seccomp profile
    if (config.useSeccomp && this.seccompProfilePath) {
      args.push('--security-opt', `seccomp=${this.seccompProfilePath}`);
    }

    // Security: No new privileges
    args.push('--security-opt', 'no-new-privileges:true');

    // Network configuration
    if (!config.network.enabled) {
      args.push('--network', 'none');
    } else {
      // Even with network, limit DNS
      for (const dns of config.network.dnsServers) {
        args.push('--dns', dns);
      }
    }

    // Working directory
    args.push('--workdir', config.workDir);

    // Environment variables (sanitized)
    if (request.env) {
      for (const [key, value] of Object.entries(request.env)) {
        // Only allow safe environment variable names
        if (/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
          args.push('--env', `${key}=${value}`);
        }
      }
    }

    // Labels for tracking
    args.push('--label', `sandbox.execution_id=${request.executionId || 'unknown'}`);
    args.push('--label', `sandbox.language=${request.language}`);
    if (request.userId) {
      args.push('--label', `sandbox.user_id=${request.userId}`);
    }
    if (request.tenantId) {
      args.push('--label', `sandbox.tenant_id=${request.tenantId}`);
    }

    // Image
    args.push(image);

    // Command with code
    args.push(...command, request.code);

    return args;
  }

  private async checkOomKilled(containerId: string): Promise<boolean> {
    try {
      const output = execSync(
        `docker inspect --format='{{.State.OOMKilled}}' ${containerId}`,
        { stdio: 'pipe', timeout: 5000 }
      ).toString();

      return output.trim() === 'true';
    } catch {
      return false;
    }
  }

  private async createSeccompProfile(): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');

      const profilePath = path.join(os.tmpdir(), 'sandbox-seccomp.json');
      await fs.writeFile(profilePath, JSON.stringify(SECCOMP_PROFILE, null, 2));
      this.seccompProfilePath = profilePath;

      this.log(`Seccomp profile created: ${profilePath}`);
    } catch (err) {
      this.log(`Warning: Could not create seccomp profile: ${err}`);
    }
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[DockerContainerManager] ${message}`);
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createContainerManager(
  config?: Partial<DockerContainerManagerConfig>
): ContainerManager {
  return new DockerContainerManager(config);
}

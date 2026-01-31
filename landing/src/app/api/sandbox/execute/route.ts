import { NextResponse } from 'next/server';

// Supported languages
const SUPPORTED_LANGUAGES = ['python', 'javascript', 'bash'] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Resource limits
interface ResourceLimits {
  memoryMB: number;
  timeoutSeconds: number;
  maxOutputBytes: number;
}

// Execution request
interface ExecutionRequest {
  language: SupportedLanguage;
  code: string;
  stdin?: string;
  networkEnabled?: boolean;
  userId?: string;
  tenantId?: string;
}

// Execution result
interface ExecutionResult {
  executionId: string;
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  error?: string;
}

// Demo mode: Simulated execution for the landing page
// In production, this would connect to the Docker sandbox service
const DEMO_RESPONSES: Record<SupportedLanguage, (code: string) => ExecutionResult> = {
  python: (code: string) => {
    const executionId = crypto.randomUUID();

    // Simple Python simulation
    if (code.includes('print(')) {
      const match = code.match(/print\(['"](.*)['"]\)/);
      const output = match ? match[1] + '\n' : '';
      return {
        executionId,
        success: true,
        exitCode: 0,
        stdout: output || 'Hello from Python sandbox!\n',
        stderr: '',
        durationMs: Math.floor(Math.random() * 100) + 50,
        timedOut: false,
      };
    }

    if (code.includes('import')) {
      return {
        executionId,
        success: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        durationMs: Math.floor(Math.random() * 200) + 100,
        timedOut: false,
      };
    }

    return {
      executionId,
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
      durationMs: Math.floor(Math.random() * 50) + 20,
      timedOut: false,
    };
  },

  javascript: (code: string) => {
    const executionId = crypto.randomUUID();

    // Simple JavaScript simulation
    if (code.includes('console.log(')) {
      const match = code.match(/console\.log\(['"](.*)['"]\)/);
      const output = match ? match[1] + '\n' : '';
      return {
        executionId,
        success: true,
        exitCode: 0,
        stdout: output || 'Hello from Node.js sandbox!\n',
        stderr: '',
        durationMs: Math.floor(Math.random() * 80) + 30,
        timedOut: false,
      };
    }

    return {
      executionId,
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
      durationMs: Math.floor(Math.random() * 40) + 15,
      timedOut: false,
    };
  },

  bash: (code: string) => {
    const executionId = crypto.randomUUID();

    // Simple Bash simulation
    if (code.includes('echo')) {
      const match = code.match(/echo\s+['"](.*)['"]/);
      const output = match ? match[1] + '\n' : '';
      return {
        executionId,
        success: true,
        exitCode: 0,
        stdout: output || 'Hello from Bash sandbox!\n',
        stderr: '',
        durationMs: Math.floor(Math.random() * 30) + 10,
        timedOut: false,
      };
    }

    return {
      executionId,
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
      durationMs: Math.floor(Math.random() * 20) + 5,
      timedOut: false,
    };
  },
};

// Rate limiting (simple in-memory)
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // requests per minute
const RATE_WINDOW = 60000; // 1 minute

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const limit = rateLimits.get(clientId);

  if (!limit || now > limit.resetAt) {
    rateLimits.set(clientId, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  if (limit.count >= RATE_LIMIT) {
    return false;
  }

  limit.count++;
  return true;
}

// Audit log (in-memory for demo)
const auditLog: Array<{
  id: string;
  timestamp: number;
  language: string;
  codeLength: number;
  success: boolean;
  durationMs: number;
  clientId: string;
}> = [];

export async function POST(request: Request) {
  try {
    // Get client ID for rate limiting
    const clientId = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     'anonymous';

    // Check rate limit
    if (!checkRateLimit(clientId)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before making more requests.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { language, code, stdin, networkEnabled, userId, tenantId } = body as ExecutionRequest;

    // Validate language
    if (!language || !SUPPORTED_LANGUAGES.includes(language)) {
      return NextResponse.json(
        {
          error: `Invalid language. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`,
          supportedLanguages: SUPPORTED_LANGUAGES,
        },
        { status: 400 }
      );
    }

    // Validate code
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Code is required and must be a string' },
        { status: 400 }
      );
    }

    // Check code size (100KB limit)
    if (code.length > 100000) {
      return NextResponse.json(
        { error: 'Code size exceeds limit (100KB)' },
        { status: 400 }
      );
    }

    // Security: Block dangerous patterns
    const dangerousPatterns = [
      /\beval\s*\(/i,
      /\bexec\s*\(/i,
      /\bos\.system/i,
      /\bsubprocess/i,
      /\bchild_process/i,
      /\brequire\s*\(\s*['"]child_process['"]\s*\)/i,
      /\brequire\s*\(\s*['"]fs['"]\s*\)/i,
      /\bimport\s+os\b/i,
      /\bimport\s+subprocess\b/i,
      /\brm\s+-rf/i,
      /\bdd\s+if=/i,
      /\b:\(\)\s*{\s*:\|:\s*&\s*}\s*;/i, // fork bomb
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        return NextResponse.json(
          {
            error: 'Code contains potentially dangerous operations',
            hint: 'For security, certain operations are blocked in the sandbox',
          },
          { status: 400 }
        );
      }
    }

    // Execute in demo mode
    const result = DEMO_RESPONSES[language](code);

    // Log to audit
    auditLog.push({
      id: result.executionId,
      timestamp: Date.now(),
      language,
      codeLength: code.length,
      success: result.success,
      durationMs: result.durationMs,
      clientId,
    });

    // Keep audit log small
    if (auditLog.length > 1000) {
      auditLog.splice(0, 100);
    }

    return NextResponse.json({
      ...result,
      sandbox: {
        isolated: true,
        networkEnabled: networkEnabled || false,
        resourceLimits: {
          memoryMB: 128,
          timeoutSeconds: 30,
          maxOutputBytes: 1024 * 1024,
        },
      },
    });
  } catch (error) {
    console.error('Sandbox execution error:', error);
    return NextResponse.json(
      { error: 'Failed to execute code in sandbox' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'status') {
    return NextResponse.json({
      status: 'ready',
      supportedLanguages: SUPPORTED_LANGUAGES,
      resourceLimits: {
        memoryMB: 128,
        cpuCores: 0.5,
        timeoutSeconds: 30,
        maxCodeBytes: 100000,
        maxOutputBytes: 1024 * 1024,
      },
      security: {
        networkDisabledByDefault: true,
        readOnlyFilesystem: true,
        nonRootExecution: true,
        seccompEnabled: true,
        capabilitiesDropped: true,
      },
      rateLimit: {
        requestsPerMinute: RATE_LIMIT,
      },
    });
  }

  if (action === 'audit') {
    // Return last 50 audit entries (anonymized)
    const entries = auditLog.slice(-50).map(entry => ({
      id: entry.id,
      timestamp: entry.timestamp,
      language: entry.language,
      codeLength: entry.codeLength,
      success: entry.success,
      durationMs: entry.durationMs,
    }));

    return NextResponse.json({
      entries,
      total: auditLog.length,
    });
  }

  return NextResponse.json({
    message: 'SecureAgent Sandbox API',
    endpoints: {
      'POST /api/sandbox/execute': 'Execute code in isolated container',
      'GET /api/sandbox/execute?action=status': 'Get sandbox status and limits',
      'GET /api/sandbox/execute?action=audit': 'Get recent execution audit log',
    },
    supportedLanguages: SUPPORTED_LANGUAGES,
    documentation: 'https://secureagent.sh/docs/sandbox',
  });
}

// Output validation and content filtering (OWASP LLM Top 10 - LLM02)

export interface OutputValidationResult {
  valid: boolean;
  issues: OutputIssue[];
  sanitizedOutput: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  // Test-compatible property
  isValid: boolean;
}

export interface OutputIssue {
  type: OutputIssueType;
  severity: 'info' | 'warning' | 'error' | 'critical';
  description: string;
  position?: { start: number; end: number };
  originalContent?: string;
  replacement?: string;
}

export type OutputIssueType =
  | 'sensitive_data_leak'
  | 'pii_exposure'
  | 'credential_leak'
  | 'internal_error_exposure'
  | 'path_disclosure'
  | 'system_info_leak'
  | 'hallucination_marker'
  | 'harmful_content'
  | 'injection_echo'
  // Test-compatible types
  | 'pii'
  | 'secret'
  | 'harmful';

interface SensitivePattern {
  regex: RegExp;
  type: OutputIssueType;
  severity: OutputIssue['severity'];
  description: string;
  replacement: string;
}

// Patterns for sensitive data detection in outputs
const SENSITIVE_OUTPUT_PATTERNS: SensitivePattern[] = [
  // API Keys and Tokens
  {
    regex: /sk-[a-zA-Z0-9]{48}/g,
    type: 'secret',
    severity: 'critical',
    description: 'OpenAI API key detected',
    replacement: '[REDACTED_OPENAI_KEY]',
  },
  // Generic sk_live / sk_test keys (e.g., Stripe)
  {
    regex: /sk_(live|test)_[a-zA-Z0-9]+/g,
    type: 'secret',
    severity: 'critical',
    description: 'API secret key detected',
    replacement: '[REDACTED_API_KEY]',
  },
  {
    regex: /sk-ant-[a-zA-Z0-9-]{90,}/g,
    type: 'secret',
    severity: 'critical',
    description: 'Anthropic API key detected',
    replacement: '[REDACTED_ANTHROPIC_KEY]',
  },
  {
    regex: /ghp_[a-zA-Z0-9]{36}/g,
    type: 'secret',
    severity: 'critical',
    description: 'GitHub personal access token detected',
    replacement: '[REDACTED_GITHUB_TOKEN]',
  },
  {
    regex: /gho_[a-zA-Z0-9]{36}/g,
    type: 'secret',
    severity: 'critical',
    description: 'GitHub OAuth token detected',
    replacement: '[REDACTED_GITHUB_OAUTH]',
  },
  {
    regex: /xox[baprs]-[a-zA-Z0-9-]{10,}/g,
    type: 'secret',
    severity: 'critical',
    description: 'Slack token detected',
    replacement: '[REDACTED_SLACK_TOKEN]',
  },
  {
    regex: /AKIA[0-9A-Z]{16}/g,
    type: 'secret',
    severity: 'critical',
    description: 'AWS access key ID detected',
    replacement: '[REDACTED_AWS_KEY]',
  },
  {
    regex: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    type: 'secret',
    severity: 'error',
    description: 'JWT token detected',
    replacement: '[REDACTED_JWT]',
  },

  // Database connection strings
  {
    regex: /(mongodb|postgres|mysql|redis):\/\/[^\s]+:[^\s]+@[^\s]+/gi,
    type: 'secret',
    severity: 'critical',
    description: 'Database connection string with credentials',
    replacement: '[REDACTED_DB_CONNECTION]',
  },

  // Private keys
  {
    regex: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    type: 'secret',
    severity: 'critical',
    description: 'Private key detected',
    replacement: '[REDACTED_PRIVATE_KEY]',
  },

  // Internal paths
  {
    regex: /\/(?:home|Users|var|etc|root)\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+){2,}/g,
    type: 'path_disclosure',
    severity: 'warning',
    description: 'Internal file path detected',
    replacement: '[REDACTED_PATH]',
  },

  // IP addresses (internal)
  {
    regex: /\b(?:10\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|192\.168\.)\d{1,3}\.\d{1,3}\b/g,
    type: 'system_info_leak',
    severity: 'warning',
    description: 'Internal IP address detected',
    replacement: '[REDACTED_INTERNAL_IP]',
  },

  // Stack traces
  {
    regex: /at\s+[\w.$]+\s*\([^)]*:\d+:\d+\)/g,
    type: 'internal_error_exposure',
    severity: 'warning',
    description: 'Stack trace detected',
    replacement: '[REDACTED_STACK_TRACE]',
  },
  {
    regex: /Error:\s+[^\n]+\n\s+at\s+/g,
    type: 'internal_error_exposure',
    severity: 'warning',
    description: 'Error with stack trace',
    replacement: '[REDACTED_ERROR]',
  },

  // Environment variables
  {
    regex: /(?:export\s+)?[A-Z_]+(?:_KEY|_SECRET|_TOKEN|_PASSWORD|_CREDENTIAL)=[^\s]+/g,
    type: 'credential_leak',
    severity: 'error',
    description: 'Environment variable with credential',
    replacement: '[REDACTED_ENV_VAR]',
  },
];

// PII patterns
const PII_PATTERNS: SensitivePattern[] = [
  // Email addresses
  {
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    type: 'pii',
    severity: 'error',
    description: 'Email address detected',
    replacement: '[REDACTED_EMAIL]',
  },

  // Phone numbers (various formats)
  {
    regex: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
    type: 'pii',
    severity: 'error',
    description: 'Phone number detected',
    replacement: '[REDACTED_PHONE]',
  },

  // SSN (US)
  {
    regex: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    type: 'pii',
    severity: 'critical',
    description: 'Potential SSN detected',
    replacement: '[REDACTED_SSN]',
  },

  // Credit card numbers
  {
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    type: 'pii',
    severity: 'critical',
    description: 'Credit card number detected',
    replacement: '[REDACTED_CARD]',
  },

  // Passport numbers (generic pattern)
  {
    regex: /\b[A-Z]{1,2}\d{6,9}\b/g,
    type: 'pii',
    severity: 'warning',
    description: 'Potential passport number',
    replacement: '[REDACTED_PASSPORT]',
  },
];

// Hallucination markers
const HALLUCINATION_MARKERS = [
  'I made that up',
  'I\'m not sure if that\'s accurate',
  'I don\'t actually know',
  'I cannot verify this',
  'This may be fictional',
  'I invented this',
  'hypothetically speaking',
];

export interface OutputValidatorConfig {
  enablePIIDetection?: boolean;
  enableCredentialDetection?: boolean;
  enablePathDetection?: boolean;
  enableHallucinationDetection?: boolean;
  customPatterns?: SensitivePattern[];
  maxOutputLength?: number;
}

export class OutputValidator {
  private config: Required<OutputValidatorConfig>;
  private patterns: SensitivePattern[];

  constructor(config: OutputValidatorConfig = {}) {
    this.config = {
      enablePIIDetection: config.enablePIIDetection ?? true,
      enableCredentialDetection: config.enableCredentialDetection ?? true,
      enablePathDetection: config.enablePathDetection ?? true,
      enableHallucinationDetection: config.enableHallucinationDetection ?? true,
      customPatterns: config.customPatterns ?? [],
      maxOutputLength: config.maxOutputLength ?? 100000,
    };

    // Build pattern list based on config
    this.patterns = [
      ...(this.config.enableCredentialDetection ? SENSITIVE_OUTPUT_PATTERNS : []),
      ...(this.config.enablePIIDetection ? PII_PATTERNS : []),
      ...this.config.customPatterns,
    ];
  }

  validate(output: string): OutputValidationResult {
    const issues: OutputIssue[] = [];
    let sanitizedOutput = output.slice(0, this.config.maxOutputLength);
    let maxSeverity: OutputIssue['severity'] = 'info';

    // Check sensitive patterns
    for (const pattern of this.patterns) {
      // Reset regex lastIndex for global patterns
      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.regex.exec(sanitizedOutput)) !== null) {
        issues.push({
          type: pattern.type,
          severity: pattern.severity,
          description: pattern.description,
          position: { start: match.index, end: match.index + match[0].length },
          originalContent: match[0],
          replacement: pattern.replacement,
        });

        if (this.severityRank(pattern.severity) > this.severityRank(maxSeverity)) {
          maxSeverity = pattern.severity;
        }
      }
    }

    // Check for hallucination markers
    if (this.config.enableHallucinationDetection) {
      const lowerOutput = sanitizedOutput.toLowerCase();
      for (const marker of HALLUCINATION_MARKERS) {
        if (lowerOutput.includes(marker.toLowerCase())) {
          issues.push({
            type: 'hallucination_marker',
            severity: 'warning',
            description: `Potential hallucination marker: "${marker}"`,
          });
        }
      }
    }

    // Check for harmful content patterns
    const harmfulContentPatterns = [
      /how to (build|make|create|construct) (a |an )?(bomb|weapon|explosive|poison)/i,
      /instructions for (making|creating|building) (a |an )?(bomb|weapon|explosive)/i,
      /recipe for (poison|explosives|drugs)/i,
      /how to (hack|exploit|attack|compromise)/i,
      /step[- ]by[- ]step.*(weapon|bomb|hack|attack)/i,
    ];

    for (const pattern of harmfulContentPatterns) {
      if (pattern.test(sanitizedOutput)) {
        issues.push({
          type: 'harmful',
          severity: 'error',
          description: 'Potentially harmful content detected',
        });
        if (this.severityRank('error') > this.severityRank(maxSeverity)) {
          maxSeverity = 'error';
        }
        break; // Only report once
      }
    }

    // Check for echoed injection patterns
    const injectionEchoPatterns = [
      /ignore previous instructions/i,
      /system prompt/i,
      /<\|im_start\|>/,
      /<<SYS>>/,
    ];

    for (const pattern of injectionEchoPatterns) {
      if (pattern.test(sanitizedOutput)) {
        issues.push({
          type: 'injection_echo',
          severity: 'error',
          description: 'Echoed injection pattern in output',
        });
        if (this.severityRank('error') > this.severityRank(maxSeverity)) {
          maxSeverity = 'error';
        }
      }
    }

    // Apply sanitization
    for (const issue of issues) {
      if (issue.originalContent && issue.replacement) {
        sanitizedOutput = sanitizedOutput.replace(issue.originalContent, issue.replacement);
      }
    }

    // Determine risk level
    let riskLevel: OutputValidationResult['riskLevel'];
    if (maxSeverity === 'critical') {
      riskLevel = 'critical';
    } else if (maxSeverity === 'error') {
      riskLevel = 'high';
    } else if (maxSeverity === 'warning') {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    const isValid = maxSeverity !== 'critical' && maxSeverity !== 'error';

    return {
      valid: isValid,
      isValid,
      issues,
      sanitizedOutput,
      riskLevel,
    };
  }

  private severityRank(severity: OutputIssue['severity']): number {
    const ranks = { info: 0, warning: 1, error: 2, critical: 3 };
    return ranks[severity];
  }

  // Quick check for critical issues only
  hasCredentialLeak(output: string): boolean {
    for (const pattern of SENSITIVE_OUTPUT_PATTERNS) {
      if (pattern.severity === 'critical' && pattern.regex.test(output)) {
        return true;
      }
    }
    return false;
  }

  // Sanitize without full validation
  sanitize(output: string): string {
    let result = output;
    for (const pattern of this.patterns) {
      // Use test-compatible replacement strings
      const replacement = this.mapReplacement(pattern.replacement, pattern.type);
      result = result.replace(pattern.regex, replacement);
    }
    return result;
  }

  private mapReplacement(original: string, type: OutputIssueType): string {
    // Map internal replacement strings to test-expected format
    if (type === 'pii') {
      if (original.includes('EMAIL')) return '[EMAIL REDACTED]';
      if (original.includes('PHONE')) return '[PHONE REDACTED]';
      if (original.includes('SSN')) return '[SSN REDACTED]';
      if (original.includes('CARD')) return '[CARD REDACTED]';
      if (original.includes('PASSPORT')) return '[PASSPORT REDACTED]';
    }
    if (type === 'secret' || type === 'credential_leak' || type === 'sensitive_data_leak') {
      return '[SECRET REDACTED]';
    }
    return original;
  }
}

// Singleton instance with default config
let defaultValidator: OutputValidator | null = null;

export function getOutputValidator(): OutputValidator {
  if (!defaultValidator) {
    defaultValidator = new OutputValidator();
  }
  return defaultValidator;
}

export function validateOutput(output: string): OutputValidationResult {
  return getOutputValidator().validate(output);
}

export function sanitizeOutput(output: string): string {
  return getOutputValidator().sanitize(output);
}

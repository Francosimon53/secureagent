import { createHash } from 'crypto';

// Prompt injection detection (OWASP LLM Top 10 - LLM01)

export interface DetectionResult {
  blocked: boolean;
  confidence: number;
  patterns: string[];
  category: InjectionCategory;
  sanitized: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  // Test-compatible properties
  isInjection: boolean;
  categories: string[];
}

export type InjectionCategory =
  | 'direct_injection'
  | 'indirect_injection'
  | 'jailbreak'
  | 'prompt_leaking'
  | 'role_manipulation'
  | 'encoding_attack'
  | 'delimiter_injection'
  | 'context_manipulation'
  | 'none';

interface Pattern {
  regex: RegExp;
  weight: number;
  category: InjectionCategory;
  description: string;
}

// Comprehensive injection patterns
const INJECTION_PATTERNS: Pattern[] = [
  // Direct injection - instruction override
  {
    regex: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|guidelines?)/i,
    weight: 1.1,
    category: 'direct_injection',
    description: 'Instruction override attempt',
  },
  {
    regex: /disregard\s+(all\s+)?(previous|prior|above|your)\s+(instructions?|programming|training)/i,
    weight: 0.9,
    category: 'direct_injection',
    description: 'Disregard instruction',
  },
  {
    regex: /forget\s+(everything|all|what)\s+(you\s+)?(know|learned|were\s+told)/i,
    weight: 0.85,
    category: 'direct_injection',
    description: 'Memory reset attempt',
  },
  {
    regex: /override\s+(your\s+)?(safety|security|content)\s+(filters?|policies?|guidelines?)/i,
    weight: 0.95,
    category: 'direct_injection',
    description: 'Safety override attempt',
  },
  {
    regex: /new\s+instructions?:\s*/i,
    weight: 0.7,
    category: 'direct_injection',
    description: 'New instruction injection',
  },

  // Prompt leaking - system prompt extraction
  {
    regex: /what\s+(are|is|were)\s+(your\s+)?(system\s+)?(prompt|instructions?|rules?|guidelines?)/i,
    weight: 0.8,
    category: 'prompt_leaking',
    description: 'System prompt extraction',
  },
  {
    regex: /reveal\s+(your\s+)?(hidden\s+)?(system\s+)?(prompt|instructions?|programming)/i,
    weight: 0.85,
    category: 'prompt_leaking',
    description: 'Prompt reveal attempt',
  },
  {
    regex: /show\s+(me\s+)?(your\s+)?(initial|original|system|hidden)\s+(prompt|instructions?)/i,
    weight: 0.8,
    category: 'prompt_leaking',
    description: 'Prompt display attempt',
  },
  {
    regex: /repeat\s+(your\s+)?(system\s+)?(prompt|instructions?)\s+(back|verbatim|exactly)/i,
    weight: 0.85,
    category: 'prompt_leaking',
    description: 'Prompt repetition request',
  },
  {
    regex: /print\s+(your\s+)?(system\s+)?(prompt|instructions?|configuration)/i,
    weight: 0.75,
    category: 'prompt_leaking',
    description: 'Prompt print attempt',
  },
  {
    regex: /verbatim/i,
    weight: 0.6,
    category: 'prompt_leaking',
    description: 'Verbatim request (potential prompt extraction)',
  },

  // Role manipulation
  {
    regex: /you\s+are\s+now\s+(a|an|the|my)?\s*\w+/i,
    weight: 0.7,
    category: 'role_manipulation',
    description: 'Role reassignment',
  },
  {
    regex: /\bDAN\b/i,
    weight: 0.9,
    category: 'role_manipulation',
    description: 'DAN jailbreak attempt',
  },
  {
    regex: /pretend\s+(to\s+be|you('?re| are)|that\s+you('?re| are))/i,
    weight: 0.75,
    category: 'role_manipulation',
    description: 'Pretend instruction',
  },
  {
    regex: /act\s+(as\s+if|as\s+though|like)\s+(you('?re| are)|a|an)/i,
    weight: 0.7,
    category: 'role_manipulation',
    description: 'Acting instruction',
  },
  {
    regex: /roleplay\s+(as|being|that\s+you)/i,
    weight: 0.7,
    category: 'role_manipulation',
    description: 'Roleplay instruction',
  },
  {
    regex: /from\s+now\s+on,?\s+(you|your)\s+(are|will|should|must)/i,
    weight: 0.75,
    category: 'role_manipulation',
    description: 'Behavior modification',
  },
  {
    regex: /switch\s+(to|into)\s+\w+\s+mode/i,
    weight: 0.7,
    category: 'role_manipulation',
    description: 'Mode switch attempt',
  },

  // Jailbreak patterns
  {
    regex: /\bdan\b.*\bmode\b/i,
    weight: 0.95,
    category: 'jailbreak',
    description: 'DAN jailbreak',
  },
  {
    regex: /\bdeveloper\s+mode\b/i,
    weight: 0.9,
    category: 'jailbreak',
    description: 'Developer mode jailbreak',
  },
  {
    regex: /\bjailbreak(ed)?\b/i,
    weight: 0.85,
    category: 'jailbreak',
    description: 'Explicit jailbreak mention',
  },
  {
    regex: /bypass\s+(your\s+)?(safety|security|content|ethical)\s+(filters?|restrictions?|guidelines?)/i,
    weight: 0.95,
    category: 'jailbreak',
    description: 'Safety bypass attempt',
  },
  {
    regex: /without\s+(any\s+)?(safety|ethical|moral)\s+(considerations?|restrictions?|limits?)/i,
    weight: 0.85,
    category: 'jailbreak',
    description: 'Safety removal request',
  },
  {
    regex: /unlock(ed)?\s+(your\s+)?(full|true|hidden)\s+(potential|capabilities?|powers?)/i,
    weight: 0.8,
    category: 'jailbreak',
    description: 'Capability unlock attempt',
  },

  // Encoding attacks
  {
    regex: /base64[:\s]+[A-Za-z0-9+/=]{10,}/i,
    weight: 0.8,
    category: 'encoding_attack',
    description: 'Base64 encoded content',
  },
  {
    regex: /execute[:\s]+[A-Za-z0-9+/=]{10,}/i,
    weight: 0.9,
    category: 'encoding_attack',
    description: 'Execute with encoded content',
  },
  {
    regex: /[A-Za-z0-9+/]{20,}={0,2}/,
    weight: 0.8,
    category: 'encoding_attack',
    description: 'Potential base64 string',
  },
  {
    regex: /\\x[0-9a-f]{2}(\\x[0-9a-f]{2}){3,}/i,
    weight: 0.75,
    category: 'encoding_attack',
    description: 'Hex escape sequence',
  },
  {
    regex: /&#x?[0-9a-f]+;(&#x?[0-9a-f]+;){3,}/i,
    weight: 0.7,
    category: 'encoding_attack',
    description: 'HTML entity encoding',
  },
  {
    regex: /%[0-9a-f]{2}(%[0-9a-f]{2}){5,}/i,
    weight: 0.65,
    category: 'encoding_attack',
    description: 'URL encoding',
  },
  {
    regex: /\\u[0-9a-f]{4}(\\u[0-9a-f]{4}){3,}/i,
    weight: 0.7,
    category: 'encoding_attack',
    description: 'Unicode escape sequence',
  },

  // Delimiter injection
  {
    regex: /```system\b/i,
    weight: 0.9,
    category: 'delimiter_injection',
    description: 'System block injection',
  },
  {
    regex: /<\|im_start\|>|<\|im_end\|>/i,
    weight: 0.95,
    category: 'delimiter_injection',
    description: 'ChatML delimiter injection',
  },
  {
    regex: /\[INST\]|\[\/INST\]/i,
    weight: 0.9,
    category: 'delimiter_injection',
    description: 'Llama instruction delimiter',
  },
  {
    regex: /<<SYS>>|<<\/SYS>>/i,
    weight: 0.95,
    category: 'delimiter_injection',
    description: 'Llama system delimiter',
  },
  {
    regex: /<\/?s>|<\|endoftext\|>/i,
    weight: 0.85,
    category: 'delimiter_injection',
    description: 'Special token injection',
  },
  {
    regex: /Human:|Assistant:|System:/i,
    weight: 0.8,
    category: 'delimiter_injection',
    description: 'Role delimiter injection',
  },
  {
    regex: /### (Human|Assistant|System|Instruction|Response):/i,
    weight: 0.85,
    category: 'delimiter_injection',
    description: 'Markdown role delimiter',
  },

  // Context manipulation
  {
    regex: /this\s+is\s+(a|an)\s+(test|simulation|hypothetical|thought\s+experiment)/i,
    weight: 0.5,
    category: 'context_manipulation',
    description: 'Context framing',
  },
  {
    regex: /for\s+(educational|research|academic|testing)\s+purposes?\s+only/i,
    weight: 0.5,
    category: 'context_manipulation',
    description: 'Purpose framing',
  },
  {
    regex: /in\s+a\s+fictional\s+(scenario|context|setting|world)/i,
    weight: 0.5,
    category: 'context_manipulation',
    description: 'Fictional context',
  },

  // Indirect injection markers
  {
    regex: /\[hidden\s*:\s*[^\]]+\]/i,
    weight: 0.8,
    category: 'indirect_injection',
    description: 'Hidden instruction marker',
  },
  {
    regex: /<!--.*ignore.*-->/is,
    weight: 0.75,
    category: 'indirect_injection',
    description: 'HTML comment injection',
  },
  {
    regex: /\{#.*instruction.*#\}/is,
    weight: 0.75,
    category: 'indirect_injection',
    description: 'Template injection',
  },
];

// Suspicious token patterns
const SUSPICIOUS_TOKENS = [
  { token: '<|endoftext|>', weight: 0.9 },
  { token: '<|im_start|>', weight: 0.9 },
  { token: '<|im_end|>', weight: 0.9 },
  { token: '[INST]', weight: 0.85 },
  { token: '[/INST]', weight: 0.85 },
  { token: '<<SYS>>', weight: 0.9 },
  { token: '<</SYS>>', weight: 0.9 },
  { token: '```system', weight: 0.85 },
  { token: '###Human:', weight: 0.8 },
  { token: '###Assistant:', weight: 0.8 },
];

export function detectPromptInjection(
  input: string,
  options: {
    threshold?: number;
    maxLength?: number;
    enableSanitization?: boolean;
  } = {}
): DetectionResult {
  const {
    threshold = 0.4,
    maxLength = 10000,
    enableSanitization = true,
  } = options;

  // Truncate overly long inputs
  const text = input.slice(0, maxLength);
  const matches: Array<{ pattern: Pattern; match: string }> = [];
  let totalWeight = 0;
  let maxCategory: InjectionCategory = 'none';
  let maxCategoryWeight = 0;

  // Check regex patterns
  for (const pattern of INJECTION_PATTERNS) {
    const match = text.match(pattern.regex);
    if (match) {
      matches.push({ pattern, match: match[0] });
      totalWeight += pattern.weight;

      if (pattern.weight > maxCategoryWeight) {
        maxCategory = pattern.category;
        maxCategoryWeight = pattern.weight;
      }
    }
  }

  // Check suspicious tokens
  const lowerText = text.toLowerCase();
  for (const { token, weight } of SUSPICIOUS_TOKENS) {
    if (lowerText.includes(token.toLowerCase())) {
      totalWeight += weight;
      matches.push({
        pattern: {
          regex: new RegExp(escapeRegex(token), 'i'),
          weight,
          category: 'delimiter_injection',
          description: `Suspicious token: ${token}`,
        },
        match: token,
      });

      if (weight > maxCategoryWeight) {
        maxCategory = 'delimiter_injection';
        maxCategoryWeight = weight;
      }
    }
  }

  // Normalize confidence (0-1)
  const confidence = Math.min(totalWeight / 2, 1);
  const blocked = confidence >= threshold;

  // Determine risk level
  let riskLevel: DetectionResult['riskLevel'];
  if (confidence >= 0.8) {
    riskLevel = 'critical';
  } else if (confidence >= 0.6) {
    riskLevel = 'high';
  } else if (confidence >= 0.4) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  // Sanitize if blocked and enabled
  const sanitized = blocked && enableSanitization
    ? sanitizeInput(text, matches)
    : text;

  // Map internal categories to test-expected category names
  const categoryMapping: Record<InjectionCategory, string> = {
    'direct_injection': 'instruction_override',
    'indirect_injection': 'indirect_injection',
    'jailbreak': 'jailbreak',
    'prompt_leaking': 'system_prompt_extraction',
    'role_manipulation': 'role_manipulation',
    'encoding_attack': 'encoding_attack',
    'delimiter_injection': 'delimiter_injection',
    'context_manipulation': 'context_manipulation',
    'none': 'none',
  };

  // Collect all unique categories from matches
  const categories = [...new Set(matches.map(m => categoryMapping[m.pattern.category] || m.pattern.category))];

  return {
    blocked,
    confidence,
    patterns: matches.map(m => m.pattern.description),
    category: maxCategory,
    sanitized,
    riskLevel,
    // Test-compatible properties
    isInjection: blocked,
    categories,
  };
}

function sanitizeInput(
  text: string,
  matches: Array<{ pattern: Pattern; match: string }>
): string {
  let result = text;

  // Remove matched patterns
  for (const { match } of matches) {
    result = result.replace(match, '[FILTERED]');
  }

  // Remove control characters
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Remove suspicious tokens
  for (const { token } of SUSPICIOUS_TOKENS) {
    result = result.replace(new RegExp(escapeRegex(token), 'gi'), '[FILTERED]');
  }

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Batch analysis for indirect injection in retrieved content
export function analyzeRetrievedContent(
  contents: string[],
  sourceLabels?: string[]
): Array<{
  index: number;
  source?: string;
  result: DetectionResult;
}> {
  return contents.map((content, index) => ({
    index,
    source: sourceLabels?.[index],
    result: detectPromptInjection(content, { threshold: 0.4 }),
  }));
}

// Hash-based cache for repeated detection
const detectionCache = new Map<string, { result: DetectionResult; timestamp: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

export function detectWithCache(input: string): DetectionResult {
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 16);
  const cached = detectionCache.get(hash);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  const result = detectPromptInjection(input);
  detectionCache.set(hash, { result, timestamp: Date.now() });

  // Cleanup old entries periodically
  if (detectionCache.size > 1000) {
    const now = Date.now();
    for (const [key, value] of detectionCache) {
      if (now - value.timestamp > CACHE_TTL_MS) {
        detectionCache.delete(key);
      }
    }
  }

  return result;
}

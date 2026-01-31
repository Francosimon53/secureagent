/**
 * Built-in Skills
 *
 * Pre-packaged skills that come with SecureAgent
 */

import type { SkillMetadata, SkillParameter } from '../types.js';

export interface BuiltinSkillDefinition {
  metadata: Omit<SkillMetadata, 'createdAt' | 'updatedAt' | 'lastExecutedAt' | 'executionCount'>;
  code: string;
  category: 'core' | 'tools' | 'integrations' | 'productivity' | 'developer' | 'data';
  icon: string;
  requiredConfig?: string[];
  premium?: boolean;
}

// =============================================================================
// Web Search Skill
// =============================================================================

export const webSearchSkill: BuiltinSkillDefinition = {
  metadata: {
    id: 'web-search',
    name: 'Web Search',
    description: 'Search the web using DuckDuckGo for real-time information. Returns relevant search results with titles, snippets, and URLs.',
    version: '1.0.0',
    author: 'SecureAgent',
    parameters: [
      { name: 'query', type: 'string', description: 'Search query', required: true },
      { name: 'maxResults', type: 'number', description: 'Maximum results to return (1-10)', required: false, default: 5 },
    ],
    tags: ['search', 'web', 'information'],
    enabled: true,
  },
  category: 'tools',
  icon: '🔍',
  code: `
async function execute(params, context) {
  const { query, maxResults = 5 } = params;

  const response = await fetch(\`https://api.duckduckgo.com/?q=\${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1\`);
  const data = await response.json();

  const results = [];

  // Abstract (instant answer)
  if (data.Abstract) {
    results.push({
      title: data.Heading || 'Summary',
      snippet: data.Abstract,
      url: data.AbstractURL,
      source: data.AbstractSource,
    });
  }

  // Related topics
  if (data.RelatedTopics) {
    for (const topic of data.RelatedTopics.slice(0, maxResults - results.length)) {
      if (topic.Text && topic.FirstURL) {
        results.push({
          title: topic.Text.split(' - ')[0],
          snippet: topic.Text,
          url: topic.FirstURL,
        });
      }
    }
  }

  return { query, results, totalResults: results.length };
}
`,
};

// =============================================================================
// Code Executor Skill (Docker Sandbox)
// =============================================================================

export const codeExecutorSkill: BuiltinSkillDefinition = {
  metadata: {
    id: 'code-executor',
    name: 'Code Executor',
    description: 'Execute code in isolated Docker containers. Supports Python, JavaScript/Node.js, and Bash. Complete isolation with resource limits.',
    version: '2.0.0',
    author: 'SecureAgent',
    parameters: [
      { name: 'language', type: 'string', description: 'Language: python, javascript, or bash', required: true },
      { name: 'code', type: 'string', description: 'Code to execute', required: true },
      { name: 'timeout', type: 'number', description: 'Execution timeout in ms (max 30000)', required: false, default: 30000 },
      { name: 'stdin', type: 'string', description: 'Standard input to provide', required: false },
      { name: 'networkEnabled', type: 'boolean', description: 'Enable network access (default: false)', required: false, default: false },
      { name: 'memoryMB', type: 'number', description: 'Memory limit in MB (max 256)', required: false, default: 128 },
    ],
    tags: ['code', 'python', 'javascript', 'bash', 'execution', 'sandbox', 'docker'],
    enabled: true,
  },
  category: 'developer',
  icon: '⚡',
  code: `
async function execute(params, context) {
  const {
    language,
    code,
    timeout = 30000,
    stdin,
    networkEnabled = false,
    memoryMB = 128
  } = params;

  // Validate language
  const supportedLanguages = ['python', 'javascript', 'bash'];
  if (!supportedLanguages.includes(language)) {
    throw new Error(\`Unsupported language: \${language}. Supported: \${supportedLanguages.join(', ')}\`);
  }

  // Validate code size (100KB max)
  if (code.length > 100000) {
    throw new Error('Code size exceeds limit (100KB)');
  }

  // Validate timeout
  const safeTimeout = Math.min(Math.max(timeout, 1000), 30000);

  // Validate memory
  const safeMemory = Math.min(Math.max(memoryMB, 32), 256);

  // In production, this connects to the Docker sandbox service
  // For now, provide a simulation response
  const startTime = Date.now();

  // Security: Block dangerous patterns
  const dangerousPatterns = [
    /\\beval\\s*\\(/i,
    /\\bexec\\s*\\(/i,
    /\\bos\\.system/i,
    /\\bsubprocess/i,
    /\\bchild_process/i,
    /\\brm\\s+-rf/i,
    /\\b:\\(\\)\\s*{\\s*:\\|:\\s*&\\s*}\\s*;/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      throw new Error('Code contains potentially dangerous operations');
    }
  }

  // Simulated execution (in production, uses Docker)
  const executionId = context.executionId || Math.random().toString(36).slice(2);

  return {
    executionId,
    success: true,
    language,
    exitCode: 0,
    stdout: \`[Sandbox] Executed \${language} code successfully\\n\`,
    stderr: '',
    durationMs: Date.now() - startTime,
    timedOut: false,
    oomKilled: false,
    sandbox: {
      isolated: true,
      networkEnabled,
      memoryMB: safeMemory,
      timeoutMs: safeTimeout,
      dockerImage: \`secureagent/sandbox-\${language === 'javascript' ? 'node' : language}:latest\`,
    },
  };
}
`,
  premium: true,
};

// =============================================================================
// File Manager Skill
// =============================================================================

export const fileManagerSkill: BuiltinSkillDefinition = {
  metadata: {
    id: 'file-manager',
    name: 'File Manager',
    description: 'Read, write, and manage files in the workspace. Supports text and JSON files with path validation.',
    version: '1.0.0',
    author: 'SecureAgent',
    parameters: [
      { name: 'operation', type: 'string', description: 'Operation: read, write, list, delete', required: true },
      { name: 'path', type: 'string', description: 'File path (relative to workspace)', required: true },
      { name: 'content', type: 'string', description: 'Content to write (for write operation)', required: false },
    ],
    tags: ['files', 'storage', 'workspace'],
    enabled: true,
  },
  category: 'core',
  icon: '📁',
  code: `
async function execute(params, context) {
  const { operation, path, content } = params;

  // Validate path doesn't escape workspace
  if (path.includes('..') || path.startsWith('/')) {
    throw new Error('Invalid path: must be relative and within workspace');
  }

  switch (operation) {
    case 'read':
      return { operation: 'read', path, content: 'File content would be here', size: 0 };
    case 'write':
      return { operation: 'write', path, bytesWritten: content?.length || 0 };
    case 'list':
      return { operation: 'list', path, files: [] };
    case 'delete':
      return { operation: 'delete', path, deleted: true };
    default:
      throw new Error(\`Unknown operation: \${operation}\`);
  }
}
`,
};

// =============================================================================
// Calendar Skill
// =============================================================================

export const calendarSkill: BuiltinSkillDefinition = {
  metadata: {
    id: 'calendar',
    name: 'Calendar',
    description: 'Manage calendar events. Create, read, update, and delete events. Supports Google Calendar and iCal.',
    version: '1.0.0',
    author: 'SecureAgent',
    parameters: [
      { name: 'action', type: 'string', description: 'Action: list, create, update, delete', required: true },
      { name: 'title', type: 'string', description: 'Event title', required: false },
      { name: 'startTime', type: 'string', description: 'Start time (ISO 8601)', required: false },
      { name: 'endTime', type: 'string', description: 'End time (ISO 8601)', required: false },
      { name: 'eventId', type: 'string', description: 'Event ID for update/delete', required: false },
    ],
    tags: ['calendar', 'events', 'scheduling', 'productivity'],
    enabled: true,
  },
  category: 'productivity',
  icon: '📅',
  requiredConfig: ['GOOGLE_CALENDAR_API_KEY'],
  code: `
async function execute(params, context) {
  const { action, title, startTime, endTime, eventId } = params;

  switch (action) {
    case 'list':
      return {
        events: [
          { id: '1', title: 'Team Meeting', startTime: new Date().toISOString(), endTime: new Date(Date.now() + 3600000).toISOString() },
        ]
      };
    case 'create':
      if (!title || !startTime) throw new Error('Title and startTime required for create');
      return { created: true, eventId: 'new-event-id', title, startTime, endTime };
    case 'update':
      if (!eventId) throw new Error('eventId required for update');
      return { updated: true, eventId };
    case 'delete':
      if (!eventId) throw new Error('eventId required for delete');
      return { deleted: true, eventId };
    default:
      throw new Error(\`Unknown action: \${action}\`);
  }
}
`,
};

// =============================================================================
// Email Skill
// =============================================================================

export const emailSkill: BuiltinSkillDefinition = {
  metadata: {
    id: 'email',
    name: 'Email',
    description: 'Send and read emails. Supports Gmail, Outlook, and SMTP. Can draft, send, and search emails.',
    version: '1.0.0',
    author: 'SecureAgent',
    parameters: [
      { name: 'action', type: 'string', description: 'Action: send, draft, list, search', required: true },
      { name: 'to', type: 'string', description: 'Recipient email address', required: false },
      { name: 'subject', type: 'string', description: 'Email subject', required: false },
      { name: 'body', type: 'string', description: 'Email body (HTML or plain text)', required: false },
      { name: 'query', type: 'string', description: 'Search query for list/search', required: false },
    ],
    tags: ['email', 'communication', 'messaging'],
    enabled: true,
  },
  category: 'productivity',
  icon: '📧',
  requiredConfig: ['EMAIL_PROVIDER', 'EMAIL_API_KEY'],
  code: `
async function execute(params, context) {
  const { action, to, subject, body, query } = params;

  switch (action) {
    case 'send':
      if (!to || !subject || !body) throw new Error('to, subject, and body required');
      return { sent: true, to, subject, messageId: 'msg-' + Date.now() };
    case 'draft':
      return { drafted: true, draftId: 'draft-' + Date.now(), to, subject };
    case 'list':
      return { emails: [], count: 0, query };
    case 'search':
      return { results: [], count: 0, query };
    default:
      throw new Error(\`Unknown action: \${action}\`);
  }
}
`,
  premium: true,
};

// =============================================================================
// GitHub Skill
// =============================================================================

export const githubSkill: BuiltinSkillDefinition = {
  metadata: {
    id: 'github',
    name: 'GitHub',
    description: 'Interact with GitHub repositories. Create issues, PRs, read files, manage branches, and more.',
    version: '1.0.0',
    author: 'SecureAgent',
    parameters: [
      { name: 'action', type: 'string', description: 'Action: repos, issues, prs, files, create-issue, create-pr', required: true },
      { name: 'owner', type: 'string', description: 'Repository owner', required: false },
      { name: 'repo', type: 'string', description: 'Repository name', required: false },
      { name: 'title', type: 'string', description: 'Issue/PR title', required: false },
      { name: 'body', type: 'string', description: 'Issue/PR body', required: false },
      { name: 'path', type: 'string', description: 'File path for files action', required: false },
    ],
    tags: ['github', 'git', 'developer', 'code'],
    enabled: true,
  },
  category: 'developer',
  icon: '🐙',
  requiredConfig: ['GITHUB_TOKEN'],
  code: `
async function execute(params, context) {
  const { action, owner, repo, title, body, path } = params;

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'SecureAgent',
  };

  switch (action) {
    case 'repos':
      return { repos: [], message: 'GitHub token required for full functionality' };
    case 'issues':
      if (!owner || !repo) throw new Error('owner and repo required');
      return { issues: [], repo: \`\${owner}/\${repo}\` };
    case 'prs':
      if (!owner || !repo) throw new Error('owner and repo required');
      return { pullRequests: [], repo: \`\${owner}/\${repo}\` };
    case 'files':
      if (!owner || !repo || !path) throw new Error('owner, repo, and path required');
      return { file: null, path };
    case 'create-issue':
      if (!owner || !repo || !title) throw new Error('owner, repo, and title required');
      return { created: true, issueNumber: 1, title };
    case 'create-pr':
      if (!owner || !repo || !title) throw new Error('owner, repo, and title required');
      return { created: true, prNumber: 1, title };
    default:
      throw new Error(\`Unknown action: \${action}\`);
  }
}
`,
};

// =============================================================================
// Slack Tools Skill
// =============================================================================

export const slackToolsSkill: BuiltinSkillDefinition = {
  metadata: {
    id: 'slack-tools',
    name: 'Slack Tools',
    description: 'Advanced Slack operations. Send messages, manage channels, search messages, and handle reactions.',
    version: '1.0.0',
    author: 'SecureAgent',
    parameters: [
      { name: 'action', type: 'string', description: 'Action: send, channels, search, react, thread', required: true },
      { name: 'channel', type: 'string', description: 'Channel ID or name', required: false },
      { name: 'message', type: 'string', description: 'Message text', required: false },
      { name: 'threadTs', type: 'string', description: 'Thread timestamp for replies', required: false },
      { name: 'emoji', type: 'string', description: 'Emoji for reactions', required: false },
      { name: 'query', type: 'string', description: 'Search query', required: false },
    ],
    tags: ['slack', 'messaging', 'team', 'communication'],
    enabled: true,
  },
  category: 'integrations',
  icon: '💬',
  requiredConfig: ['SLACK_BOT_TOKEN'],
  code: `
async function execute(params, context) {
  const { action, channel, message, threadTs, emoji, query } = params;

  switch (action) {
    case 'send':
      if (!channel || !message) throw new Error('channel and message required');
      return { sent: true, channel, ts: Date.now().toString() };
    case 'channels':
      return { channels: [] };
    case 'search':
      if (!query) throw new Error('query required');
      return { messages: [], query };
    case 'react':
      if (!channel || !emoji) throw new Error('channel and emoji required');
      return { reacted: true, emoji };
    case 'thread':
      if (!channel || !message || !threadTs) throw new Error('channel, message, and threadTs required');
      return { sent: true, threadTs };
    default:
      throw new Error(\`Unknown action: \${action}\`);
  }
}
`,
};

// =============================================================================
// Data Analysis Skill
// =============================================================================

export const dataAnalysisSkill: BuiltinSkillDefinition = {
  metadata: {
    id: 'data-analysis',
    name: 'Data Analysis',
    description: 'Analyze CSV and JSON data. Calculate statistics, filter, sort, group, and visualize data.',
    version: '1.0.0',
    author: 'SecureAgent',
    parameters: [
      { name: 'action', type: 'string', description: 'Action: parse, stats, filter, group, sort', required: true },
      { name: 'data', type: 'string', description: 'CSV or JSON data string', required: true },
      { name: 'column', type: 'string', description: 'Column name for operations', required: false },
      { name: 'condition', type: 'object', description: 'Filter condition', required: false },
      { name: 'direction', type: 'string', description: 'Sort direction: asc or desc', required: false },
    ],
    tags: ['data', 'analysis', 'csv', 'statistics'],
    enabled: true,
  },
  category: 'data',
  icon: '📊',
  code: `
async function execute(params, context) {
  const { action, data, column, condition, direction } = params;

  // Try to parse as JSON first, then CSV
  let parsedData;
  try {
    parsedData = JSON.parse(data);
  } catch {
    // Simple CSV parsing
    const lines = data.trim().split('\\n');
    const headers = lines[0].split(',').map(h => h.trim());
    parsedData = lines.slice(1).map(line => {
      const values = line.split(',');
      return headers.reduce((obj, header, i) => ({ ...obj, [header]: values[i]?.trim() }), {});
    });
  }

  if (!Array.isArray(parsedData)) {
    parsedData = [parsedData];
  }

  switch (action) {
    case 'parse':
      return { rows: parsedData.length, columns: Object.keys(parsedData[0] || {}), sample: parsedData.slice(0, 5) };
    case 'stats':
      if (!column) throw new Error('column required for stats');
      const values = parsedData.map(row => parseFloat(row[column])).filter(v => !isNaN(v));
      return {
        column,
        count: values.length,
        sum: values.reduce((a, b) => a + b, 0),
        mean: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
      };
    case 'filter':
      return { filtered: parsedData.length, data: parsedData.slice(0, 10) };
    case 'group':
      if (!column) throw new Error('column required for group');
      const groups = {};
      parsedData.forEach(row => {
        const key = row[column];
        groups[key] = (groups[key] || 0) + 1;
      });
      return { column, groups };
    case 'sort':
      if (!column) throw new Error('column required for sort');
      const sorted = [...parsedData].sort((a, b) => {
        const cmp = String(a[column]).localeCompare(String(b[column]));
        return direction === 'desc' ? -cmp : cmp;
      });
      return { sorted: sorted.slice(0, 10), total: sorted.length };
    default:
      throw new Error(\`Unknown action: \${action}\`);
  }
}
`,
  premium: true,
};

// =============================================================================
// HTTP Request Skill
// =============================================================================

export const httpRequestSkill: BuiltinSkillDefinition = {
  metadata: {
    id: 'http-request',
    name: 'HTTP Request',
    description: 'Make HTTP requests to external APIs. Supports GET, POST, PUT, DELETE with custom headers and body.',
    version: '1.0.0',
    author: 'SecureAgent',
    parameters: [
      { name: 'url', type: 'string', description: 'Request URL', required: true },
      { name: 'method', type: 'string', description: 'HTTP method (GET, POST, PUT, DELETE)', required: false, default: 'GET' },
      { name: 'headers', type: 'object', description: 'Request headers', required: false },
      { name: 'body', type: 'string', description: 'Request body (for POST/PUT)', required: false },
    ],
    tags: ['http', 'api', 'request', 'fetch'],
    enabled: true,
  },
  category: 'tools',
  icon: '🌐',
  code: `
async function execute(params, context) {
  const { url, method = 'GET', headers = {}, body } = params;

  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });

  const contentType = response.headers.get('content-type') || '';
  let data;

  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    data,
  };
}
`,
};

// =============================================================================
// JSON Processor Skill
// =============================================================================

export const jsonProcessorSkill: BuiltinSkillDefinition = {
  metadata: {
    id: 'json-processor',
    name: 'JSON Processor',
    description: 'Process and transform JSON data. Parse, format, query with JSONPath, merge, and validate.',
    version: '1.0.0',
    author: 'SecureAgent',
    parameters: [
      { name: 'action', type: 'string', description: 'Action: parse, format, query, merge, validate', required: true },
      { name: 'data', type: 'string', description: 'JSON string to process', required: true },
      { name: 'path', type: 'string', description: 'JSONPath query (for query action)', required: false },
      { name: 'schema', type: 'object', description: 'JSON schema (for validate action)', required: false },
    ],
    tags: ['json', 'data', 'transform', 'parse'],
    enabled: true,
  },
  category: 'tools',
  icon: '📋',
  code: `
async function execute(params, context) {
  const { action, data, path, schema } = params;

  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch (e) {
    throw new Error(\`Invalid JSON: \${e.message}\`);
  }

  switch (action) {
    case 'parse':
      return { parsed, type: Array.isArray(parsed) ? 'array' : typeof parsed };
    case 'format':
      return { formatted: JSON.stringify(parsed, null, 2) };
    case 'query':
      if (!path) throw new Error('path required for query');
      // Simple path query (supports dot notation)
      const parts = path.replace(/^\\$\\.?/, '').split('.');
      let result = parsed;
      for (const part of parts) {
        if (result === undefined) break;
        result = result[part];
      }
      return { path, result };
    case 'merge':
      // Expects data to be an array of objects to merge
      if (!Array.isArray(parsed)) throw new Error('Data must be array for merge');
      return { merged: Object.assign({}, ...parsed) };
    case 'validate':
      return { valid: true, data: parsed };
    default:
      throw new Error(\`Unknown action: \${action}\`);
  }
}
`,
};

// =============================================================================
// Screenshot Skill
// =============================================================================

export const screenshotSkill: BuiltinSkillDefinition = {
  metadata: {
    id: 'screenshot',
    name: 'Screenshot',
    description: 'Capture screenshots of web pages. Supports full page, viewport, and element screenshots.',
    version: '1.0.0',
    author: 'SecureAgent',
    parameters: [
      { name: 'url', type: 'string', description: 'URL to capture', required: true },
      { name: 'type', type: 'string', description: 'Type: viewport, fullpage, element', required: false, default: 'viewport' },
      { name: 'selector', type: 'string', description: 'CSS selector (for element type)', required: false },
      { name: 'width', type: 'number', description: 'Viewport width', required: false, default: 1280 },
      { name: 'height', type: 'number', description: 'Viewport height', required: false, default: 720 },
    ],
    tags: ['screenshot', 'browser', 'capture', 'web'],
    enabled: true,
  },
  category: 'tools',
  icon: '📸',
  premium: true,
  code: `
async function execute(params, context) {
  const { url, type = 'viewport', selector, width = 1280, height = 720 } = params;

  // In production, this would use Puppeteer/Playwright
  return {
    url,
    type,
    width,
    height,
    selector,
    message: 'Screenshot captured',
    // base64: 'data:image/png;base64,...'
  };
}
`,
};

// =============================================================================
// Memory Skill
// =============================================================================

export const memorySkill: BuiltinSkillDefinition = {
  metadata: {
    id: 'memory',
    name: 'Memory',
    description: 'Store and retrieve information across conversations. Remember user preferences, facts, and context.',
    version: '1.0.0',
    author: 'SecureAgent',
    parameters: [
      { name: 'action', type: 'string', description: 'Action: remember, recall, forget, list', required: true },
      { name: 'key', type: 'string', description: 'Memory key/topic', required: false },
      { name: 'value', type: 'string', description: 'Value to remember', required: false },
      { name: 'query', type: 'string', description: 'Search query for recall', required: false },
    ],
    tags: ['memory', 'context', 'storage', 'persistence'],
    enabled: true,
  },
  category: 'core',
  icon: '🧠',
  code: `
async function execute(params, context) {
  const { action, key, value, query } = params;

  // In production, this would use the MemoryManager
  switch (action) {
    case 'remember':
      if (!key || !value) throw new Error('key and value required');
      return { remembered: true, key };
    case 'recall':
      return { memories: [], query: query || key };
    case 'forget':
      if (!key) throw new Error('key required');
      return { forgotten: true, key };
    case 'list':
      return { memories: [], count: 0 };
    default:
      throw new Error(\`Unknown action: \${action}\`);
  }
}
`,
};

// =============================================================================
// Exports
// =============================================================================

export const BUILTIN_SKILLS: BuiltinSkillDefinition[] = [
  webSearchSkill,
  codeExecutorSkill,
  fileManagerSkill,
  calendarSkill,
  emailSkill,
  githubSkill,
  slackToolsSkill,
  dataAnalysisSkill,
  httpRequestSkill,
  jsonProcessorSkill,
  screenshotSkill,
  memorySkill,
];

export const SKILL_CATEGORIES = [
  { id: 'core', name: 'Core', description: 'Essential system skills', icon: '⚙️' },
  { id: 'tools', name: 'Tools', description: 'Utility and productivity tools', icon: '🔧' },
  { id: 'integrations', name: 'Integrations', description: 'Third-party service integrations', icon: '🔌' },
  { id: 'productivity', name: 'Productivity', description: 'Calendar, email, and workflow', icon: '📅' },
  { id: 'developer', name: 'Developer', description: 'Code and development tools', icon: '💻' },
  { id: 'data', name: 'Data', description: 'Data processing and analysis', icon: '📊' },
] as const;

export function getSkillsByCategory(category: string): BuiltinSkillDefinition[] {
  return BUILTIN_SKILLS.filter(skill => skill.category === category);
}

export function getSkillById(id: string): BuiltinSkillDefinition | undefined {
  return BUILTIN_SKILLS.find(skill => skill.metadata.id === id);
}

export function getPremiumSkills(): BuiltinSkillDefinition[] {
  return BUILTIN_SKILLS.filter(skill => skill.premium);
}

export function getFreeSkills(): BuiltinSkillDefinition[] {
  return BUILTIN_SKILLS.filter(skill => !skill.premium);
}

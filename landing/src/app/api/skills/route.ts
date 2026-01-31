import { NextResponse } from 'next/server';

// Skill categories
const SKILL_CATEGORIES = [
  { id: 'core', name: 'Core', description: 'Essential system skills', icon: '⚙️' },
  { id: 'tools', name: 'Tools', description: 'Utility and productivity tools', icon: '🔧' },
  { id: 'integrations', name: 'Integrations', description: 'Third-party service integrations', icon: '🔌' },
  { id: 'productivity', name: 'Productivity', description: 'Calendar, email, and workflow', icon: '📅' },
  { id: 'developer', name: 'Developer', description: 'Code and development tools', icon: '💻' },
  { id: 'data', name: 'Data', description: 'Data processing and analysis', icon: '📊' },
];

// Built-in skills registry
const SKILLS = [
  {
    id: 'web-search',
    name: 'Web Search',
    description: 'Search the web using DuckDuckGo for real-time information. Returns relevant search results with titles, snippets, and URLs.',
    category: 'tools',
    icon: '🔍',
    version: '1.0.0',
    author: 'SecureAgent',
    tags: ['search', 'web', 'information'],
    premium: false,
    installed: true,
    usageCount: 15420,
    rating: 4.8,
    reviews: 124,
  },
  {
    id: 'code-executor',
    name: 'Code Executor',
    description: 'Execute JavaScript/TypeScript code in a sandboxed environment. Supports console output, async/await, and common utilities.',
    category: 'developer',
    icon: '⚡',
    version: '1.0.0',
    author: 'SecureAgent',
    tags: ['code', 'javascript', 'execution', 'sandbox'],
    premium: true,
    installed: false,
    usageCount: 8932,
    rating: 4.9,
    reviews: 89,
  },
  {
    id: 'file-manager',
    name: 'File Manager',
    description: 'Read, write, and manage files in the workspace. Supports text and JSON files with path validation.',
    category: 'core',
    icon: '📁',
    version: '1.0.0',
    author: 'SecureAgent',
    tags: ['files', 'storage', 'workspace'],
    premium: false,
    installed: true,
    usageCount: 12650,
    rating: 4.7,
    reviews: 156,
  },
  {
    id: 'calendar',
    name: 'Calendar',
    description: 'Manage calendar events. Create, read, update, and delete events. Supports Google Calendar and iCal.',
    category: 'productivity',
    icon: '📅',
    version: '1.0.0',
    author: 'SecureAgent',
    tags: ['calendar', 'events', 'scheduling', 'productivity'],
    premium: false,
    installed: false,
    usageCount: 6789,
    rating: 4.6,
    reviews: 78,
    requiredConfig: ['GOOGLE_CALENDAR_API_KEY'],
  },
  {
    id: 'email',
    name: 'Email',
    description: 'Send and read emails. Supports Gmail, Outlook, and SMTP. Can draft, send, and search emails.',
    category: 'productivity',
    icon: '📧',
    version: '1.0.0',
    author: 'SecureAgent',
    tags: ['email', 'communication', 'messaging'],
    premium: true,
    installed: false,
    usageCount: 9234,
    rating: 4.5,
    reviews: 112,
    requiredConfig: ['EMAIL_PROVIDER', 'EMAIL_API_KEY'],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Interact with GitHub repositories. Create issues, PRs, read files, manage branches, and more.',
    category: 'developer',
    icon: '🐙',
    version: '1.0.0',
    author: 'SecureAgent',
    tags: ['github', 'git', 'developer', 'code'],
    premium: false,
    installed: true,
    usageCount: 18234,
    rating: 4.9,
    reviews: 234,
    requiredConfig: ['GITHUB_TOKEN'],
  },
  {
    id: 'slack-tools',
    name: 'Slack Tools',
    description: 'Advanced Slack operations. Send messages, manage channels, search messages, and handle reactions.',
    category: 'integrations',
    icon: '💬',
    version: '1.0.0',
    author: 'SecureAgent',
    tags: ['slack', 'messaging', 'team', 'communication'],
    premium: false,
    installed: false,
    usageCount: 5678,
    rating: 4.4,
    reviews: 67,
    requiredConfig: ['SLACK_BOT_TOKEN'],
  },
  {
    id: 'data-analysis',
    name: 'Data Analysis',
    description: 'Analyze CSV and JSON data. Calculate statistics, filter, sort, group, and visualize data.',
    category: 'data',
    icon: '📊',
    version: '1.0.0',
    author: 'SecureAgent',
    tags: ['data', 'analysis', 'csv', 'statistics'],
    premium: true,
    installed: false,
    usageCount: 4521,
    rating: 4.7,
    reviews: 45,
  },
  {
    id: 'http-request',
    name: 'HTTP Request',
    description: 'Make HTTP requests to external APIs. Supports GET, POST, PUT, DELETE with custom headers and body.',
    category: 'tools',
    icon: '🌐',
    version: '1.0.0',
    author: 'SecureAgent',
    tags: ['http', 'api', 'request', 'fetch'],
    premium: false,
    installed: true,
    usageCount: 21345,
    rating: 4.8,
    reviews: 289,
  },
  {
    id: 'json-processor',
    name: 'JSON Processor',
    description: 'Process and transform JSON data. Parse, format, query with JSONPath, merge, and validate.',
    category: 'tools',
    icon: '📋',
    version: '1.0.0',
    author: 'SecureAgent',
    tags: ['json', 'data', 'transform', 'parse'],
    premium: false,
    installed: true,
    usageCount: 17823,
    rating: 4.6,
    reviews: 198,
  },
  {
    id: 'screenshot',
    name: 'Screenshot',
    description: 'Capture screenshots of web pages. Supports full page, viewport, and element screenshots.',
    category: 'tools',
    icon: '📸',
    version: '1.0.0',
    author: 'SecureAgent',
    tags: ['screenshot', 'browser', 'capture', 'web'],
    premium: true,
    installed: false,
    usageCount: 7654,
    rating: 4.5,
    reviews: 87,
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Store and retrieve information across conversations. Remember user preferences, facts, and context.',
    category: 'core',
    icon: '🧠',
    version: '1.0.0',
    author: 'SecureAgent',
    tags: ['memory', 'context', 'storage', 'persistence'],
    premium: false,
    installed: true,
    usageCount: 34567,
    rating: 4.9,
    reviews: 456,
  },
  // Community skills
  {
    id: 'notion-sync',
    name: 'Notion Sync',
    description: 'Sync with Notion databases and pages. Create, update, and query Notion content.',
    category: 'integrations',
    icon: '📝',
    version: '1.2.0',
    author: 'CommunityDev',
    tags: ['notion', 'sync', 'database', 'notes'],
    premium: false,
    installed: false,
    usageCount: 3421,
    rating: 4.3,
    reviews: 34,
    requiredConfig: ['NOTION_API_KEY'],
  },
  {
    id: 'weather',
    name: 'Weather',
    description: 'Get current weather and forecasts for any location worldwide.',
    category: 'tools',
    icon: '🌤️',
    version: '1.0.0',
    author: 'SecureAgent',
    tags: ['weather', 'forecast', 'location'],
    premium: false,
    installed: false,
    usageCount: 8765,
    rating: 4.4,
    reviews: 123,
  },
  {
    id: 'translator',
    name: 'Translator',
    description: 'Translate text between 100+ languages using Google Translate API.',
    category: 'tools',
    icon: '🌍',
    version: '1.0.0',
    author: 'SecureAgent',
    tags: ['translate', 'language', 'international'],
    premium: false,
    installed: false,
    usageCount: 6543,
    rating: 4.6,
    reviews: 89,
  },
  {
    id: 'pdf-processor',
    name: 'PDF Processor',
    description: 'Extract text, merge, split, and convert PDF documents.',
    category: 'data',
    icon: '📄',
    version: '1.1.0',
    author: 'SecureAgent',
    tags: ['pdf', 'document', 'extract', 'convert'],
    premium: true,
    installed: false,
    usageCount: 4321,
    rating: 4.5,
    reviews: 56,
  },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const search = searchParams.get('search');
  const installed = searchParams.get('installed');
  const premium = searchParams.get('premium');

  let filteredSkills = [...SKILLS];

  // Filter by category
  if (category && category !== 'all') {
    filteredSkills = filteredSkills.filter(skill => skill.category === category);
  }

  // Filter by search
  if (search) {
    const searchLower = search.toLowerCase();
    filteredSkills = filteredSkills.filter(skill =>
      skill.name.toLowerCase().includes(searchLower) ||
      skill.description.toLowerCase().includes(searchLower) ||
      skill.tags.some(tag => tag.toLowerCase().includes(searchLower))
    );
  }

  // Filter by installed status
  if (installed === 'true') {
    filteredSkills = filteredSkills.filter(skill => skill.installed);
  } else if (installed === 'false') {
    filteredSkills = filteredSkills.filter(skill => !skill.installed);
  }

  // Filter by premium status
  if (premium === 'true') {
    filteredSkills = filteredSkills.filter(skill => skill.premium);
  } else if (premium === 'false') {
    filteredSkills = filteredSkills.filter(skill => !skill.premium);
  }

  return NextResponse.json({
    skills: filteredSkills,
    categories: SKILL_CATEGORIES,
    total: filteredSkills.length,
    installed: SKILLS.filter(s => s.installed).length,
    available: SKILLS.length,
  });
}

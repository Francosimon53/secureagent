/**
 * Skill Detail API Routes
 *
 * GET /api/skills/marketplace/:id - Get skill details
 */

import { NextRequest, NextResponse } from 'next/server';

// Same demo data (in real app, this would be in a shared store/database)
const demoSkills = [
  {
    id: 'skill_1',
    name: 'smart-summarizer',
    displayName: 'Smart Summarizer',
    description: 'Automatically summarize long documents, articles, and web pages into concise key points. Uses advanced AI to extract the most important information while maintaining context and readability.',
    icon: '📝',
    category: 'productivity',
    authorId: 'user_demo',
    authorName: 'SecureAgent Team',
    downloads: 1250,
    rating: 4.8,
    ratingCount: 89,
    featured: true,
    version: '1.2.0',
    tags: ['ai', 'summarization', 'documents'],
    code: `export async function execute(params: { text: string; maxLength?: number }) {
  const { text, maxLength = 200 } = params;
  // AI summarization logic here
  return { success: true, summary: text.substring(0, maxLength) + '...' };
}`,
    status: 'published',
    createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
    publishedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    parameters: [
      { name: 'text', type: 'string', description: 'Text to summarize', required: true },
      { name: 'maxLength', type: 'number', description: 'Maximum summary length', required: false, default: 200 },
    ],
    permissions: ['network'],
  },
  {
    id: 'skill_2',
    name: 'code-reviewer',
    displayName: 'Code Reviewer',
    description: 'AI-powered code review that checks for bugs, security issues, and suggests improvements. Supports multiple languages including TypeScript, Python, Go, and Rust.',
    icon: '🔍',
    category: 'developer',
    authorId: 'user_demo',
    authorName: 'DevTools Inc',
    downloads: 890,
    rating: 4.6,
    ratingCount: 56,
    featured: true,
    version: '2.0.1',
    tags: ['code', 'review', 'security', 'ai'],
    code: `export async function execute(params: { code: string; language: string }) {
  const { code, language } = params;
  // Code review logic here
  return { success: true, issues: [], suggestions: [] };
}`,
    status: 'published',
    createdAt: Date.now() - 45 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    publishedAt: Date.now() - 45 * 24 * 60 * 60 * 1000,
    parameters: [
      { name: 'code', type: 'string', description: 'Code to review', required: true },
      { name: 'language', type: 'string', description: 'Programming language', required: true },
    ],
    permissions: [],
  },
  {
    id: 'skill_3',
    name: 'email-composer',
    displayName: 'Email Composer',
    description: 'Generate professional emails with customizable tone and style for any occasion. Perfect for business communication, follow-ups, and cold outreach.',
    icon: '✉️',
    category: 'communication',
    authorId: 'user_demo2',
    authorName: 'WriteWell',
    downloads: 2100,
    rating: 4.9,
    ratingCount: 142,
    featured: true,
    version: '1.5.0',
    tags: ['email', 'writing', 'professional'],
    code: `export async function execute(params: { purpose: string; tone: string; recipient: string }) {
  const { purpose, tone, recipient } = params;
  // Email composition logic here
  return { success: true, email: { subject: '', body: '' } };
}`,
    status: 'published',
    createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
    publishedAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
    parameters: [
      { name: 'purpose', type: 'string', description: 'Email purpose', required: true },
      { name: 'tone', type: 'string', description: 'Email tone (formal, casual, friendly)', required: false, default: 'professional' },
      { name: 'recipient', type: 'string', description: 'Recipient name', required: true },
    ],
    permissions: [],
  },
  {
    id: 'skill_4',
    name: 'data-visualizer',
    displayName: 'Data Visualizer',
    description: 'Transform CSV and JSON data into beautiful charts and visualizations. Supports bar charts, line graphs, pie charts, and more.',
    icon: '📊',
    category: 'data',
    authorId: 'user_demo3',
    authorName: 'DataViz Pro',
    downloads: 567,
    rating: 4.3,
    ratingCount: 34,
    featured: false,
    version: '1.0.2',
    tags: ['data', 'charts', 'visualization'],
    code: `export async function execute(params: { data: string; chartType: string }) {
  const { data, chartType } = params;
  // Data visualization logic here
  return { success: true, chart: null };
}`,
    status: 'published',
    createdAt: Date.now() - 20 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
    publishedAt: Date.now() - 20 * 24 * 60 * 60 * 1000,
    parameters: [
      { name: 'data', type: 'string', description: 'CSV or JSON data', required: true },
      { name: 'chartType', type: 'string', description: 'Type of chart', required: true, enum: ['bar', 'line', 'pie', 'scatter'] },
    ],
    permissions: [],
  },
  {
    id: 'skill_5',
    name: 'task-automator',
    displayName: 'Task Automator',
    description: 'Create automated workflows that trigger based on conditions and schedules. Perfect for repetitive tasks and complex automation scenarios.',
    icon: '⚡',
    category: 'automation',
    authorId: 'user_demo',
    authorName: 'AutoFlow',
    downloads: 1800,
    rating: 4.7,
    ratingCount: 98,
    featured: true,
    version: '3.1.0',
    tags: ['automation', 'workflow', 'scheduling'],
    code: `export async function execute(params: { workflow: object; trigger: string }) {
  const { workflow, trigger } = params;
  // Automation logic here
  return { success: true, taskId: null };
}`,
    status: 'published',
    createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
    publishedAt: Date.now() - 90 * 24 * 60 * 60 * 1000,
    parameters: [
      { name: 'workflow', type: 'object', description: 'Workflow definition', required: true },
      { name: 'trigger', type: 'string', description: 'Trigger type', required: true },
    ],
    permissions: ['network', 'notifications'],
  },
];

// In-memory installs and ratings
const installs: Map<string, Set<string>> = new Map();
const ratings: Map<string, { rating: number; review?: string }[]> = new Map();

/**
 * GET /api/skills/marketplace/:id
 * Get skill details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const skill = demoSkills.find((s) => s.id === id);

    if (!skill) {
      return NextResponse.json(
        { error: 'Skill not found' },
        { status: 404 },
      );
    }

    // Get install count and ratings
    const skillInstalls = installs.get(id)?.size || skill.downloads;
    const skillRatings = ratings.get(id) || [];

    return NextResponse.json({
      ...skill,
      downloads: skillInstalls,
      reviews: skillRatings.slice(0, 10),
    });
  } catch (error) {
    console.error('Get skill error:', error);
    return NextResponse.json(
      { error: 'Failed to get skill' },
      { status: 500 },
    );
  }
}

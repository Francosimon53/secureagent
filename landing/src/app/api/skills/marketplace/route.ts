/**
 * Skill Marketplace API Routes
 *
 * GET /api/skills/marketplace - List/search marketplace skills
 * POST /api/skills/marketplace - Submit new skill
 */

import { NextRequest, NextResponse } from 'next/server';

// In-memory store for demo (replace with actual database)
interface SkillCard {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon?: string;
  category: string;
  authorName: string;
  authorAvatar?: string;
  downloads: number;
  rating: number;
  ratingCount: number;
  featured: boolean;
  version: string;
  tags?: string[];
}

interface MarketplaceSkill extends SkillCard {
  code: string;
  authorId: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
}

// Demo skills data
const demoSkills: MarketplaceSkill[] = [
  {
    id: 'skill_1',
    name: 'smart-summarizer',
    displayName: 'Smart Summarizer',
    description: 'Automatically summarize long documents, articles, and web pages into concise key points.',
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
    code: 'export async function execute(params) { return { success: true }; }',
    status: 'published',
    createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
    publishedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'skill_2',
    name: 'code-reviewer',
    displayName: 'Code Reviewer',
    description: 'AI-powered code review that checks for bugs, security issues, and suggests improvements.',
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
    code: 'export async function execute(params) { return { success: true }; }',
    status: 'published',
    createdAt: Date.now() - 45 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    publishedAt: Date.now() - 45 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'skill_3',
    name: 'email-composer',
    displayName: 'Email Composer',
    description: 'Generate professional emails with customizable tone and style for any occasion.',
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
    code: 'export async function execute(params) { return { success: true }; }',
    status: 'published',
    createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
    publishedAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'skill_4',
    name: 'data-visualizer',
    displayName: 'Data Visualizer',
    description: 'Transform CSV and JSON data into beautiful charts and visualizations.',
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
    code: 'export async function execute(params) { return { success: true }; }',
    status: 'published',
    createdAt: Date.now() - 20 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
    publishedAt: Date.now() - 20 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'skill_5',
    name: 'task-automator',
    displayName: 'Task Automator',
    description: 'Create automated workflows that trigger based on conditions and schedules.',
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
    code: 'export async function execute(params) { return { success: true }; }',
    status: 'published',
    createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
    publishedAt: Date.now() - 90 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'skill_6',
    name: 'meeting-notes',
    displayName: 'Meeting Notes AI',
    description: 'Automatically transcribe and summarize meeting recordings with action items.',
    icon: '🎙️',
    category: 'productivity',
    authorId: 'user_demo4',
    authorName: 'MeetingMind',
    downloads: 734,
    rating: 4.5,
    ratingCount: 45,
    featured: false,
    version: '1.3.0',
    tags: ['meetings', 'transcription', 'notes'],
    code: 'export async function execute(params) { return { success: true }; }',
    status: 'published',
    createdAt: Date.now() - 15 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
    publishedAt: Date.now() - 15 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'skill_7',
    name: 'git-assistant',
    displayName: 'Git Assistant',
    description: 'Smart git commands with auto-generated commit messages and PR descriptions.',
    icon: '🔀',
    category: 'developer',
    authorId: 'user_demo5',
    authorName: 'GitGenius',
    downloads: 445,
    rating: 4.4,
    ratingCount: 28,
    featured: false,
    version: '1.1.0',
    tags: ['git', 'commits', 'developer'],
    code: 'export async function execute(params) { return { success: true }; }',
    status: 'published',
    createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 4 * 24 * 60 * 60 * 1000,
    publishedAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'skill_8',
    name: 'slack-bot',
    displayName: 'Slack Bot Builder',
    description: 'Create custom Slack bots and integrations without writing code.',
    icon: '💬',
    category: 'communication',
    authorId: 'user_demo6',
    authorName: 'SlackMaster',
    downloads: 321,
    rating: 4.2,
    ratingCount: 19,
    featured: false,
    version: '1.0.0',
    tags: ['slack', 'bots', 'integration'],
    code: 'export async function execute(params) { return { success: true }; }',
    status: 'published',
    createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    publishedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
  },
];

// Store for user-submitted skills
const userSkills: MarketplaceSkill[] = [];

/**
 * GET /api/skills/marketplace
 * List and search marketplace skills
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || '';
    const category = searchParams.get('category') || '';
    const sortBy = searchParams.get('sortBy') || 'downloads';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const featured = searchParams.get('featured');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    // Combine demo and user skills
    let allSkills = [...demoSkills, ...userSkills].filter(
      (skill) => skill.status === 'published',
    );

    // Filter by query
    if (query) {
      const q = query.toLowerCase();
      allSkills = allSkills.filter(
        (skill) =>
          skill.name.toLowerCase().includes(q) ||
          skill.displayName.toLowerCase().includes(q) ||
          skill.description.toLowerCase().includes(q) ||
          skill.tags?.some((tag) => tag.toLowerCase().includes(q)),
      );
    }

    // Filter by category
    if (category) {
      allSkills = allSkills.filter((skill) => skill.category === category);
    }

    // Filter by featured
    if (featured === 'true') {
      allSkills = allSkills.filter((skill) => skill.featured);
    }

    // Sort
    allSkills.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'downloads':
          comparison = a.downloads - b.downloads;
          break;
        case 'rating':
          comparison = a.rating - b.rating;
          break;
        case 'recent':
          comparison = (a.publishedAt || 0) - (b.publishedAt || 0);
          break;
        case 'name':
          comparison = a.displayName.localeCompare(b.displayName);
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Paginate
    const total = allSkills.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const items: SkillCard[] = allSkills.slice(start, start + pageSize).map((skill) => ({
      id: skill.id,
      name: skill.name,
      displayName: skill.displayName,
      description: skill.description,
      icon: skill.icon,
      category: skill.category,
      authorName: skill.authorName,
      authorAvatar: skill.authorAvatar,
      downloads: skill.downloads,
      rating: skill.rating,
      ratingCount: skill.ratingCount,
      featured: skill.featured,
      version: skill.version,
      tags: skill.tags,
    }));

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (error) {
    console.error('Marketplace search error:', error);
    return NextResponse.json(
      { error: 'Failed to search marketplace' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/skills/marketplace
 * Submit a new skill
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { config, code, authorId, authorName } = body;

    // Basic validation
    if (!config || !code || !authorId || !authorName) {
      return NextResponse.json(
        { error: 'Missing required fields: config, code, authorId, authorName' },
        { status: 400 },
      );
    }

    // Check for duplicate name
    const existing = [...demoSkills, ...userSkills].find(
      (s) => s.name === config.name,
    );
    if (existing) {
      return NextResponse.json(
        { error: `Skill with name "${config.name}" already exists` },
        { status: 409 },
      );
    }

    // Create new skill
    const now = Date.now();
    const newSkill: MarketplaceSkill = {
      id: `skill_${now}_${Math.random().toString(36).substring(2, 9)}`,
      name: config.name,
      displayName: config.displayName,
      description: config.description,
      icon: config.icon,
      category: config.category,
      authorId,
      authorName,
      downloads: 0,
      rating: 0,
      ratingCount: 0,
      featured: false,
      version: config.version || '1.0.0',
      tags: config.tags,
      code,
      status: 'published',
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    };

    userSkills.push(newSkill);

    return NextResponse.json({
      success: true,
      skill: {
        id: newSkill.id,
        name: newSkill.name,
        displayName: newSkill.displayName,
      },
    });
  } catch (error) {
    console.error('Skill submission error:', error);
    return NextResponse.json(
      { error: 'Failed to submit skill' },
      { status: 500 },
    );
  }
}

/**
 * Marketplace Skills API
 * GET /api/skills/marketplace - List and search skills
 */

import { NextResponse } from 'next/server';

// Built-in skill data (mirrors the structure from src/skills/marketplace/built-in)
const builtInSkills = [
  // Productivity
  {
    id: 'pomodoro-timer',
    name: 'pomodoro-timer',
    displayName: 'Pomodoro Timer',
    description: 'Boost your productivity with 25-minute focused work sessions followed by short breaks. Track your pomodoros and maintain your flow.',
    icon: '🍅',
    category: 'productivity',
    authorName: 'SecureAgent',
    downloads: 4521,
    rating: 4.8,
    ratingCount: 342,
    featured: true,
    version: '1.0.0',
    tags: ['timer', 'focus', 'productivity', 'work'],
  },
  {
    id: 'daily-standup',
    name: 'daily-standup',
    displayName: 'Daily Standup',
    description: 'Streamline your daily standups with the classic three-question format. Track progress and identify blockers.',
    icon: '📋',
    category: 'productivity',
    authorName: 'SecureAgent',
    downloads: 3892,
    rating: 4.7,
    ratingCount: 287,
    featured: false,
    version: '1.0.0',
    tags: ['standup', 'agile', 'team', 'daily', 'scrum'],
  },
  {
    id: 'meeting-scheduler',
    name: 'meeting-scheduler',
    displayName: 'Meeting Scheduler',
    description: 'Schedule meetings, find available times, and manage your calendar efficiently.',
    icon: '📅',
    category: 'productivity',
    authorName: 'SecureAgent',
    downloads: 2987,
    rating: 4.5,
    ratingCount: 198,
    featured: false,
    version: '1.0.0',
    tags: ['meetings', 'calendar', 'scheduling', 'time'],
  },
  {
    id: 'expense-tracker',
    name: 'expense-tracker',
    displayName: 'Expense Tracker',
    description: 'Track your daily expenses, categorize spending, and get monthly reports to manage your finances.',
    icon: '💰',
    category: 'productivity',
    authorName: 'SecureAgent',
    downloads: 3456,
    rating: 4.6,
    ratingCount: 256,
    featured: true,
    version: '1.0.0',
    tags: ['expenses', 'finance', 'budget', 'money', 'tracking'],
  },
  {
    id: 'habit-tracker',
    name: 'habit-tracker',
    displayName: 'Habit Tracker',
    description: 'Build positive habits with streak tracking. Monitor your progress and stay motivated.',
    icon: '✅',
    category: 'productivity',
    authorName: 'SecureAgent',
    downloads: 4123,
    rating: 4.7,
    ratingCount: 312,
    featured: true,
    version: '1.0.0',
    tags: ['habits', 'streaks', 'goals', 'daily', 'routine'],
  },
  
  // Communication
  {
    id: 'email-summarizer',
    name: 'email-summarizer',
    displayName: 'Email Summarizer',
    description: 'Quickly summarize long email threads into key points. Extract action items and important dates.',
    icon: '📧',
    category: 'communication',
    authorName: 'SecureAgent',
    downloads: 3789,
    rating: 4.6,
    ratingCount: 278,
    featured: true,
    version: '1.0.0',
    tags: ['email', 'summary', 'productivity', 'communication'],
  },
  {
    id: 'translation-helper',
    name: 'translation-helper',
    displayName: 'Translation Helper',
    description: 'Translate text between 20+ languages with pronunciation guides and context explanations.',
    icon: '🌐',
    category: 'communication',
    authorName: 'SecureAgent',
    downloads: 2654,
    rating: 4.5,
    ratingCount: 187,
    featured: false,
    version: '1.0.0',
    tags: ['translation', 'languages', 'international', 'communication'],
  },
  {
    id: 'tone-adjuster',
    name: 'tone-adjuster',
    displayName: 'Tone Adjuster',
    description: 'Rewrite your text to match different tones - formal, casual, friendly, professional, or persuasive.',
    icon: '🎭',
    category: 'communication',
    authorName: 'SecureAgent',
    downloads: 2341,
    rating: 4.4,
    ratingCount: 156,
    featured: false,
    version: '1.0.0',
    tags: ['writing', 'tone', 'professional', 'casual', 'communication'],
  },
  {
    id: 'response-generator',
    name: 'response-generator',
    displayName: 'Response Generator',
    description: 'Generate professional responses for common scenarios - acceptances, declines, follow-ups, and more.',
    icon: '💬',
    category: 'communication',
    authorName: 'SecureAgent',
    downloads: 2876,
    rating: 4.5,
    ratingCount: 203,
    featured: false,
    version: '1.0.0',
    tags: ['responses', 'templates', 'professional', 'email'],
  },
  
  // Research
  {
    id: 'web-researcher',
    name: 'web-researcher',
    displayName: 'Web Researcher',
    description: 'Deep research assistant that finds, summarizes, and cites sources on any topic.',
    icon: '🔍',
    category: 'research',
    authorName: 'SecureAgent',
    downloads: 4234,
    rating: 4.8,
    ratingCount: 367,
    featured: true,
    version: '1.0.0',
    tags: ['research', 'web', 'sources', 'summary', 'citations'],
  },
  {
    id: 'competitor-monitor',
    name: 'competitor-monitor',
    displayName: 'Competitor Monitor',
    description: 'Track competitor news, product updates, and market movements. Stay ahead of the competition.',
    icon: '📊',
    category: 'research',
    authorName: 'SecureAgent',
    downloads: 1987,
    rating: 4.4,
    ratingCount: 134,
    featured: false,
    version: '1.0.0',
    tags: ['competitors', 'market', 'business', 'tracking', 'analysis'],
  },
  {
    id: 'news-digest',
    name: 'news-digest',
    displayName: 'News Digest',
    description: 'Get personalized daily news summaries on topics you care about. Stay informed effortlessly.',
    icon: '📰',
    category: 'research',
    authorName: 'SecureAgent',
    downloads: 3123,
    rating: 4.6,
    ratingCount: 245,
    featured: false,
    version: '1.0.0',
    tags: ['news', 'digest', 'daily', 'summary', 'updates'],
  },
  {
    id: 'fact-checker',
    name: 'fact-checker',
    displayName: 'Fact Checker',
    description: 'Verify claims and statements with cited sources. Get confidence ratings and explanations.',
    icon: '✓',
    category: 'research',
    authorName: 'SecureAgent',
    downloads: 2456,
    rating: 4.5,
    ratingCount: 178,
    featured: false,
    version: '1.0.0',
    tags: ['facts', 'verification', 'truth', 'sources', 'accuracy'],
  },
  
  // Data & Analysis
  {
    id: 'csv-analyzer',
    name: 'csv-analyzer',
    displayName: 'CSV Analyzer',
    description: 'Analyze CSV data with automatic statistics, insights, and data quality checks.',
    icon: '📊',
    category: 'data',
    authorName: 'SecureAgent',
    downloads: 2789,
    rating: 4.6,
    ratingCount: 198,
    featured: false,
    version: '1.0.0',
    tags: ['csv', 'data', 'analysis', 'statistics', 'insights'],
  },
  {
    id: 'chart-generator',
    name: 'chart-generator',
    displayName: 'Chart Generator',
    description: 'Create beautiful ASCII charts - bar charts, line graphs, pie charts, and tables.',
    icon: '📈',
    category: 'data',
    authorName: 'SecureAgent',
    downloads: 2345,
    rating: 4.4,
    ratingCount: 167,
    featured: false,
    version: '1.0.0',
    tags: ['charts', 'visualization', 'graphs', 'data', 'ascii'],
  },
  {
    id: 'report-builder',
    name: 'report-builder',
    displayName: 'Report Builder',
    description: 'Generate professional reports - executive summaries, technical reports, and custom formats.',
    icon: '📝',
    category: 'data',
    authorName: 'SecureAgent',
    downloads: 1876,
    rating: 4.5,
    ratingCount: 143,
    featured: false,
    version: '1.0.0',
    tags: ['reports', 'documents', 'professional', 'summary', 'business'],
  },
  
  // Personal
  {
    id: 'birthday-reminder',
    name: 'birthday-reminder',
    displayName: 'Birthday Reminder',
    description: 'Never forget a birthday again. Track important dates, get reminders, and gift suggestions.',
    icon: '🎂',
    category: 'personal',
    authorName: 'SecureAgent',
    downloads: 3214,
    rating: 4.8,
    ratingCount: 256,
    featured: false,
    version: '1.0.0',
    tags: ['birthday', 'reminder', 'calendar', 'gifts', 'celebrations'],
  },
  {
    id: 'recipe-finder',
    name: 'recipe-finder',
    displayName: 'Recipe Finder',
    description: 'Find delicious recipes based on ingredients you have. Includes cooking times and dietary filters.',
    icon: '🍳',
    category: 'personal',
    authorName: 'SecureAgent',
    downloads: 4123,
    rating: 4.7,
    ratingCount: 312,
    featured: true,
    version: '1.0.0',
    tags: ['recipes', 'cooking', 'food', 'meals', 'ingredients'],
  },
  {
    id: 'workout-planner',
    name: 'workout-planner',
    displayName: 'Workout Planner',
    description: 'Generate personalized workout routines. Strength, cardio, HIIT, yoga based on your fitness level.',
    icon: '💪',
    category: 'personal',
    authorName: 'SecureAgent',
    downloads: 2987,
    rating: 4.6,
    ratingCount: 223,
    featured: false,
    version: '1.0.0',
    tags: ['fitness', 'workout', 'exercise', 'health', 'gym'],
  },
  {
    id: 'travel-planner',
    name: 'travel-planner',
    displayName: 'Travel Planner',
    description: 'Plan your perfect trip. Research destinations, get travel tips, and create detailed itineraries.',
    icon: '✈️',
    category: 'personal',
    authorName: 'SecureAgent',
    downloads: 3567,
    rating: 4.7,
    ratingCount: 278,
    featured: false,
    version: '1.0.0',
    tags: ['travel', 'vacation', 'trips', 'itinerary', 'destinations'],
  },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const query = searchParams.get('query')?.toLowerCase() || '';
  const category = searchParams.get('category') || '';
  const sortBy = searchParams.get('sortBy') || 'downloads';
  const featured = searchParams.get('featured') === 'true';
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '12');

  let filtered = [...builtInSkills];

  // Filter by featured
  if (featured) {
    filtered = filtered.filter(s => s.featured);
  }

  // Filter by query
  if (query) {
    filtered = filtered.filter(s =>
      s.displayName.toLowerCase().includes(query) ||
      s.description.toLowerCase().includes(query) ||
      s.tags?.some(t => t.toLowerCase().includes(query))
    );
  }

  // Filter by category
  if (category) {
    filtered = filtered.filter(s => s.category === category);
  }

  // Sort
  switch (sortBy) {
    case 'rating':
      filtered.sort((a, b) => b.rating - a.rating);
      break;
    case 'recent':
      // Reverse order for "recent" (newest skills at end of array)
      filtered.reverse();
      break;
    case 'name':
      filtered.sort((a, b) => a.displayName.localeCompare(b.displayName));
      break;
    case 'downloads':
    default:
      filtered.sort((a, b) => b.downloads - a.downloads);
  }

  // Paginate
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (page - 1) * pageSize;
  const items = filtered.slice(startIndex, startIndex + pageSize);

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    totalPages,
  });
}

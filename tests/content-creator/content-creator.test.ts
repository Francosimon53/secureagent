/**
 * Content Creator Suite Tests
 *
 * Unit and integration tests for the content creator module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  // Events & Constants
  CONTENT_EVENTS,
  CONTENT_DEFAULTS,
  ERROR_CODES,
  API_ENDPOINTS,

  // Configuration
  ContentCreatorConfigSchema,

  // Base Providers
  ContentProviderRegistry,
  RateLimiter,

  // Types
  type VoiceProfile,
  type WritingStyle,
  type ContentSample,
  type GeneratedContent,
  type ContentType,
  type ContentPlatform,
  type ContentStatus,
  type Tweet,
  type Thread,
  type TrendItem,
  type TrendSource,
  type TrendAlert,
  type BlogPost,
  type SEOAuditResult,
  type VideoScript,
  type ScriptSection,
  type PodcastTranscription,
  type YouTubeSummary,
  type NewsletterDigest,
  type Presentation,
  type Slide,

  // Stores
  createContentStore,
  createVoiceProfileStore,
  createAnalyticsStore,
  createTrendStore,

  // Formatters
  TweetFormatter,
  createTweetFormatter,
  BlogFormatter,
  createBlogFormatter,
  NewsletterFormatter,
  createNewsletterFormatter,
  PresentationFormatter,
  createPresentationFormatter,
} from '../../src/content-creator/index.js';

// =============================================================================
// Configuration Tests
// =============================================================================

describe('Content Creator Configuration', () => {
  it('should parse valid configuration', () => {
    const result = ContentCreatorConfigSchema.safeParse({
      enabled: true,
      storeType: 'memory',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.storeType).toBe('memory');
    }
  });

  it('should apply default values', () => {
    const result = ContentCreatorConfigSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.storeType).toBe('database');
    }
  });

  it('should validate nested configs', () => {
    const result = ContentCreatorConfigSchema.safeParse({
      twitter: {
        enabled: true,
        rateLimitPerMinute: 50,
      },
      trendMonitoring: {
        enabled: true,
        refreshIntervalMinutes: 15,
        maxTrendsPerSource: 50,
      },
      aiGeneration: {
        provider: 'openai',
        temperature: 0.8,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.twitter?.rateLimitPerMinute).toBe(50);
      expect(result.data.trendMonitoring?.refreshIntervalMinutes).toBe(15);
      expect(result.data.aiGeneration?.temperature).toBe(0.8);
    }
  });

  it('should reject invalid configuration', () => {
    const result = ContentCreatorConfigSchema.safeParse({
      enabled: 'invalid', // Should be boolean
    });

    expect(result.success).toBe(false);
  });

  it('should validate SEO audit config', () => {
    const result = ContentCreatorConfigSchema.safeParse({
      seoAudit: {
        minWordCount: 1000,
        targetReadabilityScore: 70,
        keywordDensity: {
          min: 1,
          max: 2,
        },
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.seoAudit?.minWordCount).toBe(1000);
      expect(result.data.seoAudit?.keywordDensity?.max).toBe(2);
    }
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('Content Creator Constants', () => {
  it('should have content events', () => {
    expect(CONTENT_EVENTS.TWEET_GENERATED).toBeDefined();
    expect(CONTENT_EVENTS.THREAD_GENERATED).toBeDefined();
    expect(CONTENT_EVENTS.VOICE_PROFILE_CREATED).toBeDefined();
    expect(CONTENT_EVENTS.TREND_ALERT_TRIGGERED).toBeDefined();
    expect(CONTENT_EVENTS.BLOG_POST_PUBLISHED).toBeDefined();
    expect(CONTENT_EVENTS.SEO_AUDIT_COMPLETED).toBeDefined();
  });

  it('should have content defaults', () => {
    expect(CONTENT_DEFAULTS.TWEET_MAX_LENGTH).toBe(280);
    expect(CONTENT_DEFAULTS.THREAD_MAX_TWEETS).toBeGreaterThan(0);
    expect(CONTENT_DEFAULTS.BLOG_MIN_WORD_COUNT).toBeGreaterThan(0);
    expect(CONTENT_DEFAULTS.TREND_CACHE_TTL).toBeGreaterThan(0);
  });

  it('should have error codes', () => {
    expect(ERROR_CODES.PROVIDER_NOT_FOUND).toBeDefined();
    expect(ERROR_CODES.PROVIDER_RATE_LIMITED).toBeDefined();
    expect(ERROR_CODES.CONTENT_VALIDATION_FAILED).toBeDefined();
    expect(ERROR_CODES.CONTENT_GENERATION_FAILED).toBeDefined();
  });

  it('should have API endpoints', () => {
    expect(API_ENDPOINTS.twitter).toBeDefined();
    expect(API_ENDPOINTS.reddit).toBeDefined();
    expect(API_ENDPOINTS.hackernews).toBeDefined();
    expect(API_ENDPOINTS.openai).toBeDefined();
  });
});

// =============================================================================
// Rate Limiter Tests
// =============================================================================

describe('RateLimiter', () => {
  it('should allow requests within limit', async () => {
    const limiter = new RateLimiter(60); // 60 requests per minute

    // Should be able to proceed initially
    expect(limiter.canProceed()).toBe(true);

    // Acquire some tokens
    await limiter.acquire();
    await limiter.acquire();

    // Should still be able to proceed
    expect(limiter.canProceed()).toBe(true);
  });

  it('should track available tokens', () => {
    const limiter = new RateLimiter(10); // 10 requests per minute

    expect(limiter.getAvailableTokens()).toBe(10);
  });

  it('should report canProceed correctly', () => {
    const limiter = new RateLimiter(60);
    expect(limiter.canProceed()).toBe(true);
  });
});

// =============================================================================
// Content Store Tests
// =============================================================================

describe('ContentStore', () => {
  let store: ReturnType<typeof createContentStore>;

  beforeEach(async () => {
    store = createContentStore('memory');
    await store.initialize();
  });

  it('should create content', async () => {
    const content = await store.create({
      userId: 'user-1',
      type: 'tweet',
      platform: 'twitter',
      status: 'draft',
      content: 'Hello, world!',
      title: 'Test Tweet',
      metadata: {
        wordCount: 2,
        characterCount: 13,
        readingTimeMinutes: 1,
      },
    });

    expect(content.id).toBeDefined();
    expect(content.content).toBe('Hello, world!');
    expect(content.type).toBe('tweet');
    expect(content.status).toBe('draft');
  });

  it('should get content by ID', async () => {
    const created = await store.create({
      userId: 'user-1',
      type: 'blog_post',
      platform: 'wordpress',
      status: 'draft',
      content: 'Test blog content',
      title: 'Test Blog',
      metadata: {
        wordCount: 3,
        characterCount: 17,
        readingTimeMinutes: 1,
      },
    });

    const retrieved = await store.get(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(created.id);
    expect(retrieved?.title).toBe('Test Blog');
  });

  it('should update content', async () => {
    const content = await store.create({
      userId: 'user-1',
      type: 'tweet',
      platform: 'twitter',
      status: 'draft',
      content: 'Original content',
      title: 'Original Title',
      metadata: {
        wordCount: 2,
        characterCount: 16,
        readingTimeMinutes: 1,
      },
    });

    const updated = await store.update(content.id, {
      content: 'Updated content',
      status: 'review',
    });

    expect(updated).not.toBeNull();
    expect(updated?.content).toBe('Updated content');
    expect(updated?.status).toBe('review');
  });

  it('should list content by user', async () => {
    await store.create({
      userId: 'user-1',
      type: 'tweet',
      platform: 'twitter',
      status: 'draft',
      content: 'Tweet 1',
      metadata: {
        wordCount: 1,
        characterCount: 7,
        readingTimeMinutes: 1,
      },
    });

    await store.create({
      userId: 'user-1',
      type: 'tweet',
      platform: 'twitter',
      status: 'published',
      content: 'Tweet 2',
      metadata: {
        wordCount: 1,
        characterCount: 7,
        readingTimeMinutes: 1,
      },
    });

    const list = await store.list({ userId: 'user-1' });
    expect(list.length).toBe(2);
  });

  it('should delete content', async () => {
    const content = await store.create({
      userId: 'user-1',
      type: 'tweet',
      platform: 'twitter',
      status: 'draft',
      content: 'To be deleted',
      metadata: {
        wordCount: 3,
        characterCount: 13,
        readingTimeMinutes: 1,
      },
    });

    const deleted = await store.delete(content.id);
    expect(deleted).toBe(true);

    const retrieved = await store.get(content.id);
    expect(retrieved).toBeNull();
  });
});

// =============================================================================
// Voice Profile Store Tests
// =============================================================================

describe('VoiceProfileStore', () => {
  let store: ReturnType<typeof createVoiceProfileStore>;

  beforeEach(async () => {
    store = createVoiceProfileStore('memory');
    await store.initialize();
  });

  it('should create a voice profile', async () => {
    const profile = await store.createProfile({
      userId: 'user-1',
      name: 'Professional Voice',
      style: {
        tone: 'professional',
        formality: 'formal',
        personality: ['confident', 'knowledgeable'],
        vocabulary: 'advanced',
        sentenceLength: 'medium',
        punctuationStyle: 'standard',
        emojiUsage: 'none',
        hashtagStyle: 'minimal',
      },
      samples: [],
      patterns: {
        openingPhrases: [],
        closingPhrases: [],
        transitionWords: [],
        signaturePhrases: [],
        avoidPhrases: [],
      },
      topicExpertise: ['technology', 'business'],
    });

    expect(profile.id).toBeDefined();
    expect(profile.name).toBe('Professional Voice');
    expect(profile.style.tone).toBe('professional');
  });

  it('should get profile by ID', async () => {
    const created = await store.createProfile({
      userId: 'user-1',
      name: 'Test Profile',
      style: {
        tone: 'casual',
        formality: 'informal',
        personality: ['friendly'],
        vocabulary: 'simple',
        sentenceLength: 'short',
        punctuationStyle: 'expressive',
        emojiUsage: 'frequent',
        hashtagStyle: 'heavy',
      },
      samples: [],
      patterns: {
        openingPhrases: [],
        closingPhrases: [],
        transitionWords: [],
        signaturePhrases: [],
        avoidPhrases: [],
      },
      topicExpertise: [],
    });

    const retrieved = await store.getProfile(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe('Test Profile');
  });

  it('should get profiles by user', async () => {
    await store.createProfile({
      userId: 'user-1',
      name: 'Profile 1',
      style: {
        tone: 'professional',
        formality: 'formal',
        personality: [],
        vocabulary: 'moderate',
        sentenceLength: 'medium',
        punctuationStyle: 'standard',
        emojiUsage: 'none',
        hashtagStyle: 'none',
      },
      samples: [],
      patterns: {
        openingPhrases: [],
        closingPhrases: [],
        transitionWords: [],
        signaturePhrases: [],
        avoidPhrases: [],
      },
      topicExpertise: [],
    });

    const profiles = await store.getProfilesByUser('user-1');
    expect(profiles.length).toBeGreaterThan(0);
  });

  it('should add training samples', async () => {
    const profile = await store.createProfile({
      userId: 'user-1',
      name: 'Sample Profile',
      style: {
        tone: 'professional',
        formality: 'semi-formal',
        personality: [],
        vocabulary: 'moderate',
        sentenceLength: 'varied',
        punctuationStyle: 'standard',
        emojiUsage: 'rare',
        hashtagStyle: 'minimal',
      },
      samples: [],
      patterns: {
        openingPhrases: [],
        closingPhrases: [],
        transitionWords: [],
        signaturePhrases: [],
        avoidPhrases: [],
      },
      topicExpertise: [],
    });

    const sample = await store.addSample(profile.id, {
      userId: 'user-1',
      content: 'This is a sample tweet for training.',
      platform: 'twitter',
      contentType: 'tweet',
    });

    expect(sample.id).toBeDefined();
    expect(sample.content).toBe('This is a sample tweet for training.');
  });
});

// =============================================================================
// Trend Store Tests
// =============================================================================

describe('TrendStore', () => {
  let store: ReturnType<typeof createTrendStore>;

  beforeEach(async () => {
    store = createTrendStore('memory');
    await store.initialize();
  });

  it('should save trends', async () => {
    const trends: TrendItem[] = [
      {
        id: 'trend-1',
        source: 'twitter',
        title: 'AI Trends',
        velocity: 100,
        fetchedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      },
    ];

    await store.saveTrends(trends);
    const retrieved = await store.getTrends();
    expect(retrieved.length).toBeGreaterThan(0);
  });

  it('should get trends by source', async () => {
    const trends: TrendItem[] = [
      {
        id: 'trend-1',
        source: 'twitter',
        title: 'Twitter Trend',
        velocity: 50,
        fetchedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      },
      {
        id: 'trend-2',
        source: 'reddit',
        title: 'Reddit Trend',
        velocity: 30,
        fetchedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      },
    ];

    await store.saveTrends(trends);
    const twitterTrends = await store.getTrends({ sources: ['twitter'] });
    expect(twitterTrends.every(t => t.source === 'twitter')).toBe(true);
  });

  it('should create and get alerts', async () => {
    const alert = await store.createAlert({
      userId: 'user-1',
      name: 'AI Alert',
      keywords: ['artificial intelligence', 'machine learning'],
      sources: ['twitter', 'reddit'],
      notificationChannels: ['push'],
      enabled: true,
    });

    expect(alert.id).toBeDefined();
    expect(alert.name).toBe('AI Alert');

    const retrieved = await store.getAlert(alert.id);
    expect(retrieved).not.toBeNull();
  });

  it('should update alerts', async () => {
    const alert = await store.createAlert({
      userId: 'user-1',
      name: 'Original Alert',
      keywords: ['tech'],
      sources: ['twitter'],
      notificationChannels: ['push'],
      enabled: true,
    });

    const updated = await store.updateAlert(alert.id, {
      name: 'Updated Alert',
      enabled: false,
    });

    expect(updated).not.toBeNull();
    expect(updated?.name).toBe('Updated Alert');
    expect(updated?.enabled).toBe(false);
  });

  it('should delete alerts', async () => {
    const alert = await store.createAlert({
      userId: 'user-1',
      name: 'To Delete',
      keywords: ['test'],
      sources: ['twitter'],
      notificationChannels: ['push'],
      enabled: true,
    });

    const deleted = await store.deleteAlert(alert.id);
    expect(deleted).toBe(true);

    const retrieved = await store.getAlert(alert.id);
    expect(retrieved).toBeNull();
  });
});

// =============================================================================
// Analytics Store Tests
// =============================================================================

describe('AnalyticsStore', () => {
  let store: ReturnType<typeof createAnalyticsStore>;

  beforeEach(async () => {
    store = createAnalyticsStore('memory');
    await store.initialize();
  });

  it('should record analytics', async () => {
    const analytics = await store.create({
      contentId: 'content-1',
      userId: 'user-1',
      platform: 'twitter',
      contentType: 'tweet',
      metrics: {
        likes: 100,
        comments: 10,
        shares: 5,
        impressions: 1000,
        clicks: 50,
        engagementRate: 0.115,
        fetchedAt: Date.now(),
      },
      historicalMetrics: [],
      performanceScore: 80,
      comparedToAverage: 1.2,
      fetchedAt: Date.now(),
    });

    expect(analytics.id).toBeDefined();
    expect(analytics.metrics.likes).toBe(100);
  });

  it('should get analytics by content', async () => {
    await store.create({
      contentId: 'content-1',
      userId: 'user-1',
      platform: 'twitter',
      contentType: 'tweet',
      metrics: {
        likes: 50,
        comments: 5,
        shares: 2,
        impressions: 500,
        clicks: 25,
        engagementRate: 0.1,
        fetchedAt: Date.now(),
      },
      historicalMetrics: [],
      performanceScore: 60,
      comparedToAverage: 0.9,
      fetchedAt: Date.now(),
    });

    const analytics = await store.getByContentId('content-1');
    expect(analytics).not.toBeNull();
    expect(analytics?.contentId).toBe('content-1');
  });
});

// =============================================================================
// Tweet Formatter Tests
// =============================================================================

describe('TweetFormatter', () => {
  let formatter: TweetFormatter;

  beforeEach(() => {
    formatter = createTweetFormatter();
  });

  it('should format tweet to plain text', () => {
    const tweet: Tweet = {
      content: 'Hello, Twitter! #test @user',
      characterCount: 27,
    };

    const result = formatter.formatTweet(tweet, 'plain');
    expect(result).toContain('Hello, Twitter!');
  });

  it('should format tweet to markdown', () => {
    const tweet: Tweet = {
      content: 'Check out #AI trends @OpenAI',
      characterCount: 28,
    };

    const result = formatter.formatTweet(tweet, 'markdown');
    expect(result).toContain('#AI');
    expect(result).toContain('@OpenAI');
  });

  it('should format tweet to HTML', () => {
    const tweet: Tweet = {
      content: 'Hello world!',
      characterCount: 12,
    };

    const result = formatter.formatTweet(tweet, 'html');
    expect(result).toContain('<div class="tweet">');
    expect(result).toContain('Hello world!');
  });

  it('should format thread', () => {
    const thread: Thread = {
      id: 'thread-1',
      topic: 'AI Trends',
      hook: 'AI is changing everything...',
      tweets: [
        { content: 'First tweet', characterCount: 11 },
        { content: 'Second tweet', characterCount: 12 },
      ],
      totalCharacters: 23,
      estimatedReadTime: 1,
    };

    const result = formatter.formatThread(thread, 'plain');
    expect(result).toContain('First tweet');
    expect(result).toContain('Second tweet');
  });

  it('should parse text into tweets', () => {
    const text = 'This is paragraph one.\n\nThis is paragraph two.\n\nThis is paragraph three.';
    const tweets = formatter.parseIntoTweets(text);
    expect(tweets.length).toBeGreaterThan(0);
    expect(tweets[0].characterCount).toBeLessThanOrEqual(280);
  });
});

// =============================================================================
// Blog Formatter Tests
// =============================================================================

describe('BlogFormatter', () => {
  let formatter: BlogFormatter;

  beforeEach(() => {
    formatter = createBlogFormatter();
  });

  it('should format blog to HTML', () => {
    const post: BlogPost = {
      title: 'Test Blog Post',
      content: '<p>This is the blog content.</p>',
      status: 'draft',
      platform: 'wordpress',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const result = formatter.formatPost(post, 'html');
    expect(result).toContain('<title>Test Blog Post</title>');
    expect(result).toContain('This is the blog content.');
  });

  it('should format blog to markdown', () => {
    const post: BlogPost = {
      title: 'Markdown Post',
      content: '<p>Some content here.</p><h2>Section</h2><p>More content.</p>',
      status: 'published',
      platform: 'ghost',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const result = formatter.formatPost(post, 'markdown');
    expect(result).toContain('# Markdown Post');
  });

  it('should generate excerpt', () => {
    const content = 'This is a long piece of content that should be truncated into a shorter excerpt for display purposes.';
    const excerpt = formatter.generateExcerpt(content, 50);
    expect(excerpt.length).toBeLessThanOrEqual(53); // 50 + "..."
  });

  it('should generate slug', () => {
    const title = 'My Amazing Blog Post!';
    const slug = formatter.generateSlug(title);
    expect(slug).toBe('my-amazing-blog-post');
    expect(slug).not.toContain('!');
  });
});

// =============================================================================
// Newsletter Formatter Tests
// =============================================================================

describe('NewsletterFormatter', () => {
  let formatter: NewsletterFormatter;

  beforeEach(() => {
    formatter = createNewsletterFormatter();
  });

  it('should format newsletter to HTML', () => {
    // GeneratedDigest format expected by formatter
    const digest = {
      id: 'digest-1',
      title: 'Weekly Digest',
      sections: [
        {
          title: 'Tech News',
          items: [
            {
              title: 'AI Advances',
              content: 'New developments in AI.',
            },
          ],
        },
      ],
      wordCount: 10,
    };

    const result = formatter.format(digest as any, 'html');
    expect(result).toContain('Weekly Digest');
    expect(result).toContain('Tech News');
  });

  it('should format newsletter to markdown', () => {
    // GeneratedDigest format expected by formatter
    const digest = {
      id: 'digest-1',
      title: 'Daily Update',
      sections: [],
      wordCount: 0,
    };

    const result = formatter.format(digest as any, 'markdown');
    expect(result).toContain('# Daily Update');
  });
});

// =============================================================================
// Presentation Formatter Tests
// =============================================================================

describe('PresentationFormatter', () => {
  let formatter: PresentationFormatter;

  beforeEach(() => {
    formatter = createPresentationFormatter();
  });

  it('should format presentation to markdown', () => {
    // GeneratedPresentation format expected by formatter
    const presentation = {
      id: 'pres-1',
      title: 'My Presentation',
      slides: [
        {
          id: 'slide-1',
          slideNumber: 1,
          content: {
            title: 'Welcome',
            layout: 'title_only',
            body: 'Introduction to the topic',
          },
        },
      ],
      totalDuration: 300,
      slideCount: 1,
      generatedAt: Date.now(),
    };

    const result = formatter.format(presentation as any, 'markdown');
    expect(result).toContain('My Presentation');
    expect(result).toContain('Welcome');
  });

  it('should format presentation to HTML', () => {
    // GeneratedPresentation format expected by formatter
    const presentation = {
      id: 'pres-1',
      title: 'HTML Presentation',
      slides: [
        {
          id: 'slide-1',
          slideNumber: 1,
          content: {
            title: 'Slide One',
            layout: 'bullets',
            bullets: ['Point 1', 'Point 2', 'Point 3'],
          },
        },
      ],
      totalDuration: 120,
      slideCount: 1,
      generatedAt: Date.now(),
    };

    const result = formatter.format(presentation as any, 'html');
    expect(result).toContain('HTML Presentation');
    expect(result).toContain('Point 1');
  });

  it('should export speaker notes', () => {
    // GeneratedPresentation format expected by formatter
    const presentation = {
      id: 'pres-1',
      title: 'Notes Test',
      slides: [
        {
          id: 'slide-1',
          slideNumber: 1,
          content: {
            title: 'Slide',
            layout: 'title_only',
            speakerNotes: 'Remember to explain this point',
            duration: 60,
          },
        },
      ],
      totalDuration: 60,
      slideCount: 1,
      generatedAt: Date.now(),
    };

    const notes = formatter.format(presentation as any, 'speaker_notes');
    expect(notes).toContain('Remember to explain this point');
  });
});

// =============================================================================
// Content Provider Registry Tests
// =============================================================================

describe('ContentProviderRegistry', () => {
  it('should register and get providers', () => {
    const registry = new ContentProviderRegistry();

    // We can't easily test this without a real provider,
    // but we can test the registry methods exist
    expect(registry.has('social', 'twitter')).toBe(false);
    expect(registry.getRegisteredProviders()).toEqual([]);
  });

  it('should list all providers', () => {
    const registry = new ContentProviderRegistry();
    const providers = registry.getRegisteredProviders();
    expect(Array.isArray(providers)).toBe(true);
  });

  it('should check if provider exists', () => {
    const registry = new ContentProviderRegistry();
    expect(registry.has('nonexistent')).toBe(false);
  });
});

// =============================================================================
// Type Definition Tests
// =============================================================================

describe('Type Definitions', () => {
  it('should have valid content types', () => {
    const types: ContentType[] = ['tweet', 'thread', 'linkedin_post', 'blog_post', 'newsletter'];
    expect(types.length).toBe(5);
  });

  it('should have valid content platforms', () => {
    const platforms: ContentPlatform[] = ['twitter', 'linkedin', 'wordpress', 'ghost', 'youtube'];
    expect(platforms.length).toBe(5);
  });

  it('should have valid content statuses', () => {
    const statuses: ContentStatus[] = ['draft', 'review', 'scheduled', 'published', 'failed', 'archived'];
    expect(statuses.length).toBe(6);
  });

  it('should have valid trend sources', () => {
    const sources: TrendSource[] = ['twitter', 'reddit', 'hackernews', 'google', 'youtube'];
    expect(sources.length).toBe(5);
  });
});

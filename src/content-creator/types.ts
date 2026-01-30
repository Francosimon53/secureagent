/**
 * Content Creator Suite - Type Definitions
 *
 * Core types for content creation, social media automation,
 * voice training, trend monitoring, and content repurposing.
 */

// =============================================================================
// Voice Profile Types
// =============================================================================

/**
 * Writing style characteristics for AI voice training
 */
export interface WritingStyle {
  tone: 'professional' | 'casual' | 'humorous' | 'authoritative' | 'friendly' | 'inspirational';
  formality: 'formal' | 'semi-formal' | 'informal';
  personality: string[];
  vocabulary: 'simple' | 'moderate' | 'advanced' | 'technical';
  sentenceLength: 'short' | 'medium' | 'long' | 'varied';
  punctuationStyle: 'minimal' | 'standard' | 'expressive';
  emojiUsage: 'none' | 'rare' | 'moderate' | 'frequent';
  hashtagStyle: 'none' | 'minimal' | 'moderate' | 'heavy';
}

/**
 * Content sample for voice training
 */
export interface ContentSample {
  id: string;
  userId: string;
  content: string;
  platform: ContentPlatform;
  contentType: ContentType;
  engagementMetrics?: EngagementMetrics;
  createdAt: number;
  analyzedAt?: number;
}

/**
 * User's voice profile for consistent AI-generated content
 */
export interface VoiceProfile {
  id: string;
  userId: string;
  name: string;
  description?: string;
  style: WritingStyle;
  samples: ContentSample[];
  patterns: {
    openingPhrases: string[];
    closingPhrases: string[];
    transitionWords: string[];
    signaturePhrases: string[];
    avoidPhrases: string[];
  };
  topicExpertise: string[];
  trainedAt: number;
  updatedAt: number;
  sampleCount: number;
  confidence: number;
}

// =============================================================================
// Content Types
// =============================================================================

export type ContentType =
  | 'tweet'
  | 'thread'
  | 'linkedin_post'
  | 'linkedin_article'
  | 'blog_post'
  | 'newsletter'
  | 'video_script'
  | 'podcast_notes'
  | 'presentation'
  | 'summary';

export type ContentPlatform =
  | 'twitter'
  | 'linkedin'
  | 'wordpress'
  | 'ghost'
  | 'bearblog'
  | 'youtube'
  | 'medium'
  | 'substack'
  | 'custom';

export type ContentStatus =
  | 'draft'
  | 'review'
  | 'scheduled'
  | 'published'
  | 'failed'
  | 'archived';

/**
 * Universal content entity
 */
export interface GeneratedContent {
  id: string;
  userId: string;
  type: ContentType;
  platform: ContentPlatform;
  status: ContentStatus;
  title?: string;
  content: string;
  metadata: ContentMetadata;
  voiceProfileId?: string;
  scheduledAt?: number;
  publishedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ContentMetadata {
  wordCount: number;
  characterCount: number;
  readingTimeMinutes: number;
  hashtags?: string[];
  mentions?: string[];
  mediaUrls?: string[];
  externalLinks?: string[];
  seoScore?: number;
  engagementPrediction?: number;
  sourceContentId?: string;
  transformationType?: string;
}

export interface EngagementMetrics {
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  clicks: number;
  saves?: number;
  engagementRate: number;
  fetchedAt: number;
}

// =============================================================================
// Twitter/X Types
// =============================================================================

export interface Tweet {
  id?: string;
  content: string;
  mediaUrls?: string[];
  quoteTweetId?: string;
  replyToId?: string;
  scheduledAt?: number;
  characterCount: number;
}

export interface Thread {
  id: string;
  tweets: Tweet[];
  topic: string;
  hook: string;
  callToAction?: string;
  totalCharacters: number;
  estimatedReadTime: number;
}

export interface TweetGenerationOptions {
  topic: string;
  voiceProfileId?: string;
  style?: Partial<WritingStyle>;
  includeHashtags?: boolean;
  maxHashtags?: number;
  includeEmoji?: boolean;
  includeCTA?: boolean;
  targetAudience?: string;
  contentGoal?: 'engagement' | 'education' | 'promotion' | 'thought_leadership';
}

export interface ThreadGenerationOptions extends TweetGenerationOptions {
  minTweets?: number;
  maxTweets?: number;
  includeHook?: boolean;
  includeNumbering?: boolean;
}

// =============================================================================
// LinkedIn Types
// =============================================================================

export interface LinkedInPost {
  id?: string;
  content: string;
  mediaUrls?: string[];
  documentUrl?: string;
  pollOptions?: string[];
  articleUrl?: string;
  visibility: 'public' | 'connections' | 'logged_in';
  scheduledAt?: number;
  characterCount: number;
}

export interface LinkedInArticle {
  id?: string;
  title: string;
  content: string;
  coverImageUrl?: string;
  tags?: string[];
  visibility: 'public' | 'connections';
}

export type LinkedInEngagementAction = 'like' | 'comment' | 'share' | 'connect' | 'message';

export interface AutomationRule {
  id: string;
  userId: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  action: AutomationAction;
  conditions: AutomationCondition[];
  cooldownMinutes: number;
  maxActionsPerDay: number;
  actionsToday: number;
  lastTriggeredAt?: number;
  createdAt: number;
}

export interface AutomationTrigger {
  type: 'new_post' | 'mention' | 'connection_request' | 'message' | 'keyword' | 'schedule';
  keywords?: string[];
  authors?: string[];
  schedule?: string; // cron expression
}

export interface AutomationAction {
  type: LinkedInEngagementAction;
  template?: string;
  delay?: number;
}

export interface AutomationCondition {
  field: string;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'matches';
  value: string | number;
}

export interface LinkedInMessage {
  id?: string;
  recipientId: string;
  recipientName: string;
  subject?: string;
  content: string;
  templateId?: string;
  personalization?: Record<string, string>;
  scheduledAt?: number;
  sentAt?: number;
  status: 'draft' | 'scheduled' | 'sent' | 'failed';
}

// =============================================================================
// Content Repurposing Types
// =============================================================================

export interface RepurposingPipeline {
  id: string;
  userId: string;
  name: string;
  description?: string;
  sourceType: ContentType;
  transformations: PipelineTransformation[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PipelineTransformation {
  id: string;
  order: number;
  sourceType: ContentType;
  targetType: ContentType;
  targetPlatform: ContentPlatform;
  config: TransformationConfig;
}

export interface TransformationConfig {
  voiceProfileId?: string;
  voiceProfile?: VoiceProfile;
  maxLength?: number;
  preserveFormatting?: boolean;
  includeSourceAttribution?: boolean;
  customPrompt?: string;
  outputFormat?: string;
}

export interface RepurposingJob {
  id: string;
  pipelineId: string;
  sourceContentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  currentStep: number;
  totalSteps: number;
  outputs: GeneratedContent[];
  errors: RepurposingError[];
  startedAt: number;
  completedAt?: number;
}

export interface RepurposingError {
  step: number;
  transformationId: string;
  message: string;
  timestamp: number;
}

// =============================================================================
// Trend Monitoring Types
// =============================================================================

export type TrendSource = 'twitter' | 'reddit' | 'hackernews' | 'google' | 'youtube';

export interface TrendItem {
  id: string;
  source: TrendSource;
  title: string;
  description?: string;
  url?: string;
  volume?: number;
  velocity: number;
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
  relatedTopics?: string[];
  category?: string;
  rank?: number;
  fetchedAt: number;
  expiresAt: number;
}

export interface TrendAlert {
  id: string;
  userId: string;
  name: string;
  keywords: string[];
  sources: TrendSource[];
  minVolume?: number;
  minVelocity?: number;
  notificationChannels: ('email' | 'push' | 'webhook')[];
  webhookUrl?: string;
  enabled: boolean;
  lastTriggeredAt?: number;
  createdAt: number;
}

export interface TrendAlertNotification {
  id: string;
  alertId: string;
  trend: TrendItem;
  matchedKeywords: string[];
  relevanceScore: number;
  sentAt: number;
  acknowledged: boolean;
}

export interface TrendAggregation {
  id: string;
  userId: string;
  period: 'hourly' | 'daily' | 'weekly';
  sources: TrendSource[];
  trends: TrendItem[];
  topCategories: { category: string; count: number }[];
  emergingTopics: string[];
  generatedAt: number;
}

// =============================================================================
// Blog & Publishing Types
// =============================================================================

export interface BlogPost {
  id?: string;
  title: string;
  slug?: string;
  content: string;
  excerpt?: string;
  coverImageUrl?: string;
  author?: string;
  categories?: string[];
  tags?: string[];
  status: 'draft' | 'published' | 'scheduled' | 'private';
  publishedAt?: number;
  scheduledAt?: number;
  seo?: BlogSEO;
  platform: ContentPlatform;
  externalId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BlogSEO {
  metaTitle?: string;
  metaDescription?: string;
  focusKeyword?: string;
  secondaryKeywords?: string[];
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: 'summary' | 'summary_large_image';
}

export interface BlogPlatformCredentials {
  platform: ContentPlatform;
  siteUrl: string;
  apiKeyEnvVar?: string;
  username?: string;
  webhookSecret?: string;
}

// =============================================================================
// SEO Audit Types
// =============================================================================

export interface SEOAuditResult {
  id: string;
  contentId: string;
  url?: string;
  overallScore: number;
  categories: SEOCategoryScore[];
  issues: SEOIssue[];
  recommendations: SEORecommendation[];
  keywordAnalysis: KeywordAnalysis;
  readabilityScore: number;
  auditedAt: number;
}

export interface SEOCategoryScore {
  category: 'technical' | 'content' | 'keywords' | 'meta' | 'structure' | 'links';
  score: number;
  maxScore: number;
  issues: number;
}

export type SEOIssueSeverity = 'critical' | 'warning' | 'info';

export interface SEOIssue {
  id: string;
  category: SEOCategoryScore['category'];
  severity: SEOIssueSeverity;
  title: string;
  description: string;
  affectedElement?: string;
  currentValue?: string;
  recommendedValue?: string;
}

export interface SEORecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  effort: 'easy' | 'moderate' | 'difficult';
  category: SEOCategoryScore['category'];
}

export interface KeywordAnalysis {
  focusKeyword?: string;
  keywordDensity: number;
  keywordInTitle: boolean;
  keywordInHeadings: boolean;
  keywordInFirstParagraph: boolean;
  keywordInMetaDescription: boolean;
  relatedKeywords: { keyword: string; frequency: number }[];
  suggestedKeywords: string[];
}

// =============================================================================
// Video Script Types
// =============================================================================

export interface VideoScript {
  id: string;
  userId: string;
  title: string;
  topic: string;
  targetDuration: number; // in seconds
  actualDuration?: number;
  hook: ScriptSection;
  sections: ScriptSection[];
  callToAction?: ScriptSection;
  bRollSuggestions: BRollSuggestion[];
  totalWordCount: number;
  voiceProfileId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ScriptSection {
  id: string;
  order: number;
  type: 'hook' | 'intro' | 'main' | 'transition' | 'outro' | 'cta';
  title: string;
  content: string;
  speakerNotes?: string;
  estimatedDuration: number;
  visualCues?: string[];
}

export interface BRollSuggestion {
  id: string;
  sectionId: string;
  timestamp: number;
  description: string;
  searchTerms: string[];
  duration: number;
}

export interface VideoScriptGenerationOptions {
  topic: string;
  targetDuration: number;
  style: 'educational' | 'entertainment' | 'tutorial' | 'vlog' | 'promotional';
  voiceProfileId?: string;
  targetAudience?: string;
  includeHook?: boolean;
  includeCTA?: boolean;
  keyPoints?: string[];
}

// =============================================================================
// Podcast Types
// =============================================================================

export interface PodcastTranscription {
  id: string;
  userId: string;
  episodeTitle: string;
  episodeUrl?: string;
  duration: number;
  segments: TranscriptionSegment[];
  speakers: Speaker[];
  showNotes: ShowNotes;
  keywords: string[];
  summary: string;
  createdAt: number;
}

export interface TranscriptionSegment {
  id: string;
  speakerId: string;
  startTime: number;
  endTime: number;
  text: string;
  confidence: number;
  isHighlight?: boolean;
}

export interface Speaker {
  id: string;
  name?: string;
  label: string;
  speakingTime: number;
  segmentCount: number;
}

export interface ShowNotes {
  summary: string;
  keyTakeaways: string[];
  timestamps: TimestampEntry[];
  resources: Resource[];
  quotes: Quote[];
}

export interface TimestampEntry {
  time: number;
  label: string;
  description?: string;
}

export interface Resource {
  title: string;
  url?: string;
  description?: string;
  mentionedAt?: number;
}

export interface Quote {
  text: string;
  speaker: string;
  timestamp: number;
}

// =============================================================================
// YouTube Types
// =============================================================================

export interface YouTubeSummary {
  id: string;
  userId: string;
  videoId: string;
  videoUrl: string;
  title: string;
  channelName: string;
  duration: number;
  summary: string;
  keyPoints: KeyPoint[];
  chapters: VideoChapter[];
  quotes: Quote[];
  actionItems?: string[];
  relatedTopics: string[];
  createdAt: number;
}

export interface KeyPoint {
  id: string;
  order: number;
  point: string;
  timestamp?: number;
  importance: 'high' | 'medium' | 'low';
}

export interface VideoChapter {
  id: string;
  startTime: number;
  endTime: number;
  title: string;
  summary: string;
}

// =============================================================================
// Newsletter Types
// =============================================================================

export interface NewsletterDigest {
  id: string;
  userId: string;
  title: string;
  period: 'daily' | 'weekly' | 'monthly';
  sections: DigestSection[];
  introduction: string;
  conclusion?: string;
  totalItems: number;
  generatedAt: number;
}

export interface DigestSection {
  id: string;
  order: number;
  title: string;
  description?: string;
  items: DigestItem[];
}

export interface DigestItem {
  id: string;
  order: number;
  title: string;
  summary: string;
  sourceUrl?: string;
  sourceName?: string;
  imageUrl?: string;
  category?: string;
  relevanceScore: number;
}

export interface NewsletterConfig {
  id: string;
  userId: string;
  name: string;
  sources: NewsletterSource[];
  sections: { name: string; keywords: string[] }[];
  frequency: 'daily' | 'weekly' | 'monthly';
  maxItemsPerSection: number;
  voiceProfileId?: string;
  enabled: boolean;
}

export interface NewsletterSource {
  type: 'rss' | 'api' | 'scrape';
  url: string;
  name: string;
  category?: string;
  priority: number;
}

// =============================================================================
// Presentation Types
// =============================================================================

export interface Presentation {
  id: string;
  userId: string;
  title: string;
  subtitle?: string;
  theme: PresentationTheme;
  slides: Slide[];
  speakerNotes: string[];
  totalSlides: number;
  estimatedDuration: number;
  createdAt: number;
  updatedAt: number;
}

export interface PresentationTheme {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  backgroundColor: string;
}

export interface Slide {
  id: string;
  order: number;
  type: SlideType;
  title?: string;
  content: SlideContent;
  speakerNotes?: string;
  transition?: string;
  animationPreset?: string;
}

export type SlideType =
  | 'title'
  | 'section'
  | 'content'
  | 'bullet_points'
  | 'image'
  | 'comparison'
  | 'quote'
  | 'chart'
  | 'timeline'
  | 'closing';

export interface SlideContent {
  text?: string;
  bulletPoints?: string[];
  imageUrl?: string;
  imageAlt?: string;
  chartData?: ChartData;
  columns?: { title: string; points: string[] }[];
  quote?: { text: string; author: string };
  timelineItems?: { date: string; event: string }[];
}

export interface ChartData {
  type: 'bar' | 'line' | 'pie' | 'doughnut';
  labels: string[];
  datasets: { label: string; data: number[]; color?: string }[];
}

export interface PresentationGenerationOptions {
  topic: string;
  targetSlides?: number;
  style: 'professional' | 'creative' | 'minimal' | 'bold';
  voiceProfileId?: string;
  keyPoints?: string[];
  includeCharts?: boolean;
  includeImages?: boolean;
  audienceType?: string;
}

// =============================================================================
// Provider Types
// =============================================================================

export interface ContentProviderConfig {
  apiKeyEnvVar?: string;
  timeout?: number;
  maxRetries?: number;
  rateLimitPerMinute?: number;
}

export type ContentProviderResult<T> =
  | { success: true; data: T; cached: boolean; fetchedAt: number }
  | { success: false; error: string; cached: boolean; fetchedAt: number };

/**
 * Simpler result type for services that don't need caching metadata
 */
export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// =============================================================================
// Store Query Types
// =============================================================================

export interface ContentQueryOptions {
  userId?: string;
  type?: ContentType;
  platform?: ContentPlatform;
  status?: ContentStatus;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'publishedAt';
  sortOrder?: 'asc' | 'desc';
  fromDate?: number;
  toDate?: number;
}

export interface VoiceProfileQueryOptions {
  userId?: string;
  limit?: number;
  offset?: number;
}

export interface TrendQueryOptions {
  sources?: TrendSource[];
  minVolume?: number;
  category?: string;
  limit?: number;
  offset?: number;
}

export interface AnalyticsQueryOptions {
  userId?: string;
  platform?: ContentPlatform;
  contentType?: ContentType;
  fromDate?: number;
  toDate?: number;
  groupBy?: 'day' | 'week' | 'month';
}

// =============================================================================
// Analytics Types
// =============================================================================

export interface ContentAnalytics {
  id: string;
  contentId: string;
  userId: string;
  platform: ContentPlatform;
  contentType: ContentType;
  metrics: EngagementMetrics;
  historicalMetrics: HistoricalMetric[];
  performanceScore: number;
  comparedToAverage: number;
  topPerformingTime?: string;
  audienceInsights?: AudienceInsights;
  fetchedAt: number;
}

export interface HistoricalMetric {
  timestamp: number;
  metrics: Partial<EngagementMetrics>;
}

export interface AudienceInsights {
  topLocations?: { location: string; percentage: number }[];
  demographics?: { group: string; percentage: number }[];
  peakEngagementHours?: number[];
}

export interface AnalyticsSummary {
  userId: string;
  period: 'day' | 'week' | 'month' | 'year';
  totalContent: number;
  totalEngagements: number;
  averageEngagementRate: number;
  topPerformingContent: string[];
  platformBreakdown: { platform: ContentPlatform; count: number; engagements: number }[];
  contentTypeBreakdown: { type: ContentType; count: number; engagements: number }[];
  growthRate: number;
}

// =============================================================================
// Database Adapter Interface
// =============================================================================

export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

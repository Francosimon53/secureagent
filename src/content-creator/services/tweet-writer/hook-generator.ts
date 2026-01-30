/**
 * Content Creator Suite - Hook Generator Service
 *
 * Generates engaging hooks for tweets, threads, and other content.
 */

import type { ContentProviderResult, WritingStyle } from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';

// =============================================================================
// Types
// =============================================================================

export type HookType =
  | 'question'
  | 'statistic'
  | 'story'
  | 'controversial'
  | 'curiosity'
  | 'promise'
  | 'challenge'
  | 'quote';

export interface HookGenerationOptions {
  topic: string;
  hookType?: HookType;
  style?: Partial<WritingStyle>;
  maxLength?: number;
  targetAudience?: string;
}

export interface GeneratedHook {
  content: string;
  hookType: HookType;
  characterCount: number;
  suggestedFollowUp?: string;
}

// =============================================================================
// Hook Templates
// =============================================================================

const HOOK_TEMPLATES: Record<HookType, string[]> = {
  question: [
    'Have you ever wondered why {topic}?',
    'What if I told you that {topic}?',
    'Why do most people get {topic} wrong?',
    'Want to know the secret to {topic}?',
  ],
  statistic: [
    '{number}% of people don\'t know this about {topic}',
    'I analyzed {number} {items} and here\'s what I learned about {topic}',
    'Only {number} in {total} people understand {topic}',
  ],
  story: [
    'Last week, something changed my perspective on {topic}',
    '3 years ago, I knew nothing about {topic}. Today...',
    'I made a mistake with {topic} that cost me everything',
    'Here\'s a story about {topic} nobody talks about',
  ],
  controversial: [
    'Unpopular opinion: {topic}',
    'I\'m going to say something controversial about {topic}',
    'Most advice about {topic} is wrong. Here\'s why.',
    'Stop believing these myths about {topic}',
  ],
  curiosity: [
    'The hidden truth about {topic} that experts won\'t tell you',
    'This is what nobody mentions about {topic}',
    'There\'s something strange happening with {topic}',
    'I discovered something unexpected about {topic}',
  ],
  promise: [
    'Master {topic} in {timeframe}',
    'The simple framework that will transform your {topic}',
    'After reading this, you\'ll never think about {topic} the same way',
    '{number} lessons that will change how you approach {topic}',
  ],
  challenge: [
    'I bet you can\'t do this with {topic}',
    'Try this {topic} challenge for {timeframe}',
    'Most people fail at {topic}. Will you?',
    'Can you name {number} things about {topic}?',
  ],
  quote: [
    '"{quote}" - This changed how I think about {topic}',
    'The best advice I ever got about {topic}:',
    'Someone once told me about {topic}...',
  ],
};

// =============================================================================
// Hook Generator Service
// =============================================================================

export class HookGeneratorService {
  constructor(private readonly generator: ContentGeneratorProvider) {}

  /**
   * Generate an engaging hook
   */
  async generateHook(
    options: HookGenerationOptions
  ): Promise<ContentProviderResult<GeneratedHook>> {
    const hookType = options.hookType ?? this.selectHookType(options);
    const maxLength = options.maxLength ?? 100;

    const prompt = this.buildHookPrompt(options, hookType);

    const result = await this.generator.generate({
      prompt,
      systemPrompt: `You are an expert at writing engaging social media hooks that capture attention immediately.
Your hooks should:
- Stop the scroll
- Create curiosity
- Promise value
- Be concise and punchy
- Match the specified tone and style`,
      temperature: 0.9, // Higher temperature for creativity
      maxTokens: 100,
    });

    if (!result.success) {
      return result as ContentProviderResult<GeneratedHook>;
    }

    const content = result.data.content.trim().replace(/^["']|["']$/g, '');

    // Truncate if too long
    const finalContent = content.length > maxLength
      ? this.truncateHook(content, maxLength)
      : content;

    return {
      success: true,
      data: {
        content: finalContent,
        hookType,
        characterCount: finalContent.length,
        suggestedFollowUp: this.generateFollowUpSuggestion(hookType),
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Generate multiple hook variations
   */
  async generateHookVariations(
    options: HookGenerationOptions,
    count: number = 5
  ): Promise<ContentProviderResult<GeneratedHook[]>> {
    const hookTypes: HookType[] = [
      'question',
      'statistic',
      'story',
      'controversial',
      'curiosity',
      'promise',
      'challenge',
    ];

    // Use different hook types for variety
    const selectedTypes = hookTypes.slice(0, count);

    const prompt = `Generate ${count} different engaging hooks for content about: "${options.topic}"

Each hook should use a different approach:
${selectedTypes.map((type, i) => `${i + 1}. ${this.getHookTypeDescription(type)}`).join('\n')}

Target audience: ${options.targetAudience ?? 'general audience'}
Tone: ${options.style?.tone ?? 'professional but engaging'}

Requirements:
- Each hook should be under ${options.maxLength ?? 100} characters
- Make each hook unique and compelling
- Avoid clichés and overused phrases

Format your response as:
HOOK 1 (${selectedTypes[0]}): [hook]
HOOK 2 (${selectedTypes[1]}): [hook]
...`;

    const result = await this.generator.generate({
      prompt,
      systemPrompt: 'You are an expert copywriter specializing in attention-grabbing hooks.',
      temperature: 0.9,
      maxTokens: count * 100,
    });

    if (!result.success) {
      return result as ContentProviderResult<GeneratedHook[]>;
    }

    const hooks: GeneratedHook[] = [];
    const hookPattern = /HOOK\s*\d+\s*\((\w+)\):\s*(.+?)(?=HOOK\s*\d+|$)/gis;
    let match;

    while ((match = hookPattern.exec(result.data.content)) !== null) {
      const type = this.normalizeHookType(match[1]) ?? 'curiosity';
      const content = match[2].trim().replace(/^["']|["']$/g, '');

      if (content) {
        hooks.push({
          content,
          hookType: type,
          characterCount: content.length,
          suggestedFollowUp: this.generateFollowUpSuggestion(type),
        });
      }
    }

    // If parsing failed, try simpler format
    if (hooks.length === 0) {
      const lines = result.data.content.split('\n').filter(l => l.trim());
      for (let i = 0; i < lines.length && i < count; i++) {
        const content = lines[i].replace(/^\d+[.)]\s*/, '').trim().replace(/^["']|["']$/g, '');
        if (content) {
          hooks.push({
            content,
            hookType: selectedTypes[i] ?? 'curiosity',
            characterCount: content.length,
            suggestedFollowUp: this.generateFollowUpSuggestion(selectedTypes[i] ?? 'curiosity'),
          });
        }
      }
    }

    return {
      success: true,
      data: hooks,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Generate a hook using a template
   */
  generateTemplateHook(hookType: HookType, variables: Record<string, string>): GeneratedHook {
    const templates = HOOK_TEMPLATES[hookType];
    const template = templates[Math.floor(Math.random() * templates.length)];

    let content = template;
    for (const [key, value] of Object.entries(variables)) {
      content = content.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }

    // Clean up any remaining placeholders
    content = content.replace(/\{[^}]+\}/g, '...');

    return {
      content,
      hookType,
      characterCount: content.length,
      suggestedFollowUp: this.generateFollowUpSuggestion(hookType),
    };
  }

  /**
   * Analyze the effectiveness of a hook
   */
  async analyzeHook(hook: string): Promise<ContentProviderResult<{
    score: number;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    detectedHookType: HookType;
  }>> {
    const prompt = `Analyze this social media hook for effectiveness:

"${hook}"

Evaluate:
1. Attention-grabbing score (1-10)
2. What makes it effective (strengths)
3. What could be improved (weaknesses)
4. Specific suggestions for improvement
5. What type of hook this is (question, statistic, story, controversial, curiosity, promise, challenge, or quote)

Format your response as:
SCORE: [number]
HOOK_TYPE: [type]
STRENGTHS:
- [strength 1]
- [strength 2]
WEAKNESSES:
- [weakness 1]
SUGGESTIONS:
- [suggestion 1]
- [suggestion 2]`;

    const result = await this.generator.generate({
      prompt,
      systemPrompt: 'You are an expert copywriter and social media strategist.',
      temperature: 0.3,
      maxTokens: 400,
    });

    if (!result.success) {
      return result as ContentProviderResult<{
        score: number;
        strengths: string[];
        weaknesses: string[];
        suggestions: string[];
        detectedHookType: HookType;
      }>;
    }

    const response = result.data.content;

    // Parse the response
    const scoreMatch = response.match(/SCORE:\s*(\d+)/i);
    const hookTypeMatch = response.match(/HOOK_TYPE:\s*(\w+)/i);

    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 5;
    const detectedHookType = this.normalizeHookType(hookTypeMatch?.[1] ?? '') ?? 'curiosity';

    const strengths = this.extractListItems(response, 'STRENGTHS');
    const weaknesses = this.extractListItems(response, 'WEAKNESSES');
    const suggestions = this.extractListItems(response, 'SUGGESTIONS');

    return {
      success: true,
      data: {
        score,
        strengths,
        weaknesses,
        suggestions,
        detectedHookType,
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Select the best hook type based on options
   */
  private selectHookType(options: HookGenerationOptions): HookType {
    const tone = options.style?.tone;

    // Match hook type to tone
    if (tone === 'humorous') return 'story';
    if (tone === 'authoritative') return 'statistic';
    if (tone === 'inspirational') return 'promise';
    if (tone === 'casual') return 'question';

    // Default to curiosity for general use
    return 'curiosity';
  }

  /**
   * Build the prompt for hook generation
   */
  private buildHookPrompt(options: HookGenerationOptions, hookType: HookType): string {
    const description = this.getHookTypeDescription(hookType);

    return `Generate an engaging ${hookType} hook for content about: "${options.topic}"

Hook type: ${description}
Target audience: ${options.targetAudience ?? 'general audience'}
Tone: ${options.style?.tone ?? 'engaging and professional'}
Maximum length: ${options.maxLength ?? 100} characters

Requirements:
- Must grab attention immediately
- Should create curiosity or emotional response
- Must be relevant to the topic
- Should feel authentic, not clickbaity

Return ONLY the hook text, nothing else.`;
  }

  /**
   * Get description for a hook type
   */
  private getHookTypeDescription(hookType: HookType): string {
    const descriptions: Record<HookType, string> = {
      question: 'Start with a thought-provoking question',
      statistic: 'Lead with a surprising statistic or number',
      story: 'Begin with a personal story or anecdote',
      controversial: 'Start with a bold, contrarian statement',
      curiosity: 'Create a curiosity gap that makes people want to learn more',
      promise: 'Promise a specific benefit or outcome',
      challenge: 'Issue a challenge to the reader',
      quote: 'Start with an impactful quote',
    };
    return descriptions[hookType];
  }

  /**
   * Normalize hook type string to enum
   */
  private normalizeHookType(type: string): HookType | null {
    const normalized = type.toLowerCase().trim();
    const types: HookType[] = [
      'question',
      'statistic',
      'story',
      'controversial',
      'curiosity',
      'promise',
      'challenge',
      'quote',
    ];
    return types.find(t => normalized.includes(t)) ?? null;
  }

  /**
   * Truncate a hook at a natural break point
   */
  private truncateHook(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;

    const truncated = content.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > maxLength * 0.7) {
      return content.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
  }

  /**
   * Generate follow-up suggestion based on hook type
   */
  private generateFollowUpSuggestion(hookType: HookType): string {
    const suggestions: Record<HookType, string> = {
      question: 'Follow up by providing the answer or insight',
      statistic: 'Explain the significance of the statistic',
      story: 'Continue with the lesson or insight from the story',
      controversial: 'Support your statement with evidence or reasoning',
      curiosity: 'Deliver on the curiosity by revealing the information',
      promise: 'Provide the framework or steps to achieve the promise',
      challenge: 'Explain the challenge and how to participate',
      quote: 'Explain how this quote relates to your main point',
    };
    return suggestions[hookType];
  }

  /**
   * Extract list items from a section of text
   */
  private extractListItems(text: string, section: string): string[] {
    const sectionPattern = new RegExp(`${section}:[\\s\\S]*?(?=\\n[A-Z]+:|$)`, 'i');
    const match = text.match(sectionPattern);

    if (!match) return [];

    const items: string[] = [];
    const itemPattern = /-\s*(.+)/g;
    let itemMatch;

    while ((itemMatch = itemPattern.exec(match[0])) !== null) {
      const item = itemMatch[1].trim();
      if (item) items.push(item);
    }

    return items;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createHookGenerator(generator: ContentGeneratorProvider): HookGeneratorService {
  return new HookGeneratorService(generator);
}

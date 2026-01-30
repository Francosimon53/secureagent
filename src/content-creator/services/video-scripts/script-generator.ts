/**
 * Content Creator Suite - Video Script Generator
 *
 * Generates complete video scripts with sections, hooks, and B-roll suggestions.
 */

import type {
  VideoScript,
  ScriptSection,
  BRollSuggestion,
  VideoScriptGenerationOptions,
  VoiceProfile,
} from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import { CONTENT_DEFAULTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface ScriptGeneratorConfig {
  wordsPerMinute: number;
  includeHooks: boolean;
  includeBRollSuggestions: boolean;
  includeSpeakerNotes: boolean;
  defaultStyle: VideoScriptGenerationOptions['style'];
}

export interface GeneratedScript {
  script: VideoScript;
  metadata: {
    estimatedDuration: number;
    actualWordCount: number;
    sectionCount: number;
    bRollCount: number;
  };
}

// =============================================================================
// Script Generator Service
// =============================================================================

export class ScriptGeneratorService {
  private readonly config: ScriptGeneratorConfig;

  constructor(
    private readonly contentGenerator: ContentGeneratorProvider,
    config?: Partial<ScriptGeneratorConfig>
  ) {
    this.config = {
      wordsPerMinute: config?.wordsPerMinute ?? CONTENT_DEFAULTS.VIDEO_SCRIPT_WORDS_PER_MINUTE,
      includeHooks: config?.includeHooks ?? true,
      includeBRollSuggestions: config?.includeBRollSuggestions ?? true,
      includeSpeakerNotes: config?.includeSpeakerNotes ?? true,
      defaultStyle: config?.defaultStyle ?? 'educational',
    };
  }

  /**
   * Generate a complete video script
   */
  async generateScript(
    userId: string,
    options: VideoScriptGenerationOptions,
    voiceProfile?: VoiceProfile
  ): Promise<GeneratedScript> {
    const targetDuration = options.targetDuration;
    const targetWordCount = Math.round((targetDuration / 60) * this.config.wordsPerMinute);
    const style = options.style ?? this.config.defaultStyle;

    // Generate the main script content
    const scriptContent = await this.generateScriptContent(
      options.topic,
      targetWordCount,
      style,
      options.keyPoints,
      voiceProfile
    );

    // Parse into sections
    const sections = this.parseScriptSections(scriptContent, style);

    // Generate hook if requested
    let hook: ScriptSection | undefined;
    if (options.includeHook ?? this.config.includeHooks) {
      hook = await this.generateHook(options.topic, style, voiceProfile);
    }

    // Generate CTA if requested
    let callToAction: ScriptSection | undefined;
    if (options.includeCTA) {
      callToAction = await this.generateCTA(options.topic, style, voiceProfile);
    }

    // Generate B-roll suggestions
    let bRollSuggestions: BRollSuggestion[] = [];
    if (this.config.includeBRollSuggestions) {
      bRollSuggestions = await this.generateBRollSuggestions(sections, hook);
    }

    // Calculate actual duration
    const allSections = [
      ...(hook ? [hook] : []),
      ...sections,
      ...(callToAction ? [callToAction] : []),
    ];
    const totalWordCount = allSections.reduce(
      (sum, s) => sum + this.countWords(s.content),
      0
    );
    const actualDuration = Math.round((totalWordCount / this.config.wordsPerMinute) * 60);

    const script: VideoScript = {
      id: crypto.randomUUID(),
      userId,
      title: this.generateTitle(options.topic, style),
      topic: options.topic,
      targetDuration,
      actualDuration,
      hook: hook ?? sections[0],
      sections,
      callToAction,
      bRollSuggestions,
      totalWordCount,
      voiceProfileId: options.voiceProfileId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return {
      script,
      metadata: {
        estimatedDuration: actualDuration,
        actualWordCount: totalWordCount,
        sectionCount: sections.length,
        bRollCount: bRollSuggestions.length,
      },
    };
  }

  /**
   * Generate main script content
   */
  private async generateScriptContent(
    topic: string,
    targetWordCount: number,
    style: string,
    keyPoints?: string[],
    voiceProfile?: VoiceProfile
  ): Promise<string> {
    const styleGuides: Record<string, string> = {
      educational: 'Clear explanations, logical flow, examples and analogies',
      entertainment: 'Engaging storytelling, humor, relatable content',
      tutorial: 'Step-by-step instructions, practical demonstrations, tips',
      vlog: 'Personal, conversational, authentic, emotional connection',
      promotional: 'Benefits-focused, compelling value proposition, clear CTA',
    };

    let prompt = `Write a video script about: ${topic}

TARGET LENGTH: Approximately ${targetWordCount} words
STYLE: ${style}
STYLE GUIDE: ${styleGuides[style] ?? styleGuides.educational}

`;

    if (keyPoints && keyPoints.length > 0) {
      prompt += `KEY POINTS TO COVER:
${keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

`;
    }

    prompt += `STRUCTURE:
1. Engaging introduction (hook the viewer)
2. Main content with clear sections
3. Each section should have a header
4. Include transitions between sections
5. End with a strong conclusion

FORMAT:
Use ## for section headers
Include [PAUSE] for natural pauses
Include [EMPHASIS] for words to stress
Include speaker notes in brackets like [Note: speak slower here]`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: `You are an expert video scriptwriter. Write engaging, well-paced scripts that are optimized for video delivery. Write in a conversational style that sounds natural when spoken aloud.`,
      maxTokens: Math.max(2000, targetWordCount * 2),
      voiceProfile,
    });

    if (!result.success) {
      throw new Error(`Failed to generate script: ${result.error}`);
    }

    return result.data.content;
  }

  /**
   * Parse script content into sections
   */
  private parseScriptSections(content: string, style: string): ScriptSection[] {
    const sections: ScriptSection[] = [];
    const sectionRegex = /##\s*(.+?)\n([\s\S]*?)(?=##|$)/g;

    let match;
    let order = 1;

    while ((match = sectionRegex.exec(content)) !== null) {
      const title = match[1].trim();
      const sectionContent = match[2].trim();

      // Extract speaker notes
      const speakerNotes: string[] = [];
      const cleanContent = sectionContent.replace(
        /\[Note:\s*([^\]]+)\]/gi,
        (_, note) => {
          speakerNotes.push(note);
          return '';
        }
      );

      // Extract visual cues
      const visualCues: string[] = [];
      const contentWithoutVisuals = cleanContent.replace(
        /\[Visual:\s*([^\]]+)\]/gi,
        (_, cue) => {
          visualCues.push(cue);
          return '';
        }
      );

      // Determine section type
      let type: ScriptSection['type'] = 'main';
      const titleLower = title.toLowerCase();
      if (titleLower.includes('intro')) type = 'intro';
      else if (titleLower.includes('conclusion') || titleLower.includes('outro')) type = 'outro';
      else if (titleLower.includes('transition')) type = 'transition';
      else if (titleLower.includes('hook') || order === 1) type = order === 1 ? 'hook' : 'main';

      const wordCount = this.countWords(contentWithoutVisuals);
      const estimatedDuration = Math.round((wordCount / this.config.wordsPerMinute) * 60);

      sections.push({
        id: crypto.randomUUID(),
        order,
        type,
        title,
        content: contentWithoutVisuals.trim(),
        speakerNotes: speakerNotes.length > 0 ? speakerNotes.join('\n') : undefined,
        estimatedDuration,
        visualCues: visualCues.length > 0 ? visualCues : undefined,
      });

      order++;
    }

    // If no sections found, create a single main section
    if (sections.length === 0) {
      sections.push({
        id: crypto.randomUUID(),
        order: 1,
        type: 'main',
        title: 'Main Content',
        content: content,
        estimatedDuration: Math.round((this.countWords(content) / this.config.wordsPerMinute) * 60),
      });
    }

    return sections;
  }

  /**
   * Generate a hook
   */
  private async generateHook(
    topic: string,
    style: string,
    voiceProfile?: VoiceProfile
  ): Promise<ScriptSection> {
    const prompt = `Write a compelling video hook (first 5-10 seconds) for a ${style} video about: ${topic}

Requirements:
- Maximum 50 words
- Immediately capture attention
- Create curiosity or emotional connection
- Make the viewer want to keep watching

Types of hooks to consider:
- Surprising fact or statistic
- Bold statement or question
- Story teaser
- Direct address to viewer's problem

Return ONLY the hook text.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You write viral video hooks that capture attention instantly.',
      maxTokens: 100,
      voiceProfile,
    });

    const hookContent = result.success ? result.data.content.trim() : `Let me tell you about ${topic}...`;
    const wordCount = this.countWords(hookContent);

    return {
      id: crypto.randomUUID(),
      order: 0,
      type: 'hook',
      title: 'Hook',
      content: hookContent,
      estimatedDuration: Math.round((wordCount / this.config.wordsPerMinute) * 60),
    };
  }

  /**
   * Generate a call to action
   */
  private async generateCTA(
    topic: string,
    style: string,
    voiceProfile?: VoiceProfile
  ): Promise<ScriptSection> {
    const prompt = `Write a call to action for the end of a ${style} video about: ${topic}

Requirements:
- 20-40 words
- Clear and specific action
- Create urgency or motivation
- Include typical YouTube CTAs (like, subscribe, comment)

Return ONLY the CTA text.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You write effective calls to action that drive engagement.',
      maxTokens: 80,
      voiceProfile,
    });

    const ctaContent = result.success
      ? result.data.content.trim()
      : 'If you found this helpful, give it a like and subscribe for more content like this!';

    const wordCount = this.countWords(ctaContent);

    return {
      id: crypto.randomUUID(),
      order: 999,
      type: 'cta',
      title: 'Call to Action',
      content: ctaContent,
      estimatedDuration: Math.round((wordCount / this.config.wordsPerMinute) * 60),
    };
  }

  /**
   * Generate B-roll suggestions
   */
  private async generateBRollSuggestions(
    sections: ScriptSection[],
    hook?: ScriptSection
  ): Promise<BRollSuggestion[]> {
    const suggestions: BRollSuggestion[] = [];
    const allSections = hook ? [hook, ...sections] : sections;
    let cumulativeTime = 0;

    for (const section of allSections) {
      // Generate 1-2 B-roll suggestions per section
      const sectionSuggestions = await this.generateSectionBRoll(section, cumulativeTime);
      suggestions.push(...sectionSuggestions);
      cumulativeTime += section.estimatedDuration;
    }

    return suggestions;
  }

  /**
   * Generate B-roll for a specific section
   */
  private async generateSectionBRoll(
    section: ScriptSection,
    startTime: number
  ): Promise<BRollSuggestion[]> {
    const prompt = `Based on this video script section, suggest 1-2 B-roll shots:

SECTION: ${section.title}
CONTENT: ${section.content.substring(0, 300)}...

For each B-roll suggestion, provide:
1. A brief description of what to show
2. Search terms for stock footage
3. Suggested duration in seconds (3-10 seconds)

Format:
BROLL 1: [description] | SEARCH: [terms] | DURATION: [seconds]`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You are a video editor suggesting relevant B-roll footage.',
      maxTokens: 200,
    });

    const suggestions: BRollSuggestion[] = [];

    if (result.success) {
      const lines = result.data.content.split('\n').filter(l => l.startsWith('BROLL'));

      for (const line of lines) {
        const descMatch = line.match(/BROLL \d+:\s*(.+?)\s*\|/);
        const searchMatch = line.match(/SEARCH:\s*(.+?)\s*\|/);
        const durationMatch = line.match(/DURATION:\s*(\d+)/);

        if (descMatch) {
          const duration = parseInt(durationMatch?.[1] ?? '5', 10);
          suggestions.push({
            id: crypto.randomUUID(),
            sectionId: section.id,
            timestamp: startTime + Math.random() * section.estimatedDuration * 0.8,
            description: descMatch[1].trim(),
            searchTerms: searchMatch?.[1].split(',').map(s => s.trim()) ?? [],
            duration,
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * Generate script title
   */
  private generateTitle(topic: string, style: string): string {
    const prefixes: Record<string, string> = {
      educational: '',
      entertainment: '',
      tutorial: 'How to: ',
      vlog: 'My Journey: ',
      promotional: '',
    };

    return (prefixes[style] ?? '') + topic;
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter(w => w.length > 0).length;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createScriptGenerator(
  contentGenerator: ContentGeneratorProvider,
  config?: Partial<ScriptGeneratorConfig>
): ScriptGeneratorService {
  return new ScriptGeneratorService(contentGenerator, config);
}

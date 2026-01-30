/**
 * Content Creator Suite - Video Outline Builder
 *
 * Creates structured outlines for video scripts before full generation.
 */

import type { VoiceProfile, VideoScriptGenerationOptions } from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import { CONTENT_DEFAULTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface VideoOutline {
  id: string;
  topic: string;
  style: VideoScriptGenerationOptions['style'];
  targetDuration: number;
  hook: OutlineSection;
  sections: OutlineSection[];
  conclusion: OutlineSection;
  estimatedTotalDuration: number;
  keyTakeaways: string[];
  targetAudience?: string;
  createdAt: number;
}

export interface OutlineSection {
  id: string;
  order: number;
  title: string;
  keyPoints: string[];
  estimatedDuration: number;
  visualIdeas?: string[];
  notes?: string;
}

export interface OutlineGenerationOptions {
  topic: string;
  targetDuration: number;
  style: VideoScriptGenerationOptions['style'];
  targetAudience?: string;
  keyPoints?: string[];
  numberOfSections?: number;
  includeVisualIdeas?: boolean;
}

// =============================================================================
// Outline Builder Service
// =============================================================================

export class OutlineBuilderService {
  private readonly wordsPerMinute: number;

  constructor(
    private readonly contentGenerator: ContentGeneratorProvider,
    wordsPerMinute?: number
  ) {
    this.wordsPerMinute = wordsPerMinute ?? CONTENT_DEFAULTS.VIDEO_SCRIPT_WORDS_PER_MINUTE;
  }

  /**
   * Generate a video outline
   */
  async generateOutline(
    options: OutlineGenerationOptions,
    voiceProfile?: VoiceProfile
  ): Promise<VideoOutline> {
    const numberOfSections = options.numberOfSections ?? this.calculateSectionCount(options.targetDuration);

    // Generate the outline structure
    const outlineContent = await this.generateOutlineContent(options, numberOfSections, voiceProfile);

    // Parse into structured outline
    const outline = this.parseOutline(outlineContent, options);

    return outline;
  }

  /**
   * Expand an outline section with more detail
   */
  async expandSection(
    section: OutlineSection,
    context: { topic: string; style: string },
    voiceProfile?: VoiceProfile
  ): Promise<OutlineSection> {
    const prompt = `Expand this video script outline section with more detail:

TOPIC: ${context.topic}
STYLE: ${context.style}
SECTION: ${section.title}
CURRENT POINTS: ${section.keyPoints.join(', ')}

Provide:
1. 2-3 additional key points
2. Specific examples or stories to include
3. Transition ideas to/from this section
4. Visual suggestions

Format:
ADDITIONAL POINTS:
- [point]
EXAMPLES:
- [example]
TRANSITIONS:
- [transition idea]
VISUALS:
- [visual idea]`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You are a video content strategist who creates detailed outlines.',
      maxTokens: 400,
      voiceProfile,
    });

    if (result.success) {
      const content = result.data.content;

      // Parse additional points
      const additionalPoints: string[] = [];
      const pointsMatch = content.match(/ADDITIONAL POINTS:([\s\S]*?)(?=EXAMPLES:|TRANSITIONS:|VISUALS:|$)/i);
      if (pointsMatch) {
        const lines = pointsMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
        additionalPoints.push(...lines.map(l => l.replace(/^-\s*/, '').trim()));
      }

      // Parse visual ideas
      const visualIdeas: string[] = [];
      const visualsMatch = content.match(/VISUALS:([\s\S]*?)$/i);
      if (visualsMatch) {
        const lines = visualsMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
        visualIdeas.push(...lines.map(l => l.replace(/^-\s*/, '').trim()));
      }

      return {
        ...section,
        keyPoints: [...section.keyPoints, ...additionalPoints],
        visualIdeas: [...(section.visualIdeas ?? []), ...visualIdeas],
      };
    }

    return section;
  }

  /**
   * Suggest improvements to an outline
   */
  async suggestImprovements(outline: VideoOutline): Promise<string[]> {
    const outlineSummary = outline.sections
      .map(s => `${s.title}: ${s.keyPoints.join(', ')}`)
      .join('\n');

    const prompt = `Review this video outline and suggest improvements:

TOPIC: ${outline.topic}
STYLE: ${outline.style}
TARGET DURATION: ${outline.targetDuration} seconds
TARGET AUDIENCE: ${outline.targetAudience ?? 'General'}

OUTLINE:
${outlineSummary}

KEY TAKEAWAYS:
${outline.keyTakeaways.join('\n')}

Provide 3-5 specific, actionable suggestions to make this video more engaging and effective.
Consider: pacing, hooks, storytelling, audience engagement, visual opportunities.

Format each suggestion on a new line starting with a number.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You are a video content strategist who provides actionable feedback.',
      maxTokens: 400,
    });

    if (result.success) {
      const lines = result.data.content.split('\n');
      return lines
        .filter(l => /^\d+[\.\)]/.test(l.trim()))
        .map(l => l.replace(/^\d+[\.\)]\s*/, '').trim())
        .filter(l => l.length > 10);
    }

    return [];
  }

  /**
   * Reorder outline sections
   */
  reorderSections(outline: VideoOutline, newOrder: string[]): VideoOutline {
    const sectionMap = new Map(outline.sections.map(s => [s.id, s]));
    const reorderedSections: OutlineSection[] = [];

    for (let i = 0; i < newOrder.length; i++) {
      const section = sectionMap.get(newOrder[i]);
      if (section) {
        reorderedSections.push({
          ...section,
          order: i + 1,
        });
      }
    }

    return {
      ...outline,
      sections: reorderedSections,
    };
  }

  /**
   * Add a section to the outline
   */
  async addSection(
    outline: VideoOutline,
    position: number,
    sectionTopic: string,
    voiceProfile?: VoiceProfile
  ): Promise<VideoOutline> {
    const prompt = `Create an outline section for a video:

MAIN TOPIC: ${outline.topic}
STYLE: ${outline.style}
SECTION TOPIC: ${sectionTopic}

Provide:
1. A clear section title
2. 3-4 key points to cover
3. Estimated duration in seconds (based on detail level)

Format:
TITLE: [title]
POINTS:
- [point 1]
- [point 2]
- [point 3]
DURATION: [seconds]`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You create clear, structured video outline sections.',
      maxTokens: 200,
      voiceProfile,
    });

    let newSection: OutlineSection = {
      id: crypto.randomUUID(),
      order: position,
      title: sectionTopic,
      keyPoints: [],
      estimatedDuration: 60,
    };

    if (result.success) {
      const content = result.data.content;

      const titleMatch = content.match(/TITLE:\s*(.+)/i);
      if (titleMatch) {
        newSection.title = titleMatch[1].trim();
      }

      const pointsMatch = content.match(/POINTS:([\s\S]*?)DURATION:/i);
      if (pointsMatch) {
        newSection.keyPoints = pointsMatch[1]
          .split('\n')
          .filter(l => l.trim().startsWith('-'))
          .map(l => l.replace(/^-\s*/, '').trim());
      }

      const durationMatch = content.match(/DURATION:\s*(\d+)/i);
      if (durationMatch) {
        newSection.estimatedDuration = parseInt(durationMatch[1], 10);
      }
    }

    // Insert section and reorder
    const sections = [...outline.sections];
    sections.splice(position - 1, 0, newSection);

    const reorderedSections = sections.map((s, i) => ({
      ...s,
      order: i + 1,
    }));

    const newTotalDuration = reorderedSections.reduce(
      (sum, s) => sum + s.estimatedDuration,
      outline.hook.estimatedDuration + outline.conclusion.estimatedDuration
    );

    return {
      ...outline,
      sections: reorderedSections,
      estimatedTotalDuration: newTotalDuration,
    };
  }

  /**
   * Remove a section from the outline
   */
  removeSection(outline: VideoOutline, sectionId: string): VideoOutline {
    const sections = outline.sections
      .filter(s => s.id !== sectionId)
      .map((s, i) => ({ ...s, order: i + 1 }));

    const newTotalDuration = sections.reduce(
      (sum, s) => sum + s.estimatedDuration,
      outline.hook.estimatedDuration + outline.conclusion.estimatedDuration
    );

    return {
      ...outline,
      sections,
      estimatedTotalDuration: newTotalDuration,
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Generate outline content
   */
  private async generateOutlineContent(
    options: OutlineGenerationOptions,
    numberOfSections: number,
    voiceProfile?: VoiceProfile
  ): Promise<string> {
    const styleDescriptions: Record<string, string> = {
      educational: 'informative, clear explanations, logical progression',
      entertainment: 'engaging, storytelling, emotional hooks',
      tutorial: 'step-by-step, practical, actionable',
      vlog: 'personal, conversational, authentic',
      promotional: 'persuasive, benefit-focused, clear value',
    };

    let prompt = `Create a detailed video outline for:

TOPIC: ${options.topic}
TARGET DURATION: ${options.targetDuration} seconds (about ${Math.round(options.targetDuration / 60)} minutes)
STYLE: ${options.style} (${styleDescriptions[options.style] ?? ''})
NUMBER OF MAIN SECTIONS: ${numberOfSections}
${options.targetAudience ? `TARGET AUDIENCE: ${options.targetAudience}` : ''}

${options.keyPoints && options.keyPoints.length > 0 ? `KEY POINTS TO INCLUDE:\n${options.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n` : ''}

Create an outline with:
1. HOOK: An attention-grabbing opening (5-10 seconds)
2. MAIN SECTIONS: ${numberOfSections} distinct sections with 3-4 key points each
3. CONCLUSION: A strong ending with key takeaways

${options.includeVisualIdeas ? 'Include 1-2 visual ideas for each section.' : ''}

Format:
HOOK:
Title: [hook title]
Points: [point 1], [point 2]
Duration: [seconds]
${options.includeVisualIdeas ? 'Visuals: [visual ideas]' : ''}

SECTION 1:
Title: [title]
Points: [point 1], [point 2], [point 3]
Duration: [seconds]
${options.includeVisualIdeas ? 'Visuals: [visual ideas]' : ''}

... (continue for all sections)

CONCLUSION:
Title: [conclusion title]
Points: [point 1], [point 2]
Duration: [seconds]

KEY TAKEAWAYS:
1. [takeaway 1]
2. [takeaway 2]
3. [takeaway 3]`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You are a video content strategist who creates detailed, well-structured outlines.',
      maxTokens: 1500,
      voiceProfile,
    });

    if (!result.success) {
      throw new Error(`Failed to generate outline: ${result.error}`);
    }

    return result.data.content;
  }

  /**
   * Parse outline content into structured VideoOutline
   */
  private parseOutline(content: string, options: OutlineGenerationOptions): VideoOutline {
    const sections: OutlineSection[] = [];
    let hook: OutlineSection | undefined;
    let conclusion: OutlineSection | undefined;
    const keyTakeaways: string[] = [];

    // Parse hook
    const hookMatch = content.match(/HOOK:([\s\S]*?)(?=SECTION|CONCLUSION|$)/i);
    if (hookMatch) {
      hook = this.parseSection(hookMatch[1], 0, 'hook');
    }

    // Parse main sections
    const sectionRegex = /SECTION\s*(\d+):([\s\S]*?)(?=SECTION|CONCLUSION|KEY TAKEAWAYS|$)/gi;
    let match;
    while ((match = sectionRegex.exec(content)) !== null) {
      const order = parseInt(match[1], 10);
      sections.push(this.parseSection(match[2], order, 'main'));
    }

    // Parse conclusion
    const conclusionMatch = content.match(/CONCLUSION:([\s\S]*?)(?=KEY TAKEAWAYS|$)/i);
    if (conclusionMatch) {
      conclusion = this.parseSection(conclusionMatch[1], sections.length + 1, 'conclusion');
    }

    // Parse key takeaways
    const takeawaysMatch = content.match(/KEY TAKEAWAYS:([\s\S]*?)$/i);
    if (takeawaysMatch) {
      const lines = takeawaysMatch[1].split('\n');
      for (const line of lines) {
        const cleaned = line.replace(/^\d+[\.\)]\s*/, '').trim();
        if (cleaned.length > 5) {
          keyTakeaways.push(cleaned);
        }
      }
    }

    // Calculate total duration
    const totalDuration =
      (hook?.estimatedDuration ?? 10) +
      sections.reduce((sum, s) => sum + s.estimatedDuration, 0) +
      (conclusion?.estimatedDuration ?? 15);

    return {
      id: crypto.randomUUID(),
      topic: options.topic,
      style: options.style,
      targetDuration: options.targetDuration,
      hook: hook ?? {
        id: crypto.randomUUID(),
        order: 0,
        title: 'Hook',
        keyPoints: ['Capture attention'],
        estimatedDuration: 10,
      },
      sections,
      conclusion: conclusion ?? {
        id: crypto.randomUUID(),
        order: sections.length + 1,
        title: 'Conclusion',
        keyPoints: ['Summarize key points', 'Call to action'],
        estimatedDuration: 15,
      },
      estimatedTotalDuration: totalDuration,
      keyTakeaways,
      targetAudience: options.targetAudience,
      createdAt: Date.now(),
    };
  }

  /**
   * Parse a single section
   */
  private parseSection(content: string, order: number, type: string): OutlineSection {
    const titleMatch = content.match(/Title:\s*(.+)/i);
    const pointsMatch = content.match(/Points?:\s*(.+)/i);
    const durationMatch = content.match(/Duration:\s*(\d+)/i);
    const visualsMatch = content.match(/Visuals?:\s*(.+)/i);

    const keyPoints = pointsMatch
      ? pointsMatch[1].split(',').map(p => p.trim()).filter(p => p.length > 0)
      : [];

    return {
      id: crypto.randomUUID(),
      order,
      title: titleMatch?.[1]?.trim() ?? `Section ${order}`,
      keyPoints,
      estimatedDuration: parseInt(durationMatch?.[1] ?? '60', 10),
      visualIdeas: visualsMatch
        ? visualsMatch[1].split(',').map(v => v.trim()).filter(v => v.length > 0)
        : undefined,
    };
  }

  /**
   * Calculate appropriate section count based on duration
   */
  private calculateSectionCount(targetDuration: number): number {
    const durationMinutes = targetDuration / 60;

    if (durationMinutes <= 3) return 2;
    if (durationMinutes <= 5) return 3;
    if (durationMinutes <= 10) return 4;
    if (durationMinutes <= 15) return 5;
    return Math.min(8, Math.ceil(durationMinutes / 3));
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createOutlineBuilder(
  contentGenerator: ContentGeneratorProvider,
  wordsPerMinute?: number
): OutlineBuilderService {
  return new OutlineBuilderService(contentGenerator, wordsPerMinute);
}

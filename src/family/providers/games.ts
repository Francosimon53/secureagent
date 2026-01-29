/**
 * Games Provider
 *
 * AI-based provider for generating kid-friendly games.
 */

import type {
  AgeRange,
  GameContent,
  GameDifficulty,
  GameDuration,
  GameGenerationRequest,
  GamesProviderConfig,
  GameType,
  GeneratedGame,
  ProviderResult,
} from '../types.js';
import { BaseFamilyProvider } from './base.js';

// ============================================================================
// Game Generation Types
// ============================================================================

export interface GamePromptContext {
  gameType: GameType;
  ageRange: AgeRange;
  difficulty: GameDifficulty;
  duration: GameDuration;
  topics?: string[];
  educational?: boolean;
  kidSafe?: boolean;
}

// ============================================================================
// Games Generation Provider
// ============================================================================

export class GamesGenerationProvider extends BaseFamilyProvider<GamesProviderConfig> {
  get name(): string {
    return 'games-generator';
  }

  get type(): string {
    return 'games';
  }

  async generateGame(request: GameGenerationRequest): Promise<ProviderResult<GeneratedGame>> {
    this.ensureInitialized();
    this.ensureApiKey();

    try {
      const prompt = this.buildPrompt({
        gameType: request.gameType,
        ageRange: request.ageRange,
        difficulty: request.difficulty,
        duration: request.duration,
        topics: request.topics,
        educational: request.educational,
        kidSafe: this.config.kidSafePrompts,
      });

      const content = await this.callAI(prompt);

      if (!content) {
        return {
          success: false,
          error: 'Failed to generate game content',
        };
      }

      const game: GeneratedGame = {
        id: '', // Will be set by store
        familyGroupId: request.familyGroupId,
        createdBy: request.createdBy,
        createdFor: request.createdFor,
        gameType: request.gameType,
        title: content.title || this.generateTitle(request.gameType, request.topics),
        description: content.description,
        ageRange: request.ageRange,
        duration: request.duration,
        content: content,
        difficulty: request.difficulty,
        educational: request.educational ?? false,
        topics: request.topics,
        createdAt: Date.now(),
      };

      return {
        success: true,
        data: game,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate game',
      };
    }
  }

  private buildPrompt(context: GamePromptContext): string {
    const durationMinutes = this.getDurationMinutes(context.duration);
    const ageDescription = this.getAgeDescription(context.ageRange);

    let prompt = `Generate a ${context.gameType.replace('_', ' ')} game suitable for children aged ${context.ageRange.min}-${context.ageRange.max} years old (${ageDescription}).

Game Requirements:
- Difficulty: ${context.difficulty}
- Duration: approximately ${durationMinutes} minutes
- Educational: ${context.educational ? 'Yes, focus on learning' : 'Entertainment focused'}
`;

    if (context.topics?.length) {
      prompt += `- Topics to incorporate: ${context.topics.join(', ')}\n`;
    }

    if (context.kidSafe) {
      prompt += `
IMPORTANT: This game MUST be 100% kid-safe. No violence, scary content, inappropriate language, or mature themes.
`;
    }

    prompt += `
Please generate the game content in the following JSON format:
{
  "title": "A catchy, age-appropriate title",
  "description": "Brief description of the game",
  "instructions": "Clear instructions on how to play",
  ${this.getContentFormatForType(context.gameType)}
}

Respond with ONLY the JSON, no additional text.`;

    return prompt;
  }

  private getContentFormatForType(gameType: GameType): string {
    switch (gameType) {
      case 'trivia':
        return `"questions": [
    {
      "id": "q1",
      "question": "The question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "explanation": "Brief explanation of why this is correct",
      "points": 10
    }
  ]`;

      case 'word_game':
        return `"words": ["word1", "word2", "word3"],
  "clues": ["Clue for word1", "Clue for word2", "Clue for word3"]`;

      case 'math_game':
        return `"questions": [
    {
      "id": "m1",
      "question": "Math problem as text",
      "correctAnswer": "The answer",
      "explanation": "How to solve it",
      "points": 10
    }
  ]`;

      case 'puzzle':
        return `"challenges": ["Challenge 1 description", "Challenge 2 description"],
  "clues": ["Hint for challenge 1", "Hint for challenge 2"],
  "answers": {"1": "Answer 1", "2": "Answer 2"}`;

      case 'story_prompt':
        return `"story": "A creative story starter or prompt",
  "challenges": ["Writing challenge 1", "Writing challenge 2"]`;

      case 'scavenger_hunt':
        return `"clues": ["First clue", "Second clue", "Third clue"],
  "answers": {"1": "Item to find 1", "2": "Item to find 2"}`;

      case 'riddles':
        return `"questions": [
    {
      "id": "r1",
      "question": "The riddle",
      "correctAnswer": "The answer",
      "explanation": "Why this is the answer"
    }
  ]`;

      default:
        return `"content": "Game content here"`;
    }
  }

  private async callAI(prompt: string): Promise<GameContent | null> {
    const model = this.config.model || 'gpt-4o-mini';
    const maxTokens = this.config.maxTokens || 2000;

    // Determine the API endpoint based on model
    const isOpenAI = model.startsWith('gpt') || model.includes('openai');
    const isAnthropic = model.startsWith('claude');

    try {
      if (isOpenAI) {
        return await this.callOpenAI(prompt, model, maxTokens);
      } else if (isAnthropic) {
        return await this.callAnthropic(prompt, model, maxTokens);
      } else {
        // Default to OpenAI-compatible API
        return await this.callOpenAI(prompt, model, maxTokens);
      }
    } catch (error) {
      console.error('AI call failed:', error);
      return null;
    }
  }

  private async callOpenAI(prompt: string, model: string, maxTokens: number): Promise<GameContent | null> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a creative game designer specializing in kid-friendly games. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: maxTokens,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    return this.parseGameContent(content);
  }

  private async callAnthropic(prompt: string, model: string, maxTokens: number): Promise<GameContent | null> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const textContent = data.content?.find(c => c.type === 'text');
    if (!textContent?.text) return null;

    return this.parseGameContent(textContent.text);
  }

  private parseGameContent(content: string): GameContent | null {
    try {
      // Extract JSON from potential markdown code blocks
      let jsonStr = content;

      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      // Clean up the string
      jsonStr = jsonStr.trim();

      const parsed = JSON.parse(jsonStr) as GameContent & {
        title?: string;
        description?: string;
      };

      // Ensure required fields exist
      if (!parsed.instructions) {
        parsed.instructions = 'Follow the game content to play!';
      }

      return parsed;
    } catch (error) {
      console.error('Failed to parse game content:', error);
      return null;
    }
  }

  private getDurationMinutes(duration: GameDuration): number {
    switch (duration) {
      case 'quick': return 5;
      case 'medium': return 15;
      case 'long': return 30;
    }
  }

  private getAgeDescription(ageRange: AgeRange): string {
    if (ageRange.max <= 5) return 'early childhood';
    if (ageRange.max <= 8) return 'early elementary';
    if (ageRange.max <= 11) return 'upper elementary';
    if (ageRange.max <= 14) return 'middle school';
    return 'teens';
  }

  private generateTitle(gameType: GameType, topics?: string[]): string {
    const topicStr = topics?.length ? topics[0] : 'Fun';

    const titles: Record<GameType, string[]> = {
      trivia: [`${topicStr} Trivia Challenge`, `Brain Teaser: ${topicStr}`, `Quiz Time: ${topicStr}`],
      word_game: [`Word Wizard: ${topicStr}`, `Letter Fun: ${topicStr}`, `Word Search Adventure`],
      math_game: [`Math Masters`, `Number Ninjas`, `Calculation Challenge`],
      puzzle: [`Puzzle Paradise`, `Brain Benders`, `Mystery Solver`],
      story_prompt: [`Story Starters`, `Imagination Station`, `Creative Tales`],
      scavenger_hunt: [`Treasure Hunt`, `Discovery Quest`, `Find the Fun`],
      riddles: [`Riddle Me This`, `Mystery Riddles`, `Brain Twisters`],
    };

    const options = titles[gameType];
    return options[Math.floor(Math.random() * options.length)];
  }
}

// ============================================================================
// Fallback Game Templates
// ============================================================================

export class GameTemplates {
  static getTriviaTemplate(topics?: string[]): GameContent {
    const topic = topics?.[0] || 'general knowledge';
    return {
      instructions: `Answer the trivia questions about ${topic}. Score points for each correct answer!`,
      questions: [
        {
          id: 'q1',
          question: 'What is the capital of France?',
          options: ['London', 'Paris', 'Berlin', 'Madrid'],
          correctAnswer: 'Paris',
          explanation: 'Paris is the capital and largest city of France.',
          points: 10,
        },
        {
          id: 'q2',
          question: 'How many continents are there?',
          options: ['5', '6', '7', '8'],
          correctAnswer: '7',
          explanation: 'The seven continents are Africa, Antarctica, Asia, Australia, Europe, North America, and South America.',
          points: 10,
        },
      ],
    };
  }

  static getRiddlesTemplate(): GameContent {
    return {
      instructions: 'Solve these riddles! Take your time to think about each one.',
      questions: [
        {
          id: 'r1',
          question: 'I have hands but cannot clap. What am I?',
          correctAnswer: 'A clock',
          explanation: 'A clock has hands (hour and minute hands) but cannot clap!',
        },
        {
          id: 'r2',
          question: 'What has keys but cannot open locks?',
          correctAnswer: 'A piano',
          explanation: 'A piano has many keys but they make music, not open doors!',
        },
      ],
    };
  }

  static getWordGameTemplate(): GameContent {
    return {
      instructions: 'Find the words using the clues provided!',
      words: ['ELEPHANT', 'RAINBOW', 'BUTTERFLY'],
      clues: [
        'The largest land animal with a long trunk',
        'Colorful arc that appears after rain',
        'An insect with colorful wings that starts as a caterpillar',
      ],
    };
  }

  static getScavengerHuntTemplate(): GameContent {
    return {
      instructions: 'Find these items around your house! Check off each one as you find it.',
      clues: [
        'Something you use to brush your teeth',
        'Something that keeps you warm when it\'s cold',
        'Something you use to write with',
        'Something that tells the time',
        'Something soft you can sleep on',
      ],
      answers: {
        '1': 'Toothbrush',
        '2': 'Blanket or jacket',
        '3': 'Pen or pencil',
        '4': 'Clock or watch',
        '5': 'Pillow',
      },
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createGamesProvider(config: GamesProviderConfig): GamesGenerationProvider {
  return new GamesGenerationProvider(config);
}

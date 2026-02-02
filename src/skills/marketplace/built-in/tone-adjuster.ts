import { BuiltInSkill, SkillExecuteResult } from '../types.js';

interface ToneState {
  adjustments: Array<{
    original: string;
    adjusted: string;
    targetTone: string;
    timestamp: Date;
  }>;
}

const state: ToneState = {
  adjustments: []
};

type ToneType = 'formal' | 'casual' | 'friendly' | 'professional' | 'assertive' | 'empathetic';

const toneTransforms: Record<ToneType, { phrases: Record<string, string>; patterns: Array<{ from: RegExp; to: string }> }> = {
  formal: {
    phrases: {
      'hi': 'Dear Sir/Madam',
      'hey': 'Dear Sir/Madam',
      'thanks': 'Thank you for your consideration',
      'sorry': 'I apologize',
      'can you': 'Would you be so kind as to',
      'i want': 'I would like to request',
      'asap': 'at your earliest convenience',
      'fyi': 'For your information',
      'ok': 'Understood',
      'sure': 'Certainly',
      'gonna': 'going to',
      'wanna': 'want to'
    },
    patterns: [
      { from: /\bi'm\b/gi, to: 'I am' },
      { from: /\bcan't\b/gi, to: 'cannot' },
      { from: /\bwon't\b/gi, to: 'will not' },
      { from: /\bdon't\b/gi, to: 'do not' }
    ]
  },
  casual: {
    phrases: {
      'dear sir/madam': 'Hey',
      'i would like to': 'I want to',
      'thank you for your consideration': 'Thanks!',
      'i apologize': 'Sorry',
      'at your earliest convenience': 'when you can',
      'i am writing to': 'Just wanted to',
      'please be advised': 'FYI',
      'per our conversation': 'Like we talked about'
    },
    patterns: [
      { from: /\bI am\b/g, to: "I'm" },
      { from: /\bcannot\b/gi, to: "can't" },
      { from: /\bwill not\b/gi, to: "won't" },
      { from: /\bdo not\b/gi, to: "don't" }
    ]
  },
  friendly: {
    phrases: {
      'dear': 'Hi',
      'regards': 'Cheers',
      'sincerely': 'Take care',
      'i need': 'It would be great if',
      'you must': 'Would you mind',
      'immediately': 'when you get a chance'
    },
    patterns: [
      { from: /\.$/, to: '! ' }
    ]
  },
  professional: {
    phrases: {
      'hi': 'Hello',
      'hey': 'Hello',
      'thanks': 'Thank you',
      'i think': 'In my assessment',
      'maybe': 'Perhaps',
      'stuff': 'materials',
      'things': 'items',
      'get': 'obtain',
      'need': 'require'
    },
    patterns: []
  },
  assertive: {
    phrases: {
      'i think': 'I believe',
      'maybe': 'This will',
      'could you': 'Please',
      'would it be possible': 'I need you to',
      'i was wondering': 'I expect',
      'sorry to bother': 'I need'
    },
    patterns: []
  },
  empathetic: {
    phrases: {
      'you need to': 'I understand this might be difficult, but',
      'do this': 'when you are ready, this would help',
      'immediately': 'at your comfort',
      'must': 'it would be helpful to'
    },
    patterns: []
  }
};

function adjustTone(text: string, targetTone: ToneType): string {
  let adjusted = text;
  const transforms = toneTransforms[targetTone];

  if (!transforms) return text;

  for (const [from, to] of Object.entries(transforms.phrases)) {
    const regex = new RegExp('\\b' + from + '\\b', 'gi');
    adjusted = adjusted.replace(regex, to);
  }

  transforms.patterns.forEach(pattern => {
    adjusted = adjusted.replace(pattern.from, pattern.to);
  });

  return adjusted;
}

export const toneAdjuster: BuiltInSkill = {
  id: 'tone-adjuster',
  name: 'Tone Adjuster',
  description: 'Perfect your message tone for any audience. Transform casual text to formal, or soften assertive language effortlessly.',
  version: '1.0.0',
  author: 'SecureAgent',
  icon: '🎨',
  category: 'communication',
  installCount: 2876,
  rating: 4.4,
  commands: [
    {
      name: 'adjust',
      description: 'Adjust text to a specific tone',
      usage: 'tone adjust <tone> <text>',
      examples: ['tone adjust formal "hey can you send that report asap"']
    },
    {
      name: 'formal',
      description: 'Make text more formal',
      usage: 'tone formal <text>',
      examples: ['tone formal "hi, thanks for the info"']
    },
    {
      name: 'casual',
      description: 'Make text more casual',
      usage: 'tone casual <text>',
      examples: ['tone casual "Dear Sir, I would like to inquire..."']
    },
    {
      name: 'friendly',
      description: 'Make text friendlier',
      usage: 'tone friendly <text>',
      examples: ['tone friendly "You need to submit the form"']
    }
  ],

  async execute(action: string, params: Record<string, unknown>): Promise<SkillExecuteResult> {
    const tones: ToneType[] = ['formal', 'casual', 'friendly', 'professional', 'assertive', 'empathetic'];

    switch (action) {
      case 'adjust': {
        const targetTone = (params.arg0 as string)?.toLowerCase() as ToneType;
        const text = Object.values(params).slice(1).join(' ').replace(/^["']|["']$/g, '');

        if (!targetTone || !tones.includes(targetTone)) {
          return {
            success: false,
            message: 'Please specify a valid tone: ' + tones.join(', ') + '\n\nUsage: tone adjust <tone> <text>'
          };
        }

        if (!text) {
          return {
            success: false,
            message: 'Please provide text to adjust. Usage: tone adjust <tone> <text>'
          };
        }

        const adjusted = adjustTone(text, targetTone);

        state.adjustments.push({
          original: text,
          adjusted,
          targetTone,
          timestamp: new Date()
        });

        return {
          success: true,
          message: '🎨 TONE ADJUSTMENT\n\n' +
            'Target tone: ' + targetTone.toUpperCase() + '\n\n' +
            'ORIGINAL:\n"' + text + '"\n\n' +
            'ADJUSTED:\n"' + adjusted + '"\n\n' +
            'Tip: Review and personalize the adjusted text before sending.'
        };
      }

      case 'formal':
      case 'casual':
      case 'friendly': {
        const text = Object.values(params).join(' ').replace(/^["']|["']$/g, '');

        if (!text) {
          return {
            success: false,
            message: 'Please provide text to adjust. Usage: tone ' + action + ' <text>'
          };
        }

        const adjusted = adjustTone(text, action as ToneType);

        state.adjustments.push({
          original: text,
          adjusted,
          targetTone: action,
          timestamp: new Date()
        });

        const toneEmoji = action === 'formal' ? '👔' : action === 'casual' ? '😊' : '🤝';

        return {
          success: true,
          message: toneEmoji + ' ' + action.toUpperCase() + ' TONE\n\n' +
            'ORIGINAL:\n"' + text + '"\n\n' +
            'ADJUSTED:\n"' + adjusted + '"\n\n' +
            'Other tones available: ' + tones.filter(t => t !== action).join(', ')
        };
      }

      default:
        return {
          success: false,
          message: 'Unknown command: ' + action + '. Available commands: adjust, formal, casual, friendly'
        };
    }
  }
};

export default toneAdjuster;

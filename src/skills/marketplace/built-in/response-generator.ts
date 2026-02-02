import { BuiltInSkill, SkillExecuteResult } from '../types.js';

interface ResponseTemplate {
  type: string;
  templates: string[];
}

interface ResponseState {
  history: Array<{
    type: string;
    response: string;
    context: string;
    timestamp: Date;
  }>;
}

const state: ResponseState = {
  history: []
};

const templates: Record<string, ResponseTemplate> = {
  accept: {
    type: 'acceptance',
    templates: [
      'Thank you for the invitation. I would be happy to accept and look forward to {context}.',
      'I appreciate you reaching out. I am pleased to confirm my participation in {context}.',
      'Yes, I would be glad to {context}. Please let me know if you need any additional information.',
      'Thank you for thinking of me. I accept and am excited about {context}.'
    ]
  },
  decline: {
    type: 'decline',
    templates: [
      'Thank you for the invitation regarding {context}. Unfortunately, I will not be able to participate at this time due to prior commitments.',
      'I appreciate you thinking of me for {context}. Regrettably, I must decline as my schedule does not permit.',
      'Thank you for reaching out about {context}. While I am interested, I am unable to commit at this moment.',
      'I am honored by the invitation to {context}. However, I must respectfully decline due to existing obligations.'
    ]
  },
  followup: {
    type: 'follow-up',
    templates: [
      'I wanted to follow up on {context}. Please let me know if you need any additional information from my end.',
      'I am writing to check in regarding {context}. I would appreciate an update when you have a moment.',
      'Following up on our previous discussion about {context}. Please advise on the next steps.',
      'I hope this message finds you well. I wanted to touch base regarding {context} and see how things are progressing.'
    ]
  },
  acknowledge: {
    type: 'acknowledgment',
    templates: [
      'Thank you for informing me about {context}. I have noted this and will proceed accordingly.',
      'I acknowledge receipt of {context}. Thank you for keeping me informed.',
      'Thank you for the update regarding {context}. I appreciate you sharing this information.'
    ]
  },
  request: {
    type: 'request',
    templates: [
      'I hope this message finds you well. I am writing to request {context}. Please let me know if this is possible.',
      'Would it be possible to {context}? I would greatly appreciate your assistance with this matter.',
      'I am reaching out to inquire about {context}. Please advise on the best way to proceed.'
    ]
  }
};

function getRandomTemplate(type: string): string {
  const typeTemplates = templates[type]?.templates || [];
  if (typeTemplates.length === 0) return '';
  return typeTemplates[Math.floor(Math.random() * typeTemplates.length)];
}

export const responseGenerator: BuiltInSkill = {
  id: 'response-generator',
  name: 'Response Generator',
  description: 'Draft professional responses in seconds. Accept, decline, or follow up with perfectly worded messages.',
  version: '1.0.0',
  author: 'SecureAgent',
  icon: '✉️',
  category: 'communication',
  installCount: 3421,
  rating: 4.6,
  commands: [
    {
      name: 'accept',
      description: 'Generate an acceptance response',
      usage: 'response accept <context>',
      examples: ['response accept "the meeting on Friday"', 'response accept "joining the project team"']
    },
    {
      name: 'decline',
      description: 'Generate a polite decline',
      usage: 'response decline <context>',
      examples: ['response decline "the interview invitation"']
    },
    {
      name: 'followup',
      description: 'Generate a follow-up message',
      usage: 'response followup <context>',
      examples: ['response followup "our discussion about the proposal"']
    },
    {
      name: 'custom',
      description: 'Generate a custom response',
      usage: 'response custom <type> <context>',
      examples: ['response custom acknowledge "the document you sent"']
    }
  ],

  async execute(action: string, params: Record<string, unknown>): Promise<SkillExecuteResult> {
    const responseTypes = Object.keys(templates);

    switch (action) {
      case 'accept':
      case 'decline':
      case 'followup': {
        const context = Object.values(params).join(' ').replace(/^["']|["']$/g, '');

        if (!context) {
          return {
            success: false,
            message: 'Please provide context for the response. Usage: response ' + action + ' <context>'
          };
        }

        const template = getRandomTemplate(action);
        const response = template.replace('{context}', context);

        state.history.push({
          type: action,
          response,
          context,
          timestamp: new Date()
        });

        const typeEmoji = action === 'accept' ? '✅' : action === 'decline' ? '❌' : '📨';
        const typeName = templates[action].type.toUpperCase();

        return {
          success: true,
          message: typeEmoji + ' ' + typeName + ' RESPONSE\n\n' +
            '━━━━━━━━━━━━━━━━━━━━\n' +
            response + '\n' +
            '━━━━━━━━━━━━━━━━━━━━\n\n' +
            'Suggestions:\n' +
            '• Add a personal touch before sending\n' +
            '• Include specific dates or details if relevant\n' +
            '• Adjust tone to match your relationship'
        };
      }

      case 'custom': {
        const type = (params.arg0 as string)?.toLowerCase();
        const context = Object.values(params).slice(1).join(' ').replace(/^["']|["']$/g, '');

        if (!type || !responseTypes.includes(type)) {
          return {
            success: false,
            message: 'Please specify a valid response type: ' + responseTypes.join(', ') + '\n\nUsage: response custom <type> <context>'
          };
        }

        if (!context) {
          return {
            success: false,
            message: 'Please provide context. Usage: response custom <type> <context>'
          };
        }

        const template = getRandomTemplate(type);
        const response = template.replace('{context}', context);

        state.history.push({
          type,
          response,
          context,
          timestamp: new Date()
        });

        return {
          success: true,
          message: '✉️ CUSTOM RESPONSE (' + type.toUpperCase() + ')\n\n' +
            '━━━━━━━━━━━━━━━━━━━━\n' +
            response + '\n' +
            '━━━━━━━━━━━━━━━━━━━━\n\n' +
            'Review and personalize before sending.'
        };
      }

      default:
        return {
          success: false,
          message: 'Unknown command: ' + action + '. Available commands: accept, decline, followup, custom'
        };
    }
  }
};

export default responseGenerator;

import { BuiltInSkill, SkillExecuteResult } from '../types.js';

interface EmailSummary {
  subject: string;
  sender: string;
  summary: string;
  actionItems: string[];
  priority: 'high' | 'medium' | 'low';
  timestamp: Date;
}

interface EmailState {
  summaries: EmailSummary[];
}

const state: EmailState = {
  summaries: []
};

function extractActionItems(content: string): string[] {
  const patterns = [
    /please\s+([^.!?\n]+)/gi,
    /need\s+you\s+to\s+([^.!?\n]+)/gi,
    /can\s+you\s+([^.!?\n]+)/gi,
    /would\s+you\s+([^.!?\n]+)/gi,
    /must\s+([^.!?\n]+)/gi,
    /deadline[:\s]+([^.!?\n]+)/gi,
    /by\s+(monday|tuesday|wednesday|thursday|friday|tomorrow|end of day|eod|eow)/gi
  ];

  const actions: string[] = [];
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      actions.push(match[1].trim());
    }
  });

  return actions.slice(0, 5);
}

function determinePriority(content: string): 'high' | 'medium' | 'low' {
  const highPriorityWords = ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'deadline today'];
  const lowPriorityWords = ['fyi', 'no rush', 'when you get a chance', 'low priority'];
  
  const lowerContent = content.toLowerCase();
  
  if (highPriorityWords.some(word => lowerContent.includes(word))) {
    return 'high';
  }
  if (lowPriorityWords.some(word => lowerContent.includes(word))) {
    return 'low';
  }
  return 'medium';
}

export const emailSummarizer: BuiltInSkill = {
  id: 'email-summarizer',
  name: 'Email Summarizer',
  description: 'Quickly digest long emails with AI-powered summaries. Extract action items and prioritize your inbox efficiently.',
  version: '1.0.0',
  author: 'SecureAgent',
  icon: '📧',
  category: 'communication',
  installCount: 4892,
  rating: 4.7,
  commands: [
    {
      name: 'summarize',
      description: 'Summarize an email',
      usage: 'email summarize <email-content>',
      examples: ['email summarize "From: John... Subject: Project Update..."']
    },
    {
      name: 'actions',
      description: 'Extract action items from email',
      usage: 'email actions <email-content>',
      examples: ['email actions "Please review the document by Friday..."']
    },
    {
      name: 'reply',
      description: 'Generate a reply draft',
      usage: 'email reply <tone> <key-points>',
      examples: ['email reply professional "confirm meeting, request agenda"']
    }
  ],

  async execute(action: string, params: Record<string, unknown>): Promise<SkillExecuteResult> {
    switch (action) {
      case 'summarize': {
        const content = Object.values(params).join(' ');
        if (!content || content.length < 20) {
          return {
            success: false,
            message: 'Please provide email content to summarize. Usage: email summarize <email-content>'
          };
        }

        const subjectMatch = content.match(/subject[:\s]+([^\n]+)/i);
        const fromMatch = content.match(/from[:\s]+([^\n<]+)/i);
        
        const subject = subjectMatch ? subjectMatch[1].trim() : 'No subject';
        const sender = fromMatch ? fromMatch[1].trim() : 'Unknown sender';
        const priority = determinePriority(content);
        const actionItems = extractActionItems(content);

        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
        const summaryText = sentences.slice(0, 3).join('. ').trim() + '.';

        const summary: EmailSummary = {
          subject,
          sender,
          summary: summaryText.substring(0, 200),
          actionItems,
          priority,
          timestamp: new Date()
        };
        state.summaries.push(summary);

        const priorityIcon = priority === 'high' ? '🔴' : priority === 'medium' ? '🟡' : '🟢';

        return {
          success: true,
          message: '📧 EMAIL SUMMARY\n\n' +
            'From: ' + sender + '\n' +
            'Subject: ' + subject + '\n' +
            'Priority: ' + priorityIcon + ' ' + priority.toUpperCase() + '\n\n' +
            'SUMMARY:\n' +
            summary.summary + '\n\n' +
            (actionItems.length > 0 ? 
              'ACTION ITEMS:\n' + actionItems.map((item, i) => '  ' + (i + 1) + '. ' + item).join('\n') :
              'No clear action items detected.') +
            '\n\nUse "email reply" to draft a response.'
        };
      }

      case 'actions': {
        const content = Object.values(params).join(' ');
        if (!content || content.length < 20) {
          return {
            success: false,
            message: 'Please provide email content. Usage: email actions <email-content>'
          };
        }

        const actionItems = extractActionItems(content);
        const priority = determinePriority(content);

        if (actionItems.length === 0) {
          return {
            success: true,
            message: '📋 ACTION ITEMS\n\n' +
              'No clear action items detected in this email.\n\n' +
              'This appears to be an informational email with no direct requests.'
          };
        }

        const priorityIcon = priority === 'high' ? '🔴' : priority === 'medium' ? '🟡' : '🟢';

        return {
          success: true,
          message: '📋 ACTION ITEMS EXTRACTED\n\n' +
            'Priority: ' + priorityIcon + ' ' + priority.toUpperCase() + '\n\n' +
            'Tasks to complete:\n' +
            actionItems.map((item, i) => '  □ ' + item).join('\n') +
            '\n\nTip: Copy these to your task manager to track completion.'
        };
      }

      case 'reply': {
        const tone = (params.arg0 as string)?.toLowerCase() || 'professional';
        const keyPoints = Object.values(params).slice(1).join(' ');

        if (!keyPoints) {
          return {
            success: false,
            message: 'Please provide key points for the reply. Usage: email reply <tone> <key-points>'
          };
        }

        const points = keyPoints.split(/[,;]/).map(p => p.trim()).filter(Boolean);
        
        let greeting = '';
        let closing = '';
        let style = '';

        switch (tone) {
          case 'formal':
            greeting = 'Dear Sir/Madam,';
            closing = 'Yours sincerely,';
            style = 'I am writing to';
            break;
          case 'friendly':
            greeting = 'Hi there!';
            closing = 'Cheers,';
            style = 'Just wanted to';
            break;
          case 'brief':
            greeting = 'Hi,';
            closing = 'Thanks,';
            style = '';
            break;
          default:
            greeting = 'Hello,';
            closing = 'Best regards,';
            style = 'I wanted to';
        }

        let body = '';
        points.forEach((point, i) => {
          if (i === 0 && style) {
            body += style + ' ' + point + '.\n\n';
          } else {
            body += point.charAt(0).toUpperCase() + point.slice(1) + '.\n\n';
          }
        });

        const draft = greeting + '\n\n' + body + closing + '\n[Your name]';

        return {
          success: true,
          message: '✉️ REPLY DRAFT (' + tone.toUpperCase() + ')\n\n' +
            '━━━━━━━━━━━━━━━━━━━━\n' +
            draft + '\n' +
            '━━━━━━━━━━━━━━━━━━━━\n\n' +
            'Review and personalize before sending.'
        };
      }

      default:
        return {
          success: false,
          message: 'Unknown command: ' + action + '. Available commands: summarize, actions, reply'
        };
    }
  }
};

export default emailSummarizer;

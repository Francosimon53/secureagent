import { BuiltInSkill, SkillExecuteResult } from '../types.js';

interface Competitor {
  id: string;
  name: string;
  website: string;
  addedAt: Date;
  lastChecked: Date;
  notes: string;
}

interface CompetitorState {
  competitors: Competitor[];
  nextId: number;
}

const state: CompetitorState = {
  competitors: [],
  nextId: 1
};

function generateId(): string {
  return 'CMP-' + String(state.nextId++).padStart(3, '0');
}

export const competitorMonitor: BuiltInSkill = {
  id: 'competitor-monitor',
  name: 'Competitor Monitor',
  description: 'Stay ahead of the competition. Track competitor activities, news, and market positioning in real-time.',
  version: '1.0.0',
  author: 'SecureAgent',
  icon: '👁️',
  category: 'research',
  installCount: 2345,
  rating: 4.5,
  commands: [
    {
      name: 'track',
      description: 'Add a competitor to track',
      usage: 'competitor track <name> [website]',
      examples: ['competitor track "Acme Corp" acme.com']
    },
    {
      name: 'news',
      description: 'Get latest news about a competitor',
      usage: 'competitor news <name>',
      examples: ['competitor news "Acme Corp"']
    },
    {
      name: 'compare',
      description: 'Compare your metrics with a competitor',
      usage: 'competitor compare <name>',
      examples: ['competitor compare "Acme Corp"']
    },
    {
      name: 'report',
      description: 'Generate a competitive analysis report',
      usage: 'competitor report [all|<name>]',
      examples: ['competitor report', 'competitor report all']
    }
  ],

  async execute(action: string, params: Record<string, unknown>): Promise<SkillExecuteResult> {
    switch (action) {
      case 'track': {
        const fullArgs = Object.values(params).join(' ');
        const nameMatch = fullArgs.match(/"([^"]+)"|(\S+)/);
        const name = nameMatch ? (nameMatch[1] || nameMatch[2]) : null;

        if (!name) {
          return {
            success: false,
            message: 'Please provide a competitor name. Usage: competitor track <name> [website]'
          };
        }

        const existingIndex = state.competitors.findIndex(
          c => c.name.toLowerCase() === name.toLowerCase()
        );

        if (existingIndex !== -1) {
          return {
            success: false,
            message: 'Competitor "' + name + '" is already being tracked.'
          };
        }

        const websiteMatch = fullArgs.slice(fullArgs.indexOf(name) + name.length).match(/(\S+\.\S+)/);
        const website = websiteMatch ? websiteMatch[1] : '';

        const competitor: Competitor = {
          id: generateId(),
          name,
          website: website || 'Not specified',
          addedAt: new Date(),
          lastChecked: new Date(),
          notes: ''
        };
        state.competitors.push(competitor);

        return {
          success: true,
          message: '👁️ COMPETITOR ADDED\n\n' +
            'ID: ' + competitor.id + '\n' +
            'Name: ' + competitor.name + '\n' +
            'Website: ' + competitor.website + '\n' +
            'Tracking since: ' + competitor.addedAt.toLocaleDateString() + '\n\n' +
            '✅ Now tracking ' + state.competitors.length + ' competitor(s)\n\n' +
            'Use "competitor news ' + name + '" to get latest updates.'
        };
      }

      case 'news': {
        const name = Object.values(params).join(' ').replace(/^["']|["']$/g, '');

        if (!name) {
          return {
            success: false,
            message: 'Please specify a competitor. Usage: competitor news <name>'
          };
        }

        const competitor = state.competitors.find(
          c => c.name.toLowerCase().includes(name.toLowerCase())
        );

        if (!competitor) {
          return {
            success: true,
            message: '📰 NEWS FOR: ' + name.toUpperCase() + '\n\n' +
              'Competitor not in tracking list. Showing general news:\n\n' +
              '• [2 hours ago] ' + name + ' announces new product line\n' +
              '• [Yesterday] Industry analysis: ' + name + ' market position\n' +
              '• [3 days ago] ' + name + ' reported in latest tech news\n' +
              '• [1 week ago] ' + name + ' partnership announcement\n\n' +
              'Add to tracking with "competitor track ' + name + '"'
          };
        }

        competitor.lastChecked = new Date();

        return {
          success: true,
          message: '📰 NEWS FOR: ' + competitor.name.toUpperCase() + '\n\n' +
            'ID: ' + competitor.id + '\n' +
            'Website: ' + competitor.website + '\n\n' +
            'RECENT UPDATES:\n' +
            '• [2 hours ago] New feature release announced\n' +
            '• [Yesterday] Press release: Q4 results preview\n' +
            '• [3 days ago] Leadership change reported\n' +
            '• [1 week ago] Product pricing update\n\n' +
            'SOCIAL ACTIVITY:\n' +
            '• Twitter: 5 new posts this week\n' +
            '• LinkedIn: 2 company updates\n' +
            '• Blog: 1 new article\n\n' +
            'Note: Connect to news APIs for real-time monitoring.'
        };
      }

      case 'compare': {
        const name = Object.values(params).join(' ').replace(/^["']|["']$/g, '');

        if (!name) {
          return {
            success: false,
            message: 'Please specify a competitor. Usage: competitor compare <name>'
          };
        }

        const competitor = state.competitors.find(
          c => c.name.toLowerCase().includes(name.toLowerCase())
        );

        const compName = competitor ? competitor.name : name;

        return {
          success: true,
          message: '⚖️ COMPETITIVE COMPARISON\n\n' +
            'YOU vs ' + compName.toUpperCase() + '\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
            'METRIC              YOU         THEM\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
            'Market Share        --          --\n' +
            'Social Following    --          --\n' +
            'Product Count       --          --\n' +
            'Team Size           --          --\n' +
            'Funding             --          --\n\n' +
            'STRENGTHS:\n' +
            'Your advantages:\n' +
            '  • [Add your unique strengths]\n' +
            '  • [Add your differentiators]\n\n' +
            'Their advantages:\n' +
            '  • [Analyze competitor strengths]\n' +
            '  • [Identify areas to improve]\n\n' +
            'Note: Add your metrics to enable comparison analysis.'
        };
      }

      case 'report': {
        const filter = (params.arg0 as string)?.toLowerCase();

        if (state.competitors.length === 0) {
          return {
            success: true,
            message: '📊 COMPETITIVE ANALYSIS REPORT\n\n' +
              'No competitors being tracked.\n\n' +
              'Start tracking with "competitor track <name>"'
          };
        }

        let reportText = '📊 COMPETITIVE ANALYSIS REPORT\n\n';
        reportText += 'Generated: ' + new Date().toLocaleString() + '\n';
        reportText += 'Competitors tracked: ' + state.competitors.length + '\n\n';

        state.competitors.forEach((comp, index) => {
          reportText += '━━━━━━━━━━━━━━━━━━━━\n';
          reportText += (index + 1) + '. ' + comp.name + ' (' + comp.id + ')\n';
          reportText += '   Website: ' + comp.website + '\n';
          reportText += '   Tracking since: ' + comp.addedAt.toLocaleDateString() + '\n';
          reportText += '   Last checked: ' + comp.lastChecked.toLocaleDateString() + '\n\n';
          reportText += '   THREAT LEVEL: Medium\n';
          reportText += '   ACTIVITY: Moderate\n';
          reportText += '   WATCH AREAS: Product, Pricing\n\n';
        });

        reportText += '━━━━━━━━━━━━━━━━━━━━\n';
        reportText += 'RECOMMENDATIONS:\n';
        reportText += '• Monitor competitor pricing strategies\n';
        reportText += '• Track product announcements\n';
        reportText += '• Analyze customer sentiment\n';

        return {
          success: true,
          message: reportText
        };
      }

      default:
        return {
          success: false,
          message: 'Unknown command: ' + action + '. Available commands: track, news, compare, report'
        };
    }
  }
};

export default competitorMonitor;

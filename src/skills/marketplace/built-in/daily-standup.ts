import { BuiltInSkill, SkillExecuteResult } from '../types.js';

interface StandupEntry {
  date: Date;
  yesterday: string;
  today: string;
  blockers: string;
}

interface StandupState {
  entries: StandupEntry[];
  currentStandup: Partial<StandupEntry> | null;
  currentQuestion: number;
}

const state: StandupState = {
  entries: [],
  currentStandup: null,
  currentQuestion: 0
};

const questions = [
  'What did you accomplish yesterday?',
  'What will you work on today?',
  'Any blockers or impediments?'
];

export const dailyStandup: BuiltInSkill = {
  id: 'daily-standup',
  name: 'Daily Standup',
  description: 'Streamline your daily standups with guided 3-question format. Track progress and identify patterns over time.',
  version: '1.0.0',
  author: 'SecureAgent',
  icon: '📋',
  category: 'productivity',
  installCount: 2156,
  rating: 4.5,
  commands: [
    {
      name: 'start',
      description: 'Start a new standup session',
      usage: 'standup start',
      examples: ['standup start']
    },
    {
      name: 'log',
      description: 'Log your answer to the current question',
      usage: 'standup log <answer>',
      examples: ['standup log Completed the API integration']
    },
    {
      name: 'history',
      description: 'View past standup entries',
      usage: 'standup history [days]',
      examples: ['standup history', 'standup history 7']
    },
    {
      name: 'summary',
      description: 'Get a summary of recent standups',
      usage: 'standup summary [week|month]',
      examples: ['standup summary', 'standup summary week']
    }
  ],

  async execute(action: string, params: Record<string, unknown>): Promise<SkillExecuteResult> {
    switch (action) {
      case 'start': {
        if (state.currentStandup) {
          return {
            success: false,
            message: 'A standup is already in progress. Complete it first or use "standup cancel".'
          };
        }

        const today = new Date().toDateString();
        const existingToday = state.entries.find(e => e.date.toDateString() === today);
        
        if (existingToday) {
          return {
            success: true,
            message: `📋 You already completed today's standup!\n\n` +
              `Yesterday: ${existingToday.yesterday}\n` +
              `Today: ${existingToday.today}\n` +
              `Blockers: ${existingToday.blockers || 'None'}\n\n` +
              `Use "standup history" to view past entries.`
          };
        }

        state.currentStandup = { date: new Date() };
        state.currentQuestion = 0;

        return {
          success: true,
          message: `📋 DAILY STANDUP - ${new Date().toLocaleDateString()}\n\n` +
            `Question 1 of 3:\n` +
            `❓ ${questions[0]}\n\n` +
            `Use "standup log <your answer>" to respond.`
        };
      }

      case 'log': {
        if (!state.currentStandup) {
          return {
            success: false,
            message: 'No standup in progress. Use "standup start" to begin.'
          };
        }

        const answer = Object.values(params).join(' ');
        if (!answer) {
          return {
            success: false,
            message: 'Please provide an answer. Usage: standup log <your answer>'
          };
        }

        switch (state.currentQuestion) {
          case 0:
            state.currentStandup.yesterday = answer;
            break;
          case 1:
            state.currentStandup.today = answer;
            break;
          case 2:
            state.currentStandup.blockers = answer;
            break;
        }

        state.currentQuestion++;

        if (state.currentQuestion >= 3) {
          const entry: StandupEntry = {
            date: state.currentStandup.date as Date,
            yesterday: state.currentStandup.yesterday!,
            today: state.currentStandup.today!,
            blockers: state.currentStandup.blockers!
          };
          state.entries.push(entry);
          state.currentStandup = null;
          state.currentQuestion = 0;

          return {
            success: true,
            message: `✅ STANDUP COMPLETE!\n\n` +
              `📅 ${entry.date.toLocaleDateString()}\n\n` +
              `Yesterday:\n${entry.yesterday}\n\n` +
              `Today:\n${entry.today}\n\n` +
              `Blockers:\n${entry.blockers || 'None'}\n\n` +
              `Great job! Keep up the momentum! 🚀`
          };
        }

        return {
          success: true,
          message: `✓ Logged!\n\n` +
            `Question ${state.currentQuestion + 1} of 3:\n` +
            `❓ ${questions[state.currentQuestion]}\n\n` +
            `Use "standup log <your answer>" to respond.`
        };
      }

      case 'history': {
        const days = parseInt((params.arg0 as string)) || 7;
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const recentEntries = state.entries
          .filter(e => e.date >= cutoff)
          .sort((a, b) => b.date.getTime() - a.date.getTime());

        if (recentEntries.length === 0) {
          return {
            success: true,
            message: `📋 No standup entries in the last ${days} days.\n\n` +
              `Use "standup start" to begin your first standup.`
          };
        }

        let historyText = `📋 STANDUP HISTORY (Last ${days} days)\n\n`;
        
        recentEntries.forEach((entry, index) => {
          historyText += `━━━ ${entry.date.toLocaleDateString()} ━━━\n`;
          historyText += `Yesterday: ${entry.yesterday}\n`;
          historyText += `Today: ${entry.today}\n`;
          historyText += `Blockers: ${entry.blockers || 'None'}\n\n`;
        });

        return {
          success: true,
          message: historyText
        };
      }

      case 'summary': {
        const period = (params.arg0 as string) || 'week';
        const days = period === 'month' ? 30 : 7;
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const recentEntries = state.entries.filter(e => e.date >= cutoff);

        const totalEntries = recentEntries.length;
        const withBlockers = recentEntries.filter(e => e.blockers && e.blockers.toLowerCase() !== 'none').length;
        const consistency = Math.round((totalEntries / days) * 100);

        return {
          success: true,
          message: `📊 STANDUP SUMMARY (${period.toUpperCase()})\n\n` +
            `Total standups: ${totalEntries}\n` +
            `Days with blockers: ${withBlockers}\n` +
            `Consistency: ${consistency}%\n\n` +
            `${consistency >= 80 ? '🏆 Excellent consistency!' : consistency >= 50 ? '👍 Good progress!' : '💪 Room for improvement!'}\n\n` +
            `Tip: Regular standups help maintain focus and identify blockers early.`
        };
      }

      default:
        return {
          success: false,
          message: `Unknown command: ${action}. Available commands: start, log, history, summary`
        };
    }
  }
};

export default dailyStandup;

import { BuiltInSkill, SkillExecuteResult } from '../types.js';

interface Habit {
  id: string;
  name: string;
  description: string;
  frequency: 'daily' | 'weekly';
  createdAt: Date;
  completions: Date[];
  currentStreak: number;
  bestStreak: number;
}

interface HabitState {
  habits: Habit[];
  nextId: number;
}

const state: HabitState = {
  habits: [],
  nextId: 1
};

function generateId(): string {
  return 'HAB-' + String(state.nextId++).padStart(3, '0');
}

function calculateStreak(habit: Habit): number {
  if (habit.completions.length === 0) return 0;
  
  const sortedDates = habit.completions
    .map(d => new Date(d).toDateString())
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();

  if (sortedDates[0] !== today && sortedDates[0] !== yesterday) {
    return 0;
  }

  let streak = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const current = new Date(sortedDates[i - 1]);
    const prev = new Date(sortedDates[i]);
    const diff = (current.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000);
    
    if (diff === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

export const habitTracker: BuiltInSkill = {
  id: 'habit-tracker',
  name: 'Habit Tracker',
  description: 'Build lasting habits with streak tracking and progress visualization. Stay motivated with daily reminders and achievements.',
  version: '1.0.0',
  author: 'SecureAgent',
  icon: '🎯',
  category: 'productivity',
  installCount: 4102,
  rating: 4.8,
  commands: [
    {
      name: 'add',
      description: 'Add a new habit to track',
      usage: 'habit add <name> [description] [daily|weekly]',
      examples: [
        'habit add "Morning meditation"',
        'habit add "Exercise" "30 min workout" daily'
      ]
    },
    {
      name: 'complete',
      description: 'Mark a habit as complete for today',
      usage: 'habit complete <habit-id>',
      examples: ['habit complete HAB-001']
    },
    {
      name: 'list',
      description: 'List all habits and their status',
      usage: 'habit list [active|all]',
      examples: ['habit list', 'habit list all']
    },
    {
      name: 'stats',
      description: 'View statistics for a habit',
      usage: 'habit stats <habit-id>',
      examples: ['habit stats HAB-001']
    },
    {
      name: 'delete',
      description: 'Delete a habit',
      usage: 'habit delete <habit-id>',
      examples: ['habit delete HAB-001']
    }
  ],

  async execute(action: string, params: Record<string, unknown>): Promise<SkillExecuteResult> {
    switch (action) {
      case 'add': {
        const fullArgs = Object.values(params).join(' ');
        const nameMatch = fullArgs.match(/"([^"]+)"|(\S+)/);
        const name = nameMatch ? (nameMatch[1] || nameMatch[2]) : null;

        if (!name) {
          return {
            success: false,
            message: 'Please provide a habit name. Usage: habit add <name> [description]'
          };
        }

        const descMatch = fullArgs.slice(fullArgs.indexOf(name) + name.length).match(/"([^"]+)"/);
        const description = descMatch ? descMatch[1] : '';
        const frequency = fullArgs.includes('weekly') ? 'weekly' : 'daily';

        const habit: Habit = {
          id: generateId(),
          name,
          description,
          frequency,
          createdAt: new Date(),
          completions: [],
          currentStreak: 0,
          bestStreak: 0
        };
        state.habits.push(habit);

        return {
          success: true,
          message: '🎯 HABIT CREATED\n\n' +
            'ID: ' + habit.id + '\n' +
            'Name: ' + habit.name + '\n' +
            'Frequency: ' + habit.frequency + '\n' +
            (habit.description ? 'Description: ' + habit.description + '\n' : '') +
            '\n✅ Start building your streak with "habit complete ' + habit.id + '"'
        };
      }

      case 'complete': {
        const habitId = (params.arg0 as string)?.toUpperCase();
        if (!habitId) {
          return {
            success: false,
            message: 'Please specify a habit ID. Usage: habit complete <habit-id>'
          };
        }

        const habit = state.habits.find(h => h.id === habitId);
        if (!habit) {
          return {
            success: false,
            message: 'Habit ' + habitId + ' not found.'
          };
        }

        const today = new Date().toDateString();
        const alreadyCompletedToday = habit.completions.some(
          d => new Date(d).toDateString() === today
        );

        if (alreadyCompletedToday) {
          return {
            success: true,
            message: '✓ "' + habit.name + '" already completed today!\n\n' +
              'Current streak: ' + habit.currentStreak + ' days 🔥\n' +
              'Best streak: ' + habit.bestStreak + ' days'
          };
        }

        habit.completions.push(new Date());
        habit.currentStreak = calculateStreak(habit);
        if (habit.currentStreak > habit.bestStreak) {
          habit.bestStreak = habit.currentStreak;
        }

        let message = '🎯 HABIT COMPLETED!\n\n';
        message += habit.name + '\n';
        message += 'Current streak: ' + habit.currentStreak + ' days 🔥\n';
        message += 'Best streak: ' + habit.bestStreak + ' days\n\n';

        if (habit.currentStreak === 7) {
          message += '🏆 Achievement: First week streak!\n';
        } else if (habit.currentStreak === 30) {
          message += '🏆 Achievement: One month streak!\n';
        } else if (habit.currentStreak === habit.bestStreak && habit.currentStreak > 1) {
          message += '⭐ New personal best!\n';
        }

        return {
          success: true,
          message
        };
      }

      case 'list': {
        const today = new Date().toDateString();

        if (state.habits.length === 0) {
          return {
            success: true,
            message: '🎯 No habits found.\n\nStart tracking with "habit add <name>"'
          };
        }

        let listText = '🎯 YOUR HABITS\n\n';

        state.habits.forEach(habit => {
          const completedToday = habit.completions.some(
            d => new Date(d).toDateString() === today
          );
          habit.currentStreak = calculateStreak(habit);

          const statusIcon = completedToday ? '✅' : '○';
          const streakIcon = habit.currentStreak >= 7 ? '🔥' : '';

          listText += statusIcon + ' ' + habit.id + ' | ' + habit.name + ' ' + streakIcon + '\n';
          listText += '   Streak: ' + habit.currentStreak + ' days | Best: ' + habit.bestStreak + ' days\n';
          listText += '   Frequency: ' + habit.frequency + '\n\n';
        });

        const completedCount = state.habits.filter(h => 
          h.completions.some(d => new Date(d).toDateString() === today)
        ).length;

        listText += '━━━━━━━━━━━━━━━━━━━━\n';
        listText += 'Today: ' + completedCount + '/' + state.habits.length + ' completed';

        return {
          success: true,
          message: listText
        };
      }

      case 'stats': {
        const habitId = (params.arg0 as string)?.toUpperCase();
        if (!habitId) {
          return {
            success: false,
            message: 'Please specify a habit ID. Usage: habit stats <habit-id>'
          };
        }

        const habit = state.habits.find(h => h.id === habitId);
        if (!habit) {
          return {
            success: false,
            message: 'Habit ' + habitId + ' not found.'
          };
        }

        habit.currentStreak = calculateStreak(habit);
        
        const totalCompletions = habit.completions.length;
        const daysSinceCreated = Math.ceil(
          (Date.now() - new Date(habit.createdAt).getTime()) / (24 * 60 * 60 * 1000)
        );
        const completionRate = daysSinceCreated > 0 
          ? Math.round((totalCompletions / daysSinceCreated) * 100)
          : 0;

        let weekView = '';
        for (let i = 6; i >= 0; i--) {
          const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
          const completed = habit.completions.some(
            d => new Date(d).toDateString() === date.toDateString()
          );
          weekView += completed ? '█' : '░';
        }

        return {
          success: true,
          message: '📊 HABIT STATISTICS\n\n' +
            habit.name + ' (' + habit.id + ')\n\n' +
            'Current streak: ' + habit.currentStreak + ' days 🔥\n' +
            'Best streak: ' + habit.bestStreak + ' days\n' +
            'Total completions: ' + totalCompletions + '\n' +
            'Completion rate: ' + completionRate + '%\n' +
            'Started: ' + new Date(habit.createdAt).toLocaleDateString() + '\n\n' +
            'Last 7 days: [' + weekView + ']\n' +
            '             M T W T F S S'
        };
      }

      case 'delete': {
        const habitId = (params.arg0 as string)?.toUpperCase();
        if (!habitId) {
          return {
            success: false,
            message: 'Please specify a habit ID. Usage: habit delete <habit-id>'
          };
        }

        const index = state.habits.findIndex(h => h.id === habitId);
        if (index === -1) {
          return {
            success: false,
            message: 'Habit ' + habitId + ' not found.'
          };
        }

        const deleted = state.habits.splice(index, 1)[0];

        return {
          success: true,
          message: '🗑️ HABIT DELETED\n\n' +
            '"' + deleted.name + '" has been removed.\n' +
            'Final stats: ' + deleted.completions.length + ' completions, ' +
            deleted.bestStreak + ' day best streak'
        };
      }

      default:
        return {
          success: false,
          message: 'Unknown command: ' + action + '. Available commands: add, complete, list, stats, delete'
        };
    }
  }
};

export default habitTracker;

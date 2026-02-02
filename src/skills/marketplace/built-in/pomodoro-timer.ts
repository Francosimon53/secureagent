import { BuiltInSkill, SkillExecuteResult } from '../types.js';

interface PomodoroSession {
  startTime: Date;
  endTime?: Date;
  type: 'work' | 'break';
  completed: boolean;
}

interface PomodoroState {
  sessions: PomodoroSession[];
  currentSession: PomodoroSession | null;
  workDuration: number;
  breakDuration: number;
  longBreakDuration: number;
  sessionsUntilLongBreak: number;
  completedWorkSessions: number;
}

const state: PomodoroState = {
  sessions: [],
  currentSession: null,
  workDuration: 25,
  breakDuration: 5,
  longBreakDuration: 15,
  sessionsUntilLongBreak: 4,
  completedWorkSessions: 0
};

export const pomodoroTimer: BuiltInSkill = {
  id: 'pomodoro-timer',
  name: 'Pomodoro Timer',
  description: 'Boost productivity with 25-minute focused work sessions followed by short breaks. Track your progress and maintain flow state.',
  version: '1.0.0',
  author: 'SecureAgent',
  icon: '🍅',
  category: 'productivity',
  installCount: 3847,
  rating: 4.7,
  commands: [
    {
      name: 'start',
      description: 'Start a new pomodoro work session',
      usage: 'pomodoro start [duration]',
      examples: ['pomodoro start', 'pomodoro start 30']
    },
    {
      name: 'break',
      description: 'Start a break session',
      usage: 'pomodoro break [short|long]',
      examples: ['pomodoro break', 'pomodoro break long']
    },
    {
      name: 'status',
      description: 'Check current session status',
      usage: 'pomodoro status',
      examples: ['pomodoro status']
    },
    {
      name: 'stats',
      description: 'View productivity statistics',
      usage: 'pomodoro stats [today|week|all]',
      examples: ['pomodoro stats', 'pomodoro stats today']
    },
    {
      name: 'stop',
      description: 'Stop the current session',
      usage: 'pomodoro stop',
      examples: ['pomodoro stop']
    }
  ],

  async execute(action: string, params: Record<string, unknown>): Promise<SkillExecuteResult> {
    switch (action) {
      case 'start': {
        if (state.currentSession) {
          return {
            success: false,
            message: 'A session is already in progress. Use "pomodoro stop" to end it first.'
          };
        }

        const duration = (params.arg0 as string) ? parseInt((params.arg0 as string)) : state.workDuration;
        const session: PomodoroSession = {
          startTime: new Date(),
          type: 'work',
          completed: false
        };
        state.currentSession = session;

        const endTime = new Date(session.startTime.getTime() + duration * 60000);

        return {
          success: true,
          message: '🍅 Pomodoro started! Focus for ' + duration + ' minutes.\n\n' +
            'Started at: ' + session.startTime.toLocaleTimeString() + '\n' +
            'End time: ' + endTime.toLocaleTimeString() + '\n\n' +
            'Tips for a productive session:\n' +
            '• Close unnecessary tabs and apps\n' +
            '• Put your phone on silent\n' +
            '• Focus on a single task\n\n' +
            'Use "pomodoro status" to check remaining time.'
        };
      }

      case 'break': {
        if (state.currentSession?.type === 'break') {
          return {
            success: false,
            message: 'You are already on a break!'
          };
        }

        const isLong = (params.arg0 as string) === 'long' || 
          (state.completedWorkSessions > 0 && state.completedWorkSessions % state.sessionsUntilLongBreak === 0);
        const breakDuration = isLong ? state.longBreakDuration : state.breakDuration;

        if (state.currentSession) {
          state.currentSession.endTime = new Date();
          state.currentSession.completed = true;
          state.sessions.push(state.currentSession);
          state.completedWorkSessions++;
        }

        state.currentSession = {
          startTime: new Date(),
          type: 'break',
          completed: false
        };

        return {
          success: true,
          message: '☕ ' + (isLong ? 'Long' : 'Short') + ' break started! Relax for ' + breakDuration + ' minutes.\n\n' +
            'Break activities:\n' +
            '• Stretch and move around\n' +
            '• Get water or a snack\n' +
            '• Rest your eyes\n\n' +
            'Completed work sessions: ' + state.completedWorkSessions
        };
      }

      case 'status': {
        if (!state.currentSession) {
          return {
            success: true,
            message: '⏸️ No active session.\n\n' +
              'Completed sessions today: ' + state.completedWorkSessions + '\n' +
              'Use "pomodoro start" to begin a work session.'
          };
        }

        const elapsed = Math.floor((Date.now() - state.currentSession.startTime.getTime()) / 60000);
        const duration = state.currentSession.type === 'work' ? state.workDuration : state.breakDuration;
        const remaining = Math.max(0, duration - elapsed);
        const progress = Math.min(100, Math.floor((elapsed / duration) * 100));
        const progressBar = '█'.repeat(Math.floor(progress / 5)) + '░'.repeat(20 - Math.floor(progress / 5));

        return {
          success: true,
          message: (state.currentSession.type === 'work' ? '🍅' : '☕') + ' ' + state.currentSession.type.toUpperCase() + ' SESSION\n\n' +
            '[' + progressBar + '] ' + progress + '%\n\n' +
            'Time elapsed: ' + elapsed + ' minutes\n' +
            'Time remaining: ' + remaining + ' minutes\n' +
            'Started: ' + state.currentSession.startTime.toLocaleTimeString()
        };
      }

      case 'stats': {
        const period = (params.arg0 as string) || 'today';
        const now = new Date();
        let filteredSessions = state.sessions;

        if (period === 'today') {
          filteredSessions = state.sessions.filter(s => 
            s.startTime.toDateString() === now.toDateString()
          );
        } else if (period === 'week') {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          filteredSessions = state.sessions.filter(s => s.startTime >= weekAgo);
        }

        const workSessions = filteredSessions.filter(s => s.type === 'work' && s.completed);
        const totalMinutes = workSessions.length * state.workDuration;
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        return {
          success: true,
          message: '📊 POMODORO STATISTICS (' + period.toUpperCase() + ')\n\n' +
            'Completed work sessions: ' + workSessions.length + '\n' +
            'Total focus time: ' + hours + 'h ' + minutes + 'm\n' +
            'Current streak: ' + state.completedWorkSessions + ' sessions\n\n' +
            (workSessions.length >= 8 ? '🏆 Great productivity!' : workSessions.length >= 4 ? '👍 Good progress!' : '💪 Keep going!')
        };
      }

      case 'stop': {
        if (!state.currentSession) {
          return {
            success: false,
            message: 'No active session to stop.'
          };
        }

        const session = state.currentSession;
        session.endTime = new Date();
        const elapsed = Math.floor((session.endTime.getTime() - session.startTime.getTime()) / 60000);
        
        state.sessions.push(session);
        state.currentSession = null;

        return {
          success: true,
          message: '⏹️ Session stopped.\n\n' +
            'Type: ' + session.type + '\n' +
            'Duration: ' + elapsed + ' minutes\n' +
            'Completed: ' + (session.completed ? 'Yes' : 'No (interrupted)') + '\n\n' +
            'Use "pomodoro start" to begin a new session.'
        };
      }

      default:
        return {
          success: false,
          message: 'Unknown command: ' + action + '. Available commands: start, break, status, stats, stop'
        };
    }
  }
};

export default pomodoroTimer;

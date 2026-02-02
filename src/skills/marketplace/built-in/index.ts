import { BuiltInSkill } from '../types.js';

// Productivity Skills
import { pomodoroTimer } from './pomodoro-timer.js';
import { dailyStandup } from './daily-standup.js';
import { meetingScheduler } from './meeting-scheduler.js';
import { expenseTracker } from './expense-tracker.js';
import { habitTracker } from './habit-tracker.js';

// Communication Skills
import { emailSummarizer } from './email-summarizer.js';
import { translationHelper } from './translation-helper.js';
import { toneAdjuster } from './tone-adjuster.js';
import { responseGenerator } from './response-generator.js';

// Research Skills
import { webResearcher } from './web-researcher.js';
import { competitorMonitor } from './competitor-monitor.js';
import { newsDigest } from './news-digest.js';
import { factChecker } from './fact-checker.js';

// Data & Analysis Skills
import { csvAnalyzer } from './csv-analyzer.js';
import { chartGenerator } from './chart-generator.js';
import { reportBuilder } from './report-builder.js';

// Personal Skills
import { birthdayReminder } from './birthday-reminder.js';
import { recipeFinder } from './recipe-finder.js';
import { workoutPlanner } from './workout-planner.js';
import { travelPlanner } from './travel-planner.js';

/**
 * Array of all built-in marketplace skills
 */
export const builtInSkills: BuiltInSkill[] = [
  // Productivity
  pomodoroTimer,
  dailyStandup,
  meetingScheduler,
  expenseTracker,
  habitTracker,
  
  // Communication
  emailSummarizer,
  translationHelper,
  toneAdjuster,
  responseGenerator,
  
  // Research
  webResearcher,
  competitorMonitor,
  newsDigest,
  factChecker,
  
  // Data & Analysis
  csvAnalyzer,
  chartGenerator,
  reportBuilder,
  
  // Personal
  birthdayReminder,
  recipeFinder,
  workoutPlanner,
  travelPlanner
];

/**
 * Get all skills in a specific category
 */
export function getSkillsByCategory(category: string): BuiltInSkill[] {
  return builtInSkills.filter(skill => skill.category === category);
}

/**
 * Get a skill by its unique ID
 */
export function getSkillById(id: string): BuiltInSkill | undefined {
  return builtInSkills.find(skill => skill.id === id);
}

/**
 * Search skills by name, description, or commands
 */
export function searchSkills(query: string): BuiltInSkill[] {
  const lowerQuery = query.toLowerCase();
  
  return builtInSkills.filter(skill => {
    // Search in name
    if (skill.name.toLowerCase().includes(lowerQuery)) return true;
    
    // Search in description
    if (skill.description.toLowerCase().includes(lowerQuery)) return true;
    
    // Search in category
    if (skill.category.toLowerCase().includes(lowerQuery)) return true;
    
    // Search in commands
    if (skill.commands.some(cmd =>
      (cmd.command || cmd.name || '').toLowerCase().includes(lowerQuery) ||
      cmd.description.toLowerCase().includes(lowerQuery)
    )) return true;
    
    return false;
  });
}

/**
 * Get skills sorted by rating
 */
export function getTopRatedSkills(limit: number = 10): BuiltInSkill[] {
  return [...builtInSkills]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit);
}

/**
 * Get skills sorted by install count (popularity)
 */
export function getPopularSkills(limit: number = 10): BuiltInSkill[] {
  return [...builtInSkills]
    .sort((a, b) => b.installCount - a.installCount)
    .slice(0, limit);
}

/**
 * Get all available categories
 */
export function getCategories(): string[] {
  const categories = new Set(builtInSkills.map(skill => skill.category));
  return Array.from(categories).sort();
}

/**
 * Get skill statistics
 */
export function getSkillStats(): {
  totalSkills: number;
  totalInstalls: number;
  averageRating: number;
  categoryCounts: Record<string, number>;
} {
  const categoryCounts: Record<string, number> = {};
  let totalInstalls = 0;
  let totalRating = 0;

  builtInSkills.forEach(skill => {
    categoryCounts[skill.category] = (categoryCounts[skill.category] || 0) + 1;
    totalInstalls += skill.installCount;
    totalRating += skill.rating;
  });

  return {
    totalSkills: builtInSkills.length,
    totalInstalls,
    averageRating: totalRating / builtInSkills.length,
    categoryCounts
  };
}

// Export individual skills for direct import
export {
  // Productivity
  pomodoroTimer,
  dailyStandup,
  meetingScheduler,
  expenseTracker,
  habitTracker,
  
  // Communication
  emailSummarizer,
  translationHelper,
  toneAdjuster,
  responseGenerator,
  
  // Research
  webResearcher,
  competitorMonitor,
  newsDigest,
  factChecker,
  
  // Data & Analysis
  csvAnalyzer,
  chartGenerator,
  reportBuilder,
  
  // Personal
  birthdayReminder,
  recipeFinder,
  workoutPlanner,
  travelPlanner
};

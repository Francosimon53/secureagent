/**
 * Morning Brief Service
 *
 * Generates and delivers personalized morning briefings.
 */

import type {
  MorningBriefData,
  MorningBriefSection,
  MorningBriefSectionType,
  WeatherData,
  CalendarEvent,
  TodoItem,
  EmailDigest,
  NewsItem,
} from '../types.js';
import type { MorningBriefConfig } from '../config.js';
import type { WeatherProvider } from '../providers/weather.js';
import type { CalendarProvider } from '../providers/calendar.js';
import type { EmailProvider } from '../providers/email.js';
import type { NewsProvider } from '../providers/news.js';
import type { TodoStore } from '../stores/productivity-store.js';
import { formatMorningBrief, type OutputFormat } from './formatter.js';

// Re-export formatter
export { formatMorningBrief, type OutputFormat };

/**
 * Provider configuration for morning brief
 */
export interface MorningBriefProviders {
  weather?: WeatherProvider;
  calendar?: CalendarProvider;
  email?: EmailProvider;
  news?: NewsProvider;
  todoStore?: TodoStore;
}

/**
 * Morning Brief Service
 */
export class MorningBriefService {
  private readonly sections: MorningBriefSectionType[];
  private readonly maxTasksToShow: number;
  private readonly maxEventsToShow: number;
  private readonly timezone: string;

  constructor(
    private readonly providers: MorningBriefProviders,
    config?: Partial<MorningBriefConfig>
  ) {
    this.sections = config?.sections ?? ['weather', 'calendar', 'tasks'];
    this.maxTasksToShow = config?.maxTasksToShow ?? 5;
    this.maxEventsToShow = config?.maxEventsToShow ?? 5;
    this.timezone = config?.timezone ?? 'UTC';
  }

  /**
   * Generate a morning brief for a user
   */
  async generateBrief(
    userId: string,
    location?: string
  ): Promise<MorningBriefData> {
    const briefSections: MorningBriefSection[] = [];
    const summaryParts: string[] = [];

    for (const sectionType of this.sections) {
      const section = await this.generateSection(userId, sectionType, location);
      if (section) {
        briefSections.push(section);
        const sectionSummary = this.getSectionSummary(section);
        if (sectionSummary) {
          summaryParts.push(sectionSummary);
        }
      }
    }

    // Sort sections by priority
    briefSections.sort((a, b) => a.priority - b.priority);

    return {
      generatedAt: Date.now(),
      userId,
      sections: briefSections,
      summary: summaryParts.join(' '),
    };
  }

  /**
   * Generate a formatted brief
   */
  async generateFormattedBrief(
    userId: string,
    format: OutputFormat = 'markdown',
    location?: string
  ): Promise<string> {
    const data = await this.generateBrief(userId, location);
    return formatMorningBrief(data, format);
  }

  /**
   * Generate a specific section
   */
  private async generateSection(
    userId: string,
    sectionType: MorningBriefSectionType,
    location?: string
  ): Promise<MorningBriefSection | null> {
    try {
      switch (sectionType) {
        case 'weather':
          return this.generateWeatherSection(location);
        case 'calendar':
          return this.generateCalendarSection();
        case 'tasks':
          return this.generateTasksSection(userId);
        case 'email':
          return this.generateEmailSection();
        case 'news':
          return this.generateNewsSection();
        case 'health':
          return this.generateHealthSection();
        default:
          return null;
      }
    } catch (error) {
      console.error(`Failed to generate ${sectionType} section:`, error);
      return null;
    }
  }

  /**
   * Generate weather section
   */
  private async generateWeatherSection(location?: string): Promise<MorningBriefSection | null> {
    if (!this.providers.weather || !location) {
      return null;
    }

    const result = await this.providers.weather.getCurrentWeather(location);

    if (!result.success || !result.data) {
      return null;
    }

    // Also get forecast
    const forecastResult = await this.providers.weather.getForecast(location, 3);
    const alertsResult = await this.providers.weather.getAlerts(location);

    const weatherData: WeatherData = {
      ...result.data,
      forecast: forecastResult.data ?? [],
      alerts: alertsResult.data ?? [],
    };

    return {
      type: 'weather',
      title: 'Weather',
      content: weatherData,
      priority: 1,
    };
  }

  /**
   * Generate calendar section
   */
  private async generateCalendarSection(): Promise<MorningBriefSection | null> {
    if (!this.providers.calendar) {
      return null;
    }

    const result = await this.providers.calendar.getTodayEvents();

    if (!result.success || !result.data) {
      return null;
    }

    // Filter out cancelled events and sort by start time
    const events = result.data
      .filter(e => e.status !== 'cancelled')
      .sort((a, b) => a.startTime - b.startTime)
      .slice(0, this.maxEventsToShow);

    return {
      type: 'calendar',
      title: "Today's Schedule",
      content: events,
      priority: 2,
    };
  }

  /**
   * Generate tasks section
   */
  private async generateTasksSection(userId: string): Promise<MorningBriefSection | null> {
    if (!this.providers.todoStore) {
      return null;
    }

    const tasks = await this.providers.todoStore.list(userId, {
      status: ['pending', 'in_progress'],
      orderBy: 'score',
      orderDirection: 'desc',
      limit: this.maxTasksToShow,
    });

    // Also get overdue tasks
    const now = Date.now();
    const overdueTasks = await this.providers.todoStore.list(userId, {
      status: ['pending'],
      dueBefore: now,
      limit: 5,
    });

    // Combine and deduplicate
    const taskIds = new Set(tasks.map(t => t.id));
    const combinedTasks = [...tasks];

    for (const overdueTask of overdueTasks) {
      if (!taskIds.has(overdueTask.id)) {
        combinedTasks.unshift(overdueTask); // Add overdue at the beginning
      }
    }

    return {
      type: 'tasks',
      title: 'Priority Tasks',
      content: combinedTasks.slice(0, this.maxTasksToShow),
      priority: 3,
    };
  }

  /**
   * Generate email section
   */
  private async generateEmailSection(): Promise<MorningBriefSection | null> {
    if (!this.providers.email) {
      return null;
    }

    const result = await this.providers.email.getEmails({
      maxResults: 10,
      unreadOnly: true,
    });

    if (!result.success || !result.data) {
      return null;
    }

    // Sort by priority and take top emails
    const emails = result.data
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 5);

    return {
      type: 'email',
      title: 'Inbox Highlights',
      content: emails,
      priority: 4,
    };
  }

  /**
   * Generate news section
   */
  private async generateNewsSection(): Promise<MorningBriefSection | null> {
    if (!this.providers.news) {
      return null;
    }

    const result = await this.providers.news.getHeadlines({
      maxItems: 5,
    });

    if (!result.success || !result.data) {
      return null;
    }

    return {
      type: 'news',
      title: 'Top Headlines',
      content: result.data.items,
      priority: 5,
    };
  }

  /**
   * Generate health section (placeholder)
   */
  private async generateHealthSection(): Promise<MorningBriefSection | null> {
    // Health data would typically come from a health API integration
    // For now, return null as this requires additional integration
    return null;
  }

  /**
   * Get a brief summary for a section
   */
  private getSectionSummary(section: MorningBriefSection): string | null {
    switch (section.type) {
      case 'weather': {
        const weather = section.content as WeatherData;
        return `${weather.temperature}° and ${weather.condition.toLowerCase()}.`;
      }
      case 'calendar': {
        const events = section.content as CalendarEvent[];
        if (events.length === 0) return 'No meetings today.';
        return `${events.length} meeting${events.length > 1 ? 's' : ''} scheduled.`;
      }
      case 'tasks': {
        const tasks = section.content as TodoItem[];
        if (tasks.length === 0) return null;
        const highPriority = tasks.filter(t => t.priority === 'high' || t.priority === 'critical').length;
        if (highPriority > 0) {
          return `${highPriority} high-priority task${highPriority > 1 ? 's' : ''} to focus on.`;
        }
        return `${tasks.length} task${tasks.length > 1 ? 's' : ''} pending.`;
      }
      case 'email': {
        const emails = section.content as EmailDigest[];
        if (emails.length === 0) return null;
        return `${emails.length} email${emails.length > 1 ? 's' : ''} need attention.`;
      }
      default:
        return null;
    }
  }

  /**
   * Get cron expression for default delivery time
   */
  getCronExpression(deliveryTime: string): string {
    const [hour, minute] = deliveryTime.split(':').map(Number);
    return `${minute} ${hour} * * *`;
  }
}

/**
 * Create a morning brief service
 */
export function createMorningBriefService(
  providers: MorningBriefProviders,
  config?: Partial<MorningBriefConfig>
): MorningBriefService {
  return new MorningBriefService(providers, config);
}

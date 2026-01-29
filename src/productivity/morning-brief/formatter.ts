/**
 * Morning Brief Formatter
 *
 * Formats morning brief data for different output channels.
 */

import type {
  MorningBriefData,
  MorningBriefSection,
  WeatherData,
  CalendarEvent,
  TodoItem,
  EmailDigest,
  NewsItem,
} from '../types.js';

/**
 * Output format types
 */
export type OutputFormat = 'markdown' | 'html' | 'text' | 'slack' | 'discord';

/**
 * Format morning brief for specified channel
 */
export function formatMorningBrief(
  data: MorningBriefData,
  format: OutputFormat = 'markdown'
): string {
  switch (format) {
    case 'markdown':
      return formatMarkdown(data);
    case 'html':
      return formatHTML(data);
    case 'text':
      return formatPlainText(data);
    case 'slack':
      return formatSlack(data);
    case 'discord':
      return formatDiscord(data);
    default:
      return formatMarkdown(data);
  }
}

// =============================================================================
// Markdown Formatter
// =============================================================================

function formatMarkdown(data: MorningBriefData): string {
  const lines: string[] = [];

  lines.push(`# Good Morning! ☀️`);
  lines.push(`*${formatDate(data.generatedAt)}*`);
  lines.push('');

  if (data.summary) {
    lines.push(`> ${data.summary}`);
    lines.push('');
  }

  for (const section of data.sections) {
    lines.push(formatSectionMarkdown(section));
    lines.push('');
  }

  return lines.join('\n');
}

function formatSectionMarkdown(section: MorningBriefSection): string {
  const lines: string[] = [];

  lines.push(`## ${section.title}`);
  lines.push('');

  switch (section.type) {
    case 'weather':
      lines.push(formatWeatherMarkdown(section.content as WeatherData));
      break;
    case 'calendar':
      lines.push(formatCalendarMarkdown(section.content as CalendarEvent[]));
      break;
    case 'tasks':
      lines.push(formatTasksMarkdown(section.content as TodoItem[]));
      break;
    case 'email':
      lines.push(formatEmailMarkdown(section.content as EmailDigest[]));
      break;
    case 'news':
      lines.push(formatNewsMarkdown(section.content as NewsItem[]));
      break;
    default:
      lines.push(JSON.stringify(section.content, null, 2));
  }

  return lines.join('\n');
}

function formatWeatherMarkdown(weather: WeatherData): string {
  const unit = weather.temperatureUnit === 'celsius' ? '°C' : '°F';
  const lines: string[] = [];

  lines.push(`**${weather.location}**: ${weather.temperature}${unit}, ${weather.condition}`);
  lines.push(`Humidity: ${weather.humidity}%`);

  if (weather.alerts && weather.alerts.length > 0) {
    lines.push('');
    lines.push('⚠️ **Weather Alerts:**');
    for (const alert of weather.alerts) {
      lines.push(`- ${alert.title}`);
    }
  }

  if (weather.forecast && weather.forecast.length > 0) {
    lines.push('');
    lines.push('**Forecast:**');
    for (const day of weather.forecast.slice(0, 3)) {
      const date = new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' });
      lines.push(`- ${date}: ${day.low}${unit} - ${day.high}${unit}, ${day.condition}`);
    }
  }

  return lines.join('\n');
}

function formatCalendarMarkdown(events: CalendarEvent[]): string {
  if (events.length === 0) {
    return '*No events scheduled for today*';
  }

  const lines: string[] = [];

  for (const event of events) {
    const time = formatTimeRange(event.startTime, event.endTime, event.isAllDay);
    const attendeeCount = event.attendees.length;
    const attendeeText = attendeeCount > 0 ? ` (${attendeeCount} attendees)` : '';

    lines.push(`- **${time}** ${event.title}${attendeeText}`);

    if (event.location) {
      lines.push(`  📍 ${event.location}`);
    }

    if (event.conferenceLink) {
      lines.push(`  🔗 [Join Meeting](${event.conferenceLink})`);
    }
  }

  return lines.join('\n');
}

function formatTasksMarkdown(tasks: TodoItem[]): string {
  if (tasks.length === 0) {
    return '*No pending tasks*';
  }

  const lines: string[] = [];

  for (const task of tasks) {
    const priorityEmoji = getPriorityEmoji(task.priority);
    const dueText = task.dueDate ? ` (due ${formatRelativeDate(task.dueDate)})` : '';
    lines.push(`- ${priorityEmoji} ${task.title}${dueText}`);
  }

  return lines.join('\n');
}

function formatEmailMarkdown(emails: EmailDigest[]): string {
  if (emails.length === 0) {
    return '*No new emails*';
  }

  const lines: string[] = [];
  lines.push(`📧 **${emails.length} emails** need attention`);
  lines.push('');

  for (const email of emails.slice(0, 5)) {
    const sender = email.senderName ?? email.sender.split('@')[0];
    lines.push(`- **${sender}**: ${email.subject}`);
  }

  if (emails.length > 5) {
    lines.push(`- *... and ${emails.length - 5} more*`);
  }

  return lines.join('\n');
}

function formatNewsMarkdown(items: NewsItem[]): string {
  if (items.length === 0) {
    return '*No news items*';
  }

  const lines: string[] = [];

  for (const item of items.slice(0, 5)) {
    lines.push(`- [${item.title}](${item.url}) - *${item.source}*`);
  }

  return lines.join('\n');
}

// =============================================================================
// Plain Text Formatter
// =============================================================================

function formatPlainText(data: MorningBriefData): string {
  const lines: string[] = [];

  lines.push('GOOD MORNING!');
  lines.push(formatDate(data.generatedAt));
  lines.push('');

  if (data.summary) {
    lines.push(data.summary);
    lines.push('');
  }

  for (const section of data.sections) {
    lines.push(`--- ${section.title.toUpperCase()} ---`);
    lines.push('');
    lines.push(formatSectionPlainText(section));
    lines.push('');
  }

  return lines.join('\n');
}

function formatSectionPlainText(section: MorningBriefSection): string {
  switch (section.type) {
    case 'weather': {
      const weather = section.content as WeatherData;
      const unit = weather.temperatureUnit === 'celsius' ? 'C' : 'F';
      return `${weather.location}: ${weather.temperature}°${unit}, ${weather.condition}`;
    }
    case 'calendar': {
      const events = section.content as CalendarEvent[];
      if (events.length === 0) return 'No events scheduled';
      return events.map(e => {
        const time = formatTimeRange(e.startTime, e.endTime, e.isAllDay);
        return `* ${time} - ${e.title}`;
      }).join('\n');
    }
    case 'tasks': {
      const tasks = section.content as TodoItem[];
      if (tasks.length === 0) return 'No pending tasks';
      return tasks.map(t => `* [${t.priority.toUpperCase()}] ${t.title}`).join('\n');
    }
    default:
      return JSON.stringify(section.content);
  }
}

// =============================================================================
// HTML Formatter
// =============================================================================

function formatHTML(data: MorningBriefData): string {
  const sections = data.sections.map(s => formatSectionHTML(s)).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; }
    h2 { color: #666; border-bottom: 1px solid #eee; padding-bottom: 8px; }
    .summary { background: #f5f5f5; padding: 12px; border-radius: 8px; margin-bottom: 20px; }
    .section { margin-bottom: 24px; }
    .event, .task, .email { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .priority-critical { color: #d32f2f; }
    .priority-high { color: #f57c00; }
    .priority-medium { color: #1976d2; }
    .priority-low { color: #388e3c; }
    .time { color: #888; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Good Morning! ☀️</h1>
  <p class="time">${formatDate(data.generatedAt)}</p>
  ${data.summary ? `<div class="summary">${data.summary}</div>` : ''}
  ${sections}
</body>
</html>`;
}

function formatSectionHTML(section: MorningBriefSection): string {
  let content = '';

  switch (section.type) {
    case 'weather': {
      const weather = section.content as WeatherData;
      const unit = weather.temperatureUnit === 'celsius' ? '°C' : '°F';
      content = `<p><strong>${weather.location}</strong>: ${weather.temperature}${unit}, ${weather.condition}</p>`;
      break;
    }
    case 'calendar': {
      const events = section.content as CalendarEvent[];
      content = events.length === 0
        ? '<p>No events scheduled</p>'
        : events.map(e => `<div class="event"><span class="time">${formatTimeRange(e.startTime, e.endTime, e.isAllDay)}</span> ${e.title}</div>`).join('');
      break;
    }
    case 'tasks': {
      const tasks = section.content as TodoItem[];
      content = tasks.length === 0
        ? '<p>No pending tasks</p>'
        : tasks.map(t => `<div class="task priority-${t.priority}">${t.title}</div>`).join('');
      break;
    }
    default:
      content = `<pre>${JSON.stringify(section.content, null, 2)}</pre>`;
  }

  return `<div class="section"><h2>${section.title}</h2>${content}</div>`;
}

// =============================================================================
// Slack Formatter
// =============================================================================

function formatSlack(data: MorningBriefData): string {
  const blocks: string[] = [];

  blocks.push(`*Good Morning!* :sunny:`);
  blocks.push(`_${formatDate(data.generatedAt)}_`);

  if (data.summary) {
    blocks.push(`\n>${data.summary}`);
  }

  for (const section of data.sections) {
    blocks.push(`\n*${section.title}*`);
    blocks.push(formatSectionSlack(section));
  }

  return blocks.join('\n');
}

function formatSectionSlack(section: MorningBriefSection): string {
  switch (section.type) {
    case 'weather': {
      const weather = section.content as WeatherData;
      const unit = weather.temperatureUnit === 'celsius' ? '°C' : '°F';
      return `:thermometer: ${weather.location}: ${weather.temperature}${unit}, ${weather.condition}`;
    }
    case 'calendar': {
      const events = section.content as CalendarEvent[];
      if (events.length === 0) return '_No events scheduled_';
      return events.map(e => {
        const time = formatTimeRange(e.startTime, e.endTime, e.isAllDay);
        return `• \`${time}\` ${e.title}`;
      }).join('\n');
    }
    case 'tasks': {
      const tasks = section.content as TodoItem[];
      if (tasks.length === 0) return '_No pending tasks_';
      return tasks.map(t => `• ${getSlackPriorityEmoji(t.priority)} ${t.title}`).join('\n');
    }
    default:
      return '';
  }
}

function getSlackPriorityEmoji(priority: string): string {
  switch (priority) {
    case 'critical': return ':red_circle:';
    case 'high': return ':large_orange_circle:';
    case 'medium': return ':large_blue_circle:';
    case 'low': return ':white_circle:';
    default: return ':white_circle:';
  }
}

// =============================================================================
// Discord Formatter
// =============================================================================

function formatDiscord(data: MorningBriefData): string {
  // Discord uses similar markdown to standard but with some differences
  return formatMarkdown(data);
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTimeRange(start: number, end: number, isAllDay: boolean): string {
  if (isAllDay) {
    return 'All day';
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

  return `${startDate.toLocaleTimeString('en-US', options)} - ${endDate.toLocaleTimeString('en-US', options)}`;
}

function formatRelativeDate(timestamp: number): string {
  const now = Date.now();
  const diff = timestamp - now;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));

  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getPriorityEmoji(priority: string): string {
  switch (priority) {
    case 'critical': return '🔴';
    case 'high': return '🟠';
    case 'medium': return '🔵';
    case 'low': return '⚪';
    default: return '⚪';
  }
}

import { BuiltInSkill, SkillExecuteResult } from '../types.js';

interface Meeting {
  id: string;
  title: string;
  date: Date;
  duration: number;
  attendees: string[];
  location?: string;
  notes?: string;
}

interface MeetingState {
  meetings: Meeting[];
  nextId: number;
}

const state: MeetingState = {
  meetings: [],
  nextId: 1
};

function generateId(): string {
  return 'MTG-' + String(state.nextId++).padStart(4, '0');
}

function parseDateTime(dateStr: string, timeStr: string): Date {
  const date = new Date();
  
  if (dateStr.toLowerCase() === 'today') {
    // use today
  } else if (dateStr.toLowerCase() === 'tomorrow') {
    date.setDate(date.getDate() + 1);
  } else {
    const parts = dateStr.split('/').map(Number);
    date.setMonth(parts[0] - 1);
    date.setDate(parts[1]);
  }

  const timeParts = timeStr.replace(/[ap]m/i, '').split(':').map(Number);
  const isPM = timeStr.toLowerCase().includes('pm');
  date.setHours(isPM && timeParts[0] !== 12 ? timeParts[0] + 12 : timeParts[0]);
  date.setMinutes(timeParts[1] || 0);
  date.setSeconds(0);

  return date;
}

export const meetingScheduler: BuiltInSkill = {
  id: 'meeting-scheduler',
  name: 'Meeting Scheduler',
  description: 'Effortlessly schedule and manage meetings. Find available times, send invites, and never double-book again.',
  version: '1.0.0',
  author: 'SecureAgent',
  icon: '📅',
  category: 'productivity',
  installCount: 4521,
  rating: 4.8,
  commands: [
    {
      name: 'schedule',
      description: 'Schedule a new meeting',
      usage: 'meeting schedule <title> on <date> at <time> [duration] [with attendees]',
      examples: [
        'meeting schedule "Team Sync" on today at 2pm 30min',
        'meeting schedule "Project Review" on tomorrow at 10am 1h with john@example.com'
      ]
    },
    {
      name: 'list',
      description: 'List all scheduled meetings',
      usage: 'meeting list [upcoming|past|all]',
      examples: ['meeting list', 'meeting list upcoming']
    },
    {
      name: 'cancel',
      description: 'Cancel a meeting',
      usage: 'meeting cancel <meeting-id>',
      examples: ['meeting cancel MTG-0001']
    },
    {
      name: 'find',
      description: 'Find available time slots',
      usage: 'meeting find <duration> on <date>',
      examples: ['meeting find 30min on today', 'meeting find 1h on tomorrow']
    },
    {
      name: 'today',
      description: 'Show today\'s meeting schedule',
      usage: 'meeting today',
      examples: ['meeting today']
    }
  ],

  async execute(action: string, params: Record<string, unknown>): Promise<SkillExecuteResult> {
    switch (action) {
      case 'schedule': {
        const fullArgs = Object.values(params).join(' ');
        const titleMatch = fullArgs.match(/"([^"]+)"|(\S+)/);
        const title = titleMatch ? (titleMatch[1] || titleMatch[2]) : 'Untitled Meeting';
        
        const onMatch = fullArgs.match(/on\s+(\S+)/i);
        const atMatch = fullArgs.match(/at\s+(\S+)/i);
        const durationMatch = fullArgs.match(/(\d+)(min|h)/i);
        const withMatch = fullArgs.match(/with\s+(.+)$/i);

        if (!onMatch || !atMatch) {
          return {
            success: false,
            message: 'Please specify date and time. Usage: meeting schedule <title> on <date> at <time>'
          };
        }

        const dateTime = parseDateTime(onMatch[1], atMatch[1]);
        const duration = durationMatch 
          ? (durationMatch[2] === 'h' ? parseInt(durationMatch[1]) * 60 : parseInt(durationMatch[1]))
          : 30;
        const attendees = withMatch ? withMatch[1].split(/[,\s]+/).filter(Boolean) : [];

        const meeting: Meeting = {
          id: generateId(),
          title,
          date: dateTime,
          duration,
          attendees
        };
        state.meetings.push(meeting);

        const endTime = new Date(dateTime.getTime() + duration * 60000);

        return {
          success: true,
          message: '📅 MEETING SCHEDULED\n\n' +
            'ID: ' + meeting.id + '\n' +
            'Title: ' + meeting.title + '\n' +
            'Date: ' + dateTime.toLocaleDateString() + '\n' +
            'Time: ' + dateTime.toLocaleTimeString() + ' - ' + endTime.toLocaleTimeString() + '\n' +
            'Duration: ' + duration + ' minutes\n' +
            (attendees.length > 0 ? 'Attendees: ' + attendees.join(', ') + '\n' : '') +
            '\n✅ Meeting created successfully!'
        };
      }

      case 'list': {
        const filter = (params.arg0 as string) || 'upcoming';
        const now = new Date();
        
        let filteredMeetings = state.meetings;
        if (filter === 'upcoming') {
          filteredMeetings = state.meetings.filter(m => m.date >= now);
        } else if (filter === 'past') {
          filteredMeetings = state.meetings.filter(m => m.date < now);
        }

        filteredMeetings.sort((a, b) => a.date.getTime() - b.date.getTime());

        if (filteredMeetings.length === 0) {
          return {
            success: true,
            message: '📅 No ' + filter + ' meetings found.\n\nUse "meeting schedule" to create a new meeting.'
          };
        }

        let listText = '📅 ' + filter.toUpperCase() + ' MEETINGS\n\n';
        
        filteredMeetings.forEach(meeting => {
          listText += '━━━━━━━━━━━━━━━━━━━━\n';
          listText += meeting.id + ' | ' + meeting.title + '\n';
          listText += '📆 ' + meeting.date.toLocaleDateString() + ' at ' + meeting.date.toLocaleTimeString() + '\n';
          listText += '⏱️ ' + meeting.duration + ' minutes\n';
          if (meeting.attendees.length > 0) {
            listText += '👥 ' + meeting.attendees.join(', ') + '\n';
          }
          listText += '\n';
        });

        return {
          success: true,
          message: listText
        };
      }

      case 'cancel': {
        const meetingId = (params.arg0 as string);
        if (!meetingId) {
          return {
            success: false,
            message: 'Please specify a meeting ID. Usage: meeting cancel <meeting-id>'
          };
        }

        const index = state.meetings.findIndex(m => m.id === meetingId.toUpperCase());
        if (index === -1) {
          return {
            success: false,
            message: 'Meeting ' + meetingId + ' not found.'
          };
        }

        const cancelled = state.meetings.splice(index, 1)[0];

        return {
          success: true,
          message: '❌ MEETING CANCELLED\n\n' +
            'ID: ' + cancelled.id + '\n' +
            'Title: ' + cancelled.title + '\n' +
            'Was scheduled for: ' + cancelled.date.toLocaleString() + '\n\n' +
            'The meeting has been removed from your schedule.'
        };
      }

      case 'find': {
        const durationMatch = Object.values(params).join(' ').match(/(\d+)(min|h)/i);
        const dateMatch = Object.values(params).join(' ').match(/on\s+(\S+)/i);

        const duration = durationMatch 
          ? (durationMatch[2] === 'h' ? parseInt(durationMatch[1]) * 60 : parseInt(durationMatch[1]))
          : 30;

        const targetDate = new Date();
        if (dateMatch && dateMatch[1].toLowerCase() === 'tomorrow') {
          targetDate.setDate(targetDate.getDate() + 1);
        }

        const dayMeetings = state.meetings.filter(m => 
          m.date.toDateString() === targetDate.toDateString()
        ).sort((a, b) => a.date.getTime() - b.date.getTime());

        const workStart = 9;
        const workEnd = 17;
        const slots: string[] = [];

        for (let hour = workStart; hour < workEnd; hour++) {
          for (let minute = 0; minute < 60; minute += 30) {
            const slotStart = new Date(targetDate);
            slotStart.setHours(hour, minute, 0, 0);
            const slotEnd = new Date(slotStart.getTime() + duration * 60000);

            if (slotEnd.getHours() > workEnd) continue;

            const hasConflict = dayMeetings.some(m => {
              const meetingEnd = new Date(m.date.getTime() + m.duration * 60000);
              return (slotStart < meetingEnd && slotEnd > m.date);
            });

            if (!hasConflict) {
              slots.push(slotStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' - ' + slotEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            }
          }
        }

        return {
          success: true,
          message: '🔍 AVAILABLE TIME SLOTS\n\n' +
            'Date: ' + targetDate.toLocaleDateString() + '\n' +
            'Duration: ' + duration + ' minutes\n\n' +
            'Available slots:\n' +
            slots.slice(0, 10).map(s => '  ✓ ' + s).join('\n') +
            (slots.length > 10 ? '\n  ... and ' + (slots.length - 10) + ' more slots' : '') +
            '\n\nUse "meeting schedule" to book a slot.'
        };
      }

      case 'today': {
        const today = new Date();
        const todayMeetings = state.meetings
          .filter(m => m.date.toDateString() === today.toDateString())
          .sort((a, b) => a.date.getTime() - b.date.getTime());

        if (todayMeetings.length === 0) {
          return {
            success: true,
            message: '📅 TODAY\'S SCHEDULE - ' + today.toLocaleDateString() + '\n\n' +
              'No meetings scheduled for today.\n\n' +
              'Enjoy your meeting-free day! 🎉'
          };
        }

        let scheduleText = '📅 TODAY\'S SCHEDULE - ' + today.toLocaleDateString() + '\n\n';
        
        todayMeetings.forEach((meeting, index) => {
          const endTime = new Date(meeting.date.getTime() + meeting.duration * 60000);
          const isPast = meeting.date < today;
          const icon = isPast ? '✓' : '○';
          
          scheduleText += icon + ' ' + meeting.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' - ';
          scheduleText += endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '\n';
          scheduleText += '  ' + meeting.title + '\n';
          if (meeting.attendees.length > 0) {
            scheduleText += '  👥 ' + meeting.attendees.join(', ') + '\n';
          }
          scheduleText += '\n';
        });

        return {
          success: true,
          message: scheduleText
        };
      }

      default:
        return {
          success: false,
          message: 'Unknown command: ' + action + '. Available commands: schedule, list, cancel, find, today'
        };
    }
  }
};

export default meetingScheduler;

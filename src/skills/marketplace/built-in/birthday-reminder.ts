import { BuiltInSkill, SkillExecuteResult } from '../types.js';

interface Birthday {
  id: string;
  name: string;
  date: Date;
  notes: string;
  giftIdeas: string[];
}

interface BirthdayState {
  birthdays: Birthday[];
  nextId: number;
}

const state: BirthdayState = {
  birthdays: [],
  nextId: 1
};

function generateId(): string {
  return 'BD-' + String(state.nextId++).padStart(3, '0');
}

function parseDate(dateStr: string): Date | null {
  const formats = [
    /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/,
    /(\w+)\s+(\d{1,2})(?:,?\s*(\d{4}))?/
  ];

  const months: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  let match = dateStr.match(formats[0]);
  if (match) {
    const month = parseInt(match[1]) - 1;
    const day = parseInt(match[2]);
    const year = match[3] ? parseInt(match[3]) : new Date().getFullYear();
    return new Date(year < 100 ? year + 2000 : year, month, day);
  }

  match = dateStr.match(formats[1]);
  if (match) {
    const month = months[match[1].toLowerCase()];
    if (month !== undefined) {
      const day = parseInt(match[2]);
      const year = match[3] ? parseInt(match[3]) : new Date().getFullYear();
      return new Date(year, month, day);
    }
  }

  return null;
}

function getDaysUntilBirthday(birthday: Birthday): number {
  const now = new Date();
  const thisYear = new Date(now.getFullYear(), birthday.date.getMonth(), birthday.date.getDate());
  
  if (thisYear < now) {
    thisYear.setFullYear(thisYear.getFullYear() + 1);
  }
  
  return Math.ceil((thisYear.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

export const birthdayReminder: BuiltInSkill = {
  id: 'birthday-reminder',
  name: 'Birthday Reminder',
  description: 'Never forget a birthday again! Track important dates, get reminders, and even get gift suggestions.',
  version: '1.0.0',
  author: 'SecureAgent',
  icon: '🎂',
  category: 'personal',
  installCount: 3567,
  rating: 4.7,
  commands: [
    {
      name: 'add',
      description: 'Add a birthday to track',
      usage: 'birthday add <name> <date> [notes]',
      examples: ['birthday add "Mom" 5/15', 'birthday add "John" "March 20" "likes golf"']
    },
    {
      name: 'list',
      description: 'List all birthdays',
      usage: 'birthday list [month]',
      examples: ['birthday list', 'birthday list march']
    },
    {
      name: 'upcoming',
      description: 'Show upcoming birthdays',
      usage: 'birthday upcoming [days]',
      examples: ['birthday upcoming', 'birthday upcoming 30']
    },
    {
      name: 'today',
      description: 'Check for birthdays today',
      usage: 'birthday today',
      examples: ['birthday today']
    },
    {
      name: 'gift',
      description: 'Get gift ideas or add gift notes',
      usage: 'birthday gift <name> [add <idea>]',
      examples: ['birthday gift Mom', 'birthday gift Mom add "spa gift card"']
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
            message: 'Please provide a name. Usage: birthday add <name> <date>'
          };
        }

        const remaining = fullArgs.slice(fullArgs.indexOf(name) + name.length).trim();
        const dateMatch = remaining.match(/"([^"]+)"|(\S+\/\S+|\S+\s+\d+)/);
        const dateStr = dateMatch ? (dateMatch[1] || dateMatch[2]) : null;

        if (!dateStr) {
          return {
            success: false,
            message: 'Please provide a date. Usage: birthday add <name> <date>'
          };
        }

        const date = parseDate(dateStr);
        if (!date) {
          return {
            success: false,
            message: 'Could not parse date "' + dateStr + '". Try format: MM/DD or "Month Day"'
          };
        }

        const notesMatch = remaining.slice(remaining.indexOf(dateStr) + dateStr.length).match(/"([^"]+)"/);
        const notes = notesMatch ? notesMatch[1] : '';

        const birthday: Birthday = {
          id: generateId(),
          name,
          date,
          notes,
          giftIdeas: []
        };
        state.birthdays.push(birthday);

        const daysUntil = getDaysUntilBirthday(birthday);
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'];

        return {
          success: true,
          message: '🎂 BIRTHDAY ADDED\n\n' +
            'ID: ' + birthday.id + '\n' +
            'Name: ' + birthday.name + '\n' +
            'Date: ' + monthNames[date.getMonth()] + ' ' + date.getDate() + '\n' +
            (notes ? 'Notes: ' + notes + '\n' : '') +
            '\n' + (daysUntil === 0 ? '🎉 That\'s TODAY!' : '📅 ' + daysUntil + ' days until their birthday')
        };
      }

      case 'list': {
        const monthFilter = (params.arg0 as string)?.toLowerCase();
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
          'july', 'august', 'september', 'october', 'november', 'december'];

        let filtered = state.birthdays;
        if (monthFilter) {
          const monthIndex = monthNames.indexOf(monthFilter) !== -1 
            ? monthNames.indexOf(monthFilter)
            : monthNames.findIndex(m => m.startsWith(monthFilter));
          
          if (monthIndex !== -1) {
            filtered = state.birthdays.filter(b => b.date.getMonth() === monthIndex);
          }
        }

        if (filtered.length === 0) {
          return {
            success: true,
            message: '🎂 No birthdays found' + (monthFilter ? ' in ' + monthFilter : '') + '.\n\n' +
              'Add birthdays with "birthday add <name> <date>"'
          };
        }

        filtered.sort((a, b) => {
          const aMonth = a.date.getMonth();
          const bMonth = b.date.getMonth();
          if (aMonth !== bMonth) return aMonth - bMonth;
          return a.date.getDate() - b.date.getDate();
        });

        let listText = '🎂 BIRTHDAY LIST' + (monthFilter ? ' (' + monthFilter.toUpperCase() + ')' : '') + '\n\n';

        const monthDisplayNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        filtered.forEach(bday => {
          const daysUntil = getDaysUntilBirthday(bday);
          const dateStr = monthDisplayNames[bday.date.getMonth()] + ' ' + bday.date.getDate();
          const urgency = daysUntil <= 7 ? '⚠️' : daysUntil <= 30 ? '📅' : '';
          
          listText += urgency + ' ' + bday.id + ' | ' + bday.name + '\n';
          listText += '   Date: ' + dateStr + ' (' + daysUntil + ' days)\n';
          if (bday.notes) listText += '   Notes: ' + bday.notes + '\n';
          listText += '\n';
        });

        listText += '━━━━━━━━━━━━━━━━━━━━\n';
        listText += 'Total: ' + filtered.length + ' birthday(s)';

        return {
          success: true,
          message: listText
        };
      }

      case 'upcoming': {
        const days = parseInt((params.arg0 as string)) || 30;
        
        const upcoming = state.birthdays
          .map(b => ({ birthday: b, daysUntil: getDaysUntilBirthday(b) }))
          .filter(item => item.daysUntil <= days)
          .sort((a, b) => a.daysUntil - b.daysUntil);

        if (upcoming.length === 0) {
          return {
            success: true,
            message: '🎂 No birthdays in the next ' + days + ' days.\n\n' +
              'Add birthdays with "birthday add <name> <date>"'
          };
        }

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        let upcomingText = '🎂 UPCOMING BIRTHDAYS (Next ' + days + ' days)\n\n';

        upcoming.forEach(item => {
          const emoji = item.daysUntil === 0 ? '🎉' : item.daysUntil <= 7 ? '⚠️' : '📅';
          const dateStr = monthNames[item.birthday.date.getMonth()] + ' ' + item.birthday.date.getDate();
          const daysText = item.daysUntil === 0 ? 'TODAY!' : item.daysUntil + ' days';
          
          upcomingText += emoji + ' ' + item.birthday.name + '\n';
          upcomingText += '   ' + dateStr + ' - ' + daysText + '\n\n';
        });

        return {
          success: true,
          message: upcomingText
        };
      }

      case 'today': {
        const today = new Date();
        const todayBirthdays = state.birthdays.filter(b => 
          b.date.getMonth() === today.getMonth() && b.date.getDate() === today.getDate()
        );

        if (todayBirthdays.length === 0) {
          return {
            success: true,
            message: '🎂 No birthdays today.\n\n' +
              'Use "birthday upcoming" to see upcoming birthdays.'
          };
        }

        let todayText = '🎉🎂🎉 BIRTHDAYS TODAY! 🎉🎂🎉\n\n';

        todayBirthdays.forEach(bday => {
          todayText += '🎈 ' + bday.name + ' 🎈\n';
          if (bday.notes) todayText += '   Notes: ' + bday.notes + '\n';
          if (bday.giftIdeas.length > 0) {
            todayText += '   Gift ideas: ' + bday.giftIdeas.join(', ') + '\n';
          }
          todayText += '\n';
        });

        todayText += 'Don\'t forget to wish them happy birthday! 🎁';

        return {
          success: true,
          message: todayText
        };
      }

      case 'gift': {
        const name = (params.arg0 as string)?.replace(/^["']|["']$/g, '');
        
        if (!name) {
          return {
            success: false,
            message: 'Please specify a name. Usage: birthday gift <name> [add <idea>]'
          };
        }

        const birthday = state.birthdays.find(b => 
          b.name.toLowerCase().includes(name.toLowerCase())
        );

        if (!birthday) {
          return {
            success: false,
            message: 'Birthday not found for "' + name + '".'
          };
        }

        if ((params.arg1 as string) === 'add' && Object.keys(params).length > 2) {
          const idea = Object.values(params).slice(2).join(' ').replace(/^["']|["']$/g, '');
          birthday.giftIdeas.push(idea);
          
          return {
            success: true,
            message: '🎁 Gift idea added for ' + birthday.name + '!\n\n' +
              'Current ideas:\n' +
              birthday.giftIdeas.map((g, i) => '  ' + (i + 1) + '. ' + g).join('\n')
          };
        }

        const genericIdeas = [
          'Gift card to their favorite store',
          'Personalized photo album or frame',
          'Experience gift (concert, spa, dinner)',
          'Subscription box service',
          'Custom-made item with their name'
        ];

        let giftText = '🎁 GIFT IDEAS FOR ' + birthday.name.toUpperCase() + '\n\n';
        
        if (birthday.giftIdeas.length > 0) {
          giftText += 'YOUR SAVED IDEAS:\n';
          birthday.giftIdeas.forEach((idea, i) => {
            giftText += '  ★ ' + idea + '\n';
          });
          giftText += '\n';
        }

        giftText += 'SUGGESTIONS:\n';
        genericIdeas.forEach((idea, i) => {
          giftText += '  ' + (i + 1) + '. ' + idea + '\n';
        });

        if (birthday.notes) {
          giftText += '\nNotes about ' + birthday.name + ': ' + birthday.notes;
        }

        giftText += '\n\nAdd ideas with "birthday gift ' + birthday.name + ' add <idea>"';

        return {
          success: true,
          message: giftText
        };
      }

      default:
        return {
          success: false,
          message: 'Unknown command: ' + action + '. Available commands: add, list, upcoming, today, gift'
        };
    }
  }
};

export default birthdayReminder;

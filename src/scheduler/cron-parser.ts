// ============================================================================
// Cron Expression Parser
// ============================================================================

/**
 * Parsed cron field
 */
interface CronField {
  values: number[];
  any: boolean;
}

/**
 * Parsed cron expression
 */
interface ParsedCron {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

// Field ranges
const FIELD_RANGES = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dayOfWeek: { min: 0, max: 6 }, // 0 = Sunday
};

// Month name mappings
const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Day name mappings
const DAY_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

// Special expressions
const SPECIAL_EXPRESSIONS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

/**
 * Parse a cron field value
 */
function parseFieldValue(value: string, min: number, max: number): number {
  // Check for named values
  const lower = value.toLowerCase();
  if (MONTH_NAMES[lower] !== undefined) {
    return MONTH_NAMES[lower];
  }
  if (DAY_NAMES[lower] !== undefined) {
    return DAY_NAMES[lower];
  }

  const num = parseInt(value, 10);
  if (isNaN(num) || num < min || num > max) {
    throw new Error(`Invalid cron value: ${value} (expected ${min}-${max})`);
  }
  return num;
}

/**
 * Parse a cron field (e.g., "1,2,3" or "1-5" or "star/15" or "*")
 */
function parseField(field: string, min: number, max: number): CronField {
  if (field === '*') {
    return { values: [], any: true };
  }

  const values: Set<number> = new Set();

  // Split by comma for multiple values
  const parts = field.split(',');

  for (const part of parts) {
    // Check for step (e.g., "*/15" or "0-30/5")
    const [range, stepStr] = part.split('/');
    const step = stepStr ? parseInt(stepStr, 10) : 1;

    if (isNaN(step) || step <= 0) {
      throw new Error(`Invalid cron step: ${stepStr}`);
    }

    // Check for range (e.g., "1-5")
    if (range.includes('-')) {
      const [startStr, endStr] = range.split('-');
      const start = parseFieldValue(startStr, min, max);
      const end = parseFieldValue(endStr, min, max);

      if (start > end) {
        throw new Error(`Invalid cron range: ${range}`);
      }

      for (let i = start; i <= end; i += step) {
        values.add(i);
      }
    } else if (range === '*') {
      // All values with step
      for (let i = min; i <= max; i += step) {
        values.add(i);
      }
    } else {
      // Single value
      values.add(parseFieldValue(range, min, max));
    }
  }

  return { values: Array.from(values).sort((a, b) => a - b), any: false };
}

/**
 * Parse a cron expression
 * Format: "minute hour dayOfMonth month dayOfWeek"
 * Examples:
 *   "0 * * * *" - Every hour at minute 0
 *   "0 0 * * *" - Every day at midnight
 *   "0 9 * * 1-5" - Weekdays at 9 AM
 *   "star/15 * * * *" - Every 15 minutes (use * instead of star)
 */
export function parseCron(expression: string): ParsedCron {
  // Check for special expressions
  const normalizedExpr = expression.trim().toLowerCase();
  if (SPECIAL_EXPRESSIONS[normalizedExpr]) {
    return parseCron(SPECIAL_EXPRESSIONS[normalizedExpr]);
  }

  const fields = expression.trim().split(/\s+/);

  if (fields.length !== 5) {
    throw new Error(
      `Invalid cron expression: expected 5 fields (minute hour dayOfMonth month dayOfWeek), got ${fields.length}`
    );
  }

  return {
    minute: parseField(fields[0], FIELD_RANGES.minute.min, FIELD_RANGES.minute.max),
    hour: parseField(fields[1], FIELD_RANGES.hour.min, FIELD_RANGES.hour.max),
    dayOfMonth: parseField(fields[2], FIELD_RANGES.dayOfMonth.min, FIELD_RANGES.dayOfMonth.max),
    month: parseField(fields[3], FIELD_RANGES.month.min, FIELD_RANGES.month.max),
    dayOfWeek: parseField(fields[4], FIELD_RANGES.dayOfWeek.min, FIELD_RANGES.dayOfWeek.max),
  };
}

/**
 * Check if a cron field matches a value
 */
function fieldMatches(field: CronField, value: number): boolean {
  if (field.any) {
    return true;
  }
  return field.values.includes(value);
}

/**
 * Check if a date matches a cron expression
 */
export function cronMatches(cron: ParsedCron, date: Date): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1; // JS months are 0-indexed
  const dayOfWeek = date.getDay();

  // Day matching: if both dayOfMonth and dayOfWeek are specified,
  // either match satisfies (OR logic)
  const dayOfMonthMatch = fieldMatches(cron.dayOfMonth, dayOfMonth);
  const dayOfWeekMatch = fieldMatches(cron.dayOfWeek, dayOfWeek);

  const dayMatches = cron.dayOfMonth.any && cron.dayOfWeek.any
    ? true
    : cron.dayOfMonth.any
      ? dayOfWeekMatch
      : cron.dayOfWeek.any
        ? dayOfMonthMatch
        : dayOfMonthMatch || dayOfWeekMatch;

  return (
    fieldMatches(cron.minute, minute) &&
    fieldMatches(cron.hour, hour) &&
    dayMatches &&
    fieldMatches(cron.month, month)
  );
}

/**
 * Get next value in a cron field >= given value
 */
function getNextFieldValue(field: CronField, current: number, min: number, max: number): {
  value: number;
  wrapped: boolean;
} {
  if (field.any) {
    if (current <= max) {
      return { value: current, wrapped: false };
    }
    return { value: min, wrapped: true };
  }

  // Find next value >= current
  for (const v of field.values) {
    if (v >= current) {
      return { value: v, wrapped: false };
    }
  }

  // Wrap to first value
  return { value: field.values[0], wrapped: true };
}

/**
 * Calculate the next run time for a cron expression
 */
export function getNextCronTime(expression: string, from: Date = new Date()): Date {
  const cron = parseCron(expression);

  // Start from the next minute
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  // Maximum iterations to prevent infinite loops
  const maxIterations = 366 * 24 * 60; // One year in minutes
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    // Check month
    const monthResult = getNextFieldValue(
      cron.month,
      next.getMonth() + 1,
      FIELD_RANGES.month.min,
      FIELD_RANGES.month.max
    );

    if (monthResult.wrapped) {
      next.setFullYear(next.getFullYear() + 1);
    }

    if (next.getMonth() + 1 !== monthResult.value) {
      next.setMonth(monthResult.value - 1, 1);
      next.setHours(0, 0, 0, 0);
      continue;
    }

    // Check day of month
    const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    const dayOfMonthResult = getNextFieldValue(
      cron.dayOfMonth,
      next.getDate(),
      FIELD_RANGES.dayOfMonth.min,
      Math.min(FIELD_RANGES.dayOfMonth.max, daysInMonth)
    );

    // For day of week, we need special handling
    let dayOfWeekMatch = cron.dayOfWeek.any;
    if (!dayOfWeekMatch) {
      for (let d = next.getDate(); d <= daysInMonth; d++) {
        const testDate = new Date(next.getFullYear(), next.getMonth(), d);
        if (cron.dayOfWeek.values.includes(testDate.getDay())) {
          if (cron.dayOfMonth.any || d === dayOfMonthResult.value) {
            dayOfMonthResult.value = d;
            dayOfMonthResult.wrapped = d < next.getDate();
            dayOfWeekMatch = true;
            break;
          }
        }
      }
    }

    if (dayOfMonthResult.wrapped || !dayOfWeekMatch) {
      next.setMonth(next.getMonth() + 1, 1);
      next.setHours(0, 0, 0, 0);
      continue;
    }

    if (next.getDate() !== dayOfMonthResult.value) {
      next.setDate(dayOfMonthResult.value);
      next.setHours(0, 0, 0, 0);
      continue;
    }

    // Check hour
    const hourResult = getNextFieldValue(
      cron.hour,
      next.getHours(),
      FIELD_RANGES.hour.min,
      FIELD_RANGES.hour.max
    );

    if (hourResult.wrapped) {
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      continue;
    }

    if (next.getHours() !== hourResult.value) {
      next.setHours(hourResult.value, 0, 0, 0);
      continue;
    }

    // Check minute
    const minuteResult = getNextFieldValue(
      cron.minute,
      next.getMinutes(),
      FIELD_RANGES.minute.min,
      FIELD_RANGES.minute.max
    );

    if (minuteResult.wrapped) {
      next.setHours(next.getHours() + 1, 0, 0, 0);
      continue;
    }

    if (next.getMinutes() !== minuteResult.value) {
      next.setMinutes(minuteResult.value, 0, 0);
      continue;
    }

    // Found a match
    return next;
  }

  throw new Error('Could not calculate next cron time (exceeded max iterations)');
}

/**
 * Validate a cron expression
 */
export function isValidCron(expression: string): boolean {
  try {
    parseCron(expression);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a string is an interval expression (e.g., "interval:5000")
 */
export function isInterval(expression: string): boolean {
  return expression.startsWith('interval:');
}

/**
 * Parse an interval expression and return milliseconds
 */
export function parseInterval(expression: string): number {
  if (!isInterval(expression)) {
    throw new Error(`Not an interval expression: ${expression}`);
  }

  const ms = parseInt(expression.slice(9), 10);
  if (isNaN(ms) || ms <= 0) {
    throw new Error(`Invalid interval: ${expression}`);
  }

  return ms;
}

/**
 * Get human-readable description of a cron expression
 */
export function describeCron(expression: string): string {
  const normalizedExpr = expression.trim().toLowerCase();

  // Check special expressions
  const specialDescriptions: Record<string, string> = {
    '@yearly': 'Once a year at midnight on January 1st',
    '@annually': 'Once a year at midnight on January 1st',
    '@monthly': 'Once a month at midnight on the 1st',
    '@weekly': 'Once a week at midnight on Sunday',
    '@daily': 'Once a day at midnight',
    '@midnight': 'Once a day at midnight',
    '@hourly': 'Once an hour at the beginning of the hour',
  };

  if (specialDescriptions[normalizedExpr]) {
    return specialDescriptions[normalizedExpr];
  }

  // Check interval
  if (isInterval(expression)) {
    const ms = parseInterval(expression);
    if (ms < 1000) return `Every ${ms}ms`;
    if (ms < 60000) return `Every ${ms / 1000} seconds`;
    if (ms < 3600000) return `Every ${ms / 60000} minutes`;
    return `Every ${ms / 3600000} hours`;
  }

  // Parse and describe
  try {
    const cron = parseCron(expression);
    const parts: string[] = [];

    // Minute
    if (cron.minute.any) {
      parts.push('every minute');
    } else if (cron.minute.values.length === 1) {
      parts.push(`at minute ${cron.minute.values[0]}`);
    } else {
      parts.push(`at minutes ${cron.minute.values.join(', ')}`);
    }

    // Hour
    if (!cron.hour.any) {
      if (cron.hour.values.length === 1) {
        const h = cron.hour.values[0];
        parts.push(`at ${h}:00`);
      } else {
        parts.push(`at hours ${cron.hour.values.join(', ')}`);
      }
    }

    // Day of month
    if (!cron.dayOfMonth.any) {
      if (cron.dayOfMonth.values.length === 1) {
        parts.push(`on day ${cron.dayOfMonth.values[0]}`);
      } else {
        parts.push(`on days ${cron.dayOfMonth.values.join(', ')}`);
      }
    }

    // Month
    if (!cron.month.any) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const names = cron.month.values.map(m => monthNames[m - 1]);
      parts.push(`in ${names.join(', ')}`);
    }

    // Day of week
    if (!cron.dayOfWeek.any) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const names = cron.dayOfWeek.values.map(d => dayNames[d]);
      parts.push(`on ${names.join(', ')}`);
    }

    return parts.join(' ');
  } catch {
    return 'Invalid cron expression';
  }
}

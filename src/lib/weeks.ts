export type WorkWeek = {
  weekNumber: number;
  startDay: number;
  endDay: number;
  /** YYYY-MM-DD for first day in this week (within the month) */
  startDate: string;
  /** YYYY-MM-DD for last day in this week (within the month) */
  endDate: string;
  /** Calendar days (Sun–Sat) in this week within the month */
  dayCount: number;
  /** Mon–Fri days in this week within the month, excluding holidays */
  workdayCount: number;
  /**
   * Forecasted capacity hours = workdayCount * 8.
   * Saturdays, Sundays, and holidays contribute 0.
   */
  capacityHours: number;
  /** True when the week only contains Sat/Sun days within the month. */
  isWeekendOnly: boolean;
  label: string;
};

function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toHolidaySet(
  holidayDates: ReadonlySet<string> | readonly string[],
): ReadonlySet<string> {
  if (Array.isArray(holidayDates)) {
    return new Set(
      holidayDates
        .map((value) => value.trim())
        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)),
    );
  }
  return holidayDates as ReadonlySet<string>;
}

export type MonthCursor = {
  year: number;
  month: number; // 1-12
};

/** Inclusive range of calendar years unlocked for Prev/Next navigation. */
export type CalendarYearRange = {
  minYear: number;
  maxYear: number;
};

/** Default utilization calendar year. Adjacent years are unlocked via Generate Calendar. */
export const DEFAULT_CALENDAR_YEAR = 2026;

const CALENDAR_YEAR_RANGE_STORAGE_KEY =
  "utilization-dashboard-calendar-year-range";

export function getDefaultCalendarYearRange(): CalendarYearRange {
  return {
    minYear: DEFAULT_CALENDAR_YEAR,
    maxYear: DEFAULT_CALENDAR_YEAR,
  };
}

function isValidYear(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1900 &&
    value <= 2200
  );
}

export function loadCalendarYearRange(): CalendarYearRange {
  const fallback = getDefaultCalendarYearRange();

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(CALENDAR_YEAR_RANGE_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as {
      minYear?: unknown;
      maxYear?: unknown;
    };

    if (!isValidYear(parsed.minYear) || !isValidYear(parsed.maxYear)) {
      return fallback;
    }

    return {
      minYear: Math.min(parsed.minYear, parsed.maxYear),
      maxYear: Math.max(parsed.minYear, parsed.maxYear),
    };
  } catch {
    return fallback;
  }
}

export function saveCalendarYearRange(range: CalendarYearRange): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    CALENDAR_YEAR_RANGE_STORAGE_KEY,
    JSON.stringify({
      minYear: Math.min(range.minYear, range.maxYear),
      maxYear: Math.max(range.minYear, range.maxYear),
    }),
  );
}

export function getCurrentMonthCursor(now = new Date()): MonthCursor {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (year === DEFAULT_CALENDAR_YEAR) {
    return { year, month };
  }

  // Outside the default calendar year, land on Jan/Dec of 2026.
  return {
    year: DEFAULT_CALENDAR_YEAR,
    month: year < DEFAULT_CALENDAR_YEAR ? 1 : 12,
  };
}

export function shiftMonth(
  cursor: MonthCursor,
  delta: number,
  range: CalendarYearRange,
): MonthCursor {
  const date = new Date(cursor.year, cursor.month - 1 + delta, 1);
  const next: MonthCursor = {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };

  if (next.year < range.minYear || next.year > range.maxYear) {
    return cursor;
  }

  return next;
}

export function canShiftMonth(
  cursor: MonthCursor,
  delta: number,
  range: CalendarYearRange,
): boolean {
  const date = new Date(cursor.year, cursor.month - 1 + delta, 1);
  const nextYear = date.getFullYear();
  return nextYear >= range.minYear && nextYear <= range.maxYear;
}

/**
 * Offer Generate Calendar only at the outer edges of the unlocked range
 * (Jan of minYear / Dec of maxYear), so earlier years stay reachable via Prev/Next.
 * Continues indefinitely: Dec 2027 → 2028 → 2029… and Jan 2025 → 2024 → 2023…
 */
export function getGenerateCalendarYear(
  cursor: MonthCursor,
  range: CalendarYearRange,
): number | null {
  if (cursor.year === range.minYear && cursor.month === 1) {
    return range.minYear - 1;
  }

  if (cursor.year === range.maxYear && cursor.month === 12) {
    return range.maxYear + 1;
  }

  return null;
}

export function expandCalendarYearRange(
  range: CalendarYearRange,
  targetYear: number,
): CalendarYearRange {
  return {
    minYear: Math.min(range.minYear, targetYear),
    maxYear: Math.max(range.maxYear, targetYear),
  };
}

export function openCalendarYear(
  from: MonthCursor,
  targetYear: number,
): MonthCursor {
  if (targetYear < from.year) {
    return { year: targetYear, month: 12 };
  }
  if (targetYear > from.year) {
    return { year: targetYear, month: 1 };
  }
  return from;
}

export function formatMonthLabel(cursor: MonthCursor): string {
  const date = new Date(cursor.year, cursor.month - 1, 1);
  return date.toLocaleString("en-US", { month: "short", year: "numeric" });
}

export function monthCursorKey(cursor: MonthCursor): string {
  return `${cursor.year}-${String(cursor.month).padStart(2, "0")}`;
}

export function parseMonthCursorKey(key: string): MonthCursor | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) {
    return null;
  }

  return { year, month };
}

/** Every month from Jan of minYear through Dec of maxYear, in order. */
export function listMonthsInRange(range: CalendarYearRange): MonthCursor[] {
  const months: MonthCursor[] = [];

  for (let year = range.minYear; year <= range.maxYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      months.push({ year, month });
    }
  }

  return months;
}

/**
 * Work weeks for a month: Sunday–Saturday blocks clipped to month boundaries.
 * Includes weekends so overtime maps into the same week columns.
 * Capacity = Mon–Fri × 8 within each clipped week, excluding holiday dates.
 * Weekend-only stubs (e.g. Sat 1st) have 0 forecasted capacity.
 */
export function getWorkWeeksForMonth(
  cursor: MonthCursor,
  holidayDates: ReadonlySet<string> | readonly string[] = [],
): WorkWeek[] {
  const holidays = toHolidaySet(holidayDates);

  const first = new Date(cursor.year, cursor.month - 1, 1);
  const last = new Date(cursor.year, cursor.month, 0);

  // Sunday of the week that contains the 1st (JS: Sun=0 … Sat=6).
  const sunday = new Date(first);
  sunday.setDate(first.getDate() - first.getDay());

  const weeks: WorkWeek[] = [];
  const cursorDate = new Date(sunday);

  while (cursorDate <= last) {
    const weekDays: number[] = [];
    let calendarWorkdayCount = 0;
    let billableWorkdayCount = 0;

    for (let offset = 0; offset < 7; offset += 1) {
      const day = new Date(cursorDate);
      day.setDate(cursorDate.getDate() + offset);

      if (
        day.getFullYear() === cursor.year &&
        day.getMonth() + 1 === cursor.month
      ) {
        weekDays.push(day.getDate());
        const weekday = day.getDay(); // 0=Sun … 6=Sat
        // Saturday/Sunday never count toward forecasted capacity.
        if (weekday >= 1 && weekday <= 5) {
          calendarWorkdayCount += 1;
          const dateKey = toDateString(
            day.getFullYear(),
            day.getMonth() + 1,
            day.getDate(),
          );
          if (!holidays.has(dateKey)) {
            billableWorkdayCount += 1;
          }
        }
      }
    }

    if (weekDays.length > 0) {
      const startDay = weekDays[0];
      const endDay = weekDays[weekDays.length - 1];
      const weekNumber = weeks.length + 1;
      const dayCount = weekDays.length;
      const isWeekendOnly = calendarWorkdayCount === 0;
      // Forecasted capacity never includes Sat/Sun or holidays.
      const capacityHours = billableWorkdayCount * 8;

      weeks.push({
        weekNumber,
        startDay,
        endDay,
        startDate: toDateString(cursor.year, cursor.month, startDay),
        endDate: toDateString(cursor.year, cursor.month, endDay),
        dayCount,
        workdayCount: billableWorkdayCount,
        capacityHours,
        isWeekendOnly,
        label: `Week ${weekNumber}\n(${startDay}-${endDay})`,
      });
    }

    cursorDate.setDate(cursorDate.getDate() + 7);
  }

  return weeks;
}

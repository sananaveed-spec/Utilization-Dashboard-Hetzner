import type { MonthCursor } from "@/lib/weeks";

export type DateRange = {
  start: string; // YYYY-MM-DD
  end: string;
};

export type DateRangePresetId =
  | "today"
  | "yesterday"
  | "this-week"
  | "last-week"
  | "past-two-weeks"
  | "this-month"
  | "last-month"
  | "this-year"
  | "last-year";

export type DateRangePreset = {
  id: DateRangePresetId;
  label: string;
};

export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this-week", label: "This week" },
  { id: "last-week", label: "Last week" },
  { id: "past-two-weeks", label: "Past two weeks" },
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "this-year", label: "This year" },
  { id: "last-year", label: "Last year" },
];

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function compareDateKeys(a: string, b: string): number {
  return a.localeCompare(b);
}

export function normalizeDateRange(start: string, end: string): DateRange {
  if (compareDateKeys(start, end) <= 0) {
    return { start, end };
  }
  return { start: end, end: start };
}

/** Monday-based start of week for a local date. */
export function startOfWeekMonday(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay(); // 0=Sun … 6=Sat
  const offset = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + offset);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function shiftMonthCursor(
  year: number,
  month: number,
  delta: number,
): MonthCursor {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function getPresetRange(
  id: DateRangePresetId,
  now = new Date(),
): DateRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (id) {
    case "today":
      return { start: toDateKey(today), end: toDateKey(today) };
    case "yesterday": {
      const yesterday = addDays(today, -1);
      return { start: toDateKey(yesterday), end: toDateKey(yesterday) };
    }
    case "this-week": {
      const start = startOfWeekMonday(today);
      const end = addDays(start, 6);
      return { start: toDateKey(start), end: toDateKey(end) };
    }
    case "last-week": {
      const thisWeekStart = startOfWeekMonday(today);
      const start = addDays(thisWeekStart, -7);
      const end = addDays(start, 6);
      return { start: toDateKey(start), end: toDateKey(end) };
    }
    case "past-two-weeks": {
      const end = today;
      const start = addDays(today, -13);
      return { start: toDateKey(start), end: toDateKey(end) };
    }
    case "this-month":
      return {
        start: toDateKey(startOfMonth(today)),
        end: toDateKey(endOfMonth(today)),
      };
    case "last-month": {
      const inLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return {
        start: toDateKey(startOfMonth(inLastMonth)),
        end: toDateKey(endOfMonth(inLastMonth)),
      };
    }
    case "this-year":
      return {
        start: toDateKey(new Date(today.getFullYear(), 0, 1)),
        end: toDateKey(new Date(today.getFullYear(), 11, 31)),
      };
    case "last-year":
      return {
        start: toDateKey(new Date(today.getFullYear() - 1, 0, 1)),
        end: toDateKey(new Date(today.getFullYear() - 1, 11, 31)),
      };
  }
}

export function matchPresetId(
  range: DateRange,
  now = new Date(),
): DateRangePresetId | null {
  for (const preset of DATE_RANGE_PRESETS) {
    const candidate = getPresetRange(preset.id, now);
    if (candidate.start === range.start && candidate.end === range.end) {
      return preset.id;
    }
  }
  return null;
}

export function formatDateRangeLabel(range: DateRange): string {
  const start = parseDateKey(range.start);
  const end = parseDateKey(range.end);
  if (!start || !end) {
    return "Select dates";
  }

  const sameDay = range.start === range.end;
  const sameYear = start.getFullYear() === end.getFullYear();
  const startOpts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  };
  const endOpts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };

  if (sameDay) {
    return start.toLocaleDateString("en-US", endOpts);
  }

  return `${start.toLocaleDateString("en-US", startOpts)} – ${end.toLocaleDateString("en-US", endOpts)}`;
}

/** Months that overlap the inclusive day range, in order. */
export function listMonthsInDateRange(range: DateRange): MonthCursor[] {
  const start = parseDateKey(range.start);
  const end = parseDateKey(range.end);
  if (!start || !end) {
    return [];
  }

  const cursor = startOfMonth(start);
  const last = startOfMonth(end);
  const months: MonthCursor[] = [];

  while (cursor <= last) {
    months.push({
      year: cursor.getFullYear(),
      month: cursor.getMonth() + 1,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

/**
 * Short month name for column headers.
 * Same-year range: "Jun". Multi-year range: "Jun26".
 */
export function formatFullMonthSpanLabel(
  cursor: MonthCursor,
  options?: { includeYear?: boolean },
): string {
  const monthShort = new Date(cursor.year, cursor.month - 1, 1).toLocaleString(
    "en-US",
    { month: "short" },
  );
  if (options?.includeYear) {
    return `${monthShort}${String(cursor.year).slice(-2)}`;
  }
  return monthShort;
}

/** True when the inclusive day range spans more than one calendar year. */
export function dateRangeSpansMultipleYears(range: DateRange): boolean {
  const start = parseDateKey(range.start);
  const end = parseDateKey(range.end);
  if (!start || !end) {
    return false;
  }
  return start.getFullYear() !== end.getFullYear();
}

export type CalendarDayCell = {
  key: string;
  day: number;
  inMonth: boolean;
  month: MonthCursor;
};

/** 6×7 Monday-first grid for a month (includes adjacent-month fillers). */
export function getMonthCalendarCells(cursor: MonthCursor): CalendarDayCell[] {
  const first = new Date(cursor.year, cursor.month - 1, 1);
  const gridStart = startOfWeekMonday(first);
  const cells: CalendarDayCell[] = [];

  for (let index = 0; index < 42; index += 1) {
    const date = addDays(gridStart, index);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    cells.push({
      key: toDateKey(date),
      day: date.getDate(),
      inMonth: year === cursor.year && month === cursor.month,
      month: { year, month },
    });
  }

  return cells;
}

export function formatMonthYear(cursor: MonthCursor): string {
  return new Date(cursor.year, cursor.month - 1, 1).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export function getDefaultAnalysisDateRange(now = new Date()): DateRange {
  return getPresetRange("this-month", now);
}

/**
 * Overview default: full months from 6 months before the current month
/**
 * Initial Overview date range only (current month −6 … +6 = 13 months).
 * After load, the date picker controls the range — do not re-apply this.
 */
export function getDefaultOverviewDateRange(now = new Date()): DateRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = startOfMonth(
    new Date(today.getFullYear(), today.getMonth() - 6, 1),
  );
  const end = endOfMonth(
    new Date(today.getFullYear(), today.getMonth() + 6, 1),
  );
  return { start: toDateKey(start), end: toDateKey(end) };
}

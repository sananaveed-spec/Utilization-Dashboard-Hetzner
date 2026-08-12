import { DEFAULT_ENGINEER_NAMES, sortEngineerNames } from "@/lib/engineers";
import {
  parseUtilizationEntries,
  type UtilizationEntry,
} from "@/lib/entries";
import { parseHolidays, type Holiday } from "@/lib/holidays";
import {
  getDefaultCalendarYearRange,
  parseCalendarYearRange,
  type CalendarYearRange,
} from "@/lib/weeks";
import { readJsonFile, writeJsonFile } from "@/lib/jsonDataStore";

const HOLIDAYS_FILE = "holidays.json";
const ENGINEERS_FILE = "engineers.json";
const ENTRIES_FILE = "entries.json";
const CALENDAR_YEAR_RANGE_FILE = "calendar-year-range.json";

export async function readHolidays(): Promise<Holiday[]> {
  const parsed = await readJsonFile<unknown>(HOLIDAYS_FILE, []);
  return parseHolidays(parsed);
}

export async function writeHolidays(holidays: unknown): Promise<Holiday[]> {
  const next = parseHolidays(holidays);
  return writeJsonFile(HOLIDAYS_FILE, next);
}

export async function readEngineers(): Promise<string[]> {
  const parsed = await readJsonFile<unknown>(ENGINEERS_FILE, [
    ...DEFAULT_ENGINEER_NAMES,
  ]);
  return parseEngineerNames(parsed);
}

export async function writeEngineers(engineers: unknown): Promise<string[]> {
  const next = parseEngineerNames(engineers);
  return writeJsonFile(ENGINEERS_FILE, next);
}

export async function readEntries(): Promise<UtilizationEntry[]> {
  const parsed = await readJsonFile<unknown>(ENTRIES_FILE, []);
  return parseUtilizationEntries(parsed);
}

export async function writeEntries(entries: unknown): Promise<UtilizationEntry[]> {
  const next = parseUtilizationEntries(entries);
  return writeJsonFile(ENTRIES_FILE, next);
}

export async function readCalendarYearRange(): Promise<CalendarYearRange> {
  const parsed = await readJsonFile<unknown>(
    CALENDAR_YEAR_RANGE_FILE,
    getDefaultCalendarYearRange(),
  );
  return parseCalendarYearRange(parsed);
}

export async function writeCalendarYearRange(
  range: unknown,
): Promise<CalendarYearRange> {
  const next = parseCalendarYearRange(range);
  return writeJsonFile(CALENDAR_YEAR_RANGE_FILE, next);
}

function parseEngineerNames(parsed: unknown): string[] {
  if (!Array.isArray(parsed)) {
    return [...DEFAULT_ENGINEER_NAMES];
  }

  const names = parsed
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  return names.length > 0
    ? sortEngineerNames(names)
    : [...DEFAULT_ENGINEER_NAMES];
}

import { sortEngineerNames } from "@/lib/engineers";
import {
  parseUtilizationEntries,
  type UtilizationEntry,
} from "@/lib/entries";
import {
  createHistoryId,
  normalizeHistoryEntry,
  parseHistoryEntries,
  type HistoryEntry,
  type HistoryInput,
} from "@/lib/history";
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
const HISTORY_FILE = "history.json";

export async function readHolidays(): Promise<Holiday[]> {
  const parsed = await readJsonFile<unknown>(HOLIDAYS_FILE, []);
  return parseHolidays(parsed);
}

export async function writeHolidays(holidays: unknown): Promise<Holiday[]> {
  const next = parseHolidays(holidays);
  return writeJsonFile(HOLIDAYS_FILE, next);
}

export async function readEngineers(): Promise<string[]> {
  const parsed = await readJsonFile<unknown>(ENGINEERS_FILE, []);
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
    return [];
  }

  const names = parsed
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  return sortEngineerNames(names);
}

export async function readHistory(): Promise<HistoryEntry[]> {
  const parsed = await readJsonFile<unknown>(HISTORY_FILE, []);
  const entries = parseHistoryEntries(parsed);
  // Drop expired rows from disk when they appear in the stored file.
  if (Array.isArray(parsed) && parsed.length !== entries.length) {
    await writeJsonFile(HISTORY_FILE, entries);
  }
  return entries;
}

export async function writeHistory(
  entries: unknown,
): Promise<HistoryEntry[]> {
  const next = parseHistoryEntries(entries);
  return writeJsonFile(HISTORY_FILE, next);
}

export async function appendHistory(
  input: HistoryInput,
): Promise<HistoryEntry> {
  const current = await readHistory();
  const entry =
    normalizeHistoryEntry({
      ...input,
      id: createHistoryId(),
      createdAt: input.createdAt ?? new Date().toISOString(),
    }) ??
    normalizeHistoryEntry({
      employeeName: "Unknown",
      summary: "Action logged",
      action: "updated",
      entityType: "utilization",
    });

  if (!entry) {
    throw new Error("Invalid history entry.");
  }

  // Keep only the rolling 7-day window (parseHistoryEntries also prunes).
  const next = parseHistoryEntries([entry, ...current]);
  await writeJsonFile(HISTORY_FILE, next);
  return entry;
}

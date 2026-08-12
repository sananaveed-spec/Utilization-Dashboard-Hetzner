import type { UtilizationEntry } from "@/lib/entries";
import type { Holiday } from "@/lib/holidays";
import type { CalendarYearRange } from "@/lib/weeks";

export type DashboardData = {
  holidays: Holiday[];
  engineers: string[];
  entries: UtilizationEntry[];
  calendarYearRange: CalendarYearRange;
};

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Request failed.",
    );
  }
  return data;
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const response = await fetch("/api/dashboard-data", { cache: "no-store" });
  return readJson<DashboardData>(response);
}

export async function saveHolidays(holidays: Holiday[]): Promise<Holiday[]> {
  const response = await fetch("/api/holidays", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ holidays }),
  });
  const data = await readJson<{ holidays: Holiday[] }>(response);
  return data.holidays;
}

export async function saveEngineers(engineers: string[]): Promise<string[]> {
  const response = await fetch("/api/engineers", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ engineers }),
  });
  const data = await readJson<{ engineers: string[] }>(response);
  return data.engineers;
}

export async function saveEntries(
  entries: UtilizationEntry[],
): Promise<UtilizationEntry[]> {
  const response = await fetch("/api/entries", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries }),
  });
  const data = await readJson<{ entries: UtilizationEntry[] }>(response);
  return data.entries;
}

export async function saveCalendarYearRange(
  calendarYearRange: CalendarYearRange,
): Promise<CalendarYearRange> {
  const response = await fetch("/api/calendar-year-range", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ calendarYearRange }),
  });
  const data = await readJson<{ calendarYearRange: CalendarYearRange }>(
    response,
  );
  return data.calendarYearRange;
}

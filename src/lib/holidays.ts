const STORAGE_KEY = "utilization-dashboard-holidays";

export type Holiday = {
  id: string;
  name: string;
  /** ISO date string YYYY-MM-DD */
  date: string;
};

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `holiday-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createHoliday(partial?: Partial<Holiday>): Holiday {
  return {
    id: partial?.id ?? createId(),
    name: partial?.name?.trim() ?? "",
    date: partial?.date ?? "",
  };
}

function isValidHoliday(value: unknown): value is Holiday {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    typeof row.date === "string"
  );
}

export function loadHolidays(): Holiday[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isValidHoliday).map((row) => ({
      id: row.id,
      name: row.name.trim(),
      date: row.date.trim(),
    }));
  } catch {
    return [];
  }
}

export function saveHolidays(holidays: Holiday[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(holidays));
}

/** Unique holiday dates (YYYY-MM-DD) used to reduce forecasted capacity. */
export function getHolidayDateSet(
  holidays: Array<Pick<Holiday, "date">>,
): Set<string> {
  const dates = new Set<string>();
  for (const holiday of holidays) {
    const date = holiday.date.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      dates.add(date);
    }
  }
  return dates;
}
export function formatHolidayDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return isoDate;
  }
  const [year, month, day] = isoDate.split("-");
  return `${day}-${month}-${year}`;
}

/** Weekday name for YYYY-MM-DD (local calendar date). */
export function getHolidayDayName(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return "";
  }

  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return "";
  }

  return date.toLocaleDateString("en-US", { weekday: "long" });
}

import {
  isSameEngineerName,
  sortEngineerNames,
} from "@/lib/engineers";
import type { UtilizationEntry } from "@/lib/entries";
import {
  formatMonthLabel,
  getWorkWeeksForMonth,
  monthCursorKey,
  shiftMonth,
  type CalendarYearRange,
  type MonthCursor,
} from "@/lib/weeks";

export const LIGHT_THRESHOLD = 50;
export const MEDIUM_THRESHOLD = 75;
export const BUSY_THRESHOLD = MEDIUM_THRESHOLD;

export type EngineerMonthStats = {
  engineerName: string;
  month: MonthCursor;
  monthKey: string;
  monthLabel: string;
  allotted: number;
  capacity: number;
  percent: number | null;
};

export type EngineerWeekStats = {
  engineerName: string;
  month: MonthCursor;
  monthKey: string;
  monthLabel: string;
  weekNumber: number;
  weekLabel: string;
  allotted: number;
  capacity: number;
  percent: number | null;
};

export type FirmMonthPressure = {
  monthKey: string;
  monthLabel: string;
  allotted: number;
  capacity: number;
  percent: number | null;
};

export type EngineerUtilizationRow = {
  engineerName: string;
  allotted: number;
  capacity: number;
  percent: number | null;
  status: "busy" | "medium" | "light" | "over" | "none";
};

function parseHours(value: string | undefined): number {
  if (!value?.trim()) {
    return 0;
  }

  const normalized = value.trim().replace(/,/g, "");
  const match = normalized.match(/-?\d+(\.\d+)?/);
  if (!match) {
    return 0;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function listMonthsForward(
  start: MonthCursor,
  count: number,
  range: CalendarYearRange,
): MonthCursor[] {
  const months: MonthCursor[] = [];
  let cursor = start;

  for (let index = 0; index < count; index += 1) {
    months.push(cursor);
    if (index === count - 1) {
      break;
    }

    const next = shiftMonth(cursor, 1, range);
    if (next.year === cursor.year && next.month === cursor.month) {
      break;
    }
    cursor = next;
  }

  return months;
}

/** Engineers included in analysis — only names on the Overview engineer list. */
export function resolveAnalysisEngineers(engineerNames: string[]): string[] {
  return sortEngineerNames(
    engineerNames.map((name) => name.trim()).filter(Boolean),
  );
}

export function getEngineerAllottedForMonth(
  entries: UtilizationEntry[],
  engineerName: string,
  month: MonthCursor,
): number {
  const key = monthCursorKey(month);
  let allotted = 0;

  for (const entry of entries) {
    if (!isSameEngineerName(entry.engineerName, engineerName)) {
      continue;
    }

    const weekValues = entry.weekValuesByMonth[key] ?? {};
    for (const value of Object.values(weekValues)) {
      allotted += parseHours(value);
    }
  }

  return allotted;
}

export function getMonthCapacity(
  month: MonthCursor,
  holidayDates: ReadonlySet<string> | readonly string[] = [],
): number {
  return getWorkWeeksForMonth(month, holidayDates).reduce(
    (sum, week) => sum + week.capacityHours,
    0,
  );
}

export function utilizationPercent(
  allotted: number,
  capacity: number,
): number | null {
  if (!Number.isFinite(capacity) || capacity <= 0) {
    return null;
  }

  return (allotted / capacity) * 100;
}

export function classifyUtilization(
  percent: number | null,
): EngineerUtilizationRow["status"] {
  if (percent === null) {
    return "none";
  }
  if (percent > 100) {
    return "over";
  }
  // 0–50% light, 50–75% medium, >75% busy
  if (percent <= LIGHT_THRESHOLD) {
    return "light";
  }
  if (percent <= MEDIUM_THRESHOLD) {
    return "medium";
  }
  return "busy";
}

export function buildEngineerMonthStats(
  entries: UtilizationEntry[],
  engineerNames: string[],
  months: MonthCursor[],
  holidayDates: ReadonlySet<string> | readonly string[] = [],
): EngineerMonthStats[] {
  const engineers = resolveAnalysisEngineers(engineerNames);
  const rows: EngineerMonthStats[] = [];

  for (const engineerName of engineers) {
    for (const month of months) {
      const allotted = getEngineerAllottedForMonth(entries, engineerName, month);
      const capacity = getMonthCapacity(month, holidayDates);
      rows.push({
        engineerName,
        month,
        monthKey: monthCursorKey(month),
        monthLabel: formatMonthLabel(month),
        allotted,
        capacity,
        percent: utilizationPercent(allotted, capacity),
      });
    }
  }

  return rows;
}

export function buildFirmUtilizationByEngineer(
  monthStats: EngineerMonthStats[],
): EngineerUtilizationRow[] {
  const byEngineer = new Map<
    string,
    { allotted: number; capacity: number }
  >();

  for (const row of monthStats) {
    const current = byEngineer.get(row.engineerName) ?? {
      allotted: 0,
      capacity: 0,
    };
    current.allotted += row.allotted;
    current.capacity += row.capacity;
    byEngineer.set(row.engineerName, current);
  }

  return [...byEngineer.entries()]
    .map(([engineerName, totals]) => {
      const percent = utilizationPercent(totals.allotted, totals.capacity);
      return {
        engineerName,
        allotted: totals.allotted,
        capacity: totals.capacity,
        percent,
        status: classifyUtilization(percent),
      };
    })
    .sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1));
}

export function buildHeadcountPressure(
  monthStats: EngineerMonthStats[],
  months: MonthCursor[],
): FirmMonthPressure[] {
  return months.map((month) => {
    const monthKey = monthCursorKey(month);
    const rows = monthStats.filter((row) => row.monthKey === monthKey);
    const allotted = rows.reduce((sum, row) => sum + row.allotted, 0);
    const capacity = rows.reduce((sum, row) => sum + row.capacity, 0);

    return {
      monthKey,
      monthLabel: formatMonthLabel(month),
      allotted,
      capacity,
      percent: utilizationPercent(allotted, capacity),
    };
  });
}

export function buildAllottedVsCapacityByEngineerMonth(
  monthStats: EngineerMonthStats[],
): Array<{
  engineerName: string;
  monthKey: string;
  monthLabel: string;
  allotted: number;
  capacity: number;
}> {
  return monthStats.map((row) => ({
    engineerName: row.engineerName,
    monthKey: row.monthKey,
    monthLabel: row.monthLabel,
    allotted: row.allotted,
    capacity: row.capacity,
  }));
}

export function buildEngineerWeeklyStats(
  entries: UtilizationEntry[],
  engineerName: string,
  months: MonthCursor[],
  holidayDates: ReadonlySet<string> | readonly string[] = [],
): EngineerWeekStats[] {
  const rows: EngineerWeekStats[] = [];

  for (const month of months) {
    const monthKey = monthCursorKey(month);
    const weeks = getWorkWeeksForMonth(month, holidayDates);

    for (const week of weeks) {
      let allotted = 0;

      for (const entry of entries) {
        if (!isSameEngineerName(entry.engineerName, engineerName)) {
          continue;
        }

        const weekValues = entry.weekValuesByMonth[monthKey] ?? {};
        allotted += parseHours(weekValues[String(week.weekNumber)]);
      }

      rows.push({
        engineerName,
        month,
        monthKey,
        monthLabel: formatMonthLabel(month),
        weekNumber: week.weekNumber,
        weekLabel: `${formatMonthLabel(month)} W${week.weekNumber}`,
        allotted,
        capacity: week.capacityHours,
        percent: utilizationPercent(allotted, week.capacityHours),
      });
    }
  }

  return rows;
}

export function summarizeEngineerWeeks(weeks: EngineerWeekStats[]): {
  totalAllotted: number;
  totalCapacity: number;
  averagePercent: number | null;
} {
  const totalAllotted = weeks.reduce((sum, week) => sum + week.allotted, 0);
  const totalCapacity = weeks.reduce((sum, week) => sum + week.capacity, 0);
  const averagePercent = utilizationPercent(totalAllotted, totalCapacity);

  return {
    totalAllotted,
    totalCapacity,
    averagePercent,
  };
}

export type EngineerFocusProject = {
  projectCode: string;
  projectName: string;
  allotted: number;
};

/** Projects for an engineer that share the maximum allotted hours in range. */
export function buildEngineerFocusProjects(
  entries: UtilizationEntry[],
  engineerName: string,
  months: MonthCursor[],
): EngineerFocusProject[] {
  const monthKeys = new Set(months.map((month) => monthCursorKey(month)));
  const byProject = new Map<string, EngineerFocusProject>();

  for (const entry of entries) {
    if (!isSameEngineerName(entry.engineerName, engineerName)) {
      continue;
    }

    let allotted = 0;
    for (const [monthKey, weekValues] of Object.entries(
      entry.weekValuesByMonth,
    )) {
      if (!monthKeys.has(monthKey)) {
        continue;
      }
      for (const value of Object.values(weekValues)) {
        allotted += parseHours(value);
      }
    }

    if (allotted <= 0) {
      continue;
    }

    const key = `${entry.projectCode}::${entry.projectName}`.toLowerCase();
    const existing = byProject.get(key);
    if (existing) {
      existing.allotted += allotted;
    } else {
      byProject.set(key, {
        projectCode: entry.projectCode,
        projectName: entry.projectName,
        allotted,
      });
    }
  }

  const projects = [...byProject.values()];
  if (projects.length === 0) {
    return [];
  }

  const maxAllotted = Math.max(...projects.map((project) => project.allotted));
  return projects
    .filter((project) => project.allotted === maxAllotted)
    .sort((a, b) =>
      a.projectCode.localeCompare(b.projectCode, undefined, {
        sensitivity: "base",
      }),
    );
}

export type EngineerAvailableWeek = {
  weekLabel: string;
  allotted: number;
  capacity: number;
  available: number;
};

/** Weeks where allotted hours are less than capacity. */
export function buildEngineerAvailableWeeks(
  weeks: EngineerWeekStats[],
): EngineerAvailableWeek[] {
  return weeks
    .filter((week) => week.capacity > 0 && week.allotted < week.capacity)
    .map((week) => ({
      weekLabel: week.weekLabel,
      allotted: week.allotted,
      capacity: week.capacity,
      available: week.capacity - week.allotted,
    }));
}

export function hasAnyAllottedHours(entries: UtilizationEntry[]): boolean {
  for (const entry of entries) {
    for (const weekValues of Object.values(entry.weekValuesByMonth)) {
      for (const value of Object.values(weekValues)) {
        if (parseHours(value) > 0) {
          return true;
        }
      }
    }
  }
  return false;
}

export function formatAnalysisNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(1).replace(/\.0$/, "");
}

export function formatAnalysisPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)}%`;
}

export type AllottedMatrixWeekColumn = {
  key: string;
  label: string;
  monthKey: string;
  weekNumber: number;
  capacityHours: number;
};

export type AllottedMatrixProjectRow = {
  projectCode: string;
  projectName: string;
  hoursByWeek: Record<string, number>;
  total: number;
};

export type AllottedMatrixEngineerRow = {
  engineerName: string;
  projects: AllottedMatrixProjectRow[];
  hoursByWeek: Record<string, number>;
  total: number;
};

export type AllottedMatrix = {
  weeks: AllottedMatrixWeekColumn[];
  engineers: AllottedMatrixEngineerRow[];
};

function formatAllottedWeekLabel(month: MonthCursor, weekStartDate: string): string {
  const monthName = new Date(month.year, month.month - 1, 1).toLocaleString(
    "en-US",
    { month: "short" },
  );
  const start = weekStartDate.split("-");
  const monthNum = Number(start[1]);
  const dayNum = Number(start[2]);
  return `${monthName} Week ${monthNum}/${dayNum}/${month.year}`;
}

/** Engineer → project allotted hours across weeks in the selected months. */
export function buildAllottedMatrix(
  entries: UtilizationEntry[],
  engineerNames: string[],
  months: MonthCursor[],
  holidayDates: ReadonlySet<string> | readonly string[] = [],
): AllottedMatrix {
  const weeks: AllottedMatrixWeekColumn[] = [];

  for (const month of months) {
    const monthKey = monthCursorKey(month);
    for (const week of getWorkWeeksForMonth(month, holidayDates)) {
      weeks.push({
        key: `${monthKey}-W${week.weekNumber}`,
        label: formatAllottedWeekLabel(month, week.startDate),
        monthKey,
        weekNumber: week.weekNumber,
        capacityHours: week.capacityHours,
      });
    }
  }

  const selected = engineerNames
    .map((name) => name.trim())
    .filter(Boolean);

  const engineers: AllottedMatrixEngineerRow[] = [];

  for (const engineerName of selected) {
    const engineerEntries = entries.filter((entry) =>
      isSameEngineerName(entry.engineerName, engineerName),
    );

    const projects: AllottedMatrixProjectRow[] = engineerEntries
      .map((entry) => {
        const hoursByWeek: Record<string, number> = {};
        let total = 0;

        for (const week of weeks) {
          const raw =
            entry.weekValuesByMonth[week.monthKey]?.[String(week.weekNumber)];
          const hours = parseHours(raw);
          hoursByWeek[week.key] = hours;
          total += hours;
        }

        return {
          projectCode: entry.projectCode,
          projectName: entry.projectName,
          hoursByWeek,
          total,
        };
      })
      .filter((project) => project.total > 0)
      .sort((a, b) =>
        a.projectCode.localeCompare(b.projectCode, undefined, {
          sensitivity: "base",
        }),
      );

    const hoursByWeek: Record<string, number> = {};
    let total = 0;

    for (const week of weeks) {
      const sum = projects.reduce(
        (acc, project) => acc + (project.hoursByWeek[week.key] ?? 0),
        0,
      );
      hoursByWeek[week.key] = sum;
      total += sum;
    }

    engineers.push({
      engineerName,
      projects,
      hoursByWeek,
      total,
    });
  }

  return { weeks, engineers };
}

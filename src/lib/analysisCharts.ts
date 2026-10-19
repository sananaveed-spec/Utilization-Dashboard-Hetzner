import {
  resolveAnalysisEngineers,
  utilizationPercent,
} from "@/lib/analysis";
import { parseClockifyHoursKey } from "@/lib/clockify/hours";
import {
  isSameEngineerName,
  normalizeEngineerName,
} from "@/lib/engineers";
import type { UtilizationEntry } from "@/lib/entries";
import { projectLookupKey } from "@/lib/projects";
import {
  formatMonthLabel,
  getWorkWeeksForMonth,
  monthCursorKey,
  type MonthCursor,
} from "@/lib/weeks";

export type AnalysisDataMode = "planned" | "ats";

/** Same percentage bands as Overview util heat cells. */
export type HeatBand =
  | "0-25"
  | "25-50"
  | "50-75"
  | "75-100"
  | "over"
  | "none";

export type AnalysisWeekColumn = {
  key: string;
  label: string;
  monthKey: string;
  weekNumber: number;
  capacityHours: number;
  startDate: string;
  endDate: string;
};

export type HeatmapRow = {
  engineerName: string;
  cells: Array<{
    weekKey: string;
    hours: number;
    capacity: number;
    percent: number | null;
    band: HeatBand;
  }>;
};

export type TrendPoint = {
  weekKey: string;
  weekLabel: string;
  weeklyPercent: number | null;
  monthlyPercent: number | null;
};

export type PlannedVsActualRow = {
  name: string;
  planned: number;
  actual: number;
};

export type WorkloadSlice = {
  name: string;
  value: number;
};

export type ForecastPoint = {
  weekKey: string;
  weekLabel: string;
  plannedPercent: number | null;
  plannedHours: number;
  capacity: number;
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

export function classifyHeatBand(percent: number | null): HeatBand {
  if (percent === null) {
    return "none";
  }
  if (percent < 25) {
    return "0-25";
  }
  if (percent < 50) {
    return "25-50";
  }
  if (percent < 75) {
    return "50-75";
  }
  if (percent <= 100) {
    return "75-100";
  }
  return "over";
}

export function buildAnalysisWeekColumns(
  months: MonthCursor[],
  holidayDates: ReadonlySet<string> | readonly string[] = [],
): AnalysisWeekColumn[] {
  const weeks: AnalysisWeekColumn[] = [];
  for (const month of months) {
    const monthKey = monthCursorKey(month);
    const monthLabel = formatMonthLabel(month);
    for (const week of getWorkWeeksForMonth(month, holidayDates)) {
      weeks.push({
        key: `${monthKey}-W${week.weekNumber}`,
        label: `${monthLabel} W${week.weekNumber}`,
        monthKey,
        weekNumber: week.weekNumber,
        capacityHours: week.capacityHours,
        startDate: week.startDate,
        endDate: week.endDate,
      });
    }
  }
  return weeks;
}

/** Planned hours for engineer in a specific month week. */
function plannedHoursForEngineerWeek(
  entries: UtilizationEntry[],
  engineerName: string,
  monthKey: string,
  weekNumber: number,
): number {
  let total = 0;
  for (const entry of entries) {
    if (!isSameEngineerName(entry.engineerName, engineerName)) {
      continue;
    }
    total += parseHours(
      entry.weekValuesByMonth[monthKey]?.[String(weekNumber)],
    );
  }
  return total;
}

/** Sum ATS hours for an engineer in a month week from hoursByKey map. */
function atsHoursForEngineerWeek(
  hoursByKey: Record<string, number>,
  engineerName: string,
  weekNumber: number,
): number {
  const normalized = normalizeEngineerName(engineerName);
  let total = 0;
  for (const [key, hours] of Object.entries(hoursByKey)) {
    const parsed = parseClockifyHoursKey(key);
    if (!parsed) {
      continue;
    }
    if (
      parsed.weekNumber === weekNumber &&
      parsed.engineerName === normalized
    ) {
      total += hours;
    }
  }
  return total;
}

export type AtsHoursByMonth = Record<string, Record<string, number>>;

function hoursForEngineerWeek(
  mode: AnalysisDataMode,
  entries: UtilizationEntry[],
  atsByMonth: AtsHoursByMonth,
  engineerName: string,
  week: AnalysisWeekColumn,
): number {
  if (mode === "planned") {
    return plannedHoursForEngineerWeek(
      entries,
      engineerName,
      week.monthKey,
      week.weekNumber,
    );
  }
  return atsHoursForEngineerWeek(
    atsByMonth[week.monthKey] ?? {},
    engineerName,
    week.weekNumber,
  );
}

export function buildUtilizationHeatmap(
  mode: AnalysisDataMode,
  entries: UtilizationEntry[],
  engineerNames: string[],
  weeks: AnalysisWeekColumn[],
  atsByMonth: AtsHoursByMonth = {},
): HeatmapRow[] {
  const engineers = resolveAnalysisEngineers(engineerNames);
  return engineers.map((engineerName) => ({
    engineerName,
    cells: weeks.map((week) => {
      const hours = hoursForEngineerWeek(
        mode,
        entries,
        atsByMonth,
        engineerName,
        week,
      );
      const percent = utilizationPercent(hours, week.capacityHours);
      return {
        weekKey: week.key,
        hours,
        capacity: week.capacityHours,
        percent,
        band: classifyHeatBand(percent),
      };
    }),
  }));
}

export function buildBillabilityTrend(
  mode: AnalysisDataMode,
  entries: UtilizationEntry[],
  engineerNames: string[],
  weeks: AnalysisWeekColumn[],
  atsHoursByMonth: AtsHoursByMonth = {},
  atsBillableByMonth: AtsHoursByMonth = {},
): TrendPoint[] {
  const engineers = resolveAnalysisEngineers(engineerNames);
  const byMonth = new Map<string, { hours: number; capacity: number }>();

  for (const week of weeks) {
    const bucket = byMonth.get(week.monthKey) ?? { hours: 0, capacity: 0 };
    for (const engineerName of engineers) {
      if (mode === "ats") {
        bucket.hours += atsHoursForEngineerWeek(
          atsBillableByMonth[week.monthKey] ?? {},
          engineerName,
          week.weekNumber,
        );
      } else {
        bucket.hours += plannedHoursForEngineerWeek(
          entries,
          engineerName,
          week.monthKey,
          week.weekNumber,
        );
      }
      bucket.capacity += week.capacityHours;
    }
    byMonth.set(week.monthKey, bucket);
  }

  return weeks.map((week) => {
    let weekHours = 0;
    let weekCapacity = 0;
    for (const engineerName of engineers) {
      if (mode === "ats") {
        weekHours += atsHoursForEngineerWeek(
          atsBillableByMonth[week.monthKey] ?? {},
          engineerName,
          week.weekNumber,
        );
      } else {
        weekHours += hoursForEngineerWeek(
          "planned",
          entries,
          atsHoursByMonth,
          engineerName,
          week,
        );
      }
      weekCapacity += week.capacityHours;
    }
    const month = byMonth.get(week.monthKey);
    return {
      weekKey: week.key,
      weekLabel: week.label,
      weeklyPercent: utilizationPercent(weekHours, weekCapacity),
      monthlyPercent: month
        ? utilizationPercent(month.hours, month.capacity)
        : null,
    };
  });
}

export function buildPlannedVsActualByEngineer(
  entries: UtilizationEntry[],
  engineerNames: string[],
  weeks: AnalysisWeekColumn[],
  atsByMonth: AtsHoursByMonth,
  mode: AnalysisDataMode,
): PlannedVsActualRow[] {
  const engineers = resolveAnalysisEngineers(engineerNames);
  return engineers
    .map((engineerName) => {
      let planned = 0;
      let actual = 0;
      for (const week of weeks) {
        const p = plannedHoursForEngineerWeek(
          entries,
          engineerName,
          week.monthKey,
          week.weekNumber,
        );
        planned += p;
        if (mode === "ats") {
          actual += atsHoursForEngineerWeek(
            atsByMonth[week.monthKey] ?? {},
            engineerName,
            week.weekNumber,
          );
        } else {
          actual += p;
        }
      }
      return { name: engineerName, planned, actual };
    })
    .filter((row) => row.planned > 0 || row.actual > 0)
    .sort((a, b) => b.planned + b.actual - (a.planned + a.actual));
}

export function buildWorkloadSlices(
  mode: AnalysisDataMode,
  entries: UtilizationEntry[],
  engineerNames: string[],
  weeks: AnalysisWeekColumn[],
  atsHoursByMonth: AtsHoursByMonth,
  atsBillableByMonth: AtsHoursByMonth,
): WorkloadSlice[] {
  const engineers = resolveAnalysisEngineers(engineerNames);
  const monthKeys = new Set(weeks.map((week) => week.monthKey));

  if (mode === "ats") {
    let billable = 0;
    let total = 0;
    for (const week of weeks) {
      for (const engineerName of engineers) {
        const hours = atsHoursForEngineerWeek(
          atsHoursByMonth[week.monthKey] ?? {},
          engineerName,
          week.weekNumber,
        );
        const billed = atsHoursForEngineerWeek(
          atsBillableByMonth[week.monthKey] ?? {},
          engineerName,
          week.weekNumber,
        );
        total += hours;
        billable += billed;
      }
    }
    const nonBillable = Math.max(0, total - billable);
    return [
      { name: "Billable", value: Math.round(billable * 100) / 100 },
      { name: "Non-billable", value: Math.round(nonBillable * 100) / 100 },
    ].filter((slice) => slice.value > 0);
  }

  // Planned: hours by project
  const byProject = new Map<string, number>();
  for (const entry of entries) {
    if (
      !engineers.some((name) => isSameEngineerName(name, entry.engineerName))
    ) {
      continue;
    }
    let hours = 0;
    for (const [monthKey, weekValues] of Object.entries(
      entry.weekValuesByMonth,
    )) {
      if (!monthKeys.has(monthKey)) {
        continue;
      }
      for (const week of weeks) {
        if (week.monthKey !== monthKey) {
          continue;
        }
        hours += parseHours(weekValues[String(week.weekNumber)]);
      }
    }
    if (hours <= 0) {
      continue;
    }
    const label =
      entry.projectCode && entry.projectCode !== "—"
        ? `${entry.projectCode} ${entry.projectName}`.trim()
        : entry.projectName || entry.projectCode || "Other";
    byProject.set(label, (byProject.get(label) ?? 0) + hours);
  }

  return [...byProject.entries()]
    .map(([name, value]) => ({
      name,
      value: Math.round(value * 100) / 100,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
}

export function buildTopOverloaded(
  mode: AnalysisDataMode,
  entries: UtilizationEntry[],
  engineerNames: string[],
  weeks: AnalysisWeekColumn[],
  atsByMonth: AtsHoursByMonth,
  limit = 5,
): Array<{ name: string; percent: number; hours: number; capacity: number }> {
  const engineers = resolveAnalysisEngineers(engineerNames);
  return engineers
    .map((engineerName) => {
      let hours = 0;
      let capacity = 0;
      for (const week of weeks) {
        hours += hoursForEngineerWeek(
          mode,
          entries,
          atsByMonth,
          engineerName,
          week,
        );
        capacity += week.capacityHours;
      }
      return {
        name: engineerName,
        hours,
        capacity,
        percent: utilizationPercent(hours, capacity) ?? 0,
      };
    })
    .filter((row) => row.capacity > 0 && row.hours > 0)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, limit);
}

export function buildProjectUtilizationComparison(
  entries: UtilizationEntry[],
  engineerNames: string[],
  weeks: AnalysisWeekColumn[],
  atsByMonth: AtsHoursByMonth,
  mode: AnalysisDataMode,
): Array<{ project: string; planned: number; actual: number }> {
  const engineers = resolveAnalysisEngineers(engineerNames);
  const byProject = new Map<string, { planned: number; actual: number }>();

  for (const entry of entries) {
    if (
      !engineers.some((name) => isSameEngineerName(name, entry.engineerName))
    ) {
      continue;
    }
    let planned = 0;
    for (const week of weeks) {
      planned += parseHours(
        entry.weekValuesByMonth[week.monthKey]?.[String(week.weekNumber)],
      );
    }
    if (planned <= 0) {
      continue;
    }
    const label =
      entry.projectCode && entry.projectCode !== "—"
        ? `${entry.projectCode} ${entry.projectName}`.trim()
        : entry.projectName || "Other";
    const current = byProject.get(label) ?? { planned: 0, actual: 0 };
    current.planned += planned;
    byProject.set(label, current);
  }

  if (mode === "ats") {
    for (const week of weeks) {
      const hoursByKey = atsByMonth[week.monthKey] ?? {};
      for (const [key, hours] of Object.entries(hoursByKey)) {
        const parsed = parseClockifyHoursKey(key);
        if (!parsed || parsed.weekNumber !== week.weekNumber) {
          continue;
        }
        if (
          !engineers.some(
            (name) => normalizeEngineerName(name) === parsed.engineerName,
          )
        ) {
          continue;
        }
        // Prefer matching planned project label by lookup key when possible
        let matchedLabel: string | null = null;
        for (const entry of entries) {
          if (
            normalizeEngineerName(entry.engineerName) !== parsed.engineerName
          ) {
            continue;
          }
          const lookup = projectLookupKey(entry.projectCode, entry.projectName);
          if (lookup === parsed.projectCode) {
            matchedLabel =
              entry.projectCode && entry.projectCode !== "—"
                ? `${entry.projectCode} ${entry.projectName}`.trim()
                : entry.projectName || "Other";
            break;
          }
        }
        const label = matchedLabel ?? (parsed.projectCode || "Other");
        const current = byProject.get(label) ?? { planned: 0, actual: 0 };
        current.actual += hours;
        byProject.set(label, current);
      }
    }
  } else {
    for (const [label, totals] of byProject) {
      totals.actual = totals.planned;
      byProject.set(label, totals);
    }
  }

  return [...byProject.entries()]
    .map(([project, totals]) => ({
      project,
      planned: Math.round(totals.planned * 100) / 100,
      actual: Math.round(totals.actual * 100) / 100,
    }))
    .filter((row) => row.planned > 0 || row.actual > 0)
    .sort((a, b) => b.planned + b.actual - (a.planned + a.actual))
    .slice(0, 15);
}

export function buildFirmBillabilityKpi(
  mode: AnalysisDataMode,
  entries: UtilizationEntry[],
  engineerNames: string[],
  weeks: AnalysisWeekColumn[],
  atsHoursByMonth: AtsHoursByMonth,
  atsBillableByMonth: AtsHoursByMonth,
): { percent: number | null; hours: number; capacity: number } {
  const engineers = resolveAnalysisEngineers(engineerNames);
  let hours = 0;
  let capacity = 0;
  for (const week of weeks) {
    for (const engineerName of engineers) {
      if (mode === "ats") {
        hours += atsHoursForEngineerWeek(
          atsBillableByMonth[week.monthKey] ?? {},
          engineerName,
          week.weekNumber,
        );
      } else {
        hours += plannedHoursForEngineerWeek(
          entries,
          engineerName,
          week.monthKey,
          week.weekNumber,
        );
      }
      capacity += week.capacityHours;
    }
  }
  return {
    hours,
    capacity,
    percent: utilizationPercent(hours, capacity),
  };
}

/** Forecast uses planned A hours for upcoming weeks (including ATS mode). */
export function buildForecastUtilization(
  entries: UtilizationEntry[],
  engineerNames: string[],
  weeks: AnalysisWeekColumn[],
  todayKey = new Date().toISOString().slice(0, 10),
): ForecastPoint[] {
  const engineers = resolveAnalysisEngineers(engineerNames);
  return weeks
    .filter((week) => week.endDate >= todayKey)
    .map((week) => {
      let plannedHours = 0;
      let capacity = 0;
      for (const engineerName of engineers) {
        plannedHours += plannedHoursForEngineerWeek(
          entries,
          engineerName,
          week.monthKey,
          week.weekNumber,
        );
        capacity += week.capacityHours;
      }
      return {
        weekKey: week.key,
        weekLabel: week.label,
        plannedHours,
        capacity,
        plannedPercent: utilizationPercent(plannedHours, capacity),
      };
    });
}

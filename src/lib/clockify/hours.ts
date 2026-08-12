import { normalizeEngineerName } from "@/lib/engineers";
import { parseProjectParts, projectLookupKey } from "@/lib/projects";
import type { WorkWeek } from "@/lib/weeks";

/** Lookup key: normalized engineer + project identity + week number */
export function clockifyHoursKey(
  engineerName: string,
  projectCode: string,
  weekNumber: number,
  projectName = "",
): string {
  return `${normalizeEngineerName(engineerName)}::${projectLookupKey(projectCode, projectName)}::${weekNumber}`;
}

export function parseClockifyHoursKey(
  key: string,
): { engineerName: string; projectCode: string; weekNumber: number } | null {
  const parts = key.split("::");
  if (parts.length !== 3) {
    return null;
  }

  const weekNumber = Number(parts[2]);
  if (!Number.isInteger(weekNumber) || weekNumber < 1) {
    return null;
  }

  return {
    engineerName: parts[0],
    projectCode: parts[1],
    weekNumber,
  };
}

export function formatClockifyHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) {
    return "";
  }

  const rounded = Math.round(hours * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/\.?0+$/, "");
}

export function findWeekForDay(
  weeks: WorkWeek[],
  dayOfMonth: number,
): WorkWeek | undefined {
  return weeks.find(
    (week) => dayOfMonth >= week.startDay && dayOfMonth <= week.endDay,
  );
}

export function projectCodeFromClockifyName(projectName: string): string {
  return parseProjectParts(projectName).projectCode;
}

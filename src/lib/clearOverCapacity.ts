import { normalizeEngineerName } from "@/lib/engineers";
import type { UtilizationEntry } from "@/lib/entries";
import {
  getWorkWeeksForMonth,
  parseMonthCursorKey,
} from "@/lib/weeks";

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

function weekEntryLimit(week: {
  isWeekendOnly: boolean;
  dayCount: number;
  capacityHours: number;
}): number {
  // Same rule as Overview save validation.
  return week.isWeekendOnly ? week.dayCount * 8 : week.capacityHours;
}

/**
 * Clears allotted hour cells for engineer/month/weeks where the sum of
 * allotted hours exceeds Total Forecasted Hours (weekly capacity).
 * Returns a new entries array (does not mutate input).
 */
export function clearOverCapacityAllottedHours(
  entries: UtilizationEntry[],
  holidayDates: ReadonlySet<string> | readonly string[] = [],
): UtilizationEntry[] {
  if (entries.length === 0) {
    return entries;
  }

  const engineerKeys = [
    ...new Set(
      entries
        .map((entry) => normalizeEngineerName(entry.engineerName))
        .filter(Boolean),
    ),
  ];

  const monthKeys = new Set<string>();
  for (const entry of entries) {
    for (const monthKey of Object.keys(entry.weekValuesByMonth)) {
      monthKeys.add(monthKey);
    }
  }

  const clearKeys = new Set<string>();

  for (const engineerKey of engineerKeys) {
    const engineerEntries = entries.filter(
      (entry) => normalizeEngineerName(entry.engineerName) === engineerKey,
    );

    for (const monthKey of monthKeys) {
      const month = parseMonthCursorKey(monthKey);
      if (!month) {
        continue;
      }

      const weeks = getWorkWeeksForMonth(month, holidayDates);

      for (const week of weeks) {
        const weekId = String(week.weekNumber);
        let total = 0;

        for (const entry of engineerEntries) {
          total += parseHours(entry.weekValuesByMonth[monthKey]?.[weekId]);
        }

        const maxHours = weekEntryLimit(week);
        if (total > maxHours) {
          clearKeys.add(`${engineerKey}::${monthKey}::${weekId}`);
        }
      }
    }
  }

  if (clearKeys.size === 0) {
    return entries;
  }

  return entries.map((entry) => {
    const engineerKey = normalizeEngineerName(entry.engineerName);
    let changed = false;
    const nextByMonth: UtilizationEntry["weekValuesByMonth"] = {};

    for (const [monthKey, weekValues] of Object.entries(
      entry.weekValuesByMonth,
    )) {
      const nextWeeks: Record<string, string> = { ...weekValues };

      for (const weekId of Object.keys(weekValues)) {
        const clearKey = `${engineerKey}::${monthKey}::${weekId}`;
        if (clearKeys.has(clearKey) && weekValues[weekId]?.trim()) {
          nextWeeks[weekId] = "";
          changed = true;
        }
      }

      nextByMonth[monthKey] = nextWeeks;
    }

    if (!changed) {
      return entry;
    }

    return {
      ...entry,
      weekValuesByMonth: nextByMonth,
    };
  });
}

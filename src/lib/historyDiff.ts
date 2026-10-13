import type { UtilizationEntry } from "@/lib/entries";
import type { Holiday } from "@/lib/holidays";
import type { CalendarYearRange } from "@/lib/weeks";

const MAX_DETAIL_LINES = 40;

function entryKey(entry: UtilizationEntry): string {
  return `${entry.engineerName}::${entry.projectCode}::${entry.projectName}`.toLowerCase();
}

/** Concise week-hour deltas for utilization saves (truncated for history). */
export function summarizeUtilizationChanges(
  before: UtilizationEntry[],
  after: UtilizationEntry[],
): { summary: string; details: string; project: string } {
  const beforeMap = new Map(before.map((entry) => [entryKey(entry), entry]));
  const afterMap = new Map(after.map((entry) => [entryKey(entry), entry]));
  const lines: string[] = [];
  const engineers = new Set<string>();

  for (const [key, next] of afterMap) {
    const prev = beforeMap.get(key);
    if (!prev) {
      engineers.add(next.engineerName);
      lines.push(
        `Added ${next.engineerName} / ${next.projectCode || next.projectName}`,
      );
      continue;
    }

    const monthKeys = new Set([
      ...Object.keys(prev.weekValuesByMonth),
      ...Object.keys(next.weekValuesByMonth),
    ]);
    for (const monthKey of monthKeys) {
      const prevWeeks = prev.weekValuesByMonth[monthKey] ?? {};
      const nextWeeks = next.weekValuesByMonth[monthKey] ?? {};
      const weekNumbers = new Set([
        ...Object.keys(prevWeeks),
        ...Object.keys(nextWeeks),
      ]);
      for (const weekNumber of weekNumbers) {
        const from = (prevWeeks[weekNumber] ?? "").trim();
        const to = (nextWeeks[weekNumber] ?? "").trim();
        if (from === to) {
          continue;
        }
        engineers.add(next.engineerName);
        lines.push(
          `${next.engineerName} · ${next.projectCode || next.projectName} · ${monthKey} W${weekNumber}: "${from || "—"}" → "${to || "—"}"`,
        );
      }
    }
  }

  for (const [key, prev] of beforeMap) {
    if (afterMap.has(key)) {
      continue;
    }
    engineers.add(prev.engineerName);
    lines.push(
      `Removed ${prev.engineerName} / ${prev.projectCode || prev.projectName}`,
    );
  }

  const truncated = lines.slice(0, MAX_DETAIL_LINES);
  if (lines.length > MAX_DETAIL_LINES) {
    truncated.push(`…and ${lines.length - MAX_DETAIL_LINES} more changes`);
  }

  const engineerList = [...engineers];
  const project =
    engineerList.length === 1
      ? engineerList[0]
      : engineerList.length > 1
        ? `${engineerList.length} engineers`
        : "Utilization";

  return {
    project,
    summary:
      lines.length === 0
        ? "Utilization entries saved (no hour changes detected)"
        : `Updated utilization (${lines.length} change${lines.length === 1 ? "" : "s"})`,
    details: truncated.join("\n"),
  };
}

export function summarizeEngineerListChanges(
  before: string[],
  after: string[],
): { summary: string; details: string; action: "created" | "updated" | "deleted" } {
  const beforeSet = new Set(before.map((name) => name.trim()).filter(Boolean));
  const afterSet = new Set(after.map((name) => name.trim()).filter(Boolean));
  const added = [...afterSet].filter((name) => !beforeSet.has(name));
  const removed = [...beforeSet].filter((name) => !afterSet.has(name));
  const lines = [
    ...added.map((name) => `Added: ${name}`),
    ...removed.map((name) => `Removed: ${name}`),
  ];

  let action: "created" | "updated" | "deleted" = "updated";
  if (added.length > 0 && removed.length === 0 && before.length === 0) {
    action = "created";
  } else if (removed.length > 0 && added.length === 0 && after.length === 0) {
    action = "deleted";
  }

  return {
    action,
    summary:
      lines.length === 0
        ? "Engineer list saved"
        : `Engineer list updated (${lines.length} change${lines.length === 1 ? "" : "s"})`,
    details: lines.join("\n"),
  };
}

export function summarizeHolidayChanges(
  before: Holiday[],
  after: Holiday[],
): { summary: string; details: string; action: "created" | "updated" | "deleted" } {
  const keyOf = (holiday: Holiday) =>
    `${holiday.date}::${holiday.name}`.toLowerCase();
  const beforeMap = new Map(before.map((holiday) => [keyOf(holiday), holiday]));
  const afterMap = new Map(after.map((holiday) => [keyOf(holiday), holiday]));
  const lines: string[] = [];

  for (const [key, next] of afterMap) {
    if (!beforeMap.has(key)) {
      lines.push(`Added: ${next.date} ${next.name}`);
    }
  }
  for (const [key, prev] of beforeMap) {
    if (!afterMap.has(key)) {
      lines.push(`Removed: ${prev.date} ${prev.name}`);
    }
  }

  // Name/date edits show as remove+add; also catch id-stable renames if present
  for (const next of after) {
    const prev = before.find((holiday) => holiday.id === next.id);
    if (!prev) {
      continue;
    }
    if (prev.date !== next.date || prev.name !== next.name) {
      lines.push(
        `Updated: ${prev.date} ${prev.name} → ${next.date} ${next.name}`,
      );
    }
  }

  const uniqueLines = [...new Set(lines)];
  let action: "created" | "updated" | "deleted" = "updated";
  if (uniqueLines.every((line) => line.startsWith("Added:")) && before.length === 0) {
    action = "created";
  } else if (
    uniqueLines.every((line) => line.startsWith("Removed:")) &&
    after.length === 0
  ) {
    action = "deleted";
  }

  return {
    action,
    summary:
      uniqueLines.length === 0
        ? "Holidays saved"
        : `Holidays updated (${uniqueLines.length} change${uniqueLines.length === 1 ? "" : "s"})`,
    details: uniqueLines.join("\n"),
  };
}

export function summarizeCalendarChange(
  before: CalendarYearRange,
  after: CalendarYearRange,
): { summary: string; details: string } {
  return {
    summary: "Calendar year range updated",
    details: `Years: ${before.minYear}–${before.maxYear} → ${after.minYear}–${after.maxYear}`,
  };
}

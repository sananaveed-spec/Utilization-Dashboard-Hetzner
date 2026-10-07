"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  clockifyHoursKey,
  formatClockifyHours,
} from "@/lib/clockify/hours";
import { isSameEngineerName, normalizeEngineerName } from "@/lib/engineers";
import {
  createUtilizationEntry,
  type UtilizationEntry,
} from "@/lib/entries";
import {
  dateRangeSpansMultipleYears,
  formatFullMonthSpanLabel,
  listMonthsInDateRange,
  type DateRange,
} from "@/lib/dateRange";
import { isProjectCode, projectLookupKey } from "@/lib/projects";
import {
  getWorkWeeksForMonth,
  monthCursorKey,
  type MonthCursor,
} from "@/lib/weeks";

// ─── helpers ────────────────────────────────────────────────────────────────

function parseHours(value: string | undefined): number {
  if (!value?.trim()) return 0;
  const normalized = value.trim().replace(/,/g, "");
  const match = normalized.match(/-?\d+(\.\d+)?/);
  if (!match) return 0;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTotal(total: number): string {
  if (!Number.isFinite(total) || total <= 0) return "";
  return Number.isInteger(total)
    ? String(total)
    : total.toFixed(2).replace(/\.?0+$/, "");
}

function currentCalendarMonthKey(now = new Date()): string {
  return monthCursorKey({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
}

/** Hours / capacity × 100, or null when capacity is missing. */
function utilizationPercent(hours: number, allottedHours: number): number | null {
  if (!Number.isFinite(hours) || !Number.isFinite(allottedHours) || allottedHours <= 0) {
    return null;
  }
  const percent = (hours / allottedHours) * 100;
  return Number.isFinite(percent) ? percent : null;
}

/** Round to 1 decimal so color matches the displayed % label. */
function roundedUtilizationPercent(
  hours: number,
  allottedHours: number,
): number | null {
  const percent = utilizationPercent(hours, allottedHours);
  if (percent === null) return null;
  return Math.round(percent * 10) / 10;
}

/**
 * Heatmap bands (based on the rounded % shown in the cell):
 * 0–25 blue, 25–50 bluish green, 50–75 light green, 75–100 green, >100 red.
 */
function utilizationHeatClass(hours: number, allottedHours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "";
  const percent = roundedUtilizationPercent(hours, allottedHours);
  if (percent === null) return "";
  if (percent < 25) return "overview2-util-heat overview2-util-heat--0-25";
  if (percent < 50) return "overview2-util-heat overview2-util-heat--25-50";
  if (percent < 75) return "overview2-util-heat overview2-util-heat--50-75";
  if (percent <= 100) return "overview2-util-heat overview2-util-heat--75-100";
  return "overview2-util-heat overview2-util-heat--over";
}

function monthValueClass(
  monthKey: string,
  currentMonthKey: string,
  hours: number,
  allottedHours: number,
  weeksOpenForCurrent = false,
): string {
  const parts = [
    "overview2-results-value",
    "overview2-results-month-value",
  ];
  if (monthKey === currentMonthKey) {
    parts.push("overview2-results-month-value--current");
    if (weeksOpenForCurrent) {
      parts.push("overview2-results-month-value--current-open");
    }
  }
  const heat = utilizationHeatClass(hours, allottedHours);
  if (heat) parts.push(heat);
  return parts.join(" ");
}

function weekValueClass(
  hours: number,
  allottedHours: number,
  isCurrentMonthWeeks = false,
  weekIndex = 0,
  weekCount = 0,
): string {
  const parts = ["overview2-results-value", "overview2-results-week-value"];
  if (isCurrentMonthWeeks && weekCount > 0) {
    parts.push("overview2-results-week-value--current");
    if (weekIndex === weekCount - 1) {
      parts.push("overview2-results-week-value--current-end");
    }
  }
  const heat = utilizationHeatClass(hours, allottedHours);
  if (heat) parts.push(heat);
  return parts.join(" ");
}

/** Hours / total allotted hours × 100. Empty when allotted hours is 0. */
function formatUtilizationPercent(hours: number, allottedHours: number): string {
  const rounded = roundedUtilizationPercent(hours, allottedHours);
  if (rounded === null) return "";
  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)}%`;
}

function HoursWithUtilization({
  hours,
  allottedHours,
  preferClockifyFormat = false,
}: {
  hours: number;
  allottedHours: number;
  preferClockifyFormat?: boolean;
}) {
  const hoursLabel = preferClockifyFormat
    ? formatClockifyHours(hours) || formatTotal(hours)
    : formatTotal(hours);
  if (!hoursLabel) return null;
  const utilization = formatUtilizationPercent(hours, allottedHours);
  if (!utilization) return <>{hoursLabel}</>;
  return (
    <span className="overview2-hours-util">
      <span className="overview2-hours-util-hours">{hoursLabel}</span>
      <span className="overview2-hours-util-percent">{utilization}</span>
    </span>
  );
}

function sumClockifyForEngineer(
  engineerName: string,
  clockifyHoursByKey: Record<string, number>,
): number {
  const prefix = `${normalizeEngineerName(engineerName)}::`;
  let total = 0;
  for (const [key, hours] of Object.entries(clockifyHoursByKey)) {
    if (key.startsWith(prefix) && Number.isFinite(hours)) total += hours;
  }
  return total;
}

function projectLabel(entry: UtilizationEntry): string {
  if (entry.projectCode && entry.projectCode !== "—") {
    return entry.projectName && entry.projectName !== "—"
      ? `${entry.projectCode} — ${entry.projectName}`
      : entry.projectCode;
  }
  return entry.projectName || "—";
}

function sortProjectEntries(entries: UtilizationEntry[]): UtilizationEntry[] {
  return [...entries].sort((a, b) =>
    projectLabel(a).localeCompare(projectLabel(b), undefined, { sensitivity: "base" }),
  );
}

const ENGINEER_ACCENT_COLORS = [
  "#38bdf8", // sky
  "#34d399", // emerald
  "#a78bfa", // violet
  "#f472b6", // pink
  "#fbbf24", // amber
  "#2dd4bf", // teal
  "#60a5fa", // blue
  "#fb923c", // orange
] as const;

function engineerAccentColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return ENGINEER_ACCENT_COLORS[hash % ENGINEER_ACCENT_COLORS.length] ?? ENGINEER_ACCENT_COLORS[0];
}

function ProjectCodeCell({
  entry,
  rowSpan,
  onUpdate,
  readOnly = false,
}: {
  entry: UtilizationEntry;
  rowSpan: number;
  onUpdate: (row: UtilizationEntry) => void;
  readOnly?: boolean;
}) {
  const starred = Boolean(entry.starred);

  function toggleStar() {
    if (readOnly) {
      return;
    }
    const nextStarred = !starred;
    if (entry.id.startsWith("pending:")) {
      onUpdate(
        createUtilizationEntry({
          engineerName: entry.engineerName,
          projectCode: entry.projectCode,
          projectName: entry.projectName,
          weekValuesByMonth: entry.weekValuesByMonth,
          starred: nextStarred,
        }),
      );
      return;
    }
    onUpdate({ ...entry, starred: nextStarred });
  }

  return (
    <th
      scope="row"
      rowSpan={Math.max(rowSpan, 1)}
      className="overview2-results-project overview2-results-project-code"
    >
      <span className="overview2-project-code-cell">
        <button
          type="button"
          className={`overview2-star-button${starred ? " overview2-star-button--on" : ""}`}
          aria-label={starred ? "Unstar project" : "Star project"}
          aria-pressed={starred}
          title={
            readOnly
              ? "View only"
              : starred
                ? "Remove from important"
                : "Mark as important"
          }
          disabled={readOnly}
          onClick={(e) => {
            e.stopPropagation();
            toggleStar();
          }}
        >
          {starred ? "★" : "☆"}
        </button>
        <span className="overview2-project-code-text">
          {entry.projectCode || "—"}
        </span>
      </span>
    </th>
  );
}

function ProjectNameCell({ name }: { name: string }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canTruncate, setCanTruncate] = useState(false);

  useEffect(() => {
    const element = textRef.current;
    if (!element) return;
    function measure() {
      if (!textRef.current || expanded) return;
      setCanTruncate(textRef.current.scrollWidth > textRef.current.clientWidth + 1);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [name, expanded]);

  if (!name || name === "—") return <span className="project-name-text">{name || "—"}</span>;

  return (
    <div className="project-name-cell">
      <span
        ref={textRef}
        className={expanded ? "project-name-text project-name-text--expanded" : "project-name-text"}
        title={expanded ? undefined : name}
      >
        {name}
      </span>
      {canTruncate || expanded ? (
        <button type="button" className="project-name-toggle" onClick={() => setExpanded((c) => !c)}>
          {expanded ? "see less" : "see more"}
        </button>
      ) : null}
    </div>
  );
}

// ─── per-engineer row group ──────────────────────────────────────────────────

type VisibleProject = {
  projectCode: string;
  projectName: string;
};

type EngineerRowGroupProps = {
  engineerName: string;
  entries: UtilizationEntry[];
  visibleProjects: VisibleProject[];
  monthsInRange: MonthCursor[];
  monthCapacitiesByKey: Record<string, number>;
  /** Month whose week columns are shown / edited when weeks are expanded. */
  weeksMonth: MonthCursor;
  weeks: ReturnType<typeof getWorkWeeksForMonth>;
  weeksMonthKey: string;
  weeksExpanded: boolean;
  allottedExpanded: boolean;
  actualExpanded: boolean;
  currentMonthKey: string;
  clockifyHoursByMonth: Record<string, Record<string, number>>;
  clockifyHoursLoading: boolean;
  onUpdate: (row: UtilizationEntry) => void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
};

function EngineerRowGroup({
  engineerName,
  entries,
  visibleProjects,
  monthsInRange,
  monthCapacitiesByKey,
  weeksMonth,
  weeks,
  weeksMonthKey,
  weeksExpanded,
  allottedExpanded,
  actualExpanded,
  currentMonthKey,
  clockifyHoursByMonth,
  clockifyHoursLoading,
  onUpdate,
  onDelete,
  readOnly = false,
}: EngineerRowGroupProps) {
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const [codedExpanded, setCodedExpanded] = useState(false);
  const [uncodedExpanded, setUncodedExpanded] = useState(false);
  const [projectQuery, setProjectQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftWeeks, setDraftWeeks] = useState<Record<string, string>>({});
  const [editError, setEditError] = useState<string | null>(null);

  function collapseHiddenProjectSections() {
    setCodedExpanded(false);
    setUncodedExpanded(false);
  }

  useEffect(() => {
    setProjectsExpanded(false);
    collapseHiddenProjectSections();
    setProjectQuery("");
    setEditingId(null);
    setDraftWeeks({});
    setEditError(null);
  }, [weeksMonth.year, weeksMonth.month, engineerName]);

  useEffect(() => {
    if (!weeksExpanded) {
      setEditingId(null);
      setDraftWeeks({});
      setEditError(null);
    }
  }, [weeksExpanded]);

  const engineerEntries = useMemo(
    () => entries.filter((e) => isSameEngineerName(e.engineerName, engineerName)),
    [entries, engineerName],
  );

  const {
    starredProjectRows,
    codedUnstarredProjectRows,
    uncodedUnstarredProjectRows,
    allProjectRows,
  } = useMemo(() => {
    const starred: UtilizationEntry[] = [];
    const codedUnstarred: UtilizationEntry[] = [];
    const uncodedUnstarred: UtilizationEntry[] = [];

    for (const project of visibleProjects) {
      const lookupKey = projectLookupKey(
        project.projectCode,
        project.projectName,
      );
      const existing = engineerEntries.find(
        (entry) =>
          projectLookupKey(entry.projectCode, entry.projectName) === lookupKey,
      );
      const entry: UtilizationEntry = existing ?? {
        id: `pending:${normalizeEngineerName(engineerName)}:${lookupKey}`,
        engineerName,
        projectCode: project.projectCode,
        projectName: project.projectName,
        weekValuesByMonth: {},
      };

      if (entry.starred) {
        starred.push(entry);
      } else if (isProjectCode(entry.projectCode)) {
        codedUnstarred.push(entry);
      } else {
        uncodedUnstarred.push(entry);
      }
    }

    const starredProjectRows = sortProjectEntries(starred);
    const codedUnstarredProjectRows = sortProjectEntries(codedUnstarred);
    const uncodedUnstarredProjectRows = sortProjectEntries(uncodedUnstarred);

    return {
      starredProjectRows,
      codedUnstarredProjectRows,
      uncodedUnstarredProjectRows,
      allProjectRows: [
        ...starredProjectRows,
        ...codedUnstarredProjectRows,
        ...uncodedUnstarredProjectRows,
      ],
    };
  }, [engineerEntries, engineerName, visibleProjects]);

  const normalizedProjectQuery = projectQuery.trim().toLowerCase();
  const isProjectSearching = normalizedProjectQuery.length > 0;

  const projectRows = useMemo(() => {
    if (isProjectSearching) {
      return allProjectRows.filter((entry) => {
        const code = entry.projectCode.toLowerCase();
        const name = entry.projectName.toLowerCase();
        return (
          code.includes(normalizedProjectQuery) ||
          name.includes(normalizedProjectQuery)
        );
      });
    }

    const rows = [...starredProjectRows];
    if (codedExpanded) rows.push(...codedUnstarredProjectRows);
    if (uncodedExpanded) rows.push(...uncodedUnstarredProjectRows);
    return rows;
  }, [
    allProjectRows,
    starredProjectRows,
    codedUnstarredProjectRows,
    uncodedUnstarredProjectRows,
    codedExpanded,
    uncodedExpanded,
    isProjectSearching,
    normalizedProjectQuery,
  ]);

  const monthKeysInRange = useMemo(
    () => monthsInRange.map((cursor) => monthCursorKey(cursor)),
    [monthsInRange],
  );

  const activeClockifyHours = clockifyHoursByMonth[weeksMonthKey] ?? {};

  function weekValuesForMonth(entry: UtilizationEntry, targetMonthKey: string) {
    if (editingId === entry.id && targetMonthKey === weeksMonthKey) {
      return draftWeeks;
    }
    return entry.weekValuesByMonth[targetMonthKey] ?? {};
  }

  function sumAssignedForMonth(entry: UtilizationEntry, targetMonthKey: string): number {
    const weekValues = weekValuesForMonth(entry, targetMonthKey);
    let total = 0;
    for (const value of Object.values(weekValues)) {
      total += parseHours(value);
    }
    return total;
  }

  const weekTotals = useMemo(
    () =>
      weeks.map((week) => {
        const weekId = String(week.weekNumber);
        let assigned = 0;
        let clockify = 0;
        for (const entry of engineerEntries) {
          const values =
            editingId === entry.id
              ? draftWeeks
              : (entry.weekValuesByMonth[weeksMonthKey] ?? {});
          assigned += parseHours(values[weekId]);
          clockify +=
            activeClockifyHours[
              clockifyHoursKey(
                entry.engineerName,
                entry.projectCode,
                week.weekNumber,
                entry.projectName,
              )
            ] ?? 0;
        }
        return { assigned, clockify };
      }),
    [weeks, engineerEntries, weeksMonthKey, activeClockifyHours, editingId, draftWeeks],
  );

  const monthTotals = useMemo(
    () =>
      monthKeysInRange.map((rangeMonthKey) => {
        let assigned = 0;
        for (const entry of engineerEntries) {
          assigned += sumAssignedForMonth(entry, rangeMonthKey);
        }
        const clockify = sumClockifyForEngineer(
          engineerName,
          clockifyHoursByMonth[rangeMonthKey] ?? {},
        );
        return { monthKey: rangeMonthKey, assigned, clockify };
      }),
    // sumAssignedForMonth reads editing draft state intentionally
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      monthKeysInRange,
      engineerEntries,
      engineerName,
      clockifyHoursByMonth,
      editingId,
      draftWeeks,
      weeksMonthKey,
    ],
  );

  const projectWeekTotals = useMemo(
    () =>
      projectRows.map((entry) => {
        const values =
          editingId === entry.id
            ? draftWeeks
            : (entry.weekValuesByMonth[weeksMonthKey] ?? {});
        const byMonth = monthKeysInRange.map((rangeMonthKey) => {
          const assigned = sumAssignedForMonth(entry, rangeMonthKey);
          const monthHours = clockifyHoursByMonth[rangeMonthKey] ?? {};
          let clockify = 0;
          for (let weekNumber = 1; weekNumber <= 6; weekNumber += 1) {
            clockify +=
              monthHours[
                clockifyHoursKey(
                  entry.engineerName,
                  entry.projectCode,
                  weekNumber,
                  entry.projectName,
                )
              ] ?? 0;
          }
          return { monthKey: rangeMonthKey, assigned, clockify };
        });
        const byWeek = weeks.map((week) => {
          const assigned = parseHours(values[String(week.weekNumber)]);
          const clockify =
            activeClockifyHours[
              clockifyHoursKey(
                entry.engineerName,
                entry.projectCode,
                week.weekNumber,
                entry.projectName,
              )
            ] ?? 0;
          return {
            assigned,
            clockify,
            rawValue: values[String(week.weekNumber)] ?? "",
          };
        });
        return { entry, byMonth, byWeek };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      projectRows,
      weeks,
      weeksMonthKey,
      activeClockifyHours,
      clockifyHoursByMonth,
      editingId,
      draftWeeks,
      monthKeysInRange,
    ],
  );

  const emptyColSpan =
    3 +
    monthKeysInRange.length +
    (weeksExpanded ? weeks.length + 1 : 0);
  const engineerAccentStyle = {
    ["--engineer-accent" as string]: engineerAccentColor(engineerName),
  };
  const showCodedToggle =
    projectsExpanded &&
    !isProjectSearching &&
    codedUnstarredProjectRows.length > 0;
  const showUncodedToggle =
    projectsExpanded &&
    !isProjectSearching &&
    uncodedUnstarredProjectRows.length > 0;
  const showHiddenProjectToggles = showCodedToggle || showUncodedToggle;
  const hasEmptyProjectsMessage =
    projectsExpanded &&
    projectWeekTotals.length === 0 &&
    !showHiddenProjectToggles;
  const hasProjectRows = projectsExpanded && projectWeekTotals.length > 0;
  const hasTrailingRows =
    hasEmptyProjectsMessage || hasProjectRows || showHiddenProjectToggles;

  const metricHeaderRows = [
    ...(allottedExpanded ? (["allotted"] as const) : []),
    ...(actualExpanded ? (["actual"] as const) : []),
  ];
  const metricHeaderCount = metricHeaderRows.length;
  const nameRowSpan = Math.max(metricHeaderCount, 1);

  function blockClass(kind: "start" | "end" | "start-end" | "middle"): string {
    if (kind === "start") {
      return "overview2-engineer-block overview2-engineer-block--start";
    }
    if (kind === "end") {
      return "overview2-engineer-block overview2-engineer-block--end";
    }
    if (kind === "start-end") {
      return "overview2-engineer-block overview2-engineer-block--start overview2-engineer-block--end";
    }
    return "overview2-engineer-block";
  }

  function metricRowKind(
    row: "allotted" | "actual" | "fallback",
  ): "start" | "end" | "start-end" | "middle" {
    if (row === "fallback") {
      return hasTrailingRows ? "start" : "start-end";
    }
    const index = metricHeaderRows.indexOf(row);
    if (index < 0) return "middle";
    const isFirst = index === 0;
    const isLast = index === metricHeaderRows.length - 1;
    if (isFirst && isLast && !hasTrailingRows) return "start-end";
    if (isFirst) return "start";
    if (isLast && !hasTrailingRows) return "end";
    return "middle";
  }

  function stickySlotClass(
    row: "allotted" | "actual" | "fallback",
  ): string {
    if (row === "fallback") {
      return "overview2-sticky-slot-1";
    }
    const index = metricHeaderRows.indexOf(row);
    if (index < 0) return "";
    return `overview2-sticky-slot-${index + 1}`;
  }

  const lastProjectIndex = projectWeekTotals.length - 1;

  function handleDelete(row: UtilizationEntry) {
    if (readOnly) return;
    if (!window.confirm(`Delete row for "${row.engineerName}" / "${row.projectCode}"?`)) return;
    if (editingId === row.id) { setEditingId(null); setDraftWeeks({}); setEditError(null); }
    onDelete(row.id);
  }

  function startEditing(row: UtilizationEntry) {
    if (readOnly) return;
    setEditingId(row.id);
    setDraftWeeks(row.weekValuesByMonth[weeksMonthKey] ?? {});
    setEditError(null);
  }

  function cancelEditing() { setEditingId(null); setDraftWeeks({}); setEditError(null); }

  function saveEditing(row: UtilizationEntry) {
    onUpdate({
      ...row,
      weekValuesByMonth: {
        ...row.weekValuesByMonth,
        [weeksMonthKey]: { ...draftWeeks },
      },
    });
    setEditingId(null);
    setDraftWeeks({});
    setEditError(null);
  }

  function updateWeekValue(weekNumber: number, value: string) {
    setEditError(null);
    setDraftWeeks((c) => ({ ...c, [String(weekNumber)]: value }));
  }

  function toggleProjectsExpanded() {
    setProjectsExpanded((current) => {
      const next = !current;
      if (!next) {
        collapseHiddenProjectSections();
        setProjectQuery("");
      }
      return next;
    });
  }

  function handleProjectQueryChange(value: string) {
    setProjectQuery(value);
    if (value.trim()) {
      setProjectsExpanded(true);
    }
  }

  const engineerHeader = (
    <span className="overview2-engineer-header">
      <span className="overview2-engineer-name">{engineerName}</span>
      <button
        type="button"
        className="overview2-expand-button"
        onClick={toggleProjectsExpanded}
        aria-expanded={projectsExpanded}
        disabled={Boolean(editingId)}
        aria-label={
          projectsExpanded ? "Hide active projects" : "Show active projects"
        }
      >
        {projectsExpanded ? "−" : "+"}
      </button>
      <input
        type="search"
        className="overview2-project-search"
        value={projectQuery}
        onChange={(event) => handleProjectQueryChange(event.target.value)}
        onFocus={() => setProjectsExpanded(true)}
        placeholder="Search ID or name…"
        aria-label={`Search projects for ${engineerName}`}
        disabled={Boolean(editingId)}
      />
    </span>
  );

  return (
    <>
      {editError ? (
        <tr className={blockClass("middle")} style={engineerAccentStyle}>
          <td colSpan={emptyColSpan}>
            <p className="form-message error" role="alert">{editError}</p>
          </td>
        </tr>
      ) : null}

      {/* Engineer allotted row */}
      {allottedExpanded ? (
      <tr
        className={`overview2-engineer-row overview2-engineer-row--allotted ${stickySlotClass("allotted")} ${blockClass(metricRowKind("allotted"))}`}
        style={engineerAccentStyle}
      >
        <th
          scope="row"
          rowSpan={nameRowSpan}
          colSpan={2}
          className="overview2-results-engineer"
        >
          {engineerHeader}
        </th>
        <th scope="row" className="overview2-results-metric">Planned Hours</th>
        {monthTotals.map((totals) => (
          <Fragment key={`${engineerName}-assigned-block-${totals.monthKey}`}>
            <td
              className={monthValueClass(
                totals.monthKey,
                currentMonthKey,
                totals.assigned,
                monthCapacitiesByKey[totals.monthKey] ?? 0,
                weeksExpanded && weeksMonthKey === currentMonthKey,
              )}
            >
              <HoursWithUtilization
                hours={totals.assigned}
                allottedHours={monthCapacitiesByKey[totals.monthKey] ?? 0}
              />
            </td>
            {weeksExpanded && totals.monthKey === weeksMonthKey
              ? weekTotals.map((weekTotal, index) => (
                  <td
                    key={`${engineerName}-assigned-${totals.monthKey}-w${weeks[index]?.weekNumber ?? index}`}
                    className={weekValueClass(
                      weekTotal.assigned,
                      weeks[index]?.capacityHours ?? 0,
                      weeksMonthKey === currentMonthKey,
                      index,
                      weeks.length,
                    )}
                  >
                    <HoursWithUtilization
                      hours={weekTotal.assigned}
                      allottedHours={weeks[index]?.capacityHours ?? 0}
                    />
                  </td>
                ))
              : null}
          </Fragment>
        ))}
        {weeksExpanded ? <td className="actions-cell" /> : null}
      </tr>
      ) : null}

      {/* Engineer actual row */}
      {actualExpanded ? (
      <tr
        className={`overview2-engineer-row ${allottedExpanded ? "overview2-engineer-row--actual" : "overview2-engineer-row--allotted overview2-engineer-row--actual-only"} ${stickySlotClass("actual")} ${blockClass(metricRowKind("actual"))}`}
        style={engineerAccentStyle}
      >
        {!allottedExpanded ? (
          <th
            scope="row"
            rowSpan={nameRowSpan}
            colSpan={2}
            className="overview2-results-engineer"
          >
            {engineerHeader}
          </th>
        ) : null}
        <th scope="row" className="overview2-results-metric">Actual Hours</th>
        {monthTotals.map((totals) => (
          <Fragment key={`${engineerName}-clockify-block-${totals.monthKey}`}>
            <td
              className={monthValueClass(
                totals.monthKey,
                currentMonthKey,
                totals.clockify,
                monthCapacitiesByKey[totals.monthKey] ?? 0,
                weeksExpanded && weeksMonthKey === currentMonthKey,
              )}
            >
              {clockifyHoursLoading
                ? "…"
                : <HoursWithUtilization
                    hours={totals.clockify}
                    allottedHours={monthCapacitiesByKey[totals.monthKey] ?? 0}
                    preferClockifyFormat
                  />}
            </td>
            {weeksExpanded && totals.monthKey === weeksMonthKey
              ? weekTotals.map((weekTotal, index) => (
                  <td
                    key={`${engineerName}-clockify-${totals.monthKey}-w${weeks[index]?.weekNumber ?? index}`}
                    className={weekValueClass(
                      weekTotal.clockify,
                      weeks[index]?.capacityHours ?? 0,
                      weeksMonthKey === currentMonthKey,
                      index,
                      weeks.length,
                    )}
                  >
                    {clockifyHoursLoading
                      ? "…"
                      : <HoursWithUtilization
                          hours={weekTotal.clockify}
                          allottedHours={weeks[index]?.capacityHours ?? 0}
                          preferClockifyFormat
                        />}
                  </td>
                ))
              : null}
          </Fragment>
        ))}
        {weeksExpanded ? <td className="actions-cell" /> : null}
      </tr>
      ) : null}

      {/* Fallback name row when all metric rows are hidden */}
      {!allottedExpanded && !actualExpanded ? (
      <tr
        className={`overview2-engineer-row overview2-engineer-row--allotted ${stickySlotClass("fallback")} ${blockClass(metricRowKind("fallback"))}`}
        style={engineerAccentStyle}
      >
        <th
          scope="row"
          colSpan={2}
          className="overview2-results-engineer"
        >
          {engineerHeader}
        </th>
        <td colSpan={1 + monthKeysInRange.length + (weeksExpanded ? weeks.length : 0)} />
        {weeksExpanded ? <td className="actions-cell" /> : null}
      </tr>
      ) : null}

      {/* Project rows */}
      {projectsExpanded && projectWeekTotals.length === 0 ? (
        <tr
          className={blockClass(showHiddenProjectToggles ? "middle" : "end")}
          style={engineerAccentStyle}
        >
          <td colSpan={emptyColSpan} className="overview2-results-empty">
            {isProjectSearching
              ? `No lifetime projects match “${projectQuery.trim()}”.`
              : "No project has been selected for this engineer from their lifetime active projects in ATS."}
          </td>
        </tr>
      ) : null}

      {projectsExpanded
        ? projectWeekTotals.map(({ entry, byMonth, byWeek }, projectIndex) => {
            const isEditing = editingId === entry.id;
            const isLastProject = projectIndex === lastProjectIndex;
            const allottedIsEnd =
              isLastProject && !showHiddenProjectToggles && !actualExpanded;
            const actualIsEnd = isLastProject && !showHiddenProjectToggles;
            const projectNameRowSpan =
              (allottedExpanded ? 1 : 0) + (actualExpanded ? 1 : 0);
            return (
              <Fragment key={entry.id}>
                {allottedExpanded ? (
                <tr
                  className={`overview2-project-row overview2-project-row--allotted ${blockClass(allottedIsEnd ? "end" : "middle")}`}
                  style={engineerAccentStyle}
                >
                  <ProjectCodeCell
                    entry={entry}
                    rowSpan={projectNameRowSpan}
                    onUpdate={onUpdate}
                    readOnly={readOnly}
                  />
                  <th scope="row" rowSpan={Math.max(projectNameRowSpan, 1)} className="overview2-results-project overview2-results-project-name" title={entry.projectName}>
                    <ProjectNameCell name={entry.projectName} />
                  </th>
                  <th scope="row" className="overview2-results-metric">Planned Hours</th>
                  {byMonth.map((totals) => (
                    <Fragment key={`${entry.id}-a-block-${totals.monthKey}`}>
                      <td
                        className={monthValueClass(
                          totals.monthKey,
                          currentMonthKey,
                          totals.assigned,
                          monthCapacitiesByKey[totals.monthKey] ?? 0,
                          weeksExpanded && weeksMonthKey === currentMonthKey,
                        )}
                      >
                        <HoursWithUtilization
                          hours={totals.assigned}
                          allottedHours={monthCapacitiesByKey[totals.monthKey] ?? 0}
                        />
                      </td>
                      {weeksExpanded && totals.monthKey === weeksMonthKey
                        ? byWeek.map((weekTotal, index) => {
                            const week = weeks[index];
                            if (!week) return null;
                            return (
                              <td
                                key={`${entry.id}-a-${totals.monthKey}-w${week.weekNumber}`}
                                className={weekValueClass(
                                  weekTotal.assigned,
                                  week.capacityHours,
                                  weeksMonthKey === currentMonthKey,
                                  index,
                                  byWeek.length,
                                )}
                              >
                                {isEditing ? (
                                  <input
                                    className="week-input"
                                    type="text"
                                    inputMode="decimal"
                                    aria-label={`${entry.projectCode} week ${week.weekNumber} planned`}
                                    value={weekTotal.rawValue}
                                    onChange={(e) => updateWeekValue(week.weekNumber, e.target.value)}
                                  />
                                ) : (
                                  <HoursWithUtilization
                                    hours={weekTotal.assigned}
                                    allottedHours={week.capacityHours}
                                  />
                                )}
                              </td>
                            );
                          })
                        : null}
                    </Fragment>
                  ))}
                  {weeksExpanded ? (
                  <td className="actions-cell">
                    <div className="row-actions">
                      {isEditing ? (
                        <>
                          <button type="button" className="icon-button icon-button--save" onClick={() => saveEditing(entry)} aria-label="Save" title="Save">✓</button>
                          <button type="button" className="icon-button icon-button--cancel" onClick={cancelEditing} aria-label="Cancel" title="Cancel">×</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="icon-button icon-button--edit" onClick={() => startEditing(entry)} disabled={Boolean(editingId) || readOnly} aria-label="Edit" title="Edit">✎</button>
                          <button type="button" className="icon-button icon-button--delete" onClick={() => handleDelete(entry)} disabled={(Boolean(editingId) && editingId !== entry.id) || readOnly} aria-label="Delete" title="Delete">×</button>
                        </>
                      )}
                    </div>
                  </td>
                  ) : null}
                </tr>
                ) : null}
                {actualExpanded ? (
                <tr
                  className={`overview2-project-row overview2-project-row--actual ${blockClass(actualIsEnd ? "end" : "middle")}`}
                  style={engineerAccentStyle}
                >
                  {!allottedExpanded ? (
                    <>
                      <ProjectCodeCell
                        entry={entry}
                        rowSpan={projectNameRowSpan}
                        onUpdate={onUpdate}
                        readOnly={readOnly}
                      />
                      <th scope="row" rowSpan={Math.max(projectNameRowSpan, 1)} className="overview2-results-project overview2-results-project-name" title={entry.projectName}>
                        <ProjectNameCell name={entry.projectName} />
                      </th>
                    </>
                  ) : null}
                  <th scope="row" className="overview2-results-metric">Actual Hours</th>
                  {byMonth.map((totals) => (
                    <Fragment key={`${entry.id}-c-block-${totals.monthKey}`}>
                      <td
                        className={monthValueClass(
                          totals.monthKey,
                          currentMonthKey,
                          totals.clockify,
                          monthCapacitiesByKey[totals.monthKey] ?? 0,
                          weeksExpanded && weeksMonthKey === currentMonthKey,
                        )}
                      >
                        {clockifyHoursLoading
                          ? "…"
                          : <HoursWithUtilization
                              hours={totals.clockify}
                              allottedHours={monthCapacitiesByKey[totals.monthKey] ?? 0}
                              preferClockifyFormat
                            />}
                      </td>
                      {weeksExpanded && totals.monthKey === weeksMonthKey
                        ? byWeek.map((weekTotal, index) => (
                            <td
                              key={`${entry.id}-c-${totals.monthKey}-w${weeks[index]?.weekNumber ?? index}`}
                              className={weekValueClass(
                                weekTotal.clockify,
                                weeks[index]?.capacityHours ?? 0,
                                weeksMonthKey === currentMonthKey,
                                index,
                                weeks.length,
                              )}
                            >
                              {clockifyHoursLoading
                                ? "…"
                                : <HoursWithUtilization
                                    hours={weekTotal.clockify}
                                    allottedHours={weeks[index]?.capacityHours ?? 0}
                                    preferClockifyFormat
                                  />}
                            </td>
                          ))
                        : null}
                    </Fragment>
                  ))}
                  {weeksExpanded ? (
                  <td className="actions-cell">
                    {!allottedExpanded ? (
                      <div className="row-actions">
                        {isEditing ? (
                          <>
                            <button type="button" className="icon-button icon-button--save" onClick={() => saveEditing(entry)} aria-label="Save" title="Save">✓</button>
                            <button type="button" className="icon-button icon-button--cancel" onClick={cancelEditing} aria-label="Cancel" title="Cancel">×</button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="icon-button icon-button--edit" onClick={() => startEditing(entry)} disabled={Boolean(editingId) || readOnly} aria-label="Edit" title="Edit">✎</button>
                            <button type="button" className="icon-button icon-button--delete" onClick={() => handleDelete(entry)} disabled={(Boolean(editingId) && editingId !== entry.id) || readOnly} aria-label="Delete" title="Delete">×</button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </td>
                  ) : null}
                </tr>
                ) : null}
              </Fragment>
            );
          })
        : null}

      {showHiddenProjectToggles ? (
        <tr
          className={`overview2-uncoded-toggle-row ${blockClass("end")}`}
          style={engineerAccentStyle}
        >
          <td
            colSpan={2}
            className="overview2-uncoded-toggle-cell overview2-uncoded-toggle-cell--pin"
          >
            <div className="overview2-more-toggles">
              {!codedExpanded && !uncodedExpanded ? (
                <span className="overview2-more-toggles-label">see more</span>
              ) : null}
              {showCodedToggle ? (
                <button
                  type="button"
                  className="overview2-uncoded-toggle"
                  onClick={() => {
                    setCodedExpanded((current) => {
                      const next = !current;
                      if (!next && editingId) {
                        const editingHidden = codedUnstarredProjectRows.some(
                          (entry) => entry.id === editingId,
                        );
                        if (editingHidden) {
                          setEditingId(null);
                          setDraftWeeks({});
                          setEditError(null);
                        }
                      }
                      return next;
                    });
                  }}
                  aria-expanded={codedExpanded}
                >
                  {codedExpanded
                    ? "see less with codes"
                    : `with codes (${codedUnstarredProjectRows.length})`}
                </button>
              ) : null}
              {showCodedToggle && showUncodedToggle ? (
                <span className="overview2-more-toggles-sep" aria-hidden="true">
                  ·
                </span>
              ) : null}
              {showUncodedToggle ? (
                <button
                  type="button"
                  className="overview2-uncoded-toggle"
                  onClick={() => {
                    setUncodedExpanded((current) => {
                      const next = !current;
                      if (!next && editingId) {
                        const editingHidden = uncodedUnstarredProjectRows.some(
                          (entry) => entry.id === editingId,
                        );
                        if (editingHidden) {
                          setEditingId(null);
                          setDraftWeeks({});
                          setEditError(null);
                        }
                      }
                      return next;
                    });
                  }}
                  aria-expanded={uncodedExpanded}
                >
                  {uncodedExpanded
                    ? "see less without code"
                    : `without code (${uncodedUnstarredProjectRows.length})`}
                </button>
              ) : null}
            </div>
          </td>
          <td
            colSpan={Math.max(emptyColSpan - 2, 1)}
            className="overview2-uncoded-toggle-fill"
          />
        </tr>
      ) : null}
    </>
  );
}

type TeamSummaryRowsProps = {
  engineerNames: string[];
  entries: UtilizationEntry[];
  monthsInRange: MonthCursor[];
  monthCapacitiesByKey: Record<string, number>;
  weeks: ReturnType<typeof getWorkWeeksForMonth>;
  weeksMonthKey: string;
  weeksExpanded: boolean;
  allottedExpanded: boolean;
  actualExpanded: boolean;
  currentMonthKey: string;
  clockifyHoursByMonth: Record<string, Record<string, number>>;
  billableHoursByMonth: Record<string, Record<string, number>>;
  clockifyHoursLoading: boolean;
};

function TeamSummaryRows({
  engineerNames,
  entries,
  monthsInRange,
  monthCapacitiesByKey,
  weeks,
  weeksMonthKey,
  weeksExpanded,
  allottedExpanded,
  actualExpanded,
  currentMonthKey,
  clockifyHoursByMonth,
  billableHoursByMonth,
  clockifyHoursLoading,
}: TeamSummaryRowsProps) {
  const teamSize = engineerNames.length;
  const monthKeysInRange = useMemo(
    () => monthsInRange.map((cursor) => monthCursorKey(cursor)),
    [monthsInRange],
  );

  const teamEntries = useMemo(() => {
    const nameSet = new Set(
      engineerNames.map((name) => normalizeEngineerName(name)),
    );
    return entries.filter((entry) =>
      nameSet.has(normalizeEngineerName(entry.engineerName)),
    );
  }, [entries, engineerNames]);

  const monthTotals = useMemo(
    () =>
      monthKeysInRange.map((rangeMonthKey) => {
        let assigned = 0;
        for (const entry of teamEntries) {
          const weekValues = entry.weekValuesByMonth[rangeMonthKey] ?? {};
          for (const value of Object.values(weekValues)) {
            assigned += parseHours(value);
          }
        }
        let clockify = 0;
        let billable = 0;
        const monthHours = clockifyHoursByMonth[rangeMonthKey] ?? {};
        const monthBillable = billableHoursByMonth[rangeMonthKey] ?? {};
        for (const name of engineerNames) {
          clockify += sumClockifyForEngineer(name, monthHours);
          billable += sumClockifyForEngineer(name, monthBillable);
        }
        return { monthKey: rangeMonthKey, assigned, clockify, billable };
      }),
    [
      monthKeysInRange,
      teamEntries,
      clockifyHoursByMonth,
      billableHoursByMonth,
      engineerNames,
    ],
  );

  const weekTotals = useMemo(
    () =>
      weeks.map((week) => {
        const weekId = String(week.weekNumber);
        let assigned = 0;
        let clockify = 0;
        let billable = 0;
        const monthHours = clockifyHoursByMonth[weeksMonthKey] ?? {};
        const monthBillable = billableHoursByMonth[weeksMonthKey] ?? {};
        for (const entry of teamEntries) {
          assigned += parseHours(
            entry.weekValuesByMonth[weeksMonthKey]?.[weekId],
          );
          clockify +=
            monthHours[
              clockifyHoursKey(
                entry.engineerName,
                entry.projectCode,
                week.weekNumber,
                entry.projectName,
              )
            ] ?? 0;
        }
        const weekSuffix = `::${week.weekNumber}`;
        for (const name of engineerNames) {
          const prefix = `${normalizeEngineerName(name)}::`;
          for (const [key, hours] of Object.entries(monthBillable)) {
            if (!key.startsWith(prefix) || !key.endsWith(weekSuffix)) continue;
            if (!Number.isFinite(hours)) continue;
            billable += hours;
          }
        }
        return { assigned, clockify, billable };
      }),
    [
      weeks,
      teamEntries,
      weeksMonthKey,
      clockifyHoursByMonth,
      billableHoursByMonth,
      engineerNames,
    ],
  );

  const metricRows = [
    ...(allottedExpanded ? (["allotted"] as const) : []),
    ...(actualExpanded ? (["actual", "billable"] as const) : []),
  ];
  const teamAccentStyle = { ["--engineer-accent" as string]: "#94a3b8" };
  const firstFooterRow = allottedExpanded
    ? "allotted"
    : actualExpanded
      ? "actual"
      : null;

  function rowKind(row: "allotted" | "actual" | "billable"): string {
    const index = metricRows.indexOf(row);
    if (index < 0) return "overview2-engineer-block";
    const isFirst = index === 0;
    const isLast = index === metricRows.length - 1;
    if (isFirst && isLast) {
      return "overview2-engineer-block overview2-engineer-block--start overview2-engineer-block--end";
    }
    if (isFirst) return "overview2-engineer-block overview2-engineer-block--start";
    if (isLast) return "overview2-engineer-block overview2-engineer-block--end";
    return "overview2-engineer-block";
  }

  function teamLabelCell(row: "allotted" | "actual" | "billable") {
    if (firstFooterRow !== row) return null;
    return (
      <th
        scope="row"
        colSpan={2}
        rowSpan={metricRows.length}
        className="overview2-results-engineer overview2-team-label"
      >
        Team
      </th>
    );
  }

  if (teamSize === 0 || metricRows.length === 0) return null;

  return (
    <>
      {allottedExpanded ? (
        <tr
          className={`overview2-engineer-row overview2-engineer-row--allotted overview2-team-row ${rowKind("allotted")}`}
          style={teamAccentStyle}
        >
          {teamLabelCell("allotted")}
          <th scope="row" className="overview2-results-metric">
            Planned Hours
          </th>
          {monthTotals.map((totals) => (
            <Fragment key={`team-assigned-${totals.monthKey}`}>
              <td
                className={monthValueClass(
                  totals.monthKey,
                  currentMonthKey,
                  totals.assigned,
                  (monthCapacitiesByKey[totals.monthKey] ?? 0) * teamSize,
                  weeksExpanded && weeksMonthKey === currentMonthKey,
                )}
              >
                <HoursWithUtilization
                  hours={totals.assigned}
                  allottedHours={(monthCapacitiesByKey[totals.monthKey] ?? 0) * teamSize}
                />
              </td>
              {weeksExpanded && totals.monthKey === weeksMonthKey
                ? weekTotals.map((weekTotal, index) => (
                    <td
                      key={`team-assigned-w${weeks[index]?.weekNumber ?? index}`}
                      className={weekValueClass(
                        weekTotal.assigned,
                        (weeks[index]?.capacityHours ?? 0) * teamSize,
                        weeksMonthKey === currentMonthKey,
                        index,
                        weeks.length,
                      )}
                    >
                      <HoursWithUtilization
                        hours={weekTotal.assigned}
                        allottedHours={(weeks[index]?.capacityHours ?? 0) * teamSize}
                      />
                    </td>
                  ))
                : null}
            </Fragment>
          ))}
          {weeksExpanded ? <td className="actions-cell" /> : null}
        </tr>
      ) : null}

      {actualExpanded ? (
        <tr
          className={`overview2-engineer-row ${allottedExpanded ? "overview2-engineer-row--actual" : "overview2-engineer-row--allotted overview2-engineer-row--actual-only"} overview2-team-row ${rowKind("actual")}`}
          style={teamAccentStyle}
        >
          {teamLabelCell("actual")}
          <th scope="row" className="overview2-results-metric">
            Actual Hours
          </th>
          {monthTotals.map((totals) => (
            <Fragment key={`team-clockify-${totals.monthKey}`}>
              <td
                className={monthValueClass(
                  totals.monthKey,
                  currentMonthKey,
                  totals.clockify,
                  (monthCapacitiesByKey[totals.monthKey] ?? 0) * teamSize,
                  weeksExpanded && weeksMonthKey === currentMonthKey,
                )}
              >
                {clockifyHoursLoading
                  ? "…"
                  : <HoursWithUtilization
                      hours={totals.clockify}
                      allottedHours={(monthCapacitiesByKey[totals.monthKey] ?? 0) * teamSize}
                      preferClockifyFormat
                    />}
              </td>
              {weeksExpanded && totals.monthKey === weeksMonthKey
                ? weekTotals.map((weekTotal, index) => (
                    <td
                      key={`team-clockify-w${weeks[index]?.weekNumber ?? index}`}
                      className={weekValueClass(
                        weekTotal.clockify,
                        (weeks[index]?.capacityHours ?? 0) * teamSize,
                        weeksMonthKey === currentMonthKey,
                        index,
                        weeks.length,
                      )}
                    >
                      {clockifyHoursLoading
                        ? "…"
                        : <HoursWithUtilization
                            hours={weekTotal.clockify}
                            allottedHours={(weeks[index]?.capacityHours ?? 0) * teamSize}
                            preferClockifyFormat
                          />}
                    </td>
                  ))
                : null}
            </Fragment>
          ))}
          {weeksExpanded ? <td className="actions-cell" /> : null}
        </tr>
      ) : null}

      {actualExpanded ? (
        <tr
          className={`overview2-engineer-row overview2-engineer-row--actual overview2-team-row overview2-team-row--billable ${rowKind("billable")}`}
          style={teamAccentStyle}
        >
          {teamLabelCell("billable")}
          <th scope="row" className="overview2-results-metric">
            Billable Hours
          </th>
          {monthTotals.map((totals) => (
            <Fragment key={`team-billable-${totals.monthKey}`}>
              <td
                className={monthValueClass(
                  totals.monthKey,
                  currentMonthKey,
                  totals.billable,
                  (monthCapacitiesByKey[totals.monthKey] ?? 0) * teamSize,
                  weeksExpanded && weeksMonthKey === currentMonthKey,
                )}
              >
                {clockifyHoursLoading
                  ? "…"
                  : <HoursWithUtilization
                      hours={totals.billable}
                      allottedHours={(monthCapacitiesByKey[totals.monthKey] ?? 0) * teamSize}
                      preferClockifyFormat
                    />}
              </td>
              {weeksExpanded && totals.monthKey === weeksMonthKey
                ? weekTotals.map((weekTotal, index) => (
                    <td
                      key={`team-billable-w${weeks[index]?.weekNumber ?? index}`}
                      className={weekValueClass(
                        weekTotal.billable,
                        (weeks[index]?.capacityHours ?? 0) * teamSize,
                        weeksMonthKey === currentMonthKey,
                        index,
                        weeks.length,
                      )}
                    >
                      {clockifyHoursLoading
                        ? "…"
                        : <HoursWithUtilization
                            hours={weekTotal.billable}
                            allottedHours={(weeks[index]?.capacityHours ?? 0) * teamSize}
                            preferClockifyFormat
                          />}
                    </td>
                  ))
                : null}
            </Fragment>
          ))}
          {weeksExpanded ? <td className="actions-cell" /> : null}
        </tr>
      ) : null}
    </>
  );
}

// ─── grouped results (single month nav + one table for all engineers) ────────

export type GroupedEngineerResult = {
  engineerName: string;
  visibleProjects: VisibleProject[];
  onUpdate: (row: UtilizationEntry) => void;
  onDelete: (id: string) => void;
};

type Overview2GroupedResultsProps = {
  engineers: GroupedEngineerResult[];
  entries: UtilizationEntry[];
  month: MonthCursor;
  dateRange: DateRange;
  holidayDates?: readonly string[];
  clockifyHoursByMonth?: Record<string, Record<string, number>>;
  billableHoursByMonth?: Record<string, Record<string, number>>;
  clockifyHoursLoading?: boolean;
  clockifyHoursError?: string | null;
  readOnly?: boolean;
  hideTeamFooter?: boolean;
};

export function Overview2GroupedResults({
  engineers,
  entries,
  month,
  dateRange,
  holidayDates = [],
  clockifyHoursByMonth = {},
  billableHoursByMonth = {},
  clockifyHoursLoading = false,
  clockifyHoursError = null,
  readOnly = false,
  hideTeamFooter = false,
}: Overview2GroupedResultsProps) {
  const [expandedMonthKey, setExpandedMonthKey] = useState<string | null>(null);
  const [allottedExpanded, setAllottedExpanded] = useState(true);
  const [actualExpanded, setActualExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    setExpandedMonthKey(null);
  }, [dateRange.start, dateRange.end]);

  useEffect(() => {
    const scroll = scrollRef.current;
    const headerRow = headerRowRef.current;
    if (!scroll || !headerRow) return;
    function syncStickyOffsets() {
      if (!scroll || !headerRow) return;
      const headerHeight = headerRow.getBoundingClientRect().height;
      scroll.style.setProperty(
        "--overview2-sticky-header-height",
        `${headerHeight}px`,
      );

      const tbody = scroll.querySelector(".overview2-engineer-tbody");
      // Prefer a non-rowspan cell — the name cell rowspan can skew <tr> height.
      const slotHeight = (row: Element | null | undefined) => {
        if (!row) return 0;
        const cell =
          row.querySelector(".overview2-results-metric") ??
          row.querySelector(".overview2-results-value") ??
          row;
        return cell.getBoundingClientRect().height;
      };
      const slot1 = tbody?.querySelector(".overview2-sticky-slot-1");
      const slot2 = tbody?.querySelector(".overview2-sticky-slot-2");
      const h1 = slotHeight(slot1);
      const h2 = slotHeight(slot2) || h1;

      if (h1 > 0) {
        scroll.style.setProperty(
          "--overview2-sticky-engineer-row-height",
          `${h1}px`,
        );
        // 1px overlap prevents a hairline gap where scrolled content shows through.
        scroll.style.setProperty(
          "--overview2-sticky-slot-2-top",
          `${headerHeight + h1 - 1}px`,
        );
        scroll.style.setProperty(
          "--overview2-sticky-slot-3-top",
          `${headerHeight + h1 + h2 - 1}px`,
        );
      }

      const teamTbody = scroll.querySelector(".overview2-team-tbody");
      const teamRows = teamTbody?.querySelectorAll(".overview2-team-row");
      const lastTeamRow = teamRows?.[teamRows.length - 1] ?? null;
      const teamRowHeight = slotHeight(lastTeamRow);
      if (teamRowHeight > 0) {
        scroll.style.setProperty(
          "--overview2-sticky-team-row-height",
          `${teamRowHeight}px`,
        );
      }
    }
    syncStickyOffsets();
    const observer = new ResizeObserver(syncStickyOffsets);
    observer.observe(headerRow);
    const tbody = scroll.querySelector(".overview2-engineer-tbody");
    const slot1 = tbody?.querySelector(".overview2-sticky-slot-1");
    const slot2 = tbody?.querySelector(".overview2-sticky-slot-2");
    if (slot1) observer.observe(slot1);
    if (slot2) observer.observe(slot2);
    const teamTbody = scroll.querySelector(".overview2-team-tbody");
    if (teamTbody) observer.observe(teamTbody);
    window.addEventListener("resize", syncStickyOffsets);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncStickyOffsets);
    };
  }, [
    expandedMonthKey,
    dateRange.start,
    dateRange.end,
    allottedExpanded,
    actualExpanded,
    engineers.length,
  ]);

  /**
   * Pin the viewport so the current month sits just after the sticky name/metric
   * columns. Scrolling left then moves backward through earlier months.
   */
  useEffect(() => {
    function scrollCurrentMonthIntoView() {
      const root = scrollRef.current;
      if (!root) return;

      const currentHeader = root.querySelector<HTMLElement>(
        "th.overview2-results-date--current",
      );
      if (!currentHeader) return;

      const identity = root.querySelector<HTMLElement>(
        "th.overview2-results-identity-header",
      );
      const metric = root.querySelector<HTMLElement>(
        "th.overview2-results-metric-header",
      );
      const stickyWidth =
        (identity?.getBoundingClientRect().width ?? 0) +
        (metric?.getBoundingClientRect().width ?? 0);

      // offsetLeft is relative to the table; subtract sticky pane so Sep sits next to Planned.
      const target = Math.max(0, currentHeader.offsetLeft - stickyWidth);
      root.scrollLeft = target;
    }

    // Wait a frame so sticky widths / col layout are settled.
    const id = window.requestAnimationFrame(() => {
      scrollCurrentMonthIntoView();
      window.requestAnimationFrame(scrollCurrentMonthIntoView);
    });
    return () => window.cancelAnimationFrame(id);
  }, [
    dateRange.start,
    dateRange.end,
    expandedMonthKey,
    engineers.length,
    allottedExpanded,
    actualExpanded,
  ]);

  const monthsInRange = useMemo(
    () => listMonthsInDateRange(dateRange),
    [dateRange],
  );
  const includeMonthYear = useMemo(
    () => dateRangeSpansMultipleYears(dateRange),
    [dateRange],
  );
  const fallbackMonth = month;
  const weeksMonth = useMemo(() => {
    if (!expandedMonthKey) return fallbackMonth;
    return (
      monthsInRange.find((cursor) => monthCursorKey(cursor) === expandedMonthKey) ??
      fallbackMonth
    );
  }, [expandedMonthKey, monthsInRange, fallbackMonth]);
  const weeksMonthKey = monthCursorKey(weeksMonth);
  const weeksExpanded = expandedMonthKey !== null;
  const currentMonthKey = currentCalendarMonthKey();
  const weeks = useMemo(
    () => (weeksExpanded ? getWorkWeeksForMonth(weeksMonth, holidayDates) : []),
    [weeksExpanded, weeksMonth, holidayDates],
  );
  const monthForecastedHours = useMemo(
    () =>
      monthsInRange.map((cursor) =>
        getWorkWeeksForMonth(cursor, holidayDates).reduce(
          (monthSum, week) => monthSum + week.capacityHours,
          0,
        ),
      ),
    [monthsInRange, holidayDates],
  );
  const monthCapacitiesByKey = useMemo(() => {
    const map: Record<string, number> = {};
    monthsInRange.forEach((cursor, index) => {
      map[monthCursorKey(cursor)] = monthForecastedHours[index] ?? 0;
    });
    return map;
  }, [monthsInRange, monthForecastedHours]);

  function toggleMonthWeeks(cursorKey: string) {
    setExpandedMonthKey((current) => (current === cursorKey ? null : cursorKey));
  }

  if (engineers.length === 0) return null;

  return (
    <div className="overview2-results">
      {clockifyHoursError ? (
        <p className="form-message error" role="alert">ATS hours: {clockifyHoursError}</p>
      ) : null}

      <div className="overview2-results-scroll" ref={scrollRef}>
        <table className="overview2-results-table">
          <colgroup>
            <col className="overview2-col-code" />
            <col className="overview2-col-name" />
            <col className="overview2-col-metric" />
            {monthsInRange.map((cursor) => {
              const cursorKey = monthCursorKey(cursor);
              const isExpanded = expandedMonthKey === cursorKey;
              return (
                <Fragment key={`cols-${cursorKey}`}>
                  <col className="overview2-col-month" />
                  {isExpanded
                    ? weeks.map((week) => (
                        <col
                          key={`col-w-${cursorKey}-${week.weekNumber}`}
                          className="overview2-col-week"
                        />
                      ))
                    : null}
                </Fragment>
              );
            })}
            {weeksExpanded ? <col className="overview2-col-actions" /> : null}
          </colgroup>
          <thead>
            <tr className="overview2-header-row" ref={headerRowRef}>
              <th scope="col" colSpan={2} className="overview2-results-identity-header">
                EMPLOYEES ({engineers.length})
              </th>
              <th scope="col" className="overview2-results-metric-header">
                <span className="overview2-metric-header-group">
                  <span
                    className="overview2-metric-toggle-label"
                    title="Toggle Planned Hours rows"
                  >
                    Planned
                    <button
                      type="button"
                      className="overview2-expand-button"
                      onClick={() => setAllottedExpanded((c) => !c)}
                      aria-expanded={allottedExpanded}
                      aria-label={allottedExpanded ? "Hide planned hours" : "Show planned hours"}
                    >
                      {allottedExpanded ? "−" : "+"}
                    </button>
                  </span>
                  <span
                    className="overview2-metric-toggle-label"
                    title="Toggle Actual Hours rows"
                  >
                    Actual
                    <button
                      type="button"
                      className="overview2-expand-button"
                      onClick={() => setActualExpanded((c) => !c)}
                      aria-expanded={actualExpanded}
                      aria-label={actualExpanded ? "Hide actual hours" : "Show actual hours"}
                    >
                      {actualExpanded ? "−" : "+"}
                    </button>
                  </span>
                </span>
              </th>
              {monthsInRange.map((cursor, index) => {
                const cursorKey = monthCursorKey(cursor);
                const isExpanded = expandedMonthKey === cursorKey;
                const isCurrentMonth = cursorKey === currentMonthKey;
                return (
                  <Fragment key={cursorKey}>
                    <th
                      scope="col"
                      className={
                        isCurrentMonth
                          ? isExpanded
                            ? "overview2-results-date overview2-results-date--current overview2-results-date--current-open"
                            : "overview2-results-date overview2-results-date--current"
                          : "overview2-results-date"
                      }
                    >
                      <span className="overview2-month-header">
                        <span className="overview2-month-label">
                          <span>{formatFullMonthSpanLabel(cursor, { includeYear: includeMonthYear })}</span>
                          <span
                            className="overview2-month-forecast"
                            title="Total Forecasted Hours"
                          >
                            ({monthForecastedHours[index] ?? 0})
                          </span>
                        </span>
                        <button
                          type="button"
                          className="overview2-expand-button"
                          onClick={() => toggleMonthWeeks(cursorKey)}
                          aria-expanded={isExpanded}
                          aria-label={
                            isExpanded
                              ? `Hide weeks for ${formatFullMonthSpanLabel(cursor, { includeYear: includeMonthYear })}`
                              : `Show weeks for ${formatFullMonthSpanLabel(cursor, { includeYear: includeMonthYear })}`
                          }
                        >
                          {isExpanded ? "−" : "+"}
                        </button>
                      </span>
                    </th>
                    {isExpanded
                      ? weeks.map((week, weekIndex) => (
                          <th
                            key={`${cursorKey}-w${week.weekNumber}`}
                            scope="col"
                            className={
                              isCurrentMonth
                                ? weekIndex === weeks.length - 1
                                  ? "overview2-results-week overview2-results-week--current overview2-results-week--current-end"
                                  : "overview2-results-week overview2-results-week--current"
                                : "overview2-results-week"
                            }
                            title={`Total Forecasted Hours: ${week.capacityHours}`}
                          >
                            <span className="overview2-week-label">W{week.weekNumber}</span>
                            <span className="overview2-week-forecast">({week.capacityHours})</span>
                          </th>
                        ))
                      : null}
                  </Fragment>
                );
              })}
              {weeksExpanded ? (
                <th scope="col" className="overview2-results-actions">Actions</th>
              ) : null}
            </tr>
          </thead>
          {engineers.map((eng) => (
            <tbody key={eng.engineerName} className="overview2-engineer-tbody">
              <EngineerRowGroup
                engineerName={eng.engineerName}
                entries={entries}
                visibleProjects={eng.visibleProjects}
                monthsInRange={monthsInRange}
                monthCapacitiesByKey={monthCapacitiesByKey}
                weeksMonth={weeksMonth}
                weeks={weeks}
                weeksMonthKey={weeksMonthKey}
                weeksExpanded={weeksExpanded}
                allottedExpanded={allottedExpanded}
                actualExpanded={actualExpanded}
                currentMonthKey={currentMonthKey}
                clockifyHoursByMonth={clockifyHoursByMonth}
                clockifyHoursLoading={clockifyHoursLoading}
                onUpdate={eng.onUpdate}
                onDelete={eng.onDelete}
                readOnly={readOnly}
              />
            </tbody>
          ))}
          {!hideTeamFooter ? (
            <tbody className="overview2-team-tbody">
              <TeamSummaryRows
                engineerNames={engineers.map((eng) => eng.engineerName)}
                entries={entries}
                monthsInRange={monthsInRange}
                monthCapacitiesByKey={monthCapacitiesByKey}
                weeks={weeks}
                weeksMonthKey={weeksMonthKey}
                weeksExpanded={weeksExpanded}
                allottedExpanded={allottedExpanded}
                actualExpanded={actualExpanded}
                currentMonthKey={currentMonthKey}
                clockifyHoursByMonth={clockifyHoursByMonth}
                billableHoursByMonth={billableHoursByMonth}
                clockifyHoursLoading={clockifyHoursLoading}
              />
            </tbody>
          ) : null}
        </table>
      </div>
    </div>
  );
}

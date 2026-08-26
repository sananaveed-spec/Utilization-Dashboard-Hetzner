"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { SearchableSelect } from "@/components/SearchableSelect";
import { getEngineerAllottedForMonth } from "@/lib/analysis";
import {
  clockifyHoursKey,
  formatClockifyHours,
} from "@/lib/clockify/hours";
import { isSameEngineerName, normalizeEngineerName } from "@/lib/engineers";
import type { UtilizationEntry } from "@/lib/entries";
import {
  canShiftMonth,
  formatMonthLabel,
  getCurrentMonthCursor,
  getWorkWeeksForMonth,
  listMonthsInRange,
  monthCursorKey,
  parseMonthCursorKey,
  shiftMonth,
  type CalendarYearRange,
  type MonthCursor,
} from "@/lib/weeks";

type Overview2ResultsTableProps = {
  engineerName: string;
  entries: UtilizationEntry[];
  visibleProjectIds: string[];
  month?: MonthCursor;
  onMonthChange: (next: MonthCursor) => void;
  calendarYearRange: CalendarYearRange;
  holidayDates?: readonly string[];
  clockifyHoursByKey?: Record<string, number>;
  clockifyHoursLoading?: boolean;
  clockifyHoursError?: string | null;
  onUpdate: (row: UtilizationEntry) => void;
  onDelete: (id: string) => void;
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

function formatTotal(total: number): string {
  if (!Number.isFinite(total) || total <= 0) {
    return "";
  }

  return Number.isInteger(total)
    ? String(total)
    : total.toFixed(2).replace(/\.?0+$/, "");
}

function sumClockifyForEngineer(
  engineerName: string,
  clockifyHoursByKey: Record<string, number>,
): number {
  const prefix = `${normalizeEngineerName(engineerName)}::`;
  let total = 0;

  for (const [key, hours] of Object.entries(clockifyHoursByKey)) {
    if (key.startsWith(prefix) && Number.isFinite(hours)) {
      total += hours;
    }
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

function Overview2ProjectNameCell({ name }: { name: string }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canTruncate, setCanTruncate] = useState(false);

  useEffect(() => {
    const element = textRef.current;
    if (!element) {
      return;
    }

    function measure() {
      if (!textRef.current || expanded) {
        return;
      }
      setCanTruncate(
        textRef.current.scrollWidth > textRef.current.clientWidth + 1,
      );
    }

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [name, expanded]);

  if (!name || name === "—") {
    return <span className="project-name-text">{name || "—"}</span>;
  }

  return (
    <div className="project-name-cell">
      <span
        ref={textRef}
        className={
          expanded
            ? "project-name-text project-name-text--expanded"
            : "project-name-text"
        }
        title={expanded ? undefined : name}
      >
        {name}
      </span>
      {canTruncate || expanded ? (
        <button
          type="button"
          className="project-name-toggle"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "see less" : "see more"}
        </button>
      ) : null}
    </div>
  );
}

export function Overview2ResultsTable({
  engineerName,
  entries,
  visibleProjectIds,
  month = getCurrentMonthCursor(),
  onMonthChange,
  calendarYearRange,
  holidayDates = [],
  clockifyHoursByKey = {},
  clockifyHoursLoading = false,
  clockifyHoursError = null,
  onUpdate,
  onDelete,
}: Overview2ResultsTableProps) {
  const [weeksExpanded, setWeeksExpanded] = useState(true);
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftWeeks, setDraftWeeks] = useState<Record<string, string>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRowRef = useRef<HTMLTableRowElement>(null);
  const engineerAllottedRowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    setWeeksExpanded(true);
    setProjectsExpanded(false);
    setEditingId(null);
    setDraftWeeks({});
    setEditError(null);
  }, [month.year, month.month, engineerName]);

  useEffect(() => {
    const scroll = scrollRef.current;
    const headerRow = headerRowRef.current;
    const engineerRow = engineerAllottedRowRef.current;
    if (!scroll || !headerRow || !engineerRow) {
      return;
    }

    function syncStickyOffsets() {
      if (!scroll || !headerRow || !engineerRow) {
        return;
      }
      const headerHeight = headerRow.getBoundingClientRect().height;
      const allottedHeight = engineerRow.getBoundingClientRect().height;
      scroll.style.setProperty(
        "--overview2-sticky-header-height",
        `${headerHeight}px`,
      );
      scroll.style.setProperty(
        "--overview2-sticky-engineer-row-height",
        `${allottedHeight}px`,
      );
      scroll.style.setProperty(
        "--overview2-sticky-slot-2-top",
        `${headerHeight + allottedHeight - 1}px`,
      );
    }

    syncStickyOffsets();

    const observer = new ResizeObserver(syncStickyOffsets);
    observer.observe(headerRow);
    observer.observe(engineerRow);
    window.addEventListener("resize", syncStickyOffsets);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncStickyOffsets);
    };
  }, [weeksExpanded, engineerName, month.year, month.month]);

  const monthJumpOptions = useMemo(
    () =>
      listMonthsInRange(calendarYearRange).map((cursor) => ({
        id: monthCursorKey(cursor),
        label: formatMonthLabel(cursor),
      })),
    [calendarYearRange],
  );

  const weeks = useMemo(
    () => getWorkWeeksForMonth(month, holidayDates),
    [month, holidayDates],
  );

  const monthForecastedHours = useMemo(
    () => weeks.reduce((sum, week) => sum + week.capacityHours, 0),
    [weeks],
  );

  const monthKey = monthCursorKey(month);

  const engineerEntries = useMemo(
    () =>
      entries.filter((entry) =>
        isSameEngineerName(entry.engineerName, engineerName),
      ),
    [entries, engineerName],
  );

  const projectRows = useMemo(() => {
    const idSet = new Set(visibleProjectIds);
    return engineerEntries
      .filter((entry) => idSet.has(entry.id))
      .sort((a, b) =>
        projectLabel(a).localeCompare(projectLabel(b), undefined, {
          sensitivity: "base",
        }),
      );
  }, [engineerEntries, visibleProjectIds]);

  const weekTotals = useMemo(() => {
    return weeks.map((week) => {
      const weekId = String(week.weekNumber);
      let assigned = 0;
      let clockify = 0;

      for (const entry of engineerEntries) {
        const values =
          editingId === entry.id
            ? draftWeeks
            : (entry.weekValuesByMonth[monthKey] ?? {});
        assigned += parseHours(values[weekId]);
        clockify +=
          clockifyHoursByKey[
            clockifyHoursKey(
              entry.engineerName,
              entry.projectCode,
              week.weekNumber,
              entry.projectName,
            )
          ] ?? 0;
      }

      return { assigned, clockify };
    });
  }, [
    weeks,
    engineerEntries,
    monthKey,
    clockifyHoursByKey,
    editingId,
    draftWeeks,
  ]);

  const projectWeekTotals = useMemo(() => {
    return projectRows.map((entry) => {
      const values =
        editingId === entry.id
          ? draftWeeks
          : (entry.weekValuesByMonth[monthKey] ?? {});
      let monthAssigned = 0;
      let monthClockify = 0;

      const byWeek = weeks.map((week) => {
        const assigned = parseHours(values[String(week.weekNumber)]);
        const clockify =
          clockifyHoursByKey[
            clockifyHoursKey(
              entry.engineerName,
              entry.projectCode,
              week.weekNumber,
              entry.projectName,
            )
          ] ?? 0;
        monthAssigned += assigned;
        monthClockify += clockify;
        return { assigned, clockify, rawValue: values[String(week.weekNumber)] ?? "" };
      });

      return {
        entry,
        monthAssigned,
        monthClockify,
        byWeek,
      };
    });
  }, [
    projectRows,
    weeks,
    monthKey,
    clockifyHoursByKey,
    editingId,
    draftWeeks,
  ]);

  const totalAssigned = useMemo(() => {
    if (!editingId) {
      return getEngineerAllottedForMonth(entries, engineerName, month);
    }
    return weekTotals.reduce((sum, week) => sum + week.assigned, 0);
  }, [editingId, entries, engineerName, month, weekTotals]);

  const totalClockify = useMemo(
    () => sumClockifyForEngineer(engineerName, clockifyHoursByKey),
    [engineerName, clockifyHoursByKey],
  );

  const assignedDisplay = formatTotal(totalAssigned);
  const clockifyDisplay = clockifyHoursLoading
    ? "…"
    : formatClockifyHours(totalClockify) || formatTotal(totalClockify);

  const valueColSpan = 1 + (weeksExpanded ? weeks.length : 0);
  const emptyColSpan = 4 + valueColSpan;

  function handleDelete(row: UtilizationEntry) {
    const confirmed = window.confirm(
      `Delete row for "${row.engineerName}" / "${row.projectCode}"?`,
    );
    if (!confirmed) {
      return;
    }
    if (editingId === row.id) {
      setEditingId(null);
      setDraftWeeks({});
      setEditError(null);
    }
    onDelete(row.id);
  }

  function startEditing(row: UtilizationEntry) {
    setWeeksExpanded(true);
    setEditingId(row.id);
    setDraftWeeks(row.weekValuesByMonth[monthKey] ?? {});
    setEditError(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setDraftWeeks({});
    setEditError(null);
  }

  function saveEditing(row: UtilizationEntry) {
    const exceededWeeks = weeks.filter((week) => {
      const weekId = String(week.weekNumber);
      let total = 0;

      for (const current of engineerEntries) {
        const values =
          current.id === row.id
            ? draftWeeks
            : (current.weekValuesByMonth[monthKey] ?? {});
        total += parseHours(values[weekId]);
      }

      const maxHours = week.isWeekendOnly
        ? week.dayCount * 8
        : week.capacityHours;
      return total > maxHours;
    });

    if (exceededWeeks.length > 0) {
      const details = exceededWeeks
        .map((week) => {
          const maxHours = week.isWeekendOnly
            ? week.dayCount * 8
            : week.capacityHours;
          return `Week ${week.weekNumber} (${maxHours}h max)`;
        })
        .join(", ");
      setEditError(
        `Planned Total Hours must not exceed Total Forecasted Hours. Reduce hours for: ${details}. Entry was not saved.`,
      );
      return;
    }

    onUpdate({
      ...row,
      weekValuesByMonth: {
        ...row.weekValuesByMonth,
        [monthKey]: { ...draftWeeks },
      },
    });
    setEditingId(null);
    setDraftWeeks({});
    setEditError(null);
  }

  function updateWeekValue(weekNumber: number, value: string) {
    setEditError(null);
    setDraftWeeks((current) => ({
      ...current,
      [String(weekNumber)]: value,
    }));
  }

  return (
    <div className="overview2-results">
      {editError ? (
        <p className="form-message error" role="alert">
          {editError}
        </p>
      ) : null}

      {clockifyHoursError ? (
        <p className="form-message error" role="alert">
          Clockify hours: {clockifyHoursError}
        </p>
      ) : null}

      <div className="week-nav">
        <button
          type="button"
          className="button secondary button-small"
          onClick={() =>
            onMonthChange(shiftMonth(month, -1, calendarYearRange))
          }
          disabled={
            Boolean(editingId) || !canShiftMonth(month, -1, calendarYearRange)
          }
        >
          Prev
        </button>
        <div className="week-nav-jump">
          <SearchableSelect
            id="overview2-month-jump"
            label=""
            className="week-nav-month-select"
            placeholder="Jump to month…"
            options={monthJumpOptions}
            value={monthCursorKey(month)}
            clearable={false}
            disabled={Boolean(editingId)}
            emptyMessage="No months match your search"
            onChange={(nextKey) => {
              const next = parseMonthCursorKey(nextKey);
              if (next) {
                onMonthChange(next);
              }
            }}
          />
          {clockifyHoursLoading ? (
            <p className="week-nav-status">Loading Clockify…</p>
          ) : null}
        </div>
        <button
          type="button"
          className="button secondary button-small"
          onClick={() => onMonthChange(shiftMonth(month, 1, calendarYearRange))}
          disabled={
            Boolean(editingId) || !canShiftMonth(month, 1, calendarYearRange)
          }
        >
          Next
        </button>
      </div>

      <div className="overview2-results-scroll" ref={scrollRef}>
        <table className="overview2-results-table">
          <colgroup>
            <col className="overview2-col-code" />
            <col className="overview2-col-name" />
            <col className="overview2-col-metric" />
            <col className="overview2-col-month" />
            {weeksExpanded
              ? weeks.map((week) => (
                  <col
                    key={`col-w-${week.weekNumber}`}
                    className="overview2-col-week"
                  />
                ))
              : null}
            <col className="overview2-col-actions" />
          </colgroup>
          <thead>
            <tr className="overview2-header-row" ref={headerRowRef}>
              <th
                scope="col"
                colSpan={3}
                className="overview2-results-identity-header"
              />
              <th scope="col" className="overview2-results-date">
                <span className="overview2-month-header">
                  <span className="overview2-month-label">
                    <span>{formatMonthLabel(month)}</span>
                    <span
                      className="overview2-month-forecast"
                      title="Total Forecasted Hours"
                    >
                      ({monthForecastedHours})
                    </span>
                  </span>
                  <button
                    type="button"
                    className="overview2-expand-button"
                    onClick={() => setWeeksExpanded((current) => !current)}
                    aria-expanded={weeksExpanded}
                    disabled={Boolean(editingId)}
                    aria-label={
                      weeksExpanded
                        ? "Hide weeks for this month"
                        : "Show weeks for this month"
                    }
                  >
                    {weeksExpanded ? "−" : "+"}
                  </button>
                </span>
              </th>
              {weeksExpanded
                ? weeks.map((week) => (
                    <th
                      key={week.weekNumber}
                      scope="col"
                      className="overview2-results-week"
                      title={`Total Forecasted Hours: ${week.capacityHours}`}
                    >
                      <span className="overview2-week-label">
                        W{week.weekNumber}
                      </span>
                      <span className="overview2-week-forecast">
                        ({week.capacityHours})
                      </span>
                    </th>
                  ))
                : null}
              <th scope="col" className="overview2-results-actions">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              className="overview2-engineer-row overview2-engineer-row--allotted overview2-sticky-slot-1"
              ref={engineerAllottedRowRef}
            >
              <th
                scope="row"
                rowSpan={2}
                colSpan={2}
                className="overview2-results-engineer"
              >
                <span className="overview2-engineer-header">
                  <span>{engineerName}</span>
                  <button
                    type="button"
                    className="overview2-expand-button"
                    onClick={() => setProjectsExpanded((current) => !current)}
                    aria-expanded={projectsExpanded}
                    disabled={Boolean(editingId)}
                    aria-label={
                      projectsExpanded
                        ? "Hide active projects"
                        : "Show active projects"
                    }
                  >
                    {projectsExpanded ? "−" : "+"}
                  </button>
                </span>
              </th>
              <th scope="row" className="overview2-results-metric">
                Planned Hours
              </th>
              <td className="overview2-results-value overview2-results-month-value">
                {assignedDisplay}
              </td>
              {weeksExpanded
                ? weekTotals.map((totals, index) => (
                    <td
                      key={`assigned-${weeks[index]?.weekNumber ?? index}`}
                      className="overview2-results-value overview2-results-week-value"
                    >
                      {formatTotal(totals.assigned)}
                    </td>
                  ))
                : null}
              <td className="actions-cell" />
            </tr>
            <tr className="overview2-engineer-row overview2-engineer-row--actual overview2-sticky-slot-2">
              <th scope="row" className="overview2-results-metric">
                Actual Hours
              </th>
              <td className="overview2-results-value overview2-results-month-value">
                {clockifyHoursLoading ? "…" : clockifyDisplay}
              </td>
              {weeksExpanded
                ? weekTotals.map((totals, index) => (
                    <td
                      key={`clockify-${weeks[index]?.weekNumber ?? index}`}
                      className="overview2-results-value overview2-results-week-value"
                    >
                      {clockifyHoursLoading
                        ? "…"
                        : formatClockifyHours(totals.clockify) ||
                          formatTotal(totals.clockify)}
                    </td>
                  ))
                : null}
              <td className="actions-cell" />
            </tr>

            {projectsExpanded && projectWeekTotals.length === 0 ? (
              <tr>
                <td colSpan={emptyColSpan} className="overview2-results-empty">
                  No active projects with lifetime Clockify time for this
                  engineer.
                </td>
              </tr>
            ) : null}

            {projectsExpanded
              ? projectWeekTotals.map(
                  ({ entry, monthAssigned, monthClockify, byWeek }) => {
                    const isEditing = editingId === entry.id;

                    return (
                      <Fragment key={entry.id}>
                        <tr className="overview2-project-row overview2-project-row--allotted">
                          <th
                            scope="row"
                            rowSpan={2}
                            className="overview2-results-project overview2-results-project-code"
                          >
                            {entry.projectCode || "—"}
                          </th>
                          <th
                            scope="row"
                            rowSpan={2}
                            className="overview2-results-project overview2-results-project-name"
                            title={entry.projectName}
                          >
                            <Overview2ProjectNameCell
                              name={entry.projectName}
                            />
                          </th>
                          <th scope="row" className="overview2-results-metric">
                            Planned Hours
                          </th>
                          <td className="overview2-results-value overview2-results-month-value">
                            {formatTotal(monthAssigned)}
                          </td>
                          {weeksExpanded
                            ? byWeek.map((totals, index) => {
                                const week = weeks[index];
                                if (!week) {
                                  return null;
                                }

                                return (
                                  <td
                                    key={`${entry.id}-a-${week.weekNumber}`}
                                    className="overview2-results-value overview2-results-week-value"
                                  >
                                    {isEditing ? (
                                      <input
                                        className="week-input"
                                        type="text"
                                        inputMode="decimal"
                                        aria-label={`${entry.projectCode} week ${week.weekNumber} planned`}
                                        value={totals.rawValue}
                                        onChange={(event) =>
                                          updateWeekValue(
                                            week.weekNumber,
                                            event.target.value,
                                          )
                                        }
                                      />
                                    ) : (
                                      formatTotal(totals.assigned)
                                    )}
                                  </td>
                                );
                              })
                            : null}
                          <td className="actions-cell">
                            <div className="row-actions">
                              {isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    className="icon-button icon-button--save"
                                    onClick={() => saveEditing(entry)}
                                    aria-label="Save"
                                    title="Save"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    type="button"
                                    className="icon-button icon-button--cancel"
                                    onClick={cancelEditing}
                                    aria-label="Cancel"
                                    title="Cancel"
                                  >
                                    ×
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="icon-button icon-button--edit"
                                    onClick={() => startEditing(entry)}
                                    disabled={Boolean(editingId)}
                                    aria-label="Edit"
                                    title="Edit"
                                  >
                                    ✎
                                  </button>
                                  <button
                                    type="button"
                                    className="icon-button icon-button--delete"
                                    onClick={() => handleDelete(entry)}
                                    disabled={
                                      Boolean(editingId) &&
                                      editingId !== entry.id
                                    }
                                    aria-label="Delete"
                                    title="Delete"
                                  >
                                    ×
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        <tr className="overview2-project-row overview2-project-row--actual">
                          <th scope="row" className="overview2-results-metric">
                            Actual Hours
                          </th>
                          <td className="overview2-results-value overview2-results-month-value">
                            {clockifyHoursLoading
                              ? "…"
                              : formatClockifyHours(monthClockify) ||
                                formatTotal(monthClockify)}
                          </td>
                          {weeksExpanded
                            ? byWeek.map((totals, index) => (
                                <td
                                  key={`${entry.id}-c-${weeks[index]?.weekNumber ?? index}`}
                                  className="overview2-results-value overview2-results-week-value"
                                >
                                  {clockifyHoursLoading
                                    ? "…"
                                    : formatClockifyHours(totals.clockify) ||
                                      formatTotal(totals.clockify)}
                                </td>
                              ))
                            : null}
                          <td className="actions-cell" />
                        </tr>
                      </Fragment>
                    );
                  },
                )
              : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

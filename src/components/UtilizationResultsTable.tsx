"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { SearchableSelect } from "@/components/SearchableSelect";
import {
  clockifyHoursKey,
  formatClockifyHours,
} from "@/lib/clockify/hours";
import type { UtilizationEntry } from "@/lib/entries";
import {
  canShiftMonth,
  expandCalendarYearRange,
  formatMonthLabel,
  getGenerateCalendarYear,
  getWorkWeeksForMonth,
  listMonthsInRange,
  monthCursorKey,
  openCalendarYear,
  parseMonthCursorKey,
  shiftMonth,
  type CalendarYearRange,
  type MonthCursor,
} from "@/lib/weeks";

export type { UtilizationResultRow } from "@/lib/entries";
export type { UtilizationEntry } from "@/lib/entries";

export function monthKey(month: MonthCursor): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}

function ProjectNameCell({ name }: { name: string }) {
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
  if (total === 0) {
    return "0";
  }

  return Number.isInteger(total)
    ? String(total)
    : total.toFixed(2).replace(/\.?0+$/, "");
}

function formatPercent(allotted: number, forecasted: number): string {
  if (!Number.isFinite(forecasted) || forecasted <= 0) {
    return "—";
  }

  const percent = (allotted / forecasted) * 100;
  if (!Number.isFinite(percent)) {
    return "—";
  }

  const rounded = Math.round(percent * 10) / 10;
  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)}%`;
}

type UtilizationResultsTableProps = {
  rows: UtilizationEntry[];
  month: MonthCursor;
  onMonthChange: (next: MonthCursor) => void;
  calendarYearRange: CalendarYearRange;
  onCalendarYearRangeChange: (next: CalendarYearRange) => void;
  onUpdate: (row: UtilizationEntry) => void;
  onDelete: (id: string) => void;
  emptyHint?: string;
  clockifyHoursByKey?: Record<string, number>;
  clockifyHoursLoading?: boolean;
  clockifyHoursError?: string | null;
  holidayDates?: readonly string[];
};

export function UtilizationResultsTable({
  rows,
  month,
  onMonthChange,
  calendarYearRange,
  onCalendarYearRangeChange,
  onUpdate,
  onDelete,
  emptyHint,
  clockifyHoursByKey = {},
  clockifyHoursLoading = false,
  clockifyHoursError = null,
  holidayDates = [],
}: UtilizationResultsTableProps) {
  const weeks = useMemo(
    () => getWorkWeeksForMonth(month, holidayDates),
    [month, holidayDates],
  );
  const key = monthKey(month);
  const generateCalendarYear = getGenerateCalendarYear(
    month,
    calendarYearRange,
  );
  const monthJumpOptions = useMemo(
    () =>
      listMonthsInRange(calendarYearRange).map((cursor) => ({
        id: monthCursorKey(cursor),
        label: formatMonthLabel(cursor),
      })),
    [calendarYearRange],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftWeeks, setDraftWeeks] = useState<Record<string, string>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [showAssigned, setShowAssigned] = useState(true);
  const [showClockify, setShowClockify] = useState(true);
  const weekColSpan = (showAssigned ? 1 : 0) + (showClockify ? 1 : 0);

  function toggleAssigned() {
    setShowAssigned((current) => {
      if (current && !showClockify) {
        return current;
      }
      return !current;
    });
  }

  function toggleClockify() {
    setShowClockify((current) => {
      if (current && !showAssigned) {
        return current;
      }
      return !current;
    });
  }

  useEffect(() => {
    setEditingId(null);
    setDraftWeeks({});
    setEditError(null);
  }, [month.year, month.month]);

  const weekTotals = useMemo(() => {
    return weeks.map((week) => {
      const weekId = String(week.weekNumber);
      let assigned = 0;
      let clockify = 0;

      for (const row of rows) {
        const values =
          editingId === row.id
            ? draftWeeks
            : (row.weekValuesByMonth[key] ?? {});
        assigned += parseHours(values[weekId]);
        clockify +=
          clockifyHoursByKey[
            clockifyHoursKey(
              row.engineerName,
              row.projectCode,
              week.weekNumber,
              row.projectName,
            )
          ] ?? 0;
      }

      return {
        assigned,
        clockify,
      };
    });
  }, [rows, weeks, key, editingId, draftWeeks, clockifyHoursByKey]);

  function getClockifyHours(row: UtilizationEntry, weekNumber: number): number {
    return (
      clockifyHoursByKey[
        clockifyHoursKey(
          row.engineerName,
          row.projectCode,
          weekNumber,
          row.projectName,
        )
      ] ?? 0
    );
  }

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
    setEditingId(row.id);
    setDraftWeeks(row.weekValuesByMonth[key] ?? {});
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

      for (const current of rows) {
        const values =
          current.id === row.id
            ? draftWeeks
            : (current.weekValuesByMonth[key] ?? {});
        total += parseHours(values[weekId]);
      }

      // Weekend-only stubs still allow limited OT entry, but forecasted
      // capacity stays 0 for Saturdays/Sundays.
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
        [key]: { ...draftWeeks },
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

  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const totalsScrollRef = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);

  function syncHorizontalScroll(source: "body" | "totals") {
    if (syncingScroll.current) {
      return;
    }
    const body = bodyScrollRef.current;
    const totals = totalsScrollRef.current;
    if (!body || !totals) {
      return;
    }

    syncingScroll.current = true;
    if (source === "body") {
      totals.scrollLeft = body.scrollLeft;
    } else {
      body.scrollLeft = totals.scrollLeft;
    }
    requestAnimationFrame(() => {
      syncingScroll.current = false;
    });
  }

  const columnGroup = (
    <colgroup>
      <col className="col-code" />
      <col className="col-name" />
      {weeks.map((week) => (
        <Fragment key={week.weekNumber}>
          {showAssigned ? <col className="col-week" /> : null}
          {showClockify ? <col className="col-week" /> : null}
        </Fragment>
      ))}
      <col className="col-actions" />
    </colgroup>
  );

  const totalsSection = (
    <>
      {showAssigned ? (
        <tr className="total-row total-row--allotted">
          <td colSpan={2}>Planned Total Hours</td>
          {weeks.map((week, index) => {
            const totals = weekTotals[index] ?? {
              assigned: 0,
              clockify: 0,
            };

            return (
              <Fragment key={week.weekNumber}>
                <td className="week-cell total-cell week-col col-fit">
                  {formatTotal(totals.assigned)}
                </td>
                {showClockify ? (
                  <td className="week-cell total-cell total-cell--muted week-col col-fit">
                    <span className="week-empty">—</span>
                  </td>
                ) : null}
              </Fragment>
            );
          })}
          <td className="actions-cell col-fit" />
        </tr>
      ) : null}

      {showAssigned ? (
        <tr className="total-row total-row--forecasted">
          <td colSpan={2}>Total Forecasted Hours</td>
          {weeks.map((week) => (
            <Fragment key={week.weekNumber}>
              <td className="week-cell total-cell week-col col-fit">
                {formatTotal(week.capacityHours)}
              </td>
              {showClockify ? (
                <td className="week-cell total-cell total-cell--muted week-col col-fit">
                  <span className="week-empty">—</span>
                </td>
              ) : null}
            </Fragment>
          ))}
          <td className="actions-cell col-fit" />
        </tr>
      ) : null}

      {showAssigned ? (
        <tr className="total-row total-row--percent">
          <td colSpan={2}>% Total Forecasted Hours</td>
          {weeks.map((week, index) => {
            const totals = weekTotals[index] ?? {
              assigned: 0,
              clockify: 0,
            };

            return (
              <Fragment key={week.weekNumber}>
                <td className="week-cell total-cell week-col col-fit">
                  {formatPercent(totals.assigned, week.capacityHours)}
                </td>
                {showClockify ? (
                  <td className="week-cell total-cell total-cell--muted week-col col-fit">
                    <span className="week-empty">—</span>
                  </td>
                ) : null}
              </Fragment>
            );
          })}
          <td className="actions-cell col-fit" />
        </tr>
      ) : null}

      {showClockify ? (
        <tr className="total-row total-row--actual">
          <td colSpan={2}>Total Actual Hours</td>
          {weeks.map((week, index) => {
            const totals = weekTotals[index] ?? {
              assigned: 0,
              clockify: 0,
            };

            return (
              <Fragment key={week.weekNumber}>
                {showAssigned ? (
                  <td className="week-cell total-cell total-cell--muted week-col col-fit">
                    <span className="week-empty">—</span>
                  </td>
                ) : null}
                <td className="week-cell total-cell total-cell--clockify week-col col-fit">
                  {formatTotal(totals.clockify)}
                </td>
              </Fragment>
            );
          })}
          <td className="actions-cell col-fit" />
        </tr>
      ) : null}
    </>
  );

  if (rows.length === 0) {
    return (
      <section className="results-section">
        <p className="hint">
          {emptyHint ??
            "Select an engineer and click Search to load active Clockify projects."}
        </p>
      </section>
    );
  }

  return (
    <section className="results-section">
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
            id="month-jump"
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
          onClick={() =>
            onMonthChange(shiftMonth(month, 1, calendarYearRange))
          }
          disabled={
            Boolean(editingId) || !canShiftMonth(month, 1, calendarYearRange)
          }
        >
          Next
        </button>
      </div>

      {generateCalendarYear !== null ? (
        <div className="week-nav week-nav--generate">
          <button
            type="button"
            className="button secondary button-small"
            onClick={() => {
              onCalendarYearRangeChange(
                expandCalendarYearRange(calendarYearRange, generateCalendarYear),
              );
              onMonthChange(openCalendarYear(month, generateCalendarYear));
            }}
            disabled={Boolean(editingId)}
          >
            Generate Calendar for {generateCalendarYear}
          </button>
        </div>
      ) : null}

      <div className="week-nav week-nav--columns">
        <button
          type="button"
          className="button secondary button-small"
          onClick={toggleAssigned}
          aria-pressed={showAssigned}
          disabled={showAssigned && !showClockify}
          title={
            showAssigned && !showClockify
              ? "Keep at least one of A or C visible"
              : showAssigned
                ? "Hide planned forecast hours (A)"
                : "Show planned forecast hours (A)"
          }
        >
          {showAssigned ? "Hide A" : "Show A"}
        </button>
        <button
          type="button"
          className="button secondary button-small"
          onClick={toggleClockify}
          aria-pressed={showClockify}
          disabled={showClockify && !showAssigned}
          title={
            showClockify && !showAssigned
              ? "Keep at least one of A or C visible"
              : showClockify
                ? "Hide actual Clockify hours (C)"
                : "Show actual Clockify hours (C)"
          }
        >
          {showClockify ? "Hide C" : "Show C"}
        </button>
      </div>
      <p className="column-legend">
        <span>
          <strong>A</strong> = Planned forecast
        </span>
        <span className="column-legend-sep" aria-hidden="true">
          ·
        </span>
        <span>
          <strong>C</strong> = Actual (Clockify)
        </span>
      </p>

      <div className="table-panel">
        <div
          className="table-scroll"
          ref={bodyScrollRef}
          onScroll={() => syncHorizontalScroll("body")}
        >
          <table className="results-table">
            {columnGroup}
            <thead>
              <tr>
                <th className="col-fit" rowSpan={2}>
                  Project Code
                </th>
                <th className="col-project-name" rowSpan={2}>
                  Project Name
                </th>
                {weeks.map((week) => (
                  <th
                    key={week.weekNumber}
                    className="week-header col-fit"
                    colSpan={weekColSpan}
                  >
                    <span>Week {week.weekNumber}</span>
                    <span className="week-range">
                      ({week.startDay}-{week.endDay})
                    </span>
                  </th>
                ))}
                <th className="col-fit" rowSpan={2}>
                  Actions
                </th>
              </tr>
              <tr className="week-subheader-row">
                {weeks.map((week) => (
                  <Fragment key={week.weekNumber}>
                    {showAssigned ? (
                      <th
                        className="week-subheader week-col col-fit"
                        title="Planned forecasted hours"
                      >
                        A
                      </th>
                    ) : null}
                    {showClockify ? (
                      <th
                        className="week-subheader week-col col-fit"
                        title="Total actual hours (Clockify)"
                      >
                        C
                      </th>
                    ) : null}
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isEditing = editingId === row.id;
                const displayedWeeks = isEditing
                  ? draftWeeks
                  : (row.weekValuesByMonth[key] ?? {});

                return (
                  <tr key={row.id}>
                    <td className="col-fit">{row.projectCode}</td>
                    <td className="col-project-name">
                      <ProjectNameCell name={row.projectName} />
                    </td>
                    {weeks.map((week) => {
                      const assignedValue =
                        displayedWeeks[String(week.weekNumber)] ?? "";
                      const clockifyDisplay = formatClockifyHours(
                        getClockifyHours(row, week.weekNumber),
                      );

                      return (
                        <Fragment key={`${row.id}-${week.weekNumber}`}>
                          {showAssigned ? (
                            <td className="week-cell week-cell--assigned week-col col-fit">
                              {isEditing ? (
                                <input
                                  className="week-input"
                                  type="text"
                                  inputMode="decimal"
                                  aria-label={`${row.engineerName} week ${week.weekNumber} assigned`}
                                  value={assignedValue}
                                  onChange={(event) =>
                                    updateWeekValue(
                                      week.weekNumber,
                                      event.target.value,
                                    )
                                  }
                                />
                              ) : assignedValue.trim() ? (
                                assignedValue
                              ) : (
                                <span className="week-empty">—</span>
                              )}
                            </td>
                          ) : null}
                          {showClockify ? (
                            <td
                              className="week-cell week-cell--clockify week-col col-fit"
                              title="Clockify hours (read-only)"
                            >
                              {clockifyDisplay || (
                                <span className="week-empty">—</span>
                              )}
                            </td>
                          ) : null}
                        </Fragment>
                      );
                    })}
                    <td className="actions-cell col-fit">
                      <div className="row-actions">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="icon-button icon-button--save"
                              onClick={() => saveEditing(row)}
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
                              onClick={() => startEditing(row)}
                              disabled={Boolean(editingId)}
                              aria-label="Edit"
                              title="Edit"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              className="icon-button icon-button--delete"
                              onClick={() => handleDelete(row)}
                              disabled={
                                Boolean(editingId) && editingId !== row.id
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
                );
              })}
            </tbody>
          </table>
        </div>

        <div
          className="table-totals"
          ref={totalsScrollRef}
          onScroll={() => syncHorizontalScroll("totals")}
        >
          <table className="results-table results-table--totals">
            {columnGroup}
            <tbody>{totalsSection}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

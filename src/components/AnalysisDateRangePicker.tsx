"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DATE_RANGE_PRESETS,
  compareDateKeys,
  formatDateRangeLabel,
  formatMonthYear,
  getMonthCalendarCells,
  getPresetRange,
  matchPresetId,
  normalizeDateRange,
  parseDateKey,
  shiftMonthCursor,
  type DateRange,
  type DateRangePresetId,
} from "@/lib/dateRange";
import type { MonthCursor } from "@/lib/weeks";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

type AnalysisDateRangePickerProps = {
  value: DateRange;
  onChange: (range: DateRange) => void;
};

function monthFromDateKey(key: string): MonthCursor {
  const date = parseDateKey(key);
  if (!date) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function AnalysisDateRangePicker({
  value,
  onChange,
}: AnalysisDateRangePickerProps) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const [draft, setDraft] = useState<DateRange>(value);
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [leftMonth, setLeftMonth] = useState<MonthCursor>(() =>
    monthFromDateKey(value.start),
  );

  const activePreset = useMemo(() => matchPresetId(draft), [draft]);
  const rightMonth = useMemo(
    () => shiftMonthCursor(leftMonth.year, leftMonth.month, 1),
    [leftMonth],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(value);
    setPendingStart(null);
    setLeftMonth(monthFromDateKey(value.start));
  }, [open, value]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) {
        return;
      }
      if (popoverRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    function positionPopover() {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) {
        return;
      }

      const margin = 8;
      const gap = 8;
      const triggerRect = trigger.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Prefer opening to the right of the trigger (beside the sidebar).
      let left = triggerRect.right + gap;
      if (left + popoverRect.width > viewportWidth - margin) {
        left = triggerRect.left - popoverRect.width - gap;
      }
      if (left < margin) {
        left = Math.max(
          margin,
          Math.min(
            triggerRect.left,
            viewportWidth - popoverRect.width - margin,
          ),
        );
      }

      // Align with the trigger; flip/clamp vertically if needed.
      let top = triggerRect.top;
      if (top + popoverRect.height > viewportHeight - margin) {
        top = Math.max(
          margin,
          viewportHeight - popoverRect.height - margin,
        );
      }

      setPopoverStyle({
        position: "fixed",
        top: `${top}px`,
        left: `${left}px`,
        right: "auto",
        transform: "none",
        zIndex: 10000,
        maxWidth: `min(calc(100vw - ${margin * 2}px), 48rem)`,
        maxHeight: `calc(100vh - ${margin * 2}px)`,
        overflow: "auto",
      });
    }

    positionPopover();
    window.addEventListener("resize", positionPopover);
    window.addEventListener("scroll", positionPopover, true);
    return () => {
      window.removeEventListener("resize", positionPopover);
      window.removeEventListener("scroll", positionPopover, true);
    };
  }, [open, leftMonth, draft, pendingStart]);

  function commitRange(next: DateRange) {
    const normalized = normalizeDateRange(next.start, next.end);
    setDraft(normalized);
    setPendingStart(null);
    onChange(normalized);
    setOpen(false);
  }

  function applyPreset(id: DateRangePresetId) {
    commitRange(getPresetRange(id));
  }

  function handleDayClick(dayKey: string) {
    if (!pendingStart) {
      setPendingStart(dayKey);
      setDraft({ start: dayKey, end: dayKey });
      return;
    }

    commitRange(normalizeDateRange(pendingStart, dayKey));
  }

  function dayClassName(dayKey: string, inMonth: boolean): string {
    const classes = ["analysis-cal-day"];
    if (!inMonth) {
      classes.push("analysis-cal-day--muted");
    }

    const rangeStart = pendingStart ?? draft.start;
    const rangeEnd = pendingStart ? pendingStart : draft.end;
    const start = compareDateKeys(rangeStart, rangeEnd) <= 0 ? rangeStart : rangeEnd;
    const end = compareDateKeys(rangeStart, rangeEnd) <= 0 ? rangeEnd : rangeStart;

    const isStart = dayKey === start;
    const isEnd = dayKey === end;
    const inRange =
      compareDateKeys(dayKey, start) >= 0 && compareDateKeys(dayKey, end) <= 0;

    if (isStart || isEnd) {
      classes.push("analysis-cal-day--endpoint");
    } else if (inRange) {
      classes.push("analysis-cal-day--in-range");
    }

    if (isStart && isEnd) {
      classes.push("analysis-cal-day--single");
    } else if (isStart) {
      classes.push("analysis-cal-day--start");
    } else if (isEnd) {
      classes.push("analysis-cal-day--end");
    }

    return classes.join(" ");
  }

  function renderMonth(
    cursor: MonthCursor,
    nav?: "prev" | "next",
  ) {
    const cells = getMonthCalendarCells(cursor);
    return (
      <div className="analysis-cal-month">
        <div className="analysis-cal-month-header">
          {nav === "prev" ? (
            <button
              type="button"
              className="analysis-cal-nav-btn"
              aria-label="Previous months"
              onClick={() =>
                setLeftMonth((current) =>
                  shiftMonthCursor(current.year, current.month, -1),
                )
              }
            >
              ‹
            </button>
          ) : (
            <span className="analysis-cal-nav-spacer" aria-hidden="true" />
          )}
          <div className="analysis-cal-month-title">
            {formatMonthYear(cursor)}
          </div>
          {nav === "next" ? (
            <button
              type="button"
              className="analysis-cal-nav-btn"
              aria-label="Next months"
              onClick={() =>
                setLeftMonth((current) =>
                  shiftMonthCursor(current.year, current.month, 1),
                )
              }
            >
              ›
            </button>
          ) : (
            <span className="analysis-cal-nav-spacer" aria-hidden="true" />
          )}
        </div>
        <div className="analysis-cal-weekdays" aria-hidden="true">
          {WEEKDAYS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="analysis-cal-grid">
          {cells.map((cell) => (
            <button
              key={cell.key}
              type="button"
              className={dayClassName(cell.key, cell.inMonth)}
              onClick={() => handleDayClick(cell.key)}
            >
              {cell.day}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const popover =
    open && mounted
      ? createPortal(
          <div
            ref={popoverRef}
            id={panelId}
            className="analysis-cal-popover analysis-cal-popover--fixed"
            style={popoverStyle}
            role="dialog"
            aria-label="Select analysis date range"
          >
            <aside className="analysis-cal-presets">
              {DATE_RANGE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={
                    activePreset === preset.id
                      ? "analysis-cal-preset analysis-cal-preset--active"
                      : "analysis-cal-preset"
                  }
                  onClick={() => applyPreset(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
            </aside>

            <div className="analysis-cal-body">
              <div className="analysis-cal-months">
                {renderMonth(leftMonth, "prev")}
                {renderMonth(rightMonth, "next")}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="analysis-range-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="field-input analysis-range-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Select date range"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{formatDateRangeLabel(value)}</span>
        <span className="analysis-range-trigger-icon" aria-hidden="true">
          ▾
        </span>
      </button>
      {popover}
    </div>
  );
}

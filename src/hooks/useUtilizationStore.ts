"use client";

import { useEffect, useRef, useState } from "react";
import { useAccess } from "@/auth/accessContext";
import {
  fetchDashboardData,
  saveCalendarYearRange as persistCalendarYearRange,
  saveEngineers as persistEngineers,
  saveEntries as persistEntries,
  saveHolidays as persistHolidays,
  type DashboardData,
} from "@/lib/dashboardApi";
import {
  loadUtilizationEntries,
  saveUtilizationEntries,
  type UtilizationEntry,
} from "@/lib/entries";
import {
  loadEngineerNames,
  saveEngineerNames,
  sortEngineerNames,
  isSameEngineerName,
} from "@/lib/engineers";
import { logDashboardAction } from "@/lib/history-client";
import {
  summarizeCalendarChange,
  summarizeEngineerListChanges,
  summarizeHolidayChanges,
  summarizeUtilizationChanges,
} from "@/lib/historyDiff";
import {
  loadHolidays,
  saveHolidays,
  type Holiday,
} from "@/lib/holidays";
import {
  getDefaultCalendarYearRange,
  loadCalendarYearRange,
  saveCalendarYearRange,
  type CalendarYearRange,
} from "@/lib/weeks";

const MIGRATION_FLAG_KEY = "utilization-dashboard-migrated-to-server";
const ENTRIES_SAVE_DEBOUNCE_MS = 500;
/** How often other open sessions pull latest server data. */
const SYNC_POLL_INTERVAL_MS = 4000;
/** Ignore remote polls briefly after a local write so we don't race the save. */
const LOCAL_WRITE_GUARD_MS = 2000;

export type UtilizationStore = {
  entries: UtilizationEntry[];
  engineerNames: string[];
  holidays: Holiday[];
  calendarYearRange: CalendarYearRange;
  loading: boolean;
  saveError: string | null;
  updateEntries: (next: UtilizationEntry[]) => void;
  updateEngineerNames: (next: string[]) => void;
  updateHolidays: (next: Holiday[]) => void;
  updateCalendarYearRange: (next: CalendarYearRange) => void;
};

function sanitizeEntries(
  entries: UtilizationEntry[],
  engineerNames: string[],
): UtilizationEntry[] {
  return entries.filter((entry) =>
    engineerNames.some((name) => isSameEngineerName(name, entry.engineerName)),
  );
}

function hasLocalDashboardData(): boolean {
  return (
    loadHolidays().length > 0 ||
    loadUtilizationEntries().length > 0 ||
    loadCalendarYearRange().minYear !== getDefaultCalendarYearRange().minYear ||
    loadCalendarYearRange().maxYear !== getDefaultCalendarYearRange().maxYear
  );
}

function isServerDashboardEmpty(data: {
  holidays: Holiday[];
  entries: UtilizationEntry[];
}): boolean {
  return data.holidays.length === 0 && data.entries.length === 0;
}

function dashboardFingerprint(data: DashboardData): string {
  return JSON.stringify({
    holidays: data.holidays,
    engineers: data.engineers,
    entries: data.entries,
    calendarYearRange: data.calendarYearRange,
  });
}

export function useUtilizationStore(): UtilizationStore {
  const { canEdit, canEditAll } = useAccess();
  const [entries, setEntries] = useState<UtilizationEntry[]>([]);
  const [engineerNames, setEngineerNames] = useState<string[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [calendarYearRange, setCalendarYearRange] = useState<CalendarYearRange>(
    () => getDefaultCalendarYearRange(),
  );
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const entriesSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingEntriesRef = useRef<UtilizationEntry[] | null>(null);
  const fingerprintRef = useRef("");
  const localWriteGuardUntilRef = useRef(0);
  const writesInFlightRef = useRef(0);
  const entriesBeforeSaveRef = useRef<UtilizationEntry[]>([]);
  const snapshotRef = useRef<DashboardData>({
    holidays: [],
    engineers: [],
    entries: [],
    calendarYearRange: getDefaultCalendarYearRange(),
  });
  const canEditRef = useRef(canEdit);
  const canEditAllRef = useRef(canEditAll);
  canEditRef.current = canEdit;
  canEditAllRef.current = canEditAll;

  function markLocalWrite() {
    localWriteGuardUntilRef.current = Date.now() + LOCAL_WRITE_GUARD_MS;
  }

  function rememberSnapshot(data: DashboardData) {
    snapshotRef.current = data;
    fingerprintRef.current = dashboardFingerprint(data);
  }

  function applyDashboardData(data: DashboardData) {
    const sanitizedEntries = sanitizeEntries(data.entries, data.engineers);
    const next = { ...data, entries: sanitizedEntries };
    setEngineerNames(next.engineers);
    setHolidays(next.holidays);
    setCalendarYearRange(next.calendarYearRange);
    setEntries(next.entries);
    rememberSnapshot(next);
    entriesBeforeSaveRef.current = next.entries;
    saveEngineerNames(next.engineers);
    saveHolidays(next.holidays);
    saveCalendarYearRange(next.calendarYearRange);
    saveUtilizationEntries(next.entries);
  }

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      setLoading(true);
      setSaveError(null);

      try {
        let data = await fetchDashboardData();

        const alreadyMigrated =
          typeof window !== "undefined" &&
          window.localStorage.getItem(MIGRATION_FLAG_KEY) === "true";

        if (
          !alreadyMigrated &&
          isServerDashboardEmpty(data) &&
          hasLocalDashboardData()
        ) {
          const localHolidays = loadHolidays();
          const localEngineers = loadEngineerNames();
          const localEntries = loadUtilizationEntries();
          const localRange = loadCalendarYearRange();

          const migratedHolidays =
            localHolidays.length > 0 ? localHolidays : data.holidays;
          const migratedEngineers = localEngineers;
          const migratedEntries = sanitizeEntries(
            localEntries.length > 0 ? localEntries : data.entries,
            migratedEngineers,
          );
          const migratedRange = localRange;

          await Promise.all([
            persistHolidays(migratedHolidays),
            persistEngineers(migratedEngineers),
            persistEntries(migratedEntries),
            persistCalendarYearRange(migratedRange),
          ]);

          window.localStorage.setItem(MIGRATION_FLAG_KEY, "true");
          data = {
            holidays: migratedHolidays,
            engineers: migratedEngineers,
            entries: migratedEntries,
            calendarYearRange: migratedRange,
          };
        }

        if (cancelled) {
          return;
        }

        const sanitizedEntries = sanitizeEntries(
          data.entries,
          data.engineers,
        );

        if (sanitizedEntries.length !== data.entries.length) {
          void persistEntries(sanitizedEntries);
        }

        applyDashboardData({ ...data, entries: sanitizedEntries });
      } catch (error) {
        if (!cancelled) {
          setSaveError(
            error instanceof Error
              ? error.message
              : "Failed to load dashboard data.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
      if (entriesSaveTimerRef.current) {
        clearTimeout(entriesSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function syncFromServer() {
      if (cancelled) {
        return;
      }
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }
      if (pendingEntriesRef.current) {
        return;
      }
      if (writesInFlightRef.current > 0) {
        return;
      }
      if (Date.now() < localWriteGuardUntilRef.current) {
        return;
      }

      try {
        const data = await fetchDashboardData();
        if (cancelled) {
          return;
        }
        if (pendingEntriesRef.current || writesInFlightRef.current > 0) {
          return;
        }
        if (Date.now() < localWriteGuardUntilRef.current) {
          return;
        }

        const sanitizedEntries = sanitizeEntries(
          data.entries,
          data.engineers,
        );
        const nextFingerprint = dashboardFingerprint({
          ...data,
          entries: sanitizedEntries,
        });
        if (nextFingerprint === fingerprintRef.current) {
          return;
        }

        applyDashboardData({ ...data, entries: sanitizedEntries });
      } catch {
        // Keep showing current data; next poll retries.
      }
    }

    const intervalId = window.setInterval(() => {
      void syncFromServer();
    }, SYNC_POLL_INTERVAL_MS);

    function onVisibility() {
      if (!document.hidden) {
        void syncFromServer();
      }
    }

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  function queueEntriesSave(next: UtilizationEntry[]) {
    pendingEntriesRef.current = next;
    saveUtilizationEntries(next);
    markLocalWrite();

    if (entriesSaveTimerRef.current) {
      clearTimeout(entriesSaveTimerRef.current);
    }

    entriesSaveTimerRef.current = setTimeout(() => {
      const pending = pendingEntriesRef.current;
      if (!pending) {
        return;
      }

      writesInFlightRef.current += 1;
      const beforeEntries = entriesBeforeSaveRef.current;
      void persistEntries(pending)
        .then((saved) => {
          pendingEntriesRef.current = null;
          markLocalWrite();
          const diff = summarizeUtilizationChanges(beforeEntries, saved);
          if (diff.details) {
            void logDashboardAction({
              project: diff.project,
              entityType: "utilization",
              entityLabel: "Overview hours",
              action: "updated",
              summary: diff.summary,
              details: diff.details,
              comment: "Changes saved on Overview.",
            });
          }
          entriesBeforeSaveRef.current = saved;
          rememberSnapshot({
            ...snapshotRef.current,
            entries: saved,
          });
        })
        .catch((error) => {
          setSaveError(
            error instanceof Error ? error.message : "Failed to save entries.",
          );
        })
        .finally(() => {
          writesInFlightRef.current = Math.max(
            0,
            writesInFlightRef.current - 1,
          );
        });
    }, ENTRIES_SAVE_DEBOUNCE_MS);
  }

  function updateEntries(next: UtilizationEntry[]) {
    if (!canEditRef.current) {
      return;
    }
    // Preserve last persisted snapshot for history diffs across debounce bursts.
    if (!pendingEntriesRef.current) {
      entriesBeforeSaveRef.current = snapshotRef.current.entries;
    }
    setEntries(next);
    snapshotRef.current = { ...snapshotRef.current, entries: next };
    queueEntriesSave(next);
  }

  function updateEngineerNames(next: string[]) {
    if (!canEditAllRef.current) {
      return;
    }
    const beforeEngineers = snapshotRef.current.engineers;
    const sorted = sortEngineerNames(next);
    setEngineerNames(sorted);
    saveEngineerNames(sorted);
    snapshotRef.current = { ...snapshotRef.current, engineers: sorted };
    markLocalWrite();
    writesInFlightRef.current += 1;
    void persistEngineers(sorted)
      .then((saved) => {
        markLocalWrite();
        const diff = summarizeEngineerListChanges(beforeEngineers, saved);
        if (diff.details) {
          void logDashboardAction({
            project: "Engineers",
            entityType: "engineers",
            entityLabel: "Engineer list",
            action: diff.action,
            summary: diff.summary,
            details: diff.details,
            comment: "Changes saved on Overview engineer list.",
          });
        }
        rememberSnapshot({
          ...snapshotRef.current,
          engineers: saved,
        });
      })
      .catch((error) => {
        setSaveError(
          error instanceof Error ? error.message : "Failed to save engineers.",
        );
      })
      .finally(() => {
        writesInFlightRef.current = Math.max(0, writesInFlightRef.current - 1);
      });
  }

  function updateHolidays(next: Holiday[]) {
    if (!canEditAllRef.current) {
      return;
    }
    const beforeHolidays = snapshotRef.current.holidays;
    setHolidays(next);
    saveHolidays(next);
    snapshotRef.current = { ...snapshotRef.current, holidays: next };
    markLocalWrite();
    writesInFlightRef.current += 1;
    void persistHolidays(next)
      .then((saved) => {
        markLocalWrite();
        const diff = summarizeHolidayChanges(beforeHolidays, saved);
        if (diff.details) {
          void logDashboardAction({
            project: "Holidays",
            entityType: "holidays",
            entityLabel: "Holidays",
            action: diff.action,
            summary: diff.summary,
            details: diff.details,
            comment: "Changes saved on Holidays.",
          });
        }
        rememberSnapshot({
          ...snapshotRef.current,
          holidays: saved,
        });
      })
      .catch((error) => {
        setSaveError(
          error instanceof Error ? error.message : "Failed to save holidays.",
        );
      })
      .finally(() => {
        writesInFlightRef.current = Math.max(0, writesInFlightRef.current - 1);
      });
  }

  function updateCalendarYearRange(next: CalendarYearRange) {
    if (!canEditAllRef.current) {
      return;
    }
    const beforeRange = snapshotRef.current.calendarYearRange;
    setCalendarYearRange(next);
    saveCalendarYearRange(next);
    snapshotRef.current = {
      ...snapshotRef.current,
      calendarYearRange: next,
    };
    markLocalWrite();
    writesInFlightRef.current += 1;
    void persistCalendarYearRange(next)
      .then((saved) => {
        markLocalWrite();
        if (
          beforeRange.minYear !== saved.minYear ||
          beforeRange.maxYear !== saved.maxYear
        ) {
          const diff = summarizeCalendarChange(beforeRange, saved);
          void logDashboardAction({
            project: "Calendar",
            entityType: "calendar",
            entityLabel: "Calendar year range",
            action: "updated",
            summary: diff.summary,
            details: diff.details,
            comment: "Changes saved on calendar year range.",
          });
        }
        rememberSnapshot({
          ...snapshotRef.current,
          calendarYearRange: saved,
        });
      })
      .catch((error) => {
        setSaveError(
          error instanceof Error
            ? error.message
            : "Failed to save calendar year range.",
        );
      })
      .finally(() => {
        writesInFlightRef.current = Math.max(0, writesInFlightRef.current - 1);
      });
  }

  return {
    entries,
    engineerNames,
    holidays,
    calendarYearRange,
    loading,
    saveError,
    updateEntries,
    updateEngineerNames,
    updateHolidays,
    updateCalendarYearRange,
  };
}

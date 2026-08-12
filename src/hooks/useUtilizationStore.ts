"use client";

import { useEffect, useRef, useState } from "react";
import { clearOverCapacityAllottedHours } from "@/lib/clearOverCapacity";
import {
  fetchDashboardData,
  saveCalendarYearRange as persistCalendarYearRange,
  saveEngineers as persistEngineers,
  saveEntries as persistEntries,
  saveHolidays as persistHolidays,
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
import {
  getHolidayDateSet,
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
  holidays: Holiday[],
): UtilizationEntry[] {
  const activeEntries = entries.filter((entry) =>
    engineerNames.some((name) => isSameEngineerName(name, entry.engineerName)),
  );
  return clearOverCapacityAllottedHours(
    activeEntries,
    getHolidayDateSet(holidays),
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

export function useUtilizationStore(): UtilizationStore {
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
            migratedHolidays,
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
          data.holidays,
        );

        if (sanitizedEntries.length !== data.entries.length) {
          void persistEntries(sanitizedEntries);
        }

        setEngineerNames(data.engineers);
        setHolidays(data.holidays);
        setCalendarYearRange(data.calendarYearRange);
        setEntries(sanitizedEntries);
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

  function queueEntriesSave(next: UtilizationEntry[]) {
    pendingEntriesRef.current = next;
    saveUtilizationEntries(next);

    if (entriesSaveTimerRef.current) {
      clearTimeout(entriesSaveTimerRef.current);
    }

    entriesSaveTimerRef.current = setTimeout(() => {
      const pending = pendingEntriesRef.current;
      if (!pending) {
        return;
      }

      void persistEntries(pending).catch((error) => {
        setSaveError(
          error instanceof Error ? error.message : "Failed to save entries.",
        );
      });
    }, ENTRIES_SAVE_DEBOUNCE_MS);
  }

  function updateEntries(next: UtilizationEntry[]) {
    setEntries(next);
    queueEntriesSave(next);
  }

  function updateEngineerNames(next: string[]) {
    const sorted = sortEngineerNames(next);
    setEngineerNames(sorted);
    saveEngineerNames(sorted);
    void persistEngineers(sorted).catch((error) => {
      setSaveError(
        error instanceof Error ? error.message : "Failed to save engineers.",
      );
    });
  }

  function updateHolidays(next: Holiday[]) {
    setHolidays(next);
    saveHolidays(next);
    setEntries((current) => {
      const cleaned = clearOverCapacityAllottedHours(
        current,
        getHolidayDateSet(next),
      );
      if (cleaned !== current) {
        queueEntriesSave(cleaned);
      }
      return cleaned;
    });
    void persistHolidays(next).catch((error) => {
      setSaveError(
        error instanceof Error ? error.message : "Failed to save holidays.",
      );
    });
  }

  function updateCalendarYearRange(next: CalendarYearRange) {
    setCalendarYearRange(next);
    saveCalendarYearRange(next);
    void persistCalendarYearRange(next).catch((error) => {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Failed to save calendar year range.",
      );
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

"use client";

import { useEffect, useState } from "react";
import { clearOverCapacityAllottedHours } from "@/lib/clearOverCapacity";
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

export type UtilizationStore = {
  entries: UtilizationEntry[];
  engineerNames: string[];
  holidays: Holiday[];
  calendarYearRange: CalendarYearRange;
  updateEntries: (next: UtilizationEntry[]) => void;
  updateEngineerNames: (next: string[]) => void;
  updateHolidays: (next: Holiday[]) => void;
  updateCalendarYearRange: (next: CalendarYearRange) => void;
};

export function useUtilizationStore(): UtilizationStore {
  const [entries, setEntries] = useState<UtilizationEntry[]>([]);
  const [engineerNames, setEngineerNames] = useState<string[]>(() =>
    loadEngineerNames(),
  );
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [calendarYearRange, setCalendarYearRange] = useState<CalendarYearRange>(
    () => getDefaultCalendarYearRange(),
  );

  useEffect(() => {
    /* Hydrate shared utilization state from localStorage after mount. */
    /* eslint-disable react-hooks/set-state-in-effect */
    const names = loadEngineerNames();
    const holidays = loadHolidays();
    const loadedEntries = loadUtilizationEntries();
    const activeEntries = loadedEntries.filter((entry) =>
      names.some((name) => isSameEngineerName(name, entry.engineerName)),
    );
    const sanitizedEntries = clearOverCapacityAllottedHours(
      activeEntries,
      getHolidayDateSet(holidays),
    );

    if (
      sanitizedEntries !== activeEntries ||
      activeEntries.length !== loadedEntries.length
    ) {
      saveUtilizationEntries(sanitizedEntries);
    }

    setEngineerNames(names);
    setHolidays(holidays);
    setCalendarYearRange(loadCalendarYearRange());
    setEntries(sanitizedEntries);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function updateEntries(next: UtilizationEntry[]) {
    setEntries(next);
    saveUtilizationEntries(next);
  }

  function updateEngineerNames(next: string[]) {
    const sorted = sortEngineerNames(next);
    setEngineerNames(sorted);
    saveEngineerNames(sorted);
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
        saveUtilizationEntries(cleaned);
      }
      return cleaned;
    });
  }

  function updateCalendarYearRange(next: CalendarYearRange) {
    setCalendarYearRange(next);
    saveCalendarYearRange(next);
  }

  return {
    entries,
    engineerNames,
    holidays,
    calendarYearRange,
    updateEntries,
    updateEngineerNames,
    updateHolidays,
    updateCalendarYearRange,
  };
}

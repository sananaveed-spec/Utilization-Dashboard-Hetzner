"use client";

import { useMemo, useState } from "react";
import { AnalysisDateRangePicker } from "@/components/AnalysisDateRangePicker";
import { EngineerAnalysisCharts } from "@/components/EngineerAnalysisCharts";
import { FirmUtilizationCharts } from "@/components/FirmUtilizationCharts";
import type { UtilizationStore } from "@/hooks/useUtilizationStore";
import {
  buildEngineerMonthStats,
  buildFirmUtilizationByEngineer,
  buildHeadcountPressure,
  hasAnyAllottedHours,
} from "@/lib/analysis";
import { isSameEngineerName } from "@/lib/engineers";
import {
  getDefaultAnalysisDateRange,
  listMonthsInDateRange,
  type DateRange,
} from "@/lib/dateRange";

type AnalysisPanelProps = {
  store: UtilizationStore;
};

export function AnalysisPanel({ store }: AnalysisPanelProps) {
  const { entries, engineerNames, holidays } = store;
  const [dateRange, setDateRange] = useState<DateRange>(() =>
    getDefaultAnalysisDateRange(),
  );

  const holidayDates = useMemo(
    () => holidays.map((holiday) => holiday.date),
    [holidays],
  );

  const months = useMemo(
    () => listMonthsInDateRange(dateRange),
    [dateRange],
  );

  const monthStats = useMemo(
    () => buildEngineerMonthStats(entries, engineerNames, months, holidayDates),
    [entries, engineerNames, months, holidayDates],
  );

  const firmUtilization = useMemo(
    () => buildFirmUtilizationByEngineer(monthStats),
    [monthStats],
  );

  const headcountPressure = useMemo(
    () => buildHeadcountPressure(monthStats, months),
    [monthStats, months],
  );

  const hasData = useMemo(
    () =>
      hasAnyAllottedHours(
        entries.filter((entry) =>
          engineerNames.some((name) =>
            isSameEngineerName(name, entry.engineerName),
          ),
        ),
      ),
    [entries, engineerNames],
  );

  return (
    <div className="analysis-panel">
      <div className="analysis-header">
        <div>
          <h2 className="analysis-title">Analysis</h2>
          <p className="analysis-subtitle">
            Planned forecast hours (A) across engineers — spot who is busy,
            who has capacity, and whether headcount pressure is rising.
          </p>
        </div>
        <AnalysisDateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {!hasData ? (
        <p className="hint analysis-empty">
          No planned hours yet. Enter values in the Overview A columns, then
          return here for firm-wide and engineer charts.
        </p>
      ) : (
        <>
          <FirmUtilizationCharts
            utilization={firmUtilization}
            monthStats={monthStats}
            months={months}
            headcountPressure={headcountPressure}
            entries={entries}
            holidayDates={holidayDates}
          >
            <EngineerAnalysisCharts
              store={store}
              months={months}
              engineerOptions={firmUtilization.map((row) => row.engineerName)}
            />
          </FirmUtilizationCharts>
        </>
      )}
    </div>
  );
}

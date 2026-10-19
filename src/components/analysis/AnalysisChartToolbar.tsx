"use client";

import { AnalysisDateRangePicker } from "@/components/AnalysisDateRangePicker";
import type { DateRange } from "@/lib/dateRange";

export type ChartSourceFilters = {
  planned: boolean;
  ats: boolean;
  dateRange: DateRange;
};

type AnalysisChartToolbarProps = {
  value: ChartSourceFilters;
  onChange: (next: ChartSourceFilters) => void;
  /** When false, ATS checkbox is hidden (e.g. forecast is planned-only). */
  showAts?: boolean;
  /** When false, Planned checkbox is hidden. */
  showPlanned?: boolean;
};

export function AnalysisChartToolbar({
  value,
  onChange,
  showAts = true,
  showPlanned = true,
}: AnalysisChartToolbarProps) {
  return (
    <div className="analysis-chart-toolbar" aria-label="Chart data controls">
      <div className="analysis-chart-source" role="group" aria-label="Data source">
        {showPlanned ? (
          <label className="analysis-chart-source-check">
            <input
              type="checkbox"
              checked={value.planned}
              onChange={() =>
                onChange({ ...value, planned: !value.planned })
              }
            />
            <span>Planned</span>
          </label>
        ) : null}
        {showAts ? (
          <label className="analysis-chart-source-check">
            <input
              type="checkbox"
              checked={value.ats}
              onChange={() => onChange({ ...value, ats: !value.ats })}
            />
            <span>ATS</span>
          </label>
        ) : null}
      </div>
      <AnalysisDateRangePicker
        value={value.dateRange}
        onChange={(dateRange) => onChange({ ...value, dateRange })}
      />
    </div>
  );
}

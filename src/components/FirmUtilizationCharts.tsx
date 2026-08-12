"use client";

import { useMemo, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AllottedMatrixTable } from "@/components/AllottedMatrixTable";
import {
  LIGHT_THRESHOLD,
  MEDIUM_THRESHOLD,
  formatAnalysisNumber,
  formatAnalysisPercent,
  type EngineerMonthStats,
  type EngineerUtilizationRow,
  type FirmMonthPressure,
} from "@/lib/analysis";
import type { UtilizationEntry } from "@/lib/entries";
import type { MonthCursor } from "@/lib/weeks";

type FirmUtilizationChartsProps = {
  utilization: EngineerUtilizationRow[];
  monthStats: EngineerMonthStats[];
  months: MonthCursor[];
  headcountPressure: FirmMonthPressure[];
  entries: UtilizationEntry[];
  holidayDates?: readonly string[];
  children?: ReactNode;
};

const CHART_COLORS = {
  allotted: "#3b82f6",
  capacity: "#64748b",
  percent: "#22c55e",
  grid: "#334155",
  axis: "#94a3b8",
};

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}</p>
      {payload.map((item) => (
        <p key={String(item.name)} style={{ color: item.color }}>
          {item.name}:{" "}
          {typeof item.value === "number"
            ? item.name?.includes("%") || item.name === "Utilization"
              ? formatAnalysisPercent(item.value)
              : formatAnalysisNumber(item.value)
            : "—"}
        </p>
      ))}
    </div>
  );
}

export function FirmUtilizationCharts({
  utilization,
  monthStats,
  months,
  headcountPressure,
  entries,
  holidayDates = [],
  children,
}: FirmUtilizationChartsProps) {
  const utilizationData = useMemo(
    () =>
      utilization.map((row) => ({
        name: row.engineerName,
        Utilization: row.percent ?? 0,
        allotted: row.allotted,
        capacity: row.capacity,
        status: row.status,
      })),
    [utilization],
  );

  const capacityByEngineerMonth = useMemo(() => {
    const monthLabels = [...new Set(monthStats.map((row) => row.monthLabel))];
    const engineers = [...new Set(monthStats.map((row) => row.engineerName))];

    return engineers.map((engineerName) => {
      const point: Record<string, string | number> = { name: engineerName };
      for (const label of monthLabels) {
        const row = monthStats.find(
          (item) =>
            item.engineerName === engineerName && item.monthLabel === label,
        );
        point[`${label} Allotted`] = row?.allotted ?? 0;
        point[`${label} Capacity`] = row?.capacity ?? 0;
      }
      return point;
    });
  }, [monthStats]);

  const monthLabels = useMemo(
    () => [...new Set(monthStats.map((row) => row.monthLabel))],
    [monthStats],
  );

  const light = utilization.filter((row) => row.status === "light");
  const medium = utilization.filter((row) => row.status === "medium");
  const busy = utilization.filter(
    (row) => row.status === "busy" || row.status === "over",
  );

  const pressureData = headcountPressure.map((row) => ({
    name: row.monthLabel,
    Allotted: row.allotted,
    Capacity: row.capacity,
    Utilization: row.percent ?? 0,
  }));

  const engineerOptions = utilization.map((row) => row.engineerName);

  return (
    <>
      <section className="analysis-section">
        <div className="analysis-insight-row">
          <div className="analysis-insight-card">
            <p className="analysis-insight-label">
              Light (0–{LIGHT_THRESHOLD}%)
            </p>
            <p className="analysis-insight-value">{light.length}</p>
            <p className="analysis-insight-detail">
              {light.length === 0
                ? "No lightly loaded engineers"
                : light.map((row) => row.engineerName).join(", ")}
            </p>
          </div>
          <div className="analysis-insight-card">
            <p className="analysis-insight-label">
              Medium ({LIGHT_THRESHOLD}–{MEDIUM_THRESHOLD}%)
            </p>
            <p className="analysis-insight-value">{medium.length}</p>
            <p className="analysis-insight-detail">
              {medium.length === 0
                ? "No medium-loaded engineers"
                : medium.map((row) => row.engineerName).join(", ")}
            </p>
          </div>
          <div className="analysis-insight-card">
            <p className="analysis-insight-label">
              {`Busy (>${MEDIUM_THRESHOLD}%)`}
            </p>
            <p className="analysis-insight-value">{busy.length}</p>
            <p className="analysis-insight-detail">
              {busy.length === 0
                ? "No engineers over the busy threshold"
                : busy.map((row) => row.engineerName).join(", ")}
            </p>
          </div>
          <div className="analysis-insight-card">
            <p className="analysis-insight-label">Range</p>
            <p className="analysis-insight-value">{months.length}</p>
            <p className="analysis-insight-detail">
              {months.length === 1 ? "month" : "months"} in this view
            </p>
          </div>
        </div>

        <div className="analysis-chart-card">
          <h3 className="analysis-chart-title">Headcount pressure</h3>
          <p className="analysis-chart-hint">
            Firm-wide allotted vs capacity — rising pressure means hire before
            taking new projects
          </p>
          <div className="analysis-chart-frame">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={pressureData}
                margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
              >
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: CHART_COLORS.axis, fontSize: 12 }}
                />
                <YAxis tick={{ fill: CHART_COLORS.axis, fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="Allotted"
                  stroke={CHART_COLORS.allotted}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="Capacity"
                  stroke={CHART_COLORS.capacity}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {children}

      <section className="analysis-section">
        <div className="analysis-chart-card">
          <h3 className="analysis-chart-title">Allotted vs capacity by engineer</h3>
          <p className="analysis-chart-hint">
            Grouped hours for each month in range
          </p>
          <div className="analysis-chart-frame analysis-chart-frame--tall">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={capacityByEngineerMonth}
                margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
              >
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={70}
                />
                <YAxis tick={{ fill: CHART_COLORS.axis, fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                {monthLabels.map((label, index) => (
                  <Bar
                    key={`${label}-allotted`}
                    dataKey={`${label} Allotted`}
                    fill={index === 0 ? CHART_COLORS.allotted : "#60a5fa"}
                    radius={[3, 3, 0, 0]}
                  />
                ))}
                {monthLabels.map((label, index) => (
                  <Bar
                    key={`${label}-capacity`}
                    dataKey={`${label} Capacity`}
                    fill={index === 0 ? CHART_COLORS.capacity : "#94a3b8"}
                    radius={[3, 3, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="analysis-chart-card">
          <h3 className="analysis-chart-title">Utilization by engineer</h3>
          <p className="analysis-chart-hint">
            Average allotted ÷ capacity across the selected months
          </p>
          <div className="analysis-chart-frame analysis-chart-frame--tall">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={utilizationData}
                layout="vertical"
                margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
              >
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  domain={[0, "auto"]}
                  tick={{ fill: CHART_COLORS.axis, fontSize: 12 }}
                  unit="%"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="Utilization"
                  fill={CHART_COLORS.percent}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <AllottedMatrixTable
        entries={entries}
        engineerOptions={engineerOptions}
        months={months}
        holidayDates={holidayDates}
      />
    </>
  );
}

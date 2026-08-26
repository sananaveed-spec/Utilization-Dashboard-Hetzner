"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SearchableSelect } from "@/components/SearchableSelect";
import type { UtilizationStore } from "@/hooks/useUtilizationStore";
import {
  buildEngineerAvailableWeeks,
  buildEngineerFocusProjects,
  buildEngineerWeeklyStats,
  formatAnalysisNumber,
  formatAnalysisPercent,
  summarizeEngineerWeeks,
} from "@/lib/analysis";
import type { MonthCursor } from "@/lib/weeks";

type EngineerAnalysisChartsProps = {
  store: UtilizationStore;
  months: MonthCursor[];
  engineerOptions: string[];
};

const CHART_COLORS = {
  allotted: "#3b82f6",
  capacity: "#64748b",
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
            ? formatAnalysisNumber(item.value)
            : "—"}
        </p>
      ))}
    </div>
  );
}

function projectDisplayName(project: {
  projectCode: string;
  projectName: string;
}): string {
  if (project.projectCode && project.projectCode !== "—") {
    return project.projectName && project.projectName !== "—"
      ? `${project.projectCode} · ${project.projectName}`
      : project.projectCode;
  }
  return project.projectName || "—";
}

export function EngineerAnalysisCharts({
  store,
  months,
  engineerOptions,
}: EngineerAnalysisChartsProps) {
  const [selectedEngineer, setSelectedEngineer] = useState(
    () => engineerOptions[0] ?? "",
  );

  const options = useMemo(
    () =>
      engineerOptions.map((name) => ({
        id: name,
        label: name,
      })),
    [engineerOptions],
  );

  const activeEngineer =
    selectedEngineer && engineerOptions.includes(selectedEngineer)
      ? selectedEngineer
      : (engineerOptions[0] ?? "");

  const holidayDates = useMemo(
    () => store.holidays.map((holiday) => holiday.date),
    [store.holidays],
  );

  const weeklyStats = useMemo(
    () =>
      activeEngineer
        ? buildEngineerWeeklyStats(
            store.entries,
            activeEngineer,
            months,
            holidayDates,
          )
        : [],
    [store.entries, holidayDates, activeEngineer, months],
  );

  const summary = useMemo(
    () => summarizeEngineerWeeks(weeklyStats),
    [weeklyStats],
  );

  const focusProjects = useMemo(
    () =>
      activeEngineer
        ? buildEngineerFocusProjects(store.entries, activeEngineer, months)
        : [],
    [store.entries, activeEngineer, months],
  );

  const availableWeeks = useMemo(
    () => buildEngineerAvailableWeeks(weeklyStats),
    [weeklyStats],
  );

  const chartData = weeklyStats.map((week) => ({
    name: week.weekLabel,
    Planned: week.allotted,
    Capacity: week.capacity,
  }));

  const focusHours = focusProjects[0]?.allotted ?? 0;
  const focusDetail =
    focusProjects.length === 0
      ? "No focus project in this range"
      : focusProjects.map((project) => projectDisplayName(project)).join(", ");

  const availableDetail =
    availableWeeks.length === 0
      ? "No weeks with spare capacity"
      : availableWeeks.map((week) => week.weekLabel).join(", ");

  if (engineerOptions.length === 0) {
    return null;
  }

  return (
    <section className="analysis-section">
      <div className="analysis-header analysis-header--compact">
        <div>
          <h3 className="analysis-chart-title">Engineer drill-down</h3>
          <p className="analysis-chart-hint">
            Weekly planned vs capacity for one engineer
          </p>
        </div>
        <div className="analysis-engineer-select">
          <SearchableSelect
            id="analysis-engineer"
            label="Engineer"
            placeholder="Select engineer…"
            options={options}
            value={activeEngineer}
            clearable={false}
            onChange={setSelectedEngineer}
            emptyMessage="No engineers match your search"
          />
        </div>
      </div>

      <div className="analysis-insight-row">
        <div className="analysis-insight-card">
          <p className="analysis-insight-label">Total planned</p>
          <p className="analysis-insight-value">
            {formatAnalysisNumber(summary.totalAllotted)}
          </p>
        </div>
        <div className="analysis-insight-card">
          <p className="analysis-insight-label">Avg utilization</p>
          <p className="analysis-insight-value">
            {formatAnalysisPercent(summary.averagePercent)}
          </p>
        </div>
        <div className="analysis-insight-card">
          <p className="analysis-insight-label">Focus Projects</p>
          <p className="analysis-insight-value">
            {focusProjects.length === 0
              ? "—"
              : `${formatAnalysisNumber(focusHours)}h`}
          </p>
          <p className="analysis-insight-detail">{focusDetail}</p>
        </div>
        <div className="analysis-insight-card">
          <p className="analysis-insight-label">Available Weeks</p>
          <p className="analysis-insight-value">{availableWeeks.length}</p>
          <p className="analysis-insight-detail">{availableDetail}</p>
        </div>
      </div>

      <div className="analysis-chart-card">
        <div className="analysis-chart-frame">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 8, bottom: 48 }}
            >
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                tick={{ fill: CHART_COLORS.axis, fontSize: 10 }}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fill: CHART_COLORS.axis, fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Bar
                dataKey="Planned"
                fill={CHART_COLORS.allotted}
                radius={[3, 3, 0, 0]}
              />
              <Bar
                dataKey="Capacity"
                fill={CHART_COLORS.capacity}
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

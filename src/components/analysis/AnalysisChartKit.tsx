"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatAnalysisNumber,
  formatAnalysisPercent,
} from "@/lib/analysis";
import type {
  ForecastPoint,
  HeatBand,
  HeatmapRow,
  AnalysisWeekColumn,
  PlannedVsActualRow,
  TrendPoint,
  WorkloadSlice,
} from "@/lib/analysisCharts";

const HEAT_BAND_FILTERS: Array<{
  id: Exclude<HeatBand, "none">;
  label: string;
}> = [
  { id: "0-25", label: "0–25%" },
  { id: "25-50", label: "25–50%" },
  { id: "50-75", label: "50–75%" },
  { id: "75-100", label: "75–100%" },
  { id: "over", label: "Over 100%" },
];

type HeatBandFilterState = Record<Exclude<HeatBand, "none">, boolean>;

const DEFAULT_HEAT_BAND_FILTERS: HeatBandFilterState = {
  "0-25": true,
  "25-50": true,
  "50-75": true,
  "75-100": true,
  over: true,
};

const COLORS = {
  planned: "#3b82f6",
  actual: "#16a34a",
  weekly: "#0284c7",
  monthly: "#7c3aed",
  billable: "#16a34a",
  nonBillable: "#94a3b8",
  overload: "#dc2626",
  grid: "#e2e8f0",
  axis: "#64748b",
  pie: [
    "#3b82f6",
    "#16a34a",
    "#d97706",
    "#7c3aed",
    "#0284c7",
    "#ea580c",
    "#0d9488",
    "#e11d48",
  ],
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
            ? String(item.name ?? "").toLowerCase().includes("%") ||
              String(item.name ?? "").toLowerCase().includes("util") ||
              String(item.name ?? "").toLowerCase().includes("billab")
              ? formatAnalysisPercent(item.value)
              : formatAnalysisNumber(item.value)
            : "—"}
        </p>
      ))}
    </div>
  );
}

export function UtilizationHeatmap({
  weeks,
  rows,
}: {
  weeks: AnalysisWeekColumn[];
  rows: HeatmapRow[];
}) {
  const [bandFilters, setBandFilters] = useState<HeatBandFilterState>(
    DEFAULT_HEAT_BAND_FILTERS,
  );

  const visibleRows = useMemo(() => {
    const anyBandEnabled = HEAT_BAND_FILTERS.some(
      (band) => bandFilters[band.id],
    );
    if (!anyBandEnabled) {
      return [];
    }

    return rows.filter((row) =>
      row.cells.some(
        (cell) => cell.band !== "none" && bandFilters[cell.band],
      ),
    );
  }, [bandFilters, rows]);

  if (rows.length === 0 || weeks.length === 0) {
    return <p className="analysis-chart-hint">No heatmap data for this range.</p>;
  }

  function toggleBand(band: Exclude<HeatBand, "none">) {
    setBandFilters((prev) => ({
      ...prev,
      [band]: !prev[band],
    }));
  }

  return (
    <div className="analysis-heatmap-block">
      <div
        className="analysis-heatmap-legend"
        role="group"
        aria-label="Filter utilization color bands"
      >
        {HEAT_BAND_FILTERS.map((band) => {
          const checked = bandFilters[band.id];
          return (
            <label
              key={band.id}
              className={`analysis-heatmap-legend-btn analysis-heatmap-cell--${band.id}${
                checked ? "" : " analysis-heatmap-legend-btn--off"
              }`}
            >
              <input
                type="checkbox"
                className="analysis-heatmap-legend-check"
                checked={checked}
                onChange={() => toggleBand(band.id)}
              />
              <span>{band.label}</span>
            </label>
          );
        })}
      </div>
      <div className="analysis-heatmap-scroll">
        {visibleRows.length === 0 ? (
          <p className="analysis-chart-hint analysis-heatmap-empty">
            No engineers match the selected bands. Check at least one band
            above.
          </p>
        ) : (
          <table className="analysis-heatmap">
            <thead>
              <tr>
                <th scope="col">Engineer</th>
                {weeks.map((week) => (
                  <th key={week.key} scope="col" title={week.label}>
                    {week.label.replace(/^\w+ /, "")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.engineerName}>
                  <th scope="row">{row.engineerName}</th>
                  {row.cells.map((cell) => {
                    const show =
                      cell.band === "none" || bandFilters[cell.band];
                    const band = show ? cell.band : "none";
                    return (
                      <td
                        key={cell.weekKey}
                        className={`analysis-heatmap-cell analysis-heatmap-cell--${band}`}
                        title={`${row.engineerName} · ${formatAnalysisPercent(cell.percent)} (${formatAnalysisNumber(cell.hours)}h / ${formatAnalysisNumber(cell.capacity)}h)`}
                      >
                        {!show || cell.percent === null
                          ? "—"
                          : Math.round(cell.percent)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function BillabilityTrendChart({
  planned,
  ats,
}: {
  planned?: TrendPoint[];
  ats?: TrendPoint[];
}) {
  const chartData = useMemo(() => {
    const byLabel = new Map<string, Record<string, string | number>>();
    const addSeries = (
      points: TrendPoint[] | undefined,
      weeklyKey: string,
      monthlyKey: string,
    ) => {
      if (!points) return;
      for (const point of points) {
        const row = byLabel.get(point.weekLabel) ?? { name: point.weekLabel };
        row[weeklyKey] = point.weeklyPercent ?? 0;
        row[monthlyKey] = point.monthlyPercent ?? 0;
        byLabel.set(point.weekLabel, row);
      }
    };
    addSeries(planned, "Planned weekly %", "Planned monthly %");
    addSeries(ats, "ATS weekly %", "ATS monthly %");
    return [...byLabel.values()];
  }, [ats, planned]);

  if (chartData.length === 0) {
    return <p className="analysis-chart-hint">No trend data for this range.</p>;
  }

  return (
    <div className="analysis-chart-frame analysis-chart-frame--tall">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fill: COLORS.axis, fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: COLORS.axis, fontSize: 11 }} unit="%" />
          <Tooltip content={<ChartTooltip />} />
          <Legend />
          {planned ? (
            <>
              <Line type="monotone" dataKey="Planned weekly %" stroke={COLORS.planned} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Planned monthly %" stroke={COLORS.monthly} strokeWidth={2} dot={false} strokeDasharray="4 3" />
            </>
          ) : null}
          {ats ? (
            <>
              <Line type="monotone" dataKey="ATS weekly %" stroke={COLORS.weekly} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="ATS monthly %" stroke={COLORS.actual} strokeWidth={2} dot={false} strokeDasharray="4 3" />
            </>
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PlannedVsActualChart({
  data,
  showPlanned = true,
  showAts = true,
}: {
  data: PlannedVsActualRow[];
  showPlanned?: boolean;
  showAts?: boolean;
}) {
  if (data.length === 0 || (!showPlanned && !showAts)) {
    return <p className="analysis-chart-hint">No planned/ATS hours for this range.</p>;
  }

  return (
    <div className="analysis-chart-frame analysis-chart-frame--tall">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 48 }}>
          <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fill: COLORS.axis, fontSize: 10 }} angle={-25} textAnchor="end" height={60} />
          <YAxis tick={{ fill: COLORS.axis, fontSize: 11 }} />
          <Tooltip content={<ChartTooltip />} />
          <Legend />
          {showPlanned ? (
            <Bar dataKey="planned" name="Planned" fill={COLORS.planned} />
          ) : null}
          {showAts ? (
            <Bar dataKey="actual" name="ATS" fill={COLORS.actual} />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WorkloadPieChart({
  series,
}: {
  series: Array<{ label: string; data: WorkloadSlice[] }>;
}) {
  const visible = series.filter((item) => item.data.length > 0);
  if (visible.length === 0) {
    return <p className="analysis-chart-hint">No workload breakdown for this range.</p>;
  }

  return (
    <div
      className={
        visible.length > 1
          ? "analysis-chart-frame analysis-chart-frame--split"
          : "analysis-chart-frame"
      }
    >
      {visible.map((item) => (
        <div key={item.label} className="analysis-chart-frame-pane">
          {visible.length > 1 ? (
            <p className="analysis-chart-pane-label">{item.label}</p>
          ) : null}
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={item.data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius="70%"
                label={({ name, percent }) => {
                  const label = String(name ?? "");
                  const pct =
                    typeof percent === "number"
                      ? (percent * 100).toFixed(0)
                      : "0";
                  return `${label.slice(0, 14)}${label.length > 14 ? "…" : ""} ${pct}%`;
                }}
              >
                {item.data.map((entry, index) => (
                  <Cell
                    key={`${item.label}-${entry.name}`}
                    fill={COLORS.pie[index % COLORS.pie.length]}
                  />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}

export function TopOverloadedChart({
  data,
  showPlanned = true,
  showAts = false,
}: {
  data: Array<{ name: string; planned?: number; ats?: number }>;
  showPlanned?: boolean;
  showAts?: boolean;
}) {
  if (data.length === 0 || (!showPlanned && !showAts)) {
    return <p className="analysis-chart-hint">No overloaded engineers in this range.</p>;
  }

  return (
    <div className="analysis-chart-frame">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
          <XAxis type="number" tick={{ fill: COLORS.axis, fontSize: 11 }} unit="%" />
          <YAxis type="category" dataKey="name" width={110} tick={{ fill: COLORS.axis, fontSize: 11 }} />
          <Tooltip content={<ChartTooltip />} />
          <Legend />
          {showPlanned ? (
            <Bar dataKey="planned" name="Planned %" fill={COLORS.planned} />
          ) : null}
          {showAts ? (
            <Bar dataKey="ats" name="ATS %" fill={COLORS.overload} />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProjectUtilizationChart({
  data,
  showPlanned = true,
  showAts = true,
}: {
  data: Array<{ project: string; planned: number; actual: number }>;
  showPlanned?: boolean;
  showAts?: boolean;
}) {
  if (data.length === 0 || (!showPlanned && !showAts)) {
    return <p className="analysis-chart-hint">No project hours for this range.</p>;
  }

  const chartData = data.map((row) => ({
    name: row.project.length > 28 ? `${row.project.slice(0, 28)}…` : row.project,
    planned: row.planned,
    actual: row.actual,
  }));

  return (
    <div className="analysis-chart-frame analysis-chart-frame--tall">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 56 }}>
          <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fill: COLORS.axis, fontSize: 10 }} angle={-30} textAnchor="end" height={70} />
          <YAxis tick={{ fill: COLORS.axis, fontSize: 11 }} />
          <Tooltip content={<ChartTooltip />} />
          <Legend />
          {showPlanned ? (
            <Bar dataKey="planned" name="Planned" fill={COLORS.planned} />
          ) : null}
          {showAts ? (
            <Bar dataKey="actual" name="ATS" fill={COLORS.actual} />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BillabilityGauge({
  percent,
  label,
}: {
  percent: number | null;
  label: string;
}) {
  const value = percent === null ? 0 : Math.max(0, Math.min(percent, 150));
  const display = formatAnalysisPercent(percent);
  const rotation = -90 + (Math.min(value, 100) / 100) * 180;

  return (
    <div className="analysis-gauge">
      <div className="analysis-gauge-dial" aria-hidden="true">
        <div className="analysis-gauge-arc" />
        <div
          className="analysis-gauge-needle"
          style={{ transform: `rotate(${rotation}deg)` }}
        />
        <div className="analysis-gauge-hub" />
      </div>
      <p className="analysis-gauge-value">{display}</p>
      <p className="analysis-gauge-label">{label}</p>
    </div>
  );
}

export function ForecastUtilizationChart({ data }: { data: ForecastPoint[] }) {
  const chartData = data.map((point) => ({
    name: point.weekLabel,
    "Forecast util %": point.plannedPercent ?? 0,
    Planned: point.plannedHours,
  }));

  if (chartData.length === 0) {
    return (
      <p className="analysis-chart-hint">
        No upcoming weeks with planned hours in this range.
      </p>
    );
  }

  return (
    <div className="analysis-chart-frame">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fill: COLORS.axis, fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: COLORS.axis, fontSize: 11 }} unit="%" />
          <Tooltip content={<ChartTooltip />} />
          <Legend />
          <Line
            type="monotone"
            dataKey="Forecast util %"
            stroke={COLORS.planned}
            strokeWidth={2}
            dot
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

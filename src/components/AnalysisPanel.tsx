"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BillabilityGauge,
  BillabilityTrendChart,
  ForecastUtilizationChart,
  PlannedVsActualChart,
  ProjectUtilizationChart,
  TopOverloadedChart,
  UtilizationHeatmap,
  WorkloadPieChart,
} from "@/components/analysis/AnalysisChartKit";
import {
  AnalysisChartToolbar,
  type ChartSourceFilters,
} from "@/components/analysis/AnalysisChartToolbar";
import type { UtilizationStore } from "@/hooks/useUtilizationStore";
import { formatAnalysisPercent } from "@/lib/analysis";
import {
  buildAnalysisWeekColumns,
  buildBillabilityTrend,
  buildFirmBillabilityKpi,
  buildForecastUtilization,
  buildPlannedVsActualByEngineer,
  buildProjectUtilizationComparison,
  buildTopOverloaded,
  buildUtilizationHeatmap,
  buildWorkloadSlices,
  type AnalysisWeekColumn,
  type AtsHoursByMonth,
} from "@/lib/analysisCharts";
import {
  getDefaultAnalysisDateRange,
  listMonthsInDateRange,
} from "@/lib/dateRange";
import type { MonthCursor } from "@/lib/weeks";
import { monthCursorKey } from "@/lib/weeks";

type AnalysisPanelProps = {
  store: UtilizationStore;
};

type ChartId =
  | "kpi"
  | "heatmap"
  | "trend"
  | "top"
  | "plannedVs"
  | "workload"
  | "project"
  | "forecast";

function defaultChartFilters(): ChartSourceFilters {
  return {
    planned: true,
    ats: true,
    dateRange: getDefaultAnalysisDateRange(),
  };
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      text.trim().slice(0, 120) || `Request failed (${response.status})`,
    );
  }
}

function ChartCard({
  title,
  filters,
  onFiltersChange,
  showAts = true,
  showPlanned = true,
  children,
}: {
  title: string;
  filters: ChartSourceFilters;
  onFiltersChange: (next: ChartSourceFilters) => void;
  showAts?: boolean;
  showPlanned?: boolean;
  children: ReactNode;
}) {
  const noneSelected =
    (showPlanned || showAts) &&
    (showPlanned ? !filters.planned : true) &&
    (showAts ? !filters.ats : true);

  return (
    <div className="analysis-chart-card">
      <div className="analysis-chart-card-top">
        <h3 className="analysis-chart-title">{title}</h3>
        <AnalysisChartToolbar
          value={filters}
          onChange={onFiltersChange}
          showAts={showAts}
          showPlanned={showPlanned}
        />
      </div>
      {noneSelected ? (
        <p className="analysis-chart-hint">
          {showPlanned && showAts
            ? "Check Planned and/or ATS to show this chart."
            : showAts
              ? "Check ATS to show this chart."
              : "Check Planned to show this chart."}
        </p>
      ) : (
        children
      )}
    </div>
  );
}

function useWeeksForRange(
  dateRange: ChartSourceFilters["dateRange"],
  holidayDates: string[],
): AnalysisWeekColumn[] {
  return useMemo(() => {
    const months = listMonthsInDateRange(dateRange);
    return buildAnalysisWeekColumns(months, holidayDates);
  }, [dateRange, holidayDates]);
}

export function AnalysisPanel({ store }: AnalysisPanelProps) {
  const { entries, engineerNames, holidays } = store;
  const [filtersByChart, setFiltersByChart] = useState<
    Record<ChartId, ChartSourceFilters>
  >(() => ({
    kpi: { ...defaultChartFilters(), planned: false, ats: true },
    heatmap: defaultChartFilters(),
    trend: { ...defaultChartFilters(), planned: false, ats: true },
    top: defaultChartFilters(),
    plannedVs: defaultChartFilters(),
    workload: { ...defaultChartFilters(), planned: false, ats: true },
    project: defaultChartFilters(),
    forecast: { ...defaultChartFilters(), ats: false },
  }));

  const [atsHoursByMonth, setAtsHoursByMonth] = useState<AtsHoursByMonth>({});
  const [atsBillableByMonth, setAtsBillableByMonth] = useState<AtsHoursByMonth>(
    {},
  );
  const [atsLoading, setAtsLoading] = useState(false);
  const [atsError, setAtsError] = useState<string | null>(null);

  const holidayDates = useMemo(
    () => holidays.map((holiday) => holiday.date),
    [holidays],
  );

  const anyAtsEnabled = useMemo(
    () =>
      (Object.entries(filtersByChart) as Array<[ChartId, ChartSourceFilters]>)
        .filter(([id]) => id !== "forecast")
        .some(([, filters]) => filters.ats),
    [filtersByChart],
  );

  const monthsToLoad = useMemo(() => {
    const map = new Map<string, MonthCursor>();
    for (const filters of Object.values(filtersByChart)) {
      if (!filters.ats && !filters.planned) {
        continue;
      }
      for (const month of listMonthsInDateRange(filters.dateRange)) {
        map.set(monthCursorKey(month), month);
      }
    }
    return [...map.values()].sort((a, b) =>
      monthCursorKey(a).localeCompare(monthCursorKey(b)),
    );
  }, [filtersByChart]);

  useEffect(() => {
    if (monthsToLoad.length === 0 || !anyAtsEnabled) {
      return;
    }

    let cancelled = false;

    async function loadAtsHours() {
      setAtsLoading(true);
      setAtsError(null);

      try {
        const results = await Promise.all(
          monthsToLoad.map(async (cursor) => {
            const response = await fetch(
              `/api/clockify/hours?year=${cursor.year}&month=${cursor.month}`,
              { cache: "no-store" },
            );
            const payload = await readJsonResponse<{
              hoursByKey?: Record<string, number>;
              billableHoursByKey?: Record<string, number>;
              error?: string;
            }>(response);

            if (!response.ok) {
              throw new Error(
                payload.error ?? `Request failed (${response.status})`,
              );
            }

            return {
              key: monthCursorKey(cursor),
              hoursByKey: payload.hoursByKey ?? {},
              billableHoursByKey: payload.billableHoursByKey ?? {},
            };
          }),
        );

        if (cancelled) {
          return;
        }

        const hours: AtsHoursByMonth = {};
        const billable: AtsHoursByMonth = {};
        for (const row of results) {
          hours[row.key] = row.hoursByKey;
          billable[row.key] = row.billableHoursByKey;
        }
        setAtsHoursByMonth(hours);
        setAtsBillableByMonth(billable);
      } catch (error) {
        if (!cancelled) {
          setAtsHoursByMonth({});
          setAtsBillableByMonth({});
          setAtsError(
            error instanceof Error
              ? error.message
              : "Failed to load ATS hours.",
          );
        }
      } finally {
        if (!cancelled) {
          setAtsLoading(false);
        }
      }
    }

    void loadAtsHours();
    return () => {
      cancelled = true;
    };
  }, [anyAtsEnabled, monthsToLoad]);

  function updateFilters(id: ChartId, next: ChartSourceFilters) {
    setFiltersByChart((prev) => ({ ...prev, [id]: next }));
  }

  const kpiWeeks = useWeeksForRange(filtersByChart.kpi.dateRange, holidayDates);
  const heatmapWeeks = useWeeksForRange(
    filtersByChart.heatmap.dateRange,
    holidayDates,
  );
  const trendWeeks = useWeeksForRange(
    filtersByChart.trend.dateRange,
    holidayDates,
  );
  const topWeeks = useWeeksForRange(filtersByChart.top.dateRange, holidayDates);
  const plannedVsWeeks = useWeeksForRange(
    filtersByChart.plannedVs.dateRange,
    holidayDates,
  );
  const workloadWeeks = useWeeksForRange(
    filtersByChart.workload.dateRange,
    holidayDates,
  );
  const projectWeeks = useWeeksForRange(
    filtersByChart.project.dateRange,
    holidayDates,
  );
  const forecastWeeks = useWeeksForRange(
    filtersByChart.forecast.dateRange,
    holidayDates,
  );

  /** Firm snapshot — ATS billability gauge only (guideline). */
  const kpiAts = useMemo(
    () =>
      filtersByChart.kpi.ats
        ? buildFirmBillabilityKpi(
            "ats",
            entries,
            engineerNames,
            kpiWeeks,
            atsHoursByMonth,
            atsBillableByMonth,
          )
        : null,
    [
      atsBillableByMonth,
      atsHoursByMonth,
      engineerNames,
      entries,
      filtersByChart.kpi.ats,
      kpiWeeks,
    ],
  );

  const heatmapPlanned = useMemo(
    () =>
      filtersByChart.heatmap.planned
        ? buildUtilizationHeatmap(
            "planned",
            entries,
            engineerNames,
            heatmapWeeks,
            atsHoursByMonth,
          )
        : null,
    [
      atsHoursByMonth,
      engineerNames,
      entries,
      filtersByChart.heatmap.planned,
      heatmapWeeks,
    ],
  );

  const heatmapAts = useMemo(
    () =>
      filtersByChart.heatmap.ats
        ? buildUtilizationHeatmap(
            "ats",
            entries,
            engineerNames,
            heatmapWeeks,
            atsHoursByMonth,
          )
        : null,
    [
      atsHoursByMonth,
      engineerNames,
      entries,
      filtersByChart.heatmap.ats,
      heatmapWeeks,
    ],
  );

  /** Chart 2 — ATS billable hours only (guideline). */
  const trendAts = useMemo(
    () =>
      filtersByChart.trend.ats
        ? buildBillabilityTrend(
            "ats",
            entries,
            engineerNames,
            trendWeeks,
            atsHoursByMonth,
            atsBillableByMonth,
          )
        : undefined,
    [
      atsBillableByMonth,
      atsHoursByMonth,
      engineerNames,
      entries,
      filtersByChart.trend.ats,
      trendWeeks,
    ],
  );

  const topPlanned = useMemo(
    () =>
      filtersByChart.top.planned
        ? buildTopOverloaded(
            "planned",
            entries,
            engineerNames,
            topWeeks,
            atsHoursByMonth,
          )
        : [],
    [
      atsHoursByMonth,
      engineerNames,
      entries,
      filtersByChart.top.planned,
      topWeeks,
    ],
  );

  const topAts = useMemo(
    () =>
      filtersByChart.top.ats
        ? buildTopOverloaded(
            "ats",
            entries,
            engineerNames,
            topWeeks,
            atsHoursByMonth,
          )
        : [],
    [atsHoursByMonth, engineerNames, entries, filtersByChart.top.ats, topWeeks],
  );

  const topMerged = useMemo(() => {
    const byName = new Map<
      string,
      { name: string; planned?: number; ats?: number }
    >();
    for (const row of topPlanned) {
      byName.set(row.name, { name: row.name, planned: row.percent });
    }
    for (const row of topAts) {
      const current = byName.get(row.name) ?? { name: row.name };
      current.ats = row.percent;
      byName.set(row.name, current);
    }
    return [...byName.values()]
      .sort(
        (a, b) =>
          Math.max(b.planned ?? 0, b.ats ?? 0) -
          Math.max(a.planned ?? 0, a.ats ?? 0),
      )
      .slice(0, 5);
  }, [topAts, topPlanned]);

  const plannedVsData = useMemo(
    () =>
      buildPlannedVsActualByEngineer(
        entries,
        engineerNames,
        plannedVsWeeks,
        atsHoursByMonth,
        "ats",
      ),
    [atsHoursByMonth, engineerNames, entries, plannedVsWeeks],
  );

  /** Chart 4 — ATS billable vs non-billable only (guideline). */
  const workloadAts = useMemo(
    () =>
      filtersByChart.workload.ats
        ? buildWorkloadSlices(
            "ats",
            entries,
            engineerNames,
            workloadWeeks,
            atsHoursByMonth,
            atsBillableByMonth,
          )
        : [],
    [
      atsBillableByMonth,
      atsHoursByMonth,
      engineerNames,
      entries,
      filtersByChart.workload.ats,
      workloadWeeks,
    ],
  );

  const projectData = useMemo(
    () =>
      buildProjectUtilizationComparison(
        entries,
        engineerNames,
        projectWeeks,
        atsHoursByMonth,
        "ats",
      ),
    [atsHoursByMonth, engineerNames, entries, projectWeeks],
  );

  const forecast = useMemo(
    () => buildForecastUtilization(entries, engineerNames, forecastWeeks),
    [engineerNames, entries, forecastWeeks],
  );

  return (
    <div className="analysis-panel">
      <div className="analysis-header">
        <div>
          <h2 className="analysis-title">Analysis</h2>
          <p className="analysis-subtitle">
            Each chart has its own Planned / ATS toggles and date range — check
            one or both sources to compare.
          </p>
        </div>
      </div>

      {anyAtsEnabled && atsLoading ? (
        <p className="hint analysis-empty">Loading ATS hours…</p>
      ) : null}
      {anyAtsEnabled && atsError ? (
        <p className="users-error" role="alert">
          {atsError}
        </p>
      ) : null}

      {engineerNames.length === 0 ? (
        <p className="hint analysis-empty">
          Add engineers on Overview to populate Analysis charts.
        </p>
      ) : (
        <>
          <section className="analysis-section">
            <ChartCard
              title="Firm billability"
              filters={filtersByChart.kpi}
              onFiltersChange={(next) =>
                updateFilters("kpi", { ...next, planned: false })
              }
              showPlanned={false}
              showAts
            >
              <div className="analysis-insight-row analysis-insight-row--kpi">
                {kpiAts ? (
                  <>
                    <div className="analysis-insight-card analysis-insight-card--gauge">
                      <BillabilityGauge
                        percent={kpiAts.percent}
                        label="Firm billability (ATS billable / capacity)"
                      />
                    </div>
                    <div className="analysis-insight-card">
                      <p className="analysis-insight-label">Billable %</p>
                      <p className="analysis-insight-value">
                        {formatAnalysisPercent(kpiAts.percent)}
                      </p>
                      <p className="analysis-insight-detail">
                        ATS billable hours vs capacity in this date range
                      </p>
                    </div>
                  </>
                ) : null}
                <div className="analysis-insight-card">
                  <p className="analysis-insight-label">Engineers</p>
                  <p className="analysis-insight-value">
                    {engineerNames.length}
                  </p>
                  <p className="analysis-insight-detail">
                    On the Overview engineer list
                  </p>
                </div>
                <div className="analysis-insight-card">
                  <p className="analysis-insight-label">Weeks</p>
                  <p className="analysis-insight-value">{kpiWeeks.length}</p>
                  <p className="analysis-insight-detail">
                    In this chart’s date range
                  </p>
                </div>
              </div>
            </ChartCard>
          </section>

          <section className="analysis-section">
            <ChartCard
              title="1. Engineer utilization heatmap"
              filters={filtersByChart.heatmap}
              onFiltersChange={(next) => updateFilters("heatmap", next)}
            >
              <div className="analysis-heatmap-modes">
                {heatmapPlanned ? (
                  <div>
                    {filtersByChart.heatmap.ats ? (
                      <p className="analysis-chart-pane-label">Planned</p>
                    ) : null}
                    <UtilizationHeatmap
                      weeks={heatmapWeeks}
                      rows={heatmapPlanned}
                    />
                  </div>
                ) : null}
                {heatmapAts ? (
                  <div>
                    {filtersByChart.heatmap.planned ? (
                      <p className="analysis-chart-pane-label">ATS</p>
                    ) : null}
                    <UtilizationHeatmap
                      weeks={heatmapWeeks}
                      rows={heatmapAts}
                    />
                  </div>
                ) : null}
              </div>
            </ChartCard>
          </section>

          <section className="analysis-section analysis-section--split">
            <ChartCard
              title="2. Weekly vs monthly billability trend"
              filters={filtersByChart.trend}
              onFiltersChange={(next) =>
                updateFilters("trend", { ...next, planned: false })
              }
              showPlanned={false}
              showAts
            >
              <p className="analysis-chart-hint">
                ATS billable hours % vs capacity — weekly line and monthly
                average.
              </p>
              <BillabilityTrendChart ats={trendAts} />
            </ChartCard>
            <ChartCard
              title="3. Planned vs ATS"
              filters={filtersByChart.plannedVs}
              onFiltersChange={(next) => updateFilters("plannedVs", next)}
            >
              <PlannedVsActualChart
                data={plannedVsData}
                showPlanned={filtersByChart.plannedVs.planned}
                showAts={filtersByChart.plannedVs.ats}
              />
            </ChartCard>
          </section>

          <section className="analysis-section analysis-section--split">
            <ChartCard
              title="4. Workload distribution"
              filters={filtersByChart.workload}
              onFiltersChange={(next) =>
                updateFilters("workload", { ...next, planned: false })
              }
              showPlanned={false}
              showAts
            >
              <p className="analysis-chart-hint">
                ATS billable vs non-billable hours (firm-wide).
              </p>
              <WorkloadPieChart
                series={
                  filtersByChart.workload.ats
                    ? [{ label: "ATS", data: workloadAts }]
                    : []
                }
              />
            </ChartCard>
            <ChartCard
              title="5. Top 5 overloaded"
              filters={filtersByChart.top}
              onFiltersChange={(next) => updateFilters("top", next)}
            >
              <TopOverloadedChart
                data={topMerged}
                showPlanned={filtersByChart.top.planned}
                showAts={filtersByChart.top.ats}
              />
            </ChartCard>
          </section>

          <section className="analysis-section analysis-section--split">
            <ChartCard
              title="6. Project utilization comparison"
              filters={filtersByChart.project}
              onFiltersChange={(next) => updateFilters("project", next)}
            >
              <ProjectUtilizationChart
                data={projectData}
                showPlanned={filtersByChart.project.planned}
                showAts={filtersByChart.project.ats}
              />
            </ChartCard>
            <ChartCard
              title="7. Forecasted utilization"
              filters={filtersByChart.forecast}
              onFiltersChange={(next) =>
                updateFilters("forecast", { ...next, ats: false })
              }
              showAts={false}
            >
              <ForecastUtilizationChart data={forecast} />
            </ChartCard>
          </section>
        </>
      )}
    </div>
  );
}

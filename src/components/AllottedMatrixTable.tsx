"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildAllottedMatrix,
  formatAnalysisNumber,
  formatAnalysisPercent,
} from "@/lib/analysis";
import type { UtilizationEntry } from "@/lib/entries";
import type { MonthCursor } from "@/lib/weeks";

type AllottedMatrixTableProps = {
  entries: UtilizationEntry[];
  engineerOptions: string[];
  months: MonthCursor[];
  holidayDates?: readonly string[];
};

function formatCell(value: number): string {
  if (!value) {
    return "";
  }
  return formatAnalysisNumber(value);
}

export function AllottedMatrixTable({
  entries,
  engineerOptions,
  months,
  holidayDates = [],
}: AllottedMatrixTableProps) {
  const [selectedEngineers, setSelectedEngineers] = useState<string[]>(
    () => engineerOptions,
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSelectedEngineers((current) => {
      const stillValid = current.filter((name) =>
        engineerOptions.includes(name),
      );
      if (stillValid.length > 0) {
        return stillValid;
      }
      return engineerOptions;
    });
  }, [engineerOptions]);

  const matrix = useMemo(
    () =>
      buildAllottedMatrix(entries, selectedEngineers, months, holidayDates),
    [entries, selectedEngineers, months, holidayDates],
  );

  const weekTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    let grandTotal = 0;

    for (const week of matrix.weeks) {
      const sum = matrix.engineers.reduce(
        (acc, engineer) => acc + (engineer.hoursByWeek[week.key] ?? 0),
        0,
      );
      totals[week.key] = sum;
      grandTotal += sum;
    }

    return { byWeek: totals, grandTotal };
  }, [matrix]);

  function toggleEngineer(name: string) {
    setSelectedEngineers((current) => {
      if (current.includes(name)) {
        return current.filter((item) => item !== name);
      }
      return [...current, name];
    });
  }

  function toggleExpanded(name: string) {
    setExpanded((current) => ({
      ...current,
      [name]: !(current[name] ?? true),
    }));
  }

  function selectAll() {
    setSelectedEngineers(engineerOptions);
  }

  function clearAll() {
    setSelectedEngineers([]);
  }

  if (engineerOptions.length === 0) {
    return null;
  }

  return (
    <section className="analysis-section">
      <div className="analysis-chart-card">
        <div className="analysis-header analysis-header--compact">
          <div>
            <h3 className="analysis-chart-title">Allotted hours by engineer</h3>
            <p className="analysis-chart-hint">
              Expand an engineer to see project codes. Total hours is the sum
              across the selected date range.
            </p>
          </div>
          <div className="allotted-matrix-actions">
            <button
              type="button"
              className="button secondary button-small"
              onClick={selectAll}
            >
              Select all
            </button>
            <button
              type="button"
              className="button secondary button-small"
              onClick={clearAll}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="allotted-matrix-engineers" role="group" aria-label="Engineers">
          {engineerOptions.map((name) => {
            const checked = selectedEngineers.includes(name);
            return (
              <label
                key={name}
                className={
                  checked
                    ? "allotted-matrix-chip allotted-matrix-chip--active"
                    : "allotted-matrix-chip"
                }
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleEngineer(name)}
                />
                <span>{name}</span>
              </label>
            );
          })}
        </div>

        {selectedEngineers.length === 0 ? (
          <p className="analysis-chart-hint">
            Select one or more engineers to show allotted hours.
          </p>
        ) : (
          <div className="allotted-matrix-scroll">
            <table className="allotted-matrix-table">
              <thead>
                <tr>
                  <th className="allotted-matrix-sticky">Engineer</th>
                  {matrix.weeks.map((week) => (
                    <th key={week.key}>{week.label}</th>
                  ))}
                  <th className="allotted-matrix-total-col">Total hours</th>
                </tr>
              </thead>
              <tbody>
                {matrix.engineers.map((engineer) => {
                  const isOpen = expanded[engineer.engineerName] ?? true;
                  return (
                    <FragmentRows
                      key={engineer.engineerName}
                      engineerName={engineer.engineerName}
                      isOpen={isOpen}
                      onToggle={() => toggleExpanded(engineer.engineerName)}
                      weekKeys={matrix.weeks.map((week) => week.key)}
                      hoursByWeek={engineer.hoursByWeek}
                      total={engineer.total}
                      projects={engineer.projects}
                    />
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="allotted-matrix-week-total-row">
                  <th className="allotted-matrix-sticky" scope="row">
                    Allotted Total Hours
                  </th>
                  {matrix.weeks.map((week) => (
                    <td key={week.key}>
                      {formatCell(weekTotals.byWeek[week.key] ?? 0)}
                    </td>
                  ))}
                  <td className="allotted-matrix-total-col">
                    {formatAnalysisNumber(weekTotals.grandTotal)}
                  </td>
                </tr>
                <tr className="allotted-matrix-week-forecasted-row">
                  <th className="allotted-matrix-sticky" scope="row">
                    Total Forecasted Hours
                  </th>
                  {matrix.weeks.map((week) => (
                    <td key={week.key}>{formatAnalysisNumber(week.capacityHours)}</td>
                  ))}
                  <td className="allotted-matrix-total-col">
                    {formatAnalysisNumber(
                      matrix.weeks.reduce(
                        (sum, week) => sum + week.capacityHours,
                        0,
                      ),
                    )}
                  </td>
                </tr>
                <tr className="allotted-matrix-week-percent-row">
                  <th className="allotted-matrix-sticky" scope="row">
                    % Total Forecasted Hours
                  </th>
                  {matrix.weeks.map((week) => {
                    const forecasted = week.capacityHours;
                    const allotted = weekTotals.byWeek[week.key] ?? 0;
                    const percent =
                      forecasted > 0 ? (allotted / forecasted) * 100 : null;
                    return <td key={week.key}>{formatAnalysisPercent(percent)}</td>;
                  })}
                  <td className="allotted-matrix-total-col">
                    {formatAnalysisPercent(
                      (() => {
                        const forecastedTotal = matrix.weeks.reduce(
                          (sum, week) => sum + week.capacityHours,
                          0,
                        );
                        return forecastedTotal > 0
                          ? (weekTotals.grandTotal / forecastedTotal) * 100
                          : null;
                      })(),
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function FragmentRows({
  engineerName,
  isOpen,
  onToggle,
  weekKeys,
  hoursByWeek,
  total,
  projects,
}: {
  engineerName: string;
  isOpen: boolean;
  onToggle: () => void;
  weekKeys: string[];
  hoursByWeek: Record<string, number>;
  total: number;
  projects: Array<{
    projectCode: string;
    projectName: string;
    hoursByWeek: Record<string, number>;
    total: number;
  }>;
}) {
  return (
    <>
      <tr className="allotted-matrix-engineer-row">
        <th className="allotted-matrix-sticky" scope="row">
          <button
            type="button"
            className="allotted-matrix-toggle"
            onClick={onToggle}
            aria-expanded={isOpen}
          >
            <span className="allotted-matrix-toggle-icon" aria-hidden="true">
              {isOpen ? "−" : "+"}
            </span>
            <span>{engineerName}</span>
          </button>
        </th>
        {weekKeys.map((key) => (
          <td key={key}>{formatCell(hoursByWeek[key] ?? 0)}</td>
        ))}
        <td className="allotted-matrix-total-col">
          {formatAnalysisNumber(total)}
        </td>
      </tr>
      {isOpen
        ? projects.map((project) => (
            <tr key={`${engineerName}-${project.projectCode}`} className="allotted-matrix-project-row">
              <th className="allotted-matrix-sticky allotted-matrix-project" scope="row">
                <span title={project.projectName}>{project.projectCode}</span>
              </th>
              {weekKeys.map((key) => (
                <td key={key}>{formatCell(project.hoursByWeek[key] ?? 0)}</td>
              ))}
              <td className="allotted-matrix-total-col">
                {project.total ? formatAnalysisNumber(project.total) : ""}
              </td>
            </tr>
          ))
        : null}
    </>
  );
}

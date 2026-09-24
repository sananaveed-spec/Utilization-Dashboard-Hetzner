"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddEngineerDialog } from "@/components/AddEngineerDialog";
import { Overview2GroupedResults } from "@/components/Overview2GroupedResults";
import type { UtilizationStore } from "@/hooks/useUtilizationStore";
import {
  createUtilizationEntry,
  type UtilizationEntry,
} from "@/lib/entries";
import { isSameEngineerName } from "@/lib/engineers";
import {
  getDefaultOverviewDateRange,
  listMonthsInDateRange,
  type DateRange,
} from "@/lib/dateRange";
import { parseProjectParts, projectLookupKey } from "@/lib/projects";
import {
  getCurrentMonthCursor,
  monthCursorKey,
  type MonthCursor,
} from "@/lib/weeks";

type ClockifyEmployee = {
  id: string;
  name: string;
  email: string;
};

type ClockifyProject = {
  id: string;
  name: string;
  clientName: string | null;
};

type ClockifyPayload = {
  employees: ClockifyEmployee[];
};

async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `Server returned an unexpected response (${response.status}). Try refreshing the page.`,
    );
  }

  return (await response.json()) as T;
}

function syncEngineerClockifyProjects(
  engineerName: string,
  clockifyProjects: ClockifyProject[],
  existingEntries: UtilizationEntry[],
): { entries: UtilizationEntry[]; visibleIds: string[] } {
  const next = [...existingEntries];
  const visibleIds: string[] = [];

  for (const project of clockifyProjects) {
    const { projectCode, projectName } = parseProjectParts(project.name);
    const lookupKey = projectLookupKey(projectCode, projectName);

    const existingIndex = next.findIndex(
      (entry) =>
        isSameEngineerName(entry.engineerName, engineerName) &&
        projectLookupKey(entry.projectCode, entry.projectName) === lookupKey,
    );

    if (existingIndex >= 0) {
      const existing = next[existingIndex];
      if (existing.projectName !== projectName) {
        next[existingIndex] = { ...existing, projectName };
      }
      visibleIds.push(next[existingIndex].id);
      continue;
    }

    const entry = createUtilizationEntry({
      engineerName,
      projectCode,
      projectName,
    });
    next.push(entry);
    visibleIds.push(entry.id);
  }

  return { entries: next, visibleIds };
}

type Overview2FiltersProps = {
  store: UtilizationStore;
};

export function Overview2Filters({ store }: Overview2FiltersProps) {
  const {
    entries,
    engineerNames,
    holidays,
    updateEntries,
    updateEngineerNames,
  } = store;

  const [employees, setEmployees] = useState<ClockifyEmployee[]>([]);
  // Track selection by engineer `name` (stable) rather than Clockify `id` (changes
  // while the Clockify employee list loads).
  const [selectedEngineerNames, setSelectedEngineerNames] = useState<Set<string>>(
    new Set(),
  );
  const [searchedEngineerNames, setSearchedEngineerNames] = useState<string[]>([]);
  const [visibleProjectIdsByEngineer, setVisibleProjectIdsByEngineer] = useState<Record<string, string[]>>({});
  const [isAddingEngineer, setIsAddingEngineer] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [month, setMonth] = useState<MonthCursor>(() => getCurrentMonthCursor());
  const [dateRange, setDateRange] = useState<DateRange>(() =>
    getDefaultOverviewDateRange(),
  );
  const [clockifyHoursByMonth, setClockifyHoursByMonth] = useState<
    Record<string, Record<string, number>>
  >({});
  const [clockifyHoursLoading, setClockifyHoursLoading] = useState(false);
  const [clockifyHoursError, setClockifyHoursError] = useState<string | null>(
    null,
  );

  const monthsInRange = useMemo(
    () => listMonthsInDateRange(dateRange),
    [dateRange],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/clockify", { cache: "no-store" });
      const payload = await readJsonResponse<
        ClockifyPayload & { error?: string }
      >(response);

      if (!response.ok) {
        throw new Error(payload.error ?? `Request failed (${response.status})`);
      }

      setEmployees(payload.employees);
    } catch (err) {
      setEmployees([]);
      setError(
        err instanceof Error ? err.message : "Failed to load Clockify data.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (searchedEngineerNames.length === 0 || monthsInRange.length === 0) {
      return;
    }

    let cancelled = false;

    async function loadClockifyHours() {
      setClockifyHoursLoading(true);
      setClockifyHoursError(null);

      try {
        const results = await Promise.all(
          monthsInRange.map(async (cursor) => {
            const response = await fetch(
              `/api/clockify/hours?year=${cursor.year}&month=${cursor.month}`,
              { cache: "no-store" },
            );
            const payload = await readJsonResponse<{
              hoursByKey?: Record<string, number>;
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
            };
          }),
        );

        if (!cancelled) {
          const next: Record<string, Record<string, number>> = {};
          for (const result of results) {
            next[result.key] = result.hoursByKey;
          }
          setClockifyHoursByMonth(next);
        }
      } catch (err) {
        if (!cancelled) {
          setClockifyHoursByMonth({});
          setClockifyHoursError(
            err instanceof Error
              ? err.message
              : "Failed to load Clockify hours.",
          );
        }
      } finally {
        if (!cancelled) {
          setClockifyHoursLoading(false);
        }
      }
    }

    void loadClockifyHours();

    return () => {
      cancelled = true;
    };
  }, [monthsInRange, searchedEngineerNames]);

  const listedEmployees = useMemo(() => {
    return engineerNames
      .map((name) => {
        const match = employees.find((employee) =>
          isSameEngineerName(employee.name, name),
        );
        return {
          id: match?.id ?? `local:${name}`,
          name: match?.name ?? name,
          email: match?.email ?? "",
          linked: Boolean(match),
        };
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
  }, [employees, engineerNames]);

  const hasAutoSearched = useRef(false);

  // Auto-select all engineers when the list is first populated, then auto-search once
  useEffect(() => {
    if (listedEmployees.length > 0 && selectedEngineerNames.size === 0) {
      setSelectedEngineerNames(new Set(listedEmployees.map((e) => e.name)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listedEmployees]);


  const addCandidates = useMemo(() => {
    return employees.filter(
      (employee) =>
        !engineerNames.some((name) => isSameEngineerName(name, employee.name)),
    );
  }, [employees, engineerNames]);

  const selectedEngineers = listedEmployees.filter(
    (employee) => selectedEngineerNames.has(employee.name),
  );

  function toggleEngineer(name: string, checked: boolean) {
    setSelectedEngineerNames((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(name);
      } else {
        next.delete(name);
      }
      return next;
    });
    setActionError(null);

  }

  function selectAllEmployees() {
    setSelectedEngineerNames(new Set(listedEmployees.map((employee) => employee.name)));
    setActionError(null);
  }

  function clearAllEmployees() {
    setSelectedEngineerNames(new Set());
    setActionError(null);
  }

  function handleAddEngineer(name: string) {
    const alreadyExists = engineerNames.some((existing) =>
      isSameEngineerName(existing, name),
    );

    if (alreadyExists) {
      setActionError(`"${name}" is already on the engineer list.`);
      setIsAddingEngineer(false);
      return;
    }

    updateEngineerNames([...engineerNames, name]);
    setActionError(null);
    setIsAddingEngineer(false);

    const match = employees.find((employee) =>
      isSameEngineerName(employee.name, name),
    );
    if (match) {
      setSelectedEngineerNames((prev) => new Set([...prev, match.name]));
    }
  }

  function handleDeleteEngineer() {
    if (selectedEngineers.length === 0) {
      setActionError("Select at least one engineer before deleting.");
      return;
    }

    const names = selectedEngineers.map((e) => e.name);
    const label =
      names.length === 1
        ? `"${names[0]}"`
        : `${names.length} engineers`;

    const confirmed = window.confirm(
      `Remove ${label} from the engineer list?`,
    );
    if (!confirmed) {
      return;
    }

    updateEngineerNames(
      engineerNames.filter(
        (name) => !selectedEngineers.some((e) => isSameEngineerName(name, e.name)),
      ),
    );
    updateEntries(
      entries.filter(
        (entry) =>
          !selectedEngineers.some((e) =>
            isSameEngineerName(entry.engineerName, e.name),
          ),
      ),
    );
    setSelectedEngineerNames(new Set());
    setSearchedEngineerNames([]);
    setVisibleProjectIdsByEngineer({});
    setActionError(null);

  }

  async function handleSearch() {
    if (selectedEngineers.length === 0) {
      setActionError("Select at least one engineer name before searching.");

      return;
    }

    const unlinked = selectedEngineers.filter((e) => !e.linked);
    if (unlinked.length > 0) {
      setActionError(
        `${unlinked.map((e) => `"${e.name}"`).join(", ")} ${unlinked.length === 1 ? "was" : "were"} not found in Clockify. Add them from Clockify employees.`,
      );

      return;
    }

    setSearching(true);
    setActionError(null);


    let allEntries = [...entries];
    const newVisibleByEngineer: Record<string, string[]> = {};
    const messages: string[] = [];
    const errors: string[] = [];

    await Promise.all(
      selectedEngineers.map(async (engineer) => {
        try {
          const response = await fetch(
            `/api/clockify/user-projects?userId=${encodeURIComponent(engineer.id)}`,
            { cache: "no-store" },
          );
          const payload = await readJsonResponse<{
            projects?: ClockifyProject[];
            error?: string;
          }>(response);

          if (!response.ok) {
            throw new Error(payload.error ?? `Request failed (${response.status})`);
          }

          const clockifyProjects = payload.projects ?? [];
          const { entries: nextEntries, visibleIds } = syncEngineerClockifyProjects(
            engineer.name,
            clockifyProjects,
            allEntries,
          );
          allEntries = nextEntries;
          newVisibleByEngineer[engineer.name] = visibleIds;
          messages.push(
            clockifyProjects.length === 0
              ? `No active projects found for ${engineer.name}.`
              : `Loaded ${clockifyProjects.length} project${clockifyProjects.length === 1 ? "" : "s"} for ${engineer.name}.`,
          );
        } catch (err) {
          errors.push(
            `${engineer.name}: ${err instanceof Error ? err.message : "Failed to load projects."}`,
          );
        }
      }),
    );

    updateEntries(allEntries);
    setVisibleProjectIdsByEngineer(newVisibleByEngineer);
    setSearchedEngineerNames(Object.keys(newVisibleByEngineer));

    if (errors.length > 0) {
      setActionError(errors.join(" "));
    }
    if (messages.length > 0) {

    }

    setSearching(false);
  }

  // Auto-search once on initial load after employees finish loading
  useEffect(() => {
    if (
      !hasAutoSearched.current &&
      !loading &&
      !searching &&
      selectedEngineerNames.size > 0 &&
      searchedEngineerNames.length === 0
    ) {
      hasAutoSearched.current = true;
      void handleSearch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, selectedEngineerNames]);

  const disabled = loading || Boolean(error) || searching;
  const searchedEngineerNameSet = useMemo(
    () => new Set(searchedEngineerNames),
    [searchedEngineerNames],
  );

  return (
    <div className="utilization-workspace">
      <section className="filters">
        {error ? (
          <p className="form-message error" role="alert">
            {error}
          </p>
        ) : null}

        {actionError ? (
          <p className="form-message error" role="alert">
            {actionError}
          </p>
        ) : null}

        <div className="filter-fields-row">
          <div className="engineer-filter filter-field--engineer">
            <div className="field-label-row">
              <span className="field-label" id="overview2-engineer-label">
                Employee Name
              </span>
              <div className="field-label-actions">
                <button
                  type="button"
                  className="button secondary button-small"
                  onClick={() => {
                    setActionError(null);
                    setIsAddingEngineer(true);
                  }}
                  disabled={disabled}
                >
                  Add
                </button>
                <button
                  type="button"
                  className="button danger button-small"
                  onClick={handleDeleteEngineer}
                  disabled={disabled || selectedEngineerNames.size === 0}
                >
                  Delete
                </button>
              </div>
            </div>

            {listedEmployees.length === 0 && !loading ? (
              <p className="hint">
                No engineers on the list yet. Use Add to include Clockify
                employees.
              </p>
            ) : (
              <div
                className="overview2-radio-row"
                role="group"
                aria-labelledby="overview2-engineer-label"
              >
                {listedEmployees.map((employee) => {
                  const inputId = `overview2-engineer-${employee.id}`;
                  return (
                    <label
                      key={employee.id}
                      className="overview2-radio-option"
                      htmlFor={inputId}
                    >
                      <input
                        id={inputId}
                        type="checkbox"
                        value={employee.id}
                        checked={selectedEngineerNames.has(employee.name)}
                        onChange={(e) => {
                          toggleEngineer(employee.name, e.target.checked);
                        }}
                        disabled={disabled}
                      />
                      <span>{employee.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="filter-actions">
          <button
            type="button"
            className="button primary"
            onClick={() => {
              void handleSearch();
            }}
            disabled={disabled || selectedEngineerNames.size === 0}
          >
            {searching ? "Searching…" : "Search"}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={selectAllEmployees}
            disabled={disabled || listedEmployees.length === 0}
          >
            Select All
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={clearAllEmployees}
            disabled={disabled || selectedEngineerNames.size === 0}
          >
            Clear All
          </button>
        </div>

        {isAddingEngineer ? (
          <AddEngineerDialog
            candidates={addCandidates}
            onSave={handleAddEngineer}
            onClose={() => setIsAddingEngineer(false)}
          />
        ) : null}
      </section>

      <Overview2GroupedResults
        engineers={selectedEngineers
          .filter((engineer) => searchedEngineerNameSet.has(engineer.name))
          .map((engineer) => ({
            engineerName: engineer.name,
            visibleProjectIds: visibleProjectIdsByEngineer[engineer.name] ?? [],
            onUpdate: (updated) => {
              updateEntries(
                entries.map((entry) =>
                  entry.id === updated.id ? updated : entry,
                ),
              );
            },
            onDelete: (id) => {
              updateEntries(entries.filter((entry) => entry.id !== id));
              setVisibleProjectIdsByEngineer((current) => ({
                ...current,
                [engineer.name]: (current[engineer.name] ?? []).filter(
                  (entryId) => entryId !== id,
                ),
              }));
            },
          }))}
        entries={entries}
        month={month}
        dateRange={dateRange}
        onDateRangeChange={(range) => {
          setDateRange(range);
          // Use the *end* month of the selected range.
          // (If the range spans multiple months, users expect to see the last month.)
          const parsed = range.end.split("-").map(Number);
          if (parsed.length === 3) {
            const [year, month] = parsed;
            if (year && month) setMonth({ year, month });
          }
        }}
        holidayDates={holidays.map((holiday) => holiday.date)}
        clockifyHoursByMonth={clockifyHoursByMonth}
        clockifyHoursLoading={clockifyHoursLoading}
        clockifyHoursError={clockifyHoursError}
      />
    </div>
  );
}

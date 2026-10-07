"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccess } from "@/auth/accessContext";
import type { ResolvedAccess } from "@/auth/access";
import { AddEngineerDialog } from "@/components/AddEngineerDialog";
import { AnalysisDateRangePicker } from "@/components/AnalysisDateRangePicker";
import { Overview2GroupedResults } from "@/components/Overview2GroupedResults";
import type { UtilizationStore } from "@/hooks/useUtilizationStore";
import {
  createUtilizationEntry,
  type UtilizationEntry,
} from "@/lib/entries";
import { isSameEngineerName, normalizeEngineerName } from "@/lib/engineers";
import {
  getDefaultOverviewDateRange,
  listMonthsInDateRange,
  type DateRange,
} from "@/lib/dateRange";
import { parseProjectParts, projectLookupKey, isProjectCode } from "@/lib/projects";
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
): {
  entries: UtilizationEntry[];
  visibleProjects: Array<{ projectCode: string; projectName: string }>;
} {
  const next = [...existingEntries];
  const visibleProjects: Array<{ projectCode: string; projectName: string }> =
    [];

  for (const project of clockifyProjects) {
    const { projectCode, projectName } = parseProjectParts(project.name);
    visibleProjects.push({ projectCode, projectName });
    const lookupKey = projectLookupKey(projectCode, projectName);

    const existingIndex = next.findIndex(
      (entry) =>
        isSameEngineerName(entry.engineerName, engineerName) &&
        projectLookupKey(entry.projectCode, entry.projectName) === lookupKey,
    );

    if (existingIndex >= 0) {
      const existing = next[existingIndex];
      if (
        existing.projectCode !== projectCode ||
        existing.projectName !== projectName
      ) {
        next[existingIndex] = { ...existing, projectCode, projectName };
      }
      continue;
    }

    next.push(
      createUtilizationEntry({
        engineerName,
        projectCode,
        projectName,
      }),
    );
  }

  return { entries: next, visibleProjects };
}

type Overview2FiltersProps = {
  store: UtilizationStore;
  accessOverride?: ResolvedAccess;
};

export function Overview2Filters({
  store,
  accessOverride,
}: Overview2FiltersProps) {
  const accessFromContext = useAccess();
  const canEdit = accessOverride?.canEdit ?? accessFromContext.canEdit;
  const scope = accessOverride?.scope ?? accessFromContext.scope;
  const linkedEngineerName =
    accessOverride?.engineerName ?? accessFromContext.engineerName;
  const needsEngineerLink =
    accessOverride?.needsEngineerLink ?? accessFromContext.needsEngineerLink;
  const isSelfScope = scope === "self";
  const {
    entries,
    engineerNames,
    holidays,
    loading: storeLoading,
    updateEntries,
    updateEngineerNames,
  } = store;

  const [employees, setEmployees] = useState<ClockifyEmployee[]>([]);
  // Track selection by engineer `name` (stable) rather than ATS `id` (changes
  // while the ATS employee list loads).
  const [selectedEngineerNames, setSelectedEngineerNames] = useState<Set<string>>(
    new Set(),
  );
  const [searchedEngineerNames, setSearchedEngineerNames] = useState<string[]>([]);
  /** Parsed ATS projects from last Search — source of truth for visible rows. */
  const [visibleProjectsByEngineer, setVisibleProjectsByEngineer] = useState<
    Record<string, Array<{ projectCode: string; projectName: string }>>
  >({});
  const [isAddingEngineer, setIsAddingEngineer] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState({ done: 0, total: 0 });
  const [searchElapsedSec, setSearchElapsedSec] = useState(0);
  const [month, setMonth] = useState<MonthCursor>(() => getCurrentMonthCursor());
  // Initial load only: current month ±6. User date-picker changes replace this.
  const [dateRange, setDateRange] = useState<DateRange>(() =>
    getDefaultOverviewDateRange(),
  );
  const [clockifyHoursByMonth, setClockifyHoursByMonth] = useState<
    Record<string, Record<string, number>>
  >({});
  const [billableHoursByMonth, setBillableHoursByMonth] = useState<
    Record<string, Record<string, number>>
  >({});
  const [clockifyHoursLoading, setClockifyHoursLoading] = useState(false);
  const [clockifyHoursError, setClockifyHoursError] = useState<string | null>(
    null,
  );
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

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
        err instanceof Error ? err.message : "Failed to load ATS data.",
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

        if (!cancelled) {
          const next: Record<string, Record<string, number>> = {};
          const nextBillable: Record<string, Record<string, number>> = {};
          for (const result of results) {
            next[result.key] = result.hoursByKey;
            nextBillable[result.key] = result.billableHoursByKey;
          }
          setClockifyHoursByMonth(next);
          setBillableHoursByMonth(nextBillable);

          // Merge any projects that have hours in-range into the visible list
          // (covers uncoded names if Search state was incomplete).
          setVisibleProjectsByEngineer((current) => {
            if (searchedEngineerNames.length === 0) return current;
            const merged: typeof current = { ...current };
            for (const engineerName of searchedEngineerNames) {
              const prefix = `${normalizeEngineerName(engineerName)}::`;
              const byKey = new Map<
                string,
                { projectCode: string; projectName: string }
              >();
              for (const project of merged[engineerName] ?? []) {
                byKey.set(
                  projectLookupKey(project.projectCode, project.projectName),
                  project,
                );
              }
              for (const hoursByKey of Object.values(next)) {
                for (const [key, hours] of Object.entries(hoursByKey)) {
                  if (!Number.isFinite(hours) || hours <= 0) continue;
                  if (!key.startsWith(prefix)) continue;
                  const parts = key.split("::");
                  if (parts.length !== 3) continue;
                  const lookup = parts[1] ?? "";
                  if (!lookup || byKey.has(lookup)) continue;
                  if (lookup.startsWith("name:")) {
                    byKey.set(lookup, {
                      projectCode: "—",
                      projectName: lookup.slice("name:".length),
                    });
                  } else if (isProjectCode(lookup)) {
                    byKey.set(lookup, {
                      projectCode: lookup,
                      projectName: "—",
                    });
                  }
                }
              }
              merged[engineerName] = [...byKey.values()];
            }
            return merged;
          });
        }
      } catch (err) {
        if (!cancelled) {
          setClockifyHoursByMonth({});
          setBillableHoursByMonth({});
          setClockifyHoursError(
            err instanceof Error
              ? err.message
              : "Failed to load ATS hours.",
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
    const names =
      isSelfScope && linkedEngineerName
        ? engineerNames.filter((name) =>
            isSameEngineerName(name, linkedEngineerName),
          )
        : engineerNames;

    return names
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
  }, [employees, engineerNames, isSelfScope, linkedEngineerName]);

  const hasAutoSearched = useRef(false);
  const lastSearchedRangeRef = useRef<string>("");

  useEffect(() => {
    if (!searching) {
      setSearchElapsedSec(0);
      return;
    }
    setSearchElapsedSec(0);
    const timer = window.setInterval(() => {
      setSearchElapsedSec((sec) => sec + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [searching]);

  // Auto-select engineers when the list is first populated (self-scope: linked only)
  useEffect(() => {
    if (listedEmployees.length === 0) return;
    if (isSelfScope) {
      setSelectedEngineerNames(new Set(listedEmployees.map((e) => e.name)));
      return;
    }
    if (selectedEngineerNames.size === 0) {
      setSelectedEngineerNames(new Set(listedEmployees.map((e) => e.name)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listedEmployees, isSelfScope]);


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
    setVisibleProjectsByEngineer({});
    setActionError(null);

  }

  async function handleSearch(options?: { quietUnlinked?: boolean }) {
    if (selectedEngineers.length === 0) {
      setActionError("Select at least one engineer name before searching.");

      return;
    }

    const linkedEngineers = selectedEngineers.filter((e) => e.linked);
    const unlinked = selectedEngineers.filter((e) => !e.linked);

    if (linkedEngineers.length === 0) {
      setActionError(
        `${unlinked.map((e) => `"${e.name}"`).join(", ")} ${unlinked.length === 1 ? "was" : "were"} not found in ATS. Add them from ATS employees.`,
      );
      return;
    }

    setSearching(true);
    setSearchProgress({ done: 0, total: linkedEngineers.length });
    setActionError(
      unlinked.length > 0 && !options?.quietUnlinked
        ? `${unlinked.map((e) => `"${e.name}"`).join(", ")} ${unlinked.length === 1 ? "was" : "were"} not found in ATS and skipped. Add them from ATS employees.`
        : null,
    );

    const newVisibleProjectsByEngineer: Record<
      string,
      Array<{ projectCode: string; projectName: string }>
    > = {};
    const errors: string[] = [];
    const projectResults: {
      engineerName: string;
      projects: ClockifyProject[];
    }[] = [];

    // Limit concurrency — Main org has many engineers; unbounded Promise.all stalls Searching…
    const concurrency = 3;
    let cursor = 0;
    let completed = 0;

    async function worker() {
      while (cursor < linkedEngineers.length) {
        const index = cursor;
        cursor += 1;
        const engineer = linkedEngineers[index];
        if (!engineer) continue;

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

          projectResults.push({
            engineerName: engineer.name,
            projects: payload.projects ?? [],
          });
        } catch (err) {
          errors.push(
            `${engineer.name}: ${err instanceof Error ? err.message : "Failed to load projects."}`,
          );
        } finally {
          completed += 1;
          setSearchProgress({
            done: completed,
            total: linkedEngineers.length,
          });
        }
      }
    }

    try {
      await Promise.all(
        Array.from({ length: Math.min(concurrency, linkedEngineers.length) }, () =>
          worker(),
        ),
      );

      let allEntries = [...entriesRef.current];
      for (const result of projectResults) {
        const { entries: nextEntries, visibleProjects } =
          syncEngineerClockifyProjects(
            result.engineerName,
            result.projects,
            allEntries,
          );
        allEntries = nextEntries;
        newVisibleProjectsByEngineer[result.engineerName] = visibleProjects;
      }

      updateEntries(allEntries);
      setVisibleProjectsByEngineer(newVisibleProjectsByEngineer);
      setSearchedEngineerNames(Object.keys(newVisibleProjectsByEngineer));
      lastSearchedRangeRef.current = `${dateRange.start}|${dateRange.end}`;

      if (errors.length > 0) {
        setActionError((current) =>
          [current, errors.join(" ")].filter(Boolean).join(" "),
        );
      }
    } finally {
      setSearching(false);
      setSearchProgress({ done: 0, total: 0 });
    }
  }

  // Auto-search once on initial load (lifetime active projects)
  useEffect(() => {
    if (
      !hasAutoSearched.current &&
      !storeLoading &&
      !loading &&
      !searching &&
      selectedEngineerNames.size > 0 &&
      searchedEngineerNames.length === 0
    ) {
      hasAutoSearched.current = true;
      void handleSearch({ quietUnlinked: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeLoading, loading, selectedEngineerNames]);

  // Re-run Search when the date range changes after the initial load.
  useEffect(() => {
    const key = `${dateRange.start}|${dateRange.end}`;
    if (!hasAutoSearched.current) return;
    if (searchedEngineerNames.length === 0) return;
    if (lastSearchedRangeRef.current === key) return;
    if (searching || loading || storeLoading) return;
    lastSearchedRangeRef.current = key;
    void handleSearch({ quietUnlinked: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.start, dateRange.end]);

  const disabled = loading || Boolean(error) || searching;
  const editDisabled = disabled || !canEdit;
  const searchedEngineerNameSet = useMemo(
    () => new Set(searchedEngineerNames),
    [searchedEngineerNames],
  );

  return (
    <div className="utilization-workspace utilization-workspace--overview-sidebar">
      {(error || actionError) ? (
        <div className="utilization-workspace__alerts">
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
        </div>
      ) : null}

      <div className="utilization-workspace__body">
        <aside className="overview2-sidebar" aria-label="Employee selection">
          {!isSelfScope ? (
            <div className="overview2-sidebar__manage">
              <button
                type="button"
                className="button secondary button-small overview2-sidebar__manage-btn"
                onClick={() => {
                  setActionError(null);
                  setIsAddingEngineer(true);
                }}
                disabled={editDisabled}
                title={
                  canEdit
                    ? undefined
                    : "View only — editing requires Admin role"
                }
              >
                Add
              </button>
              <button
                type="button"
                className="button danger button-small overview2-sidebar__manage-btn"
                onClick={handleDeleteEngineer}
                disabled={editDisabled || selectedEngineerNames.size === 0}
                title={
                  canEdit
                    ? undefined
                    : "View only — editing requires Admin role"
                }
              >
                Delete
              </button>
            </div>
          ) : null}

          <div className="overview2-sidebar__date">
            <AnalysisDateRangePicker
              value={dateRange}
              onChange={(range) => {
                setDateRange(range);
                const parsed = range.end.split("-").map(Number);
                if (parsed.length === 3) {
                  const [year, month] = parsed;
                  if (year && month) setMonth({ year, month });
                }
              }}
            />
          </div>

          {needsEngineerLink ? (
            <p className="overview2-sidebar__empty hint">
              Ask an Admin to link your engineer profile under Users.
            </p>
          ) : listedEmployees.length === 0 && !loading ? (
            <p className="overview2-sidebar__empty hint">
              {isSelfScope
                ? "Your linked engineer was not found on the list."
                : "No engineers on the list yet. Use Add to include ATS employees."}
            </p>
          ) : (
            <div
              className="overview2-sidebar__list"
              role="group"
              aria-label="Employees"
            >
              {listedEmployees.map((employee) => {
                const inputId = `overview2-engineer-${employee.id}`;
                return (
                  <label
                    key={employee.id}
                    className="overview2-sidebar__option"
                    htmlFor={inputId}
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      value={employee.id}
                      checked={selectedEngineerNames.has(employee.name)}
                      onChange={(e) => {
                        if (isSelfScope) return;
                        toggleEngineer(employee.name, e.target.checked);
                      }}
                      disabled={disabled || isSelfScope}
                    />
                    <span>{employee.name}</span>
                  </label>
                );
              })}
            </div>
          )}

          <div className="overview2-sidebar__actions">
            <button
              type="button"
              className="button primary overview2-sidebar__action"
              onClick={() => {
                void handleSearch();
              }}
              disabled={
                disabled ||
                needsEngineerLink ||
                selectedEngineerNames.size === 0
              }
            >
              {searching
                ? searchProgress.total > 0
                  ? `Searching… ${searchProgress.done}/${searchProgress.total} · ${searchElapsedSec}s`
                  : `Searching… ${searchElapsedSec}s`
                : "Search"}
            </button>
            {!isSelfScope ? (
              <>
                <button
                  type="button"
                  className="button secondary overview2-sidebar__action"
                  onClick={selectAllEmployees}
                  disabled={disabled || listedEmployees.length === 0}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="button secondary overview2-sidebar__action"
                  onClick={clearAllEmployees}
                  disabled={disabled || selectedEngineerNames.size === 0}
                >
                  Clear All
                </button>
              </>
            ) : null}
          </div>
          {searching ? (
            <p
              className="hint search-progress-hint overview2-sidebar__progress"
              aria-live="polite"
            >
              Still searching
              {searchProgress.total > 0
                ? ` — ${Math.max(searchProgress.total - searchProgress.done, 0)} employee${
                    searchProgress.total - searchProgress.done === 1 ? "" : "s"
                  } left`
                : ""}
              {` (${searchElapsedSec}s)`}
            </p>
          ) : null}
        </aside>

        <div className="overview2-main">
          <Overview2GroupedResults
        engineers={selectedEngineers
          .filter((engineer) => searchedEngineerNameSet.has(engineer.name))
          .map((engineer) => ({
            engineerName: engineer.name,
            visibleProjects: visibleProjectsByEngineer[engineer.name] ?? [],
            onUpdate: (updated) => {
              const lookup = projectLookupKey(
                updated.projectCode,
                updated.projectName,
              );
              const existingIndex = entries.findIndex(
                (entry) =>
                  isSameEngineerName(entry.engineerName, updated.engineerName) &&
                  projectLookupKey(entry.projectCode, entry.projectName) ===
                    lookup,
              );
              if (existingIndex >= 0) {
                updateEntries(
                  entries.map((entry, index) =>
                    index === existingIndex
                      ? {
                          ...entry,
                          ...updated,
                          id: entry.id,
                        }
                      : entry,
                  ),
                );
                return;
              }
              updateEntries([
                ...entries,
                updated.id.startsWith("pending:")
                  ? createUtilizationEntry({
                      engineerName: updated.engineerName,
                      projectCode: updated.projectCode,
                      projectName: updated.projectName,
                      weekValuesByMonth: updated.weekValuesByMonth,
                      starred: updated.starred,
                    })
                  : updated,
              ]);
            },
            onDelete: (id) => {
              const removed = entries.find((entry) => entry.id === id);
              updateEntries(entries.filter((entry) => entry.id !== id));
              if (!removed) return;
              const removedKey = projectLookupKey(
                removed.projectCode,
                removed.projectName,
              );
              setVisibleProjectsByEngineer((current) => ({
                ...current,
                [engineer.name]: (current[engineer.name] ?? []).filter(
                  (project) =>
                    projectLookupKey(project.projectCode, project.projectName) !==
                    removedKey,
                ),
              }));
            },
          }))}
        entries={entries}
        month={month}
        dateRange={dateRange}
        holidayDates={holidays.map((holiday) => holiday.date)}
        clockifyHoursByMonth={clockifyHoursByMonth}
        billableHoursByMonth={billableHoursByMonth}
        clockifyHoursLoading={clockifyHoursLoading}
        clockifyHoursError={clockifyHoursError}
        readOnly={!canEdit}
        hideTeamFooter={isSelfScope}
          />
        </div>
      </div>

      {isAddingEngineer && canEdit ? (
        <AddEngineerDialog
          candidates={addCandidates}
          onSave={handleAddEngineer}
          onClose={() => setIsAddingEngineer(false)}
        />
      ) : null}
    </div>
  );
}

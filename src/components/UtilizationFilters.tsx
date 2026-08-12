"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AddEngineerDialog } from "@/components/AddEngineerDialog";
import { SearchableSelect } from "@/components/SearchableSelect";
import { UtilizationResultsTable } from "@/components/UtilizationResultsTable";
import type { UtilizationStore } from "@/hooks/useUtilizationStore";
import {
  createUtilizationEntry,
  type UtilizationEntry,
} from "@/lib/entries";
import { isSameEngineerName } from "@/lib/engineers";
import { parseProjectParts, projectLookupKey } from "@/lib/projects";
import {
  getCurrentMonthCursor,
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

type UtilizationFiltersProps = {
  store: UtilizationStore;
};

export function UtilizationFilters({ store }: UtilizationFiltersProps) {
  const {
    entries,
    engineerNames,
    holidays,
    calendarYearRange,
    updateEntries,
    updateEngineerNames,
    updateCalendarYearRange,
  } = store;

  const [employees, setEmployees] = useState<ClockifyEmployee[]>([]);
  const [selectedEngineerId, setSelectedEngineerId] = useState("");
  const [isAddingEngineer, setIsAddingEngineer] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [viewMode, setViewMode] = useState<"none" | "results">("none");
  const [visibleEntryIds, setVisibleEntryIds] = useState<string[]>([]);
  const [month, setMonth] = useState<MonthCursor>(() => getCurrentMonthCursor());
  const [clockifyHoursByKey, setClockifyHoursByKey] = useState<
    Record<string, number>
  >({});
  const [clockifyHoursLoading, setClockifyHoursLoading] = useState(false);
  const [clockifyHoursError, setClockifyHoursError] = useState<string | null>(
    null,
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
    if (viewMode === "none") {
      return;
    }

    let cancelled = false;

    async function loadClockifyHours() {
      setClockifyHoursLoading(true);
      setClockifyHoursError(null);

      try {
        const response = await fetch(
          `/api/clockify/hours?year=${month.year}&month=${month.month}`,
          { cache: "no-store" },
        );
        const payload = await readJsonResponse<{
          hoursByKey?: Record<string, number>;
          error?: string;
        }>(response);

        if (!response.ok) {
          throw new Error(payload.error ?? `Request failed (${response.status})`);
        }

        if (!cancelled) {
          setClockifyHoursByKey(payload.hoursByKey ?? {});
        }
      } catch (err) {
        if (!cancelled) {
          setClockifyHoursByKey({});
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
  }, [month.year, month.month, viewMode]);

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

  const engineerOptions = useMemo(
    () =>
      listedEmployees.map((employee) => ({
        id: employee.id,
        label: employee.name,
      })),
    [listedEmployees],
  );

  const addCandidates = useMemo(() => {
    return employees.filter(
      (employee) =>
        !engineerNames.some((name) => isSameEngineerName(name, employee.name)),
    );
  }, [employees, engineerNames]);

  const selectedEngineer = listedEmployees.find(
    (employee) => employee.id === selectedEngineerId,
  );

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
      setSelectedEngineerId(match.id);
    }
  }

  function handleDeleteEngineer() {
    if (!selectedEngineer) {
      setActionError("Select an engineer before deleting.");
      return;
    }

    const confirmed = window.confirm(
      `Remove "${selectedEngineer.name}" from the engineer list?`,
    );
    if (!confirmed) {
      return;
    }

    updateEngineerNames(
      engineerNames.filter(
        (name) => !isSameEngineerName(name, selectedEngineer.name),
      ),
    );
    updateEntries(
      entries.filter(
        (entry) => !isSameEngineerName(entry.engineerName, selectedEngineer.name),
      ),
    );
    setSelectedEngineerId("");
    setVisibleEntryIds([]);
    setViewMode("none");
    setActionError(null);
  }

  async function handleSearch() {
    if (!selectedEngineer) {
      setActionError("Select an engineer name before searching.");
      setActionMessage(null);
      return;
    }

    if (!selectedEngineer.linked) {
      setActionError(
        `"${selectedEngineer.name}" was not found in Clockify. Add them from Clockify employees.`,
      );
      setActionMessage(null);
      return;
    }

    setSearching(true);
    setActionError(null);
    setActionMessage(null);

    try {
      const response = await fetch(
        `/api/clockify/user-projects?userId=${encodeURIComponent(selectedEngineer.id)}`,
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
        selectedEngineer.name,
        clockifyProjects,
        entries,
      );

      updateEntries(nextEntries);
      setVisibleEntryIds(visibleIds);
      setMonth(getCurrentMonthCursor());
      setViewMode("results");
      setActionMessage(
        clockifyProjects.length === 0
          ? `No active projects with lifetime Clockify time found for ${selectedEngineer.name}.`
          : `Showing ${clockifyProjects.length} active project${clockifyProjects.length === 1 ? "" : "s"} ${selectedEngineer.name} has worked on.`,
      );
    } catch (err) {
      setVisibleEntryIds([]);
      setViewMode("none");
      setActionError(
        err instanceof Error
          ? err.message
          : "Failed to load engineer projects from Clockify.",
      );
    } finally {
      setSearching(false);
    }
  }

  function handleClear() {
    setSelectedEngineerId("");
    setActionError(null);
    setActionMessage(null);
    setVisibleEntryIds([]);
    setViewMode("none");
    setMonth(getCurrentMonthCursor());
    setIsAddingEngineer(false);
  }

  const visibleRows =
    viewMode === "results"
      ? entries.filter((entry) => visibleEntryIds.includes(entry.id))
      : [];

  const disabled = loading || Boolean(error) || searching;

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

        {actionMessage ? (
          <p className="form-message success" role="status">
            {actionMessage}
          </p>
        ) : null}

        <div className="filter-fields-row">
          <div className="engineer-filter filter-field--engineer">
            <div className="field-label-row">
              <label className="field-label" htmlFor="engineer-name">
                Engineer Name
              </label>
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
                  disabled={disabled || !selectedEngineerId}
                >
                  Delete
                </button>
              </div>
            </div>

            <SearchableSelect
              id="engineer-name"
              label=""
              placeholder={loading ? "Loading employees…" : "Search engineer…"}
              options={engineerOptions}
              value={selectedEngineerId}
              onChange={(value) => {
                setSelectedEngineerId(value);
                setVisibleEntryIds([]);
                setViewMode("none");
                setActionError(null);
                setActionMessage(null);
              }}
              disabled={disabled}
              emptyMessage="No engineers match your search"
            />
          </div>
        </div>

        <div className="filter-actions">
          <button
            type="button"
            className="button primary"
            onClick={() => {
              void handleSearch();
            }}
            disabled={disabled}
          >
            {searching ? "Searching…" : "Search"}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={handleClear}
            disabled={disabled}
          >
            Clear
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

      {viewMode !== "none" ? (
        <UtilizationResultsTable
          rows={visibleRows}
          month={month}
          onMonthChange={setMonth}
          calendarYearRange={calendarYearRange}
          onCalendarYearRangeChange={updateCalendarYearRange}
          emptyHint="No active projects with lifetime Clockify time for this engineer."
          clockifyHoursByKey={clockifyHoursByKey}
          clockifyHoursLoading={clockifyHoursLoading}
          clockifyHoursError={clockifyHoursError}
          holidayDates={holidays.map((holiday) => holiday.date)}
          onUpdate={(updated) => {
            updateEntries(
              entries.map((entry) =>
                entry.id === updated.id ? updated : entry,
              ),
            );
          }}
          onDelete={(id) => {
            const next = entries.filter((entry) => entry.id !== id);
            updateEntries(next);
            setVisibleEntryIds((current) =>
              current.filter((entryId) => entryId !== id),
            );
          }}
        />
      ) : null}
    </div>
  );
}

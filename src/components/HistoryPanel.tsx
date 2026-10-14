"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccess } from "@/auth/accessContext";
import {
  DataListToolbar,
  downloadCsv,
  uniqueSortedValues,
} from "@/components/DataListToolbar";
import {
  actionLabel,
  entityTypeLabel,
  formatHistoryDate,
  formatHistoryTime,
  type HistoryEntry,
} from "@/lib/history";

const HISTORY_SORT_OPTIONS = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
];

export function HistoryPanel() {
  const { canManageUsers, email } = useAccess();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [clearing, setClearing] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const headers: HeadersInit = {};
        if (email) {
          headers["x-user-email"] = email;
        }
        const response = await fetch("/api/history", {
          cache: "no-store",
          headers,
        });
        const data = (await response.json()) as {
          entries?: HistoryEntry[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error || "Failed to load history.");
        }
        if (!cancelled) {
          setEntries(data.entries ?? []);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load history.",
          );
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    void load();

    const intervalId = window.setInterval(() => {
      if (document.hidden) {
        return;
      }
      void load();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [email]);

  const toolbarFilters = useMemo(
    () => [
      {
        id: "employee",
        label: "Employee",
        options: uniqueSortedValues(
          entries.map((entry) => entry.employeeName),
        ),
      },
      {
        id: "project",
        label: "Engineer / Section",
        options: uniqueSortedValues(entries.map((entry) => entry.project)),
      },
      {
        id: "area",
        label: "Area",
        options: uniqueSortedValues(
          entries.map((entry) => entityTypeLabel(entry.entityType)),
        ),
      },
      {
        id: "action",
        label: "Action",
        options: uniqueSortedValues(
          entries.map((entry) => actionLabel(entry.action)),
        ),
      },
    ],
    [entries],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let rows = entries.filter((entry) => {
      if (query) {
        const haystack = [
          entry.employeeName,
          entry.employeeEmail,
          entry.project,
          entry.summary,
          entry.details,
          entry.comment,
          entry.entityLabel,
          actionLabel(entry.action),
          entityTypeLabel(entry.entityType),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }

      const employeeFilter = activeFilters.employee ?? [];
      if (
        employeeFilter.length > 0 &&
        !employeeFilter.includes(entry.employeeName.trim())
      ) {
        return false;
      }

      const projectFilter = activeFilters.project ?? [];
      if (
        projectFilter.length > 0 &&
        !projectFilter.includes(entry.project.trim())
      ) {
        return false;
      }

      const areaFilter = activeFilters.area ?? [];
      if (
        areaFilter.length > 0 &&
        !areaFilter.includes(entityTypeLabel(entry.entityType))
      ) {
        return false;
      }

      const actionFilter = activeFilters.action ?? [];
      if (
        actionFilter.length > 0 &&
        !actionFilter.includes(actionLabel(entry.action))
      ) {
        return false;
      }

      return true;
    });

    rows = [...rows].sort((a, b) => {
      if (sort === "oldest") {
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return rows;
  }, [entries, search, activeFilters, sort]);

  function handleFilterChange(filterId: string, values: string[]) {
    setActiveFilters((current) => ({ ...current, [filterId]: values }));
  }

  function handleExport() {
    const header = [
      "Date",
      "Time",
      "Employee",
      "Employee Email",
      "Engineer / Section",
      "Area",
      "Action",
      "Summary",
      "Details",
      "Comments",
    ];
    const rows = filtered.map((entry) => [
      formatHistoryDate(entry.createdAt),
      formatHistoryTime(entry.createdAt),
      entry.employeeName,
      entry.employeeEmail,
      entry.project,
      entityTypeLabel(entry.entityType),
      actionLabel(entry.action),
      entry.summary,
      entry.details,
      entry.comment,
    ]);
    downloadCsv("utilization-history.csv", [header, ...rows]);
  }

  async function handleClearHistory() {
    if (entries.length === 0) {
      return;
    }
    if (
      !window.confirm(
        `Clear all ${entries.length} history ${entries.length === 1 ? "entry" : "entries"}? This cannot be undone.`,
      )
    ) {
      return;
    }

    setClearing(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (email) {
        headers["x-user-email"] = email;
      }
      const response = await fetch("/api/history", {
        method: "DELETE",
        headers,
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to clear history.");
      }
      setEntries([]);
      setSearch("");
      setActiveFilters({});
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : "Failed to clear history.",
      );
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="history-panel">
      <div className="analysis-header">
        <div>
          <h2 className="analysis-title">History log</h2>
          <p className="analysis-subtitle">
            Audit trail of utilization, engineer list, holidays, calendar, and
            user changes. Entries older than 7 days are removed automatically.
          </p>
        </div>
      </div>

      <DataListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Employee, engineer, action, summary..."
        sort={sort}
        onSortChange={setSort}
        sortOptions={HISTORY_SORT_OPTIONS}
        filters={toolbarFilters}
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
        actions={
          <>
            {canManageUsers ? (
              <button
                type="button"
                className="button danger"
                onClick={() => void handleClearHistory()}
                disabled={entries.length === 0 || clearing}
              >
                {clearing ? "Clearing…" : "Clear"}
              </button>
            ) : null}
            <button
              type="button"
              className="button secondary-solid"
              onClick={handleExport}
              disabled={filtered.length === 0}
            >
              Export
            </button>
          </>
        }
      />

      {error ? (
        <p className="users-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="history-table-wrap">
        {!ready ? (
          <p className="hint analysis-empty">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="hint analysis-empty">
            No history yet. Edit Overview hours, engineers, holidays, or Users
            to start logging.
          </p>
        ) : filtered.length === 0 ? (
          <p className="hint analysis-empty">
            No history matches the current filters.
          </p>
        ) : (
          <table className="history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Employee</th>
                <th>Engineer / Section</th>
                <th>Area</th>
                <th>Action</th>
                <th>Summary</th>
                <th>Details</th>
                <th>Comments</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatHistoryDate(entry.createdAt)}</td>
                  <td>{formatHistoryTime(entry.createdAt)}</td>
                  <td>
                    <div>{entry.employeeName}</div>
                    {entry.employeeEmail ? (
                      <div className="history-meta">{entry.employeeEmail}</div>
                    ) : null}
                  </td>
                  <td>{entry.project || "—"}</td>
                  <td>{entityTypeLabel(entry.entityType)}</td>
                  <td>{actionLabel(entry.action)}</td>
                  <td>{entry.summary || "—"}</td>
                  <td className="cell-multiline">{entry.details || "—"}</td>
                  <td className="cell-multiline">{entry.comment || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

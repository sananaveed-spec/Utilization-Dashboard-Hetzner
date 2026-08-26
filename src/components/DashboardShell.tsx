"use client";

import { useState } from "react";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { HolidaysPanel } from "@/components/HolidaysPanel";
import { Overview2Filters } from "@/components/Overview2Filters";
import { UsersPanel } from "@/components/UsersPanel";
import { useUtilizationStore } from "@/hooks/useUtilizationStore";

type DashboardTab =
  | "overview2"
  | "analysis"
  | "holidays"
  | "users";

export function DashboardShell() {
  const store = useUtilizationStore();
  const [tab, setTab] = useState<DashboardTab>("overview2");

  if (store.loading) {
    return (
      <div className="dashboard-shell">
        <div className="dashboard-main">
          <p className="login-subtitle">Loading dashboard data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      {store.saveError ? (
        <p className="users-error dashboard-save-error" role="alert">
          {store.saveError}
        </p>
      ) : null}
      <aside className="dashboard-sidebar" aria-label="Dashboard navigation">
        <p className="dashboard-sidebar-brand">Utilization</p>
        <nav className="dashboard-nav">
          <button
            type="button"
            className={`dashboard-nav-item${tab === "overview2" ? " dashboard-nav-item--active" : ""}`}
            onClick={() => setTab("overview2")}
            aria-current={tab === "overview2" ? "page" : undefined}
          >
            Overview
          </button>
          <button
            type="button"
            className={`dashboard-nav-item${tab === "analysis" ? " dashboard-nav-item--active" : ""}`}
            onClick={() => setTab("analysis")}
            aria-current={tab === "analysis" ? "page" : undefined}
          >
            Analysis
          </button>
          <button
            type="button"
            className={`dashboard-nav-item${tab === "holidays" ? " dashboard-nav-item--active" : ""}`}
            onClick={() => setTab("holidays")}
            aria-current={tab === "holidays" ? "page" : undefined}
          >
            Holidays
          </button>
          <button
            type="button"
            className={`dashboard-nav-item${tab === "users" ? " dashboard-nav-item--active" : ""}`}
            onClick={() => setTab("users")}
            aria-current={tab === "users" ? "page" : undefined}
          >
            Users
          </button>
        </nav>
      </aside>

      <div className="dashboard-main">
        {tab === "overview2" ? (
          <Overview2Filters store={store} />
        ) : tab === "analysis" ? (
          <AnalysisPanel store={store} />
        ) : tab === "holidays" ? (
          <HolidaysPanel store={store} />
        ) : (
          <UsersPanel />
        )}
      </div>
    </div>
  );
}

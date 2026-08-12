"use client";

import { useState } from "react";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { HolidaysPanel } from "@/components/HolidaysPanel";
import { UsersPanel } from "@/components/UsersPanel";
import { UtilizationFilters } from "@/components/UtilizationFilters";
import { useUtilizationStore } from "@/hooks/useUtilizationStore";

type DashboardTab = "overview" | "analysis" | "holidays" | "users";

export function DashboardShell() {
  const store = useUtilizationStore();
  const [tab, setTab] = useState<DashboardTab>("overview");

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar" aria-label="Dashboard navigation">
        <p className="dashboard-sidebar-brand">Utilization</p>
        <nav className="dashboard-nav">
          <button
            type="button"
            className={`dashboard-nav-item${tab === "overview" ? " dashboard-nav-item--active" : ""}`}
            onClick={() => setTab("overview")}
            aria-current={tab === "overview" ? "page" : undefined}
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
        {tab === "overview" ? (
          <UtilizationFilters store={store} />
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

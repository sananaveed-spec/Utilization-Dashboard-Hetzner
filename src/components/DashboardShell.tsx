"use client";

import { useEffect } from "react";
import { useAccess } from "@/auth/accessContext";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { HolidaysPanel } from "@/components/HolidaysPanel";
import { Overview2Filters } from "@/components/Overview2Filters";
import { UsersPanel } from "@/components/UsersPanel";
import { useUtilizationStore } from "@/hooks/useUtilizationStore";

export type DashboardTab =
  | "overview2"
  | "analysis"
  | "holidays"
  | "users";

export const DASHBOARD_NAV_ITEMS: Array<{ id: DashboardTab; label: string }> = [
  { id: "overview2", label: "Overview" },
  { id: "analysis", label: "Analysis" },
  { id: "holidays", label: "Holidays" },
  { id: "users", label: "Users" },
];

type DashboardShellProps = {
  tab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
};

export function DashboardNav({
  tab,
  onTabChange,
  canEdit,
}: {
  tab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  canEdit: boolean;
}) {
  const items = canEdit
    ? DASHBOARD_NAV_ITEMS
    : DASHBOARD_NAV_ITEMS.filter((item) => item.id !== "users");

  return (
    <nav className="dashboard-nav" aria-label="Dashboard navigation">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`dashboard-nav-item${tab === item.id ? " dashboard-nav-item--active" : ""}`}
          onClick={() => onTabChange(item.id)}
          aria-current={tab === item.id ? "page" : undefined}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export function DashboardShell({ tab, onTabChange }: DashboardShellProps) {
  const { canEdit } = useAccess();
  const store = useUtilizationStore();

  useEffect(() => {
    if (!canEdit && tab === "users") {
      onTabChange("overview2");
    }
  }, [canEdit, tab, onTabChange]);

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
      {!canEdit ? (
        <p className="dashboard-view-only-banner" role="status">
          View only — you can browse the dashboard. Editing is limited to users
          added under Users.
        </p>
      ) : null}

      {store.saveError ? (
        <p className="users-error dashboard-save-error" role="alert">
          {store.saveError}
        </p>
      ) : null}

      <div className="dashboard-main">
        {tab === "overview2" ? (
          <Overview2Filters store={store} />
        ) : tab === "analysis" ? (
          <AnalysisPanel store={store} />
        ) : tab === "holidays" ? (
          <HolidaysPanel store={store} />
        ) : canEdit ? (
          <UsersPanel />
        ) : (
          <Overview2Filters store={store} />
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo } from "react";
import { useAccess } from "@/auth/accessContext";
import type { ResolvedAccess } from "@/auth/access";
import { HistoryPanel } from "@/components/HistoryPanel";
import { HolidaysPanel } from "@/components/HolidaysPanel";
import { Overview2Filters } from "@/components/Overview2Filters";
import { UsersPanel } from "@/components/UsersPanel";
import { useUtilizationStore } from "@/hooks/useUtilizationStore";
import { resolveAccess } from "@/auth/access";
import { useAllowedUsers } from "@/hooks/useAllowedUsers";
import { useTeams } from "@/hooks/useTeams";

/** Analysis tab is temporarily hidden from the live dashboard. */
const SHOW_ANALYSIS_TAB = false;

export type DashboardTab =
  | "overview2"
  | "analysis"
  | "holidays"
  | "history"
  | "users";

export const DASHBOARD_NAV_ITEMS: Array<{ id: DashboardTab; label: string }> = [
  { id: "overview2", label: "Overview" },
  { id: "analysis", label: "Analysis" },
  { id: "holidays", label: "Holidays" },
  { id: "history", label: "History" },
  { id: "users", label: "Users" },
];

type DashboardShellProps = {
  tab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
};

function navItemsForAccess(
  access: Pick<
    ResolvedAccess,
    | "role"
    | "canManageUsers"
    | "canViewHistory"
    | "canViewAnalysis"
    | "canViewHolidays"
  >,
): Array<{ id: DashboardTab; label: string }> {
  return DASHBOARD_NAV_ITEMS.filter((item) => {
    if (item.id === "overview2") return true;
    if (item.id === "analysis") {
      return SHOW_ANALYSIS_TAB && access.canViewAnalysis;
    }
    if (item.id === "holidays") return access.canViewHolidays;
    if (item.id === "history") return access.canViewHistory;
    if (item.id === "users") return access.canManageUsers;
    return false;
  });
}

export function DashboardNav({
  tab,
  onTabChange,
  access,
}: {
  tab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  access: Pick<
    ResolvedAccess,
    | "role"
    | "canManageUsers"
    | "canViewHistory"
    | "canViewAnalysis"
    | "canViewHolidays"
  >;
}) {
  const items = navItemsForAccess(access);

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
  const access = useAccess();
  const store = useUtilizationStore();
  const { users } = useAllowedUsers();
  const { teams } = useTeams();

  const resolved = useMemo(
    () =>
      resolveAccess(access.email, users, store.engineerNames, teams),
    [access.email, users, store.engineerNames, teams],
  );

  useEffect(() => {
    const allowed = navItemsForAccess(resolved).map((item) => item.id);
    if (!allowed.includes(tab)) {
      onTabChange("overview2");
    }
  }, [resolved, tab, onTabChange]);

  if (store.loading) {
    return (
      <div className="dashboard-shell">
        <div className="dashboard-main">
          <p className="login-subtitle">Loading dashboard data…</p>
        </div>
      </div>
    );
  }

  const banner =
    resolved.role === "employee"
      ? "Employee view — you can view Overview and Holidays; editing requires Team Lead, Manager, or Admin."
      : resolved.role === "lead" || resolved.role === "manager"
        ? "You can edit dashboard data. History and Users are Admin only."
        : null;

  return (
    <div className="dashboard-shell">
      {banner ? (
        <p className="dashboard-view-only-banner" role="status">
          {banner}
        </p>
      ) : null}

      {store.saveError ? (
        <p className="users-error dashboard-save-error" role="alert">
          {store.saveError}
        </p>
      ) : null}

      <div className="dashboard-main">
        {tab === "holidays" && resolved.canViewHolidays ? (
          <HolidaysPanel store={store} />
        ) : tab === "history" && resolved.canViewHistory ? (
          <HistoryPanel />
        ) : tab === "users" && resolved.canManageUsers ? (
          <UsersPanel />
        ) : (
          <Overview2Filters store={store} accessOverride={resolved} />
        )}
      </div>
    </div>
  );
}

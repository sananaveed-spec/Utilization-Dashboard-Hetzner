"use client";

import { useEffect, useMemo } from "react";
import { useAccess } from "@/auth/accessContext";
import type { AccessScope } from "@/auth/access";
import { HolidaysPanel } from "@/components/HolidaysPanel";
import { Overview2Filters } from "@/components/Overview2Filters";
import { UsersPanel } from "@/components/UsersPanel";
import { useUtilizationStore } from "@/hooks/useUtilizationStore";
import type { DashboardRole } from "@/lib/allowedUsers";
import { resolveAccess } from "@/auth/access";
import { useAllowedUsers } from "@/hooks/useAllowedUsers";

export type DashboardTab =
  | "overview2"
  | "analysis"
  | "holidays"
  | "users";

export const DASHBOARD_NAV_ITEMS: Array<{ id: DashboardTab; label: string }> = [
  { id: "overview2", label: "Overview" },
  { id: "holidays", label: "Holidays" },
  { id: "users", label: "Users" },
];

type DashboardShellProps = {
  tab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
};

function navItemsForAccess(options: {
  role: DashboardRole;
  canManageUsers: boolean;
  scope: AccessScope;
}): Array<{ id: DashboardTab; label: string }> {
  if (options.scope === "self" || options.role === "team") {
    return DASHBOARD_NAV_ITEMS.filter((item) => item.id === "overview2");
  }
  if (!options.canManageUsers) {
    return DASHBOARD_NAV_ITEMS.filter((item) => item.id !== "users");
  }
  return DASHBOARD_NAV_ITEMS;
}

export function DashboardNav({
  tab,
  onTabChange,
  role,
  canManageUsers,
  scope,
}: {
  tab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  role: DashboardRole;
  canManageUsers: boolean;
  scope: AccessScope;
}) {
  const items = navItemsForAccess({ role, canManageUsers, scope });

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

  // Re-resolve with engineer names once store is loaded (Team link validation).
  const resolved = useMemo(
    () =>
      resolveAccess(access.email, users, store.engineerNames),
    [access.email, users, store.engineerNames],
  );

  useEffect(() => {
    const allowed = navItemsForAccess({
      role: resolved.role,
      canManageUsers: resolved.canManageUsers,
      scope: resolved.scope,
    }).map((item) => item.id);

    if (tab === "analysis" || !allowed.includes(tab)) {
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

  return (
    <div className="dashboard-shell">
      {!resolved.canEdit ? (
        <p className="dashboard-view-only-banner" role="status">
          {resolved.role === "team"
            ? resolved.needsEngineerLink
              ? "Ask an Admin to link your engineer profile under Users."
              : "Team member view — you can only see your own Overview row."
            : "View only — browsing is enabled. Editing requires Admin role."}
        </p>
      ) : null}

      {store.saveError ? (
        <p className="users-error dashboard-save-error" role="alert">
          {store.saveError}
        </p>
      ) : null}

      <div className="dashboard-main">
        {tab === "holidays" && resolved.scope === "all" ? (
          <HolidaysPanel store={store} />
        ) : tab === "users" && resolved.canManageUsers ? (
          <UsersPanel engineerNames={store.engineerNames} />
        ) : (
          <Overview2Filters store={store} accessOverride={resolved} />
        )}
      </div>
    </div>
  );
}

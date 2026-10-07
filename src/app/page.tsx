"use client";

import { useMemo, useState } from "react";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { AccessProvider } from "@/auth/accessContext";
import { resolveAccess } from "@/auth/access";
import { AuthHeader } from "@/components/AuthHeader";
import {
  DashboardNav,
  DashboardShell,
  type DashboardTab,
} from "@/components/DashboardShell";
import { LoginPage } from "@/components/LoginPage";
import { UnauthorizedPage } from "@/components/UnauthorizedPage";
import { getAccountEmail } from "@/auth/organization";
import { useAllowedUsers } from "@/hooks/useAllowedUsers";

export default function Home() {
  const isAuthenticated = useIsAuthenticated();
  const { accounts } = useMsal();
  const { users, loading: usersLoading } = useAllowedUsers();
  const [tab, setTab] = useState<DashboardTab>("overview2");
  const authenticatedEmail = isAuthenticated
    ? getAccountEmail(accounts[0])
    : "";
  const accessChecking = usersLoading && users === null;

  const access = useMemo(
    () => resolveAccess(authenticatedEmail, users),
    [authenticatedEmail, users],
  );
  const canView = isAuthenticated && !accessChecking && access.canView;

  return (
    <main className="page">
      <div className={`layout${canView ? " layout--dashboard" : ""}`}>
        {isAuthenticated ? (
          <AuthHeader
            center={
              canView ? (
                <DashboardNav
                  tab={tab}
                  onTabChange={setTab}
                  role={access.role}
                  canManageUsers={access.canManageUsers}
                  scope={access.scope}
                />
              ) : undefined
            }
          />
        ) : null}

        <div className={`card${canView ? " card--dashboard" : ""}`}>
          {!isAuthenticated ? (
            <>
              <h1 className="dashboard-title">Utilization Dashboard</h1>
              <div className="divider" />
              <LoginPage />
            </>
          ) : accessChecking ? (
            <>
              <h1 className="dashboard-title">Utilization Dashboard</h1>
              <div className="divider" />
              <p className="login-subtitle">Checking access…</p>
            </>
          ) : !access.canView ? (
            <>
              <h1 className="dashboard-title">Utilization Dashboard</h1>
              <div className="divider" />
              <UnauthorizedPage />
            </>
          ) : (
            <AccessProvider access={access}>
              <DashboardShell tab={tab} onTabChange={setTab} />
            </AccessProvider>
          )}
        </div>
      </div>
    </main>
  );
}

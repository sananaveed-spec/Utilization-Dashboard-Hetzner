"use client";

import { useState } from "react";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { AccessProvider } from "@/auth/accessContext";
import { canEditDashboard, canViewDashboard } from "@/auth/access";
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
  const { emails, loading: allowlistLoading } = useAllowedUsers();
  const [tab, setTab] = useState<DashboardTab>("overview2");
  const authenticatedEmail = isAuthenticated
    ? getAccountEmail(accounts[0])
    : "";
  const canView =
    isAuthenticated && canViewDashboard(authenticatedEmail);
  const canEdit = canView && canEditDashboard(authenticatedEmail, emails);

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
                  canEdit={canEdit}
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
          ) : !canView ? (
            <>
              <h1 className="dashboard-title">Utilization Dashboard</h1>
              <div className="divider" />
              <UnauthorizedPage />
            </>
          ) : allowlistLoading && emails === null ? (
            <>
              <h1 className="dashboard-title">Utilization Dashboard</h1>
              <div className="divider" />
              <p className="login-subtitle">Checking access…</p>
            </>
          ) : (
            <AccessProvider email={authenticatedEmail} canEdit={canEdit}>
              <DashboardShell tab={tab} onTabChange={setTab} />
            </AccessProvider>
          )}
        </div>
      </div>
    </main>
  );
}

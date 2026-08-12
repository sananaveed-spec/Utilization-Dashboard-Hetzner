"use client";

import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { AuthHeader } from "@/components/AuthHeader";
import { DashboardShell } from "@/components/DashboardShell";
import { LoginPage } from "@/components/LoginPage";
import { UnauthorizedPage } from "@/components/UnauthorizedPage";
import { getAccountEmail } from "@/auth/organization";
import { useAllowedUsers } from "@/hooks/useAllowedUsers";

export default function Home() {
  const isAuthenticated = useIsAuthenticated();
  const { accounts } = useMsal();
  const { emails, loading: allowlistLoading, isAllowed } = useAllowedUsers();
  const authenticatedEmail = isAuthenticated
    ? getAccountEmail(accounts[0])
    : "";
  const isAuthorized =
    isAuthenticated && emails !== null && isAllowed(authenticatedEmail);

  return (
    <main className="page">
      <div className={`layout${isAuthorized ? " layout--dashboard" : ""}`}>
        {isAuthenticated ? <AuthHeader /> : null}

        <div className={`card${isAuthorized ? " card--dashboard" : ""}`}>
          {!isAuthenticated ? (
            <>
              <h1 className="dashboard-title">Utilization Dashboard</h1>
              <div className="divider" />
              <LoginPage />
            </>
          ) : allowlistLoading || emails === null ? (
            <>
              <h1 className="dashboard-title">Utilization Dashboard</h1>
              <div className="divider" />
              <p className="login-subtitle">Checking access…</p>
            </>
          ) : !isAuthorized ? (
            <>
              <h1 className="dashboard-title">Utilization Dashboard</h1>
              <div className="divider" />
              <UnauthorizedPage />
            </>
          ) : (
            <DashboardShell />
          )}
        </div>
      </div>
    </main>
  );
}

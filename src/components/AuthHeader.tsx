"use client";

import { useMsal } from "@azure/msal-react";
import type { ReactNode } from "react";
import { getAccountEmail } from "@/auth/organization";
import { logoutCompletely } from "@/auth/session";

type AuthHeaderProps = {
  center?: ReactNode;
};

export function AuthHeader({ center }: AuthHeaderProps) {
  const { instance, accounts } = useMsal();
  const email = getAccountEmail(accounts[0]);
  const displayName = accounts[0]?.name ?? email;

  function handleLogout() {
    void logoutCompletely(instance);
  }

  if (!email) {
    return null;
  }

  return (
    <header className={`auth-header${center ? " auth-header--with-nav" : ""}`}>
      <div className="auth-header-text">
        <p className="auth-header-title">Utilization Dashboard</p>
        <p className="auth-header-meta">Welcome, {displayName}</p>
      </div>
      {center ? <div className="auth-header-center">{center}</div> : null}
      <div className="auth-header-actions">
        <button type="button" className="button secondary" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}

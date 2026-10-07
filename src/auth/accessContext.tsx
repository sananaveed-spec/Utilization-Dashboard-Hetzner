"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  type ReactNode,
} from "react";
import type { AccessScope, ResolvedAccess } from "@/auth/access";
import type { DashboardRole } from "@/lib/allowedUsers";
import { setDashboardUserEmail } from "@/lib/dashboardApi";

export type AccessContextValue = {
  email: string;
  role: DashboardRole;
  canEdit: boolean;
  canManageUsers: boolean;
  scope: AccessScope;
  engineerName?: string;
  needsEngineerLink: boolean;
};

const AccessContext = createContext<AccessContextValue>({
  email: "",
  role: "team",
  canEdit: false,
  canManageUsers: false,
  scope: "self",
  needsEngineerLink: false,
});

export function AccessProvider({
  access,
  children,
}: {
  access: ResolvedAccess;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    setDashboardUserEmail(access.email);
    return () => {
      setDashboardUserEmail("");
    };
  }, [access.email]);

  const value: AccessContextValue = {
    email: access.email,
    role: access.role,
    canEdit: access.canEdit,
    canManageUsers: access.canManageUsers,
    scope: access.scope,
    engineerName: access.engineerName,
    needsEngineerLink: access.needsEngineerLink,
  };

  return (
    <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
  );
}

export function useAccess(): AccessContextValue {
  return useContext(AccessContext);
}

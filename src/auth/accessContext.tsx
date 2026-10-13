"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  type ReactNode,
} from "react";
import { useMsal } from "@azure/msal-react";
import type { AccessScope, ResolvedAccess } from "@/auth/access";
import type { DashboardRole } from "@/lib/allowedUsers";
import { setDashboardUserEmail } from "@/lib/dashboardApi";
import {
  getActorFromAccount,
  setDashboardActor,
} from "@/lib/history-client";

export type AccessContextValue = {
  email: string;
  role: DashboardRole;
  canEdit: boolean;
  canEditAll: boolean;
  canManageUsers: boolean;
  canViewHistory: boolean;
  canViewAnalysis: boolean;
  canViewHolidays: boolean;
  scope: AccessScope;
  engineerName?: string;
  editableEngineerNames: string[];
  needsEngineerLink: boolean;
};

const AccessContext = createContext<AccessContextValue>({
  email: "",
  role: "employee",
  canEdit: false,
  canEditAll: false,
  canManageUsers: false,
  canViewHistory: false,
  canViewAnalysis: false,
  canViewHolidays: false,
  scope: "all",
  editableEngineerNames: [],
  needsEngineerLink: false,
});

export function AccessProvider({
  access,
  children,
}: {
  access: ResolvedAccess;
  children: ReactNode;
}) {
  const { accounts } = useMsal();

  useLayoutEffect(() => {
    setDashboardUserEmail(access.email);
    setDashboardActor(getActorFromAccount(accounts[0] ?? null));
    return () => {
      setDashboardUserEmail("");
      setDashboardActor({ name: "", email: "" });
    };
  }, [access.email, accounts]);

  const value: AccessContextValue = {
    email: access.email,
    role: access.role,
    canEdit: access.canEdit,
    canEditAll: access.canEditAll,
    canManageUsers: access.canManageUsers,
    canViewHistory: access.canViewHistory,
    canViewAnalysis: access.canViewAnalysis,
    canViewHolidays: access.canViewHolidays,
    scope: access.scope,
    engineerName: access.engineerName,
    editableEngineerNames: access.editableEngineerNames,
    needsEngineerLink: access.needsEngineerLink,
  };

  return (
    <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
  );
}

export function useAccess(): AccessContextValue {
  return useContext(AccessContext);
}

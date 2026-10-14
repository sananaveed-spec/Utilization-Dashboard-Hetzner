import { isAllowedOrganizationEmail } from "@/auth/organization";
import {
  normalizeEmail,
  type DashboardRole,
  type DashboardUser,
} from "@/lib/allowedUsers";
import { engineerNamesMatch } from "@/lib/engineers";
import type { DashboardTeam } from "@/lib/teams";

export type AccessScope = "all" | "team" | "self";

export type ResolvedAccess = {
  email: string;
  role: DashboardRole;
  canView: boolean;
  /** May edit hours/stars (and other scoped writes). */
  canEdit: boolean;
  /** Firm-wide edits: all engineers, holidays, engineer list. */
  canEditAll: boolean;
  canManageUsers: boolean;
  canViewHistory: boolean;
  canViewAnalysis: boolean;
  canViewHolidays: boolean;
  scope: AccessScope;
  /** Optional Employee self link (display). */
  engineerName?: string;
  editableEngineerNames: string[];
  needsEngineerLink: boolean;
};

function deniedAccess(
  email: string,
  role: DashboardRole = "employee",
): ResolvedAccess {
  return {
    email,
    role,
    canView: false,
    canEdit: false,
    canEditAll: false,
    canManageUsers: false,
    canViewHistory: false,
    canViewAnalysis: false,
    canViewHolidays: false,
    scope: "all",
    editableEngineerNames: [],
    needsEngineerLink: false,
  };
}

/** Org-domain check only; listing is required separately via resolveAccess. */
export function canViewDashboard(email: string): boolean {
  return isAllowedOrganizationEmail(normalizeEmail(email));
}

export function canEditEngineerName(
  access: Pick<ResolvedAccess, "canEdit" | "canEditAll" | "editableEngineerNames">,
  engineerName: string,
): boolean {
  if (!access.canEdit) {
    return false;
  }
  if (access.canEditAll) {
    return true;
  }
  return access.editableEngineerNames.some((name) =>
    engineerNamesMatch(name, engineerName),
  );
}

/**
 * Access levels:
 * - Employee: view Overview / Holidays / Analysis; no History or Users; no edit
 * - Team Lead / Manager: edit all content; no History or Users
 * - Admin: everything including History and Users
 */
export function resolveAccess(
  email: string,
  users: DashboardUser[] | null,
  engineerNames: string[] = [],
  _teams: DashboardTeam[] = [],
): ResolvedAccess {
  const normalized = normalizeEmail(email);
  const onDomain = canViewDashboard(normalized);

  if (!onDomain) {
    return deniedAccess(normalized);
  }

  const record =
    users?.find((user) => user.email === normalized) ?? null;

  if (!record) {
    return deniedAccess(normalized);
  }

  if (record.role === "admin") {
    return {
      email: normalized,
      role: "admin",
      canView: true,
      canEdit: true,
      canEditAll: true,
      canManageUsers: true,
      canViewHistory: true,
      canViewAnalysis: true,
      canViewHolidays: true,
      scope: "all",
      editableEngineerNames: [...engineerNames],
      needsEngineerLink: false,
    };
  }

  if (record.role === "manager" || record.role === "lead") {
    return {
      email: normalized,
      role: record.role,
      canView: true,
      canEdit: true,
      canEditAll: true,
      canManageUsers: false,
      canViewHistory: false,
      canViewAnalysis: true,
      canViewHolidays: true,
      scope: "all",
      editableEngineerNames: [...engineerNames],
      needsEngineerLink: false,
    };
  }

  // Employee — view all content tabs except History and Users; no edit
  const selfName = record.engineerName?.trim() ?? "";
  return {
    email: normalized,
    role: "employee",
    canView: true,
    canEdit: false,
    canEditAll: false,
    canManageUsers: false,
    canViewHistory: false,
    canViewAnalysis: true,
    canViewHolidays: true,
    scope: "all",
    engineerName: selfName || undefined,
    editableEngineerNames: [],
    needsEngineerLink: false,
  };
}

/** @deprecated Prefer resolveAccess(...).canEdit */
export function canEditDashboard(
  email: string,
  users: DashboardUser[] | null,
): boolean {
  return resolveAccess(email, users).canEdit;
}

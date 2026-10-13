import { isAllowedOrganizationEmail } from "@/auth/organization";
import {
  normalizeEmail,
  type DashboardRole,
  type DashboardUser,
} from "@/lib/allowedUsers";
import {
  engineerNamesMatch,
  resolveEngineerName,
} from "@/lib/engineers";
import {
  teamEditableEngineers,
  type DashboardTeam,
} from "@/lib/teams";

export type AccessScope = "all" | "team" | "self";

export type ResolvedAccess = {
  email: string;
  role: DashboardRole;
  canView: boolean;
  /** May edit anything they are allowed to touch (hours/stars for scoped engineers). */
  canEdit: boolean;
  /** Admin/Manager: edit all engineers, holidays, engineer list, analysis data writes. */
  canEditAll: boolean;
  canManageUsers: boolean;
  canViewHistory: boolean;
  canViewAnalysis: boolean;
  canViewHolidays: boolean;
  scope: AccessScope;
  /** Lead: engineers they may edit. Employee optional self name. */
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

function matchEngineers(
  linked: string[],
  engineerNames: string[],
): string[] {
  if (engineerNames.length === 0) {
    return linked;
  }
  const matched: string[] = [];
  const seen = new Set<string>();
  for (const link of linked) {
    const found = resolveEngineerName(link, engineerNames) ?? link;
    const key = found.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    matched.push(found);
  }
  return matched;
}

export function resolveAccess(
  email: string,
  users: DashboardUser[] | null,
  engineerNames: string[] = [],
  teams: DashboardTeam[] = [],
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

  if (record.role === "manager") {
    return {
      email: normalized,
      role: "manager",
      canView: true,
      canEdit: true,
      canEditAll: true,
      canManageUsers: false,
      canViewHistory: true,
      canViewAnalysis: true,
      canViewHolidays: true,
      scope: "all",
      editableEngineerNames: [...engineerNames],
      needsEngineerLink: false,
    };
  }

  if (record.role === "lead") {
    const team = record.teamId
      ? teams.find((item) => item.id === record.teamId)
      : undefined;
    const linked = team
      ? teamEditableEngineers(team)
      : (record.teamEngineers ?? []).map((name) => name.trim()).filter(Boolean);

    if (linked.length === 0) {
      return {
        ...deniedAccess(normalized, "lead"),
        canView: true,
        needsEngineerLink: true,
        scope: "team",
      };
    }

    const matched = matchEngineers(linked, engineerNames);
    const editable =
      engineerNames.length > 0 && matched.length === 0
        ? linked
        : matched.length > 0
          ? matched
          : linked;

    return {
      email: normalized,
      role: "lead",
      canView: true,
      canEdit: editable.length > 0,
      canEditAll: false,
      canManageUsers: false,
      canViewHistory: false,
      canViewAnalysis: false,
      canViewHolidays: false,
      scope: "team",
      editableEngineerNames: editable,
      needsEngineerLink: Boolean(record.teamId) && !team
        ? true
        : engineerNames.length > 0 && matched.length === 0,
    };
  }

  // Employee — Overview view only
  const selfName = record.engineerName?.trim() ?? "";
  return {
    email: normalized,
    role: "employee",
    canView: true,
    canEdit: false,
    canEditAll: false,
    canManageUsers: false,
    canViewHistory: false,
    canViewAnalysis: false,
    canViewHolidays: false,
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

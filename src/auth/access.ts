import { isAllowedOrganizationEmail } from "@/auth/organization";
import {
  normalizeEmail,
  type DashboardRole,
  type DashboardUser,
} from "@/lib/allowedUsers";
import { isSameEngineerName } from "@/lib/engineers";

export type AccessScope = "all" | "self";

export type ResolvedAccess = {
  email: string;
  role: DashboardRole;
  canView: boolean;
  canEdit: boolean;
  canManageUsers: boolean;
  scope: AccessScope;
  engineerName?: string;
  /** Team role without a usable engineer link */
  needsEngineerLink: boolean;
};

/** Org-domain check only; listing is required separately via resolveAccess. */
export function canViewDashboard(email: string): boolean {
  return isAllowedOrganizationEmail(normalizeEmail(email));
}

export function resolveAccess(
  email: string,
  users: DashboardUser[] | null,
  engineerNames: string[] = [],
): ResolvedAccess {
  const normalized = normalizeEmail(email);
  const onDomain = canViewDashboard(normalized);

  if (!onDomain) {
    return {
      email: normalized,
      role: "team",
      canView: false,
      canEdit: false,
      canManageUsers: false,
      scope: "self",
      needsEngineerLink: false,
    };
  }

  const record =
    users?.find((user) => user.email === normalized) ?? null;

  if (!record) {
    // Domain login with no Users entry → Access restricted
    return {
      email: normalized,
      role: "team",
      canView: false,
      canEdit: false,
      canManageUsers: false,
      scope: "self",
      needsEngineerLink: false,
    };
  }

  if (record.role === "admin") {
    return {
      email: normalized,
      role: "admin",
      canView: true,
      canEdit: true,
      canManageUsers: true,
      scope: "all",
      needsEngineerLink: false,
    };
  }

  if (record.role === "lead") {
    return {
      email: normalized,
      role: "lead",
      canView: true,
      canEdit: false,
      canManageUsers: false,
      scope: "all",
      needsEngineerLink: false,
    };
  }

  // Team member — must be linked to an engineer name
  const linked = record.engineerName?.trim() ?? "";
  if (!linked) {
    return {
      email: normalized,
      role: "team",
      canView: false,
      canEdit: false,
      canManageUsers: false,
      scope: "self",
      needsEngineerLink: true,
    };
  }

  const matchedEngineer =
    engineerNames.find((name) => isSameEngineerName(name, linked)) ?? null;

  if (engineerNames.length > 0 && !matchedEngineer) {
    return {
      email: normalized,
      role: "team",
      canView: true,
      canEdit: false,
      canManageUsers: false,
      scope: "self",
      engineerName: linked,
      needsEngineerLink: true,
    };
  }

  return {
    email: normalized,
    role: "team",
    canView: true,
    canEdit: false,
    canManageUsers: false,
    scope: "self",
    engineerName: matchedEngineer ?? linked,
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

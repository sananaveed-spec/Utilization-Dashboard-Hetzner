export const DEFAULT_ALLOWED_EMAILS = ["sana.naveed@allumiax.com"] as const;

export const ALLOWED_USERS_CHANGED_EVENT = "allowed-users-changed";

export const DASHBOARD_ROLES = [
  "admin",
  "manager",
  "lead",
  "employee",
] as const;

export type DashboardRole = (typeof DASHBOARD_ROLES)[number];

export type DashboardUser = {
  email: string;
  role: DashboardRole;
  /** Display / self link name (Team Lead or Team Member) */
  engineerName?: string;
  /** Team Member: their Team Lead's name */
  leadEngineerName?: string;
  /** Lead (and optional Team Member): team id */
  teamId?: string;
  /** Lead legacy: engineers list (used if teamId missing) */
  teamEngineers?: string[];
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function isDashboardRole(value: unknown): value is DashboardRole {
  return (
    typeof value === "string" &&
    (DASHBOARD_ROLES as readonly string[]).includes(value)
  );
}

/** Display order: Manager → Team Lead → Team Member (Admin first). */
const ROLE_SORT_ORDER: Record<DashboardRole, number> = {
  admin: 0,
  manager: 1,
  lead: 2,
  employee: 3,
};

function userSortName(user: DashboardUser): string {
  return (user.engineerName || user.email).toLowerCase();
}

export function sortDashboardUsers(users: DashboardUser[]): DashboardUser[] {
  return [...users].sort((a, b) => {
    const roleDiff = ROLE_SORT_ORDER[a.role] - ROLE_SORT_ORDER[b.role];
    if (roleDiff !== 0) return roleDiff;
    return userSortName(a).localeCompare(userSortName(b), undefined, {
      sensitivity: "base",
    });
  });
}

export function defaultAdminUsers(): DashboardUser[] {
  return sortDashboardUsers(
    DEFAULT_ALLOWED_EMAILS.map((email) => ({
      email: normalizeEmail(email),
      role: "admin" as const,
    })),
  );
}

function normalizeTeamEngineers(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const names = [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  return names.length > 0 ? names : undefined;
}

function resolveStoredRole(
  rawRole: unknown,
  teamEngineers: string[] | undefined,
  teamId: string | undefined,
): DashboardRole {
  if (rawRole === "team") {
    return "employee";
  }
  if (rawRole === "lead") {
    // Legacy lead had full-firm edit and no team → Manager.
    // New Lead records include teamId or teamEngineers.
    return teamId || (teamEngineers && teamEngineers.length > 0)
      ? "lead"
      : "manager";
  }
  if (isDashboardRole(rawRole)) {
    return rawRole;
  }
  return "admin";
}

/**
 * Accepts legacy string[] emails (→ admin), old team/lead roles, or DashboardUser[].
 * Legacy lead → manager. Legacy team → employee.
 */
export function parseDashboardUsers(parsed: unknown): DashboardUser[] {
  if (!Array.isArray(parsed)) {
    return defaultAdminUsers();
  }

  const byEmail = new Map<string, DashboardUser>();

  for (const item of parsed) {
    if (typeof item === "string") {
      const email = normalizeEmail(item);
      if (!isValidEmail(email) || byEmail.has(email)) continue;
      byEmail.set(email, { email, role: "admin" });
      continue;
    }

    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const email =
      typeof record.email === "string" ? normalizeEmail(record.email) : "";
    if (!isValidEmail(email) || byEmail.has(email)) continue;

    const teamEngineers = normalizeTeamEngineers(record.teamEngineers);
    const teamId =
      typeof record.teamId === "string" && record.teamId.trim()
        ? record.teamId.trim()
        : undefined;
    const role = resolveStoredRole(record.role, teamEngineers, teamId);
    const engineerName =
      typeof record.engineerName === "string" && record.engineerName.trim()
        ? record.engineerName.trim()
        : undefined;
    const leadEngineerName =
      typeof record.leadEngineerName === "string" &&
      record.leadEngineerName.trim()
        ? record.leadEngineerName.trim()
        : undefined;

    byEmail.set(email, {
      email,
      role,
      ...(engineerName && (role === "employee" || role === "lead")
        ? { engineerName }
        : {}),
      ...(role === "employee" && leadEngineerName ? { leadEngineerName } : {}),
      ...(role === "employee" && teamId ? { teamId } : {}),
      ...(role === "lead" && teamId ? { teamId } : {}),
      ...(role === "lead" && !teamId && teamEngineers
        ? { teamEngineers }
        : {}),
    });
  }

  const users = sortDashboardUsers([...byEmail.values()]);
  return users.length > 0 ? users : defaultAdminUsers();
}

export function normalizeDashboardUser(input: {
  email: string;
  role: DashboardRole;
  engineerName?: string;
  leadEngineerName?: string;
  teamId?: string;
  teamEngineers?: string[];
}): DashboardUser | { error: string } {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    return { error: "Enter a valid email address." };
  }
  if (!isDashboardRole(input.role)) {
    return { error: "Select a valid role." };
  }

  if (input.role === "lead") {
    const teamId = input.teamId?.trim() ?? "";
    const teamEngineers = normalizeTeamEngineers(input.teamEngineers ?? []);
    const engineerName = input.engineerName?.trim() ?? "";
    if (!teamId && (!teamEngineers || teamEngineers.length === 0)) {
      return {
        error: "Leads must be linked to a Team (create one under Teams first).",
      };
    }
    return {
      email,
      role: "lead",
      ...(engineerName ? { engineerName } : {}),
      ...(teamId ? { teamId } : {}),
      ...(!teamId && teamEngineers ? { teamEngineers } : {}),
    };
  }

  if (input.role === "employee") {
    const engineerName = input.engineerName?.trim() ?? "";
    const leadEngineerName = input.leadEngineerName?.trim() ?? "";
    const teamId = input.teamId?.trim() ?? "";
    return {
      email,
      role: "employee",
      ...(engineerName ? { engineerName } : {}),
      ...(leadEngineerName ? { leadEngineerName } : {}),
      ...(teamId ? { teamId } : {}),
    };
  }

  return { email, role: input.role };
}

export function notifyAllowedUsersChanged(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(ALLOWED_USERS_CHANGED_EVENT));
}

/** @deprecated Prefer role checks via resolveAccess; kept for migration helpers. */
export function isEmailAllowed(
  email: string,
  allowedEmails: string[],
): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return false;
  }
  return allowedEmails.some((item) => normalizeEmail(item) === normalized);
}

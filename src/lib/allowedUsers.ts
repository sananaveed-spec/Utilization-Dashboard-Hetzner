export const DEFAULT_ALLOWED_EMAILS = ["sana.naveed@allumiax.com"] as const;

export const ALLOWED_USERS_CHANGED_EVENT = "allowed-users-changed";

export const DASHBOARD_ROLES = ["admin", "lead", "team"] as const;

export type DashboardRole = (typeof DASHBOARD_ROLES)[number];

export type DashboardUser = {
  email: string;
  role: DashboardRole;
  /** Required when role === "team"; display name matching engineers list */
  engineerName?: string;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  // Practical allowlist validation — not a full RFC parser.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function isDashboardRole(value: unknown): value is DashboardRole {
  return (
    typeof value === "string" &&
    (DASHBOARD_ROLES as readonly string[]).includes(value)
  );
}

export function sortDashboardUsers(users: DashboardUser[]): DashboardUser[] {
  return [...users].sort((a, b) => a.email.localeCompare(b.email));
}

export function defaultAdminUsers(): DashboardUser[] {
  return sortDashboardUsers(
    DEFAULT_ALLOWED_EMAILS.map((email) => ({
      email: normalizeEmail(email),
      role: "admin" as const,
    })),
  );
}

/**
 * Accepts legacy string[] emails (migrates to admin) or DashboardUser[].
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

    const role: DashboardRole = isDashboardRole(record.role)
      ? record.role
      : "admin";
    const engineerName =
      typeof record.engineerName === "string" && record.engineerName.trim()
        ? record.engineerName.trim()
        : undefined;

    byEmail.set(email, {
      email,
      role,
      ...(role === "team" && engineerName ? { engineerName } : {}),
    });
  }

  const users = sortDashboardUsers([...byEmail.values()]);
  return users.length > 0 ? users : defaultAdminUsers();
}

export function normalizeDashboardUser(input: {
  email: string;
  role: DashboardRole;
  engineerName?: string;
}): DashboardUser | { error: string } {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    return { error: "Enter a valid email address." };
  }
  if (!isDashboardRole(input.role)) {
    return { error: "Select a valid role." };
  }

  if (input.role === "team") {
    const engineerName = input.engineerName?.trim() ?? "";
    if (!engineerName) {
      return { error: "Team members must be linked to an engineer name." };
    }
    return { email, role: "team", engineerName };
  }

  return { email, role: input.role };
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
  return allowedEmails.some((allowed) => allowed === normalized);
}

export function notifyAllowedUsersChanged(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(ALLOWED_USERS_CHANGED_EVENT));
}

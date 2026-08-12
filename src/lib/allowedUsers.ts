export const DEFAULT_ALLOWED_EMAILS = ["sana.naveed@allumiax.com"] as const;

export const ALLOWED_USERS_CHANGED_EVENT = "allowed-users-changed";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  // Practical allowlist validation — not a full RFC parser.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function sortEmails(emails: string[]): string[] {
  return [...emails].sort((a, b) => a.localeCompare(b));
}

export function uniqueNormalizedEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const email of emails) {
    const normalized = normalizeEmail(email);
    if (!normalized || !isValidEmail(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return sortEmails(result);
}

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

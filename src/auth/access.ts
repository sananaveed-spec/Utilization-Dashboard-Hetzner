import { isAllowedOrganizationEmail } from "@/auth/organization";
import { isEmailAllowed, normalizeEmail } from "@/lib/allowedUsers";

/** Any @allumiax.com (or configured domain) account can view the dashboard. */
export function canViewDashboard(email: string): boolean {
  return isAllowedOrganizationEmail(normalizeEmail(email));
}

/** Only emails on the Users allowlist can edit data. */
export function canEditDashboard(
  email: string,
  editorEmails: string[] | null,
): boolean {
  if (!editorEmails) {
    return false;
  }
  const normalized = normalizeEmail(email);
  return (
    canViewDashboard(normalized) && isEmailAllowed(normalized, editorEmails)
  );
}

import { NextResponse } from "next/server";
import { canViewDashboard, resolveAccess } from "@/auth/access";
import { normalizeEmail } from "@/lib/allowedUsers";
import { readDashboardUsers } from "@/lib/allowedUsersStore";

/**
 * Soft server gate for write APIs: require x-user-email with Admin role.
 * Client UI also blocks edits for non-admins.
 */
export async function requireEditor(
  request: Request,
): Promise<NextResponse | null> {
  const email = normalizeEmail(request.headers.get("x-user-email") ?? "");

  if (!email || !canViewDashboard(email)) {
    return NextResponse.json(
      { error: "Sign in with an @allumiax.com account to continue." },
      { status: 401 },
    );
  }

  const users = await readDashboardUsers();
  const access = resolveAccess(email, users);
  if (!access.canEdit) {
    return NextResponse.json(
      {
        error:
          "Admin access required to edit. Ask an Admin to update your role under Users.",
      },
      { status: 403 },
    );
  }

  return null;
}

/** Alias for clarity — write APIs require Admin. */
export const requireAdmin = requireEditor;

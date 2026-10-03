import { NextResponse } from "next/server";
import { canEditDashboard, canViewDashboard } from "@/auth/access";
import { normalizeEmail } from "@/lib/allowedUsers";
import { readAllowedEmails } from "@/lib/allowedUsersStore";

/**
 * Soft server gate for write APIs: require x-user-email on the allowlist.
 * Client UI also blocks edits for view-only users.
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

  const editorEmails = await readAllowedEmails();
  if (!canEditDashboard(email, editorEmails)) {
    return NextResponse.json(
      {
        error:
          "View-only access. Ask an admin to add your email under Users to edit.",
      },
      { status: 403 },
    );
  }

  return null;
}

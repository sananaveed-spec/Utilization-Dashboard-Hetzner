import { NextResponse } from "next/server";
import { canViewDashboard, resolveAccess } from "@/auth/access";
import { normalizeEmail } from "@/lib/allowedUsers";
import { readDashboardUsers } from "@/lib/allowedUsersStore";

async function resolveRequestAccess(request: Request) {
  const email = normalizeEmail(request.headers.get("x-user-email") ?? "");

  if (!email || !canViewDashboard(email)) {
    return {
      email,
      access: null,
      unauthorized: NextResponse.json(
        { error: "Sign in with an @allumiax.com account to continue." },
        { status: 401 },
      ),
    } as const;
  }

  const users = await readDashboardUsers();
  return {
    email,
    access: resolveAccess(email, users),
    unauthorized: null,
  } as const;
}

/**
 * Soft server gate for write APIs: require Admin or Lead (canEdit).
 */
export async function requireEditor(
  request: Request,
): Promise<NextResponse | null> {
  const { access, unauthorized } = await resolveRequestAccess(request);
  if (unauthorized) return unauthorized;

  if (!access?.canEdit) {
    return NextResponse.json(
      {
        error:
          "Admin or Lead access required to edit. Ask an Admin to update your role under Users.",
      },
      { status: 403 },
    );
  }

  return null;
}

/** Users management APIs — Admin only (canManageUsers). */
export async function requireAdmin(
  request: Request,
): Promise<NextResponse | null> {
  const { access, unauthorized } = await resolveRequestAccess(request);
  if (unauthorized) return unauthorized;

  if (!access?.canManageUsers) {
    return NextResponse.json(
      {
        error:
          "Admin access required to manage users. Ask an Admin to update your role under Users.",
      },
      { status: 403 },
    );
  }

  return null;
}

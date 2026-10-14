import { NextResponse } from "next/server";
import {
  canViewDashboard,
  resolveAccess,
  type ResolvedAccess,
} from "@/auth/access";
import { normalizeEmail } from "@/lib/allowedUsers";
import { readDashboardUsers } from "@/lib/allowedUsersStore";
import { readEngineers } from "@/lib/dashboardDataStore";
import { readTeams } from "@/lib/teamsStore";

export async function resolveRequestAccess(request: Request): Promise<{
  email: string;
  access: ResolvedAccess | null;
  unauthorized: NextResponse | null;
}> {
  const email = normalizeEmail(request.headers.get("x-user-email") ?? "");

  if (!email || !canViewDashboard(email)) {
    return {
      email,
      access: null,
      unauthorized: NextResponse.json(
        { error: "Sign in with an @allumiax.com account to continue." },
        { status: 401 },
      ),
    };
  }

  const [users, teams, engineers] = await Promise.all([
    readDashboardUsers(),
    readTeams(),
    readEngineers(),
  ]);
  return {
    email,
    access: resolveAccess(email, users, engineers, teams),
    unauthorized: null,
  };
}

/**
 * Soft server gate for write APIs that Leads may use (e.g. entries hours/stars).
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
          "Edit access required. Ask an Admin to update your role under Users.",
      },
      { status: 403 },
    );
  }

  return null;
}

/**
 * Firm-wide edits (holidays, engineer list, calendar) — Admin or Manager only.
 */
export async function requireFullEditor(
  request: Request,
): Promise<NextResponse | null> {
  const { access, unauthorized } = await resolveRequestAccess(request);
  if (unauthorized) return unauthorized;

  if (!access?.canEditAll) {
    return NextResponse.json(
      {
        error:
          "Team Lead, Manager, or Admin access required. Ask an Admin to update your role under Users.",
      },
      { status: 403 },
    );
  }

  return null;
}

/** Users management APIs — Admin only. */
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

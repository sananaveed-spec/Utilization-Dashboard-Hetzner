import { NextResponse } from "next/server";
import { isDashboardRole, isValidEmail, normalizeEmail } from "@/lib/allowedUsers";
import {
  readDashboardUsers,
  removeDashboardUser,
  upsertDashboardUser,
} from "@/lib/allowedUsersStore";
import { requireAdmin } from "@/lib/requireEditor";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const users = await readDashboardUsers();
    return NextResponse.json({ users });
  } catch {
    return NextResponse.json(
      { error: "Failed to load allowed users." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) {
    return denied;
  }

  try {
    const body = (await request.json()) as {
      email?: unknown;
      role?: unknown;
      engineerName?: unknown;
    };
    const email =
      typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const role = body.role;
    const engineerName =
      typeof body.engineerName === "string" ? body.engineerName : undefined;

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 },
      );
    }
    if (!isDashboardRole(role)) {
      return NextResponse.json(
        { error: "Select a valid role (admin, lead, or team)." },
        { status: 400 },
      );
    }

    const result = await upsertDashboardUser({ email, role, engineerName });
    if (result.error) {
      return NextResponse.json(
        { error: result.error, users: result.users },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        users: result.users,
        saved: result.saved,
        message: "User saved.",
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to save user." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) {
    return denied;
  }

  try {
    const body = (await request.json()) as { email?: unknown };
    const email =
      typeof body.email === "string" ? normalizeEmail(body.email) : "";

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 },
      );
    }

    const result = await removeDashboardUser(email);
    if (result.error) {
      return NextResponse.json(
        { error: result.error, users: result.users },
        { status: 400 },
      );
    }

    return NextResponse.json({
      users: result.users,
      removed: result.removed,
      message: result.removed
        ? "User removed."
        : "User was not on the list.",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to remove user." },
      { status: 500 },
    );
  }
}

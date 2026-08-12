import { NextResponse } from "next/server";
import { isValidEmail, normalizeEmail } from "@/lib/allowedUsers";
import {
  addAllowedEmail,
  readAllowedEmails,
  removeAllowedEmail,
} from "@/lib/allowedUsersStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const emails = await readAllowedEmails();
    return NextResponse.json({ emails });
  } catch {
    return NextResponse.json(
      { error: "Failed to load allowed users." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
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

    const result = await addAllowedEmail(email);
    return NextResponse.json(
      {
        emails: result.emails,
        added: result.added,
        message: result.added
          ? "Email added."
          : "Email is already on the allowlist.",
      },
      { status: result.added ? 201 : 200 },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to add email." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
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

    const result = await removeAllowedEmail(email);
    if (result.error) {
      return NextResponse.json(
        { error: result.error, emails: result.emails },
        { status: 400 },
      );
    }

    return NextResponse.json({
      emails: result.emails,
      removed: result.removed,
      message: result.removed
        ? "Email removed."
        : "Email was not on the allowlist.",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to remove email." },
      { status: 500 },
    );
  }
}

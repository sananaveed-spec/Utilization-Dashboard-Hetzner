import { NextResponse } from "next/server";
import {
  appendHistory,
  readHistory,
  writeHistory,
} from "@/lib/dashboardDataStore";
import type { HistoryInput } from "@/lib/history";
import {
  requireAdmin,
  requireEditor,
  resolveRequestAccess,
} from "@/lib/requireEditor";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { access, unauthorized } = await resolveRequestAccess(request);
  if (unauthorized) {
    return unauthorized;
  }
  if (!access?.canViewHistory) {
    return NextResponse.json(
      { error: "History is available to Admins only." },
      { status: 403 },
    );
  }

  try {
    const entries = await readHistory();
    return NextResponse.json({ entries });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load history.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireEditor(request);
  if (denied) {
    return denied;
  }

  try {
    const body = (await request.json()) as HistoryInput;
    const entry = await appendHistory(body);
    return NextResponse.json({ entry });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save history.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  // Clear history is Admin-only (same spirit as Users management).
  const denied = await requireAdmin(request);
  if (denied) {
    return denied;
  }

  try {
    await writeHistory([]);
    return NextResponse.json({ entries: [] });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to clear history.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { readEntries, writeEntries } from "@/lib/dashboardDataStore";
import { requireEditor } from "@/lib/requireEditor";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const entries = await readEntries();
    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json(
      { error: "Failed to load entries." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const denied = await requireEditor(request);
  if (denied) {
    return denied;
  }

  try {
    const body = (await request.json()) as { entries?: unknown };
    const entries = await writeEntries(body.entries ?? []);
    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json(
      { error: "Failed to save entries." },
      { status: 500 },
    );
  }
}

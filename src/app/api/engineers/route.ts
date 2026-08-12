import { NextResponse } from "next/server";
import { readEngineers, writeEngineers } from "@/lib/dashboardDataStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const engineers = await readEngineers();
    return NextResponse.json({ engineers });
  } catch {
    return NextResponse.json(
      { error: "Failed to load engineers." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { engineers?: unknown };
    const engineers = await writeEngineers(body.engineers ?? []);
    return NextResponse.json({ engineers });
  } catch {
    return NextResponse.json(
      { error: "Failed to save engineers." },
      { status: 500 },
    );
  }
}

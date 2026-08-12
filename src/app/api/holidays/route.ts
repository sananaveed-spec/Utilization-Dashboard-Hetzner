import { NextResponse } from "next/server";
import { readHolidays, writeHolidays } from "@/lib/dashboardDataStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const holidays = await readHolidays();
    return NextResponse.json({ holidays });
  } catch {
    return NextResponse.json(
      { error: "Failed to load holidays." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { holidays?: unknown };
    const holidays = await writeHolidays(body.holidays ?? []);
    return NextResponse.json({ holidays });
  } catch {
    return NextResponse.json(
      { error: "Failed to save holidays." },
      { status: 500 },
    );
  }
}

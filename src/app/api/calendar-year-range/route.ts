import { NextResponse } from "next/server";
import {
  readCalendarYearRange,
  writeCalendarYearRange,
} from "@/lib/dashboardDataStore";
import { getDefaultCalendarYearRange } from "@/lib/weeks";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const calendarYearRange = await readCalendarYearRange();
    return NextResponse.json({ calendarYearRange });
  } catch {
    return NextResponse.json(
      { error: "Failed to load calendar year range." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { calendarYearRange?: unknown };
    const calendarYearRange = await writeCalendarYearRange(
      body.calendarYearRange ?? getDefaultCalendarYearRange(),
    );
    return NextResponse.json({ calendarYearRange });
  } catch {
    return NextResponse.json(
      { error: "Failed to save calendar year range." },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import {
  readCalendarYearRange,
  readEngineers,
  readEntries,
  readHolidays,
} from "@/lib/dashboardDataStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [holidays, engineers, entries, calendarYearRange] = await Promise.all(
      [readHolidays(), readEngineers(), readEntries(), readCalendarYearRange()],
    );

    return NextResponse.json({
      holidays,
      engineers,
      entries,
      calendarYearRange,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load dashboard data." },
      { status: 500 },
    );
  }
}

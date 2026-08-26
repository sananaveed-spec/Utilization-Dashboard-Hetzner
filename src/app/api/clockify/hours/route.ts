import { NextResponse } from "next/server";
import {
  ClockifyClient,
  getClockifyConfig,
  getClockifyTimezone,
} from "@/lib/clockify/client";
import {
  clockifyHoursKey,
  findWeekForDay,
} from "@/lib/clockify/hours";
import { canonicalEngineerName } from "@/lib/entries";
import { parseProjectParts } from "@/lib/projects";
import { getWorkWeeksForMonth } from "@/lib/weeks";

export const dynamic = "force-dynamic";

function zonedParts(
  iso: string,
  timeZone: string,
): { year: number; month: number; day: number } | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(new Date(iso));
    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);

    if (![year, month, day].every((value) => Number.isFinite(value))) {
      return null;
    }

    return { year, month, day };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const config = getClockifyConfig();

  if (!config) {
    return NextResponse.json(
      {
        error:
          "Timesheets is not configured. Set TIMESHEETS_API_TOKEN and TIMESHEETS_ORGANIZATION_ID in .env.local.",
      },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return NextResponse.json(
      { error: "Query params year and month (1-12) are required." },
      { status: 400 },
    );
  }

  try {
    const timezone = getClockifyTimezone();
    const weeks = getWorkWeeksForMonth({ year, month });
    const firstDay = weeks[0]?.startDate ?? `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const lastDay =
      weeks[weeks.length - 1]?.endDate ??
      `${year}-${String(month).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`;

    const client = new ClockifyClient(config);
    const entries = await client.getDetailedReportEntries(
      `${firstDay}T00:00:00.000`,
      `${lastDay}T23:59:59.999`,
      timezone,
    );

    const hoursByKey: Record<string, number> = {};

    for (const entry of entries) {
      if (!entry.projectName) {
        continue;
      }

      const zoned = zonedParts(entry.timeInterval.start, timezone);
      if (!zoned || zoned.year !== year || zoned.month !== month) {
        continue;
      }

      const week = findWeekForDay(weeks, zoned.day);
      if (!week) {
        continue;
      }

      const seconds = client.getEntrySeconds(entry);
      if (seconds <= 0) {
        continue;
      }

      const engineerName = canonicalEngineerName(entry.userName);
      const { projectCode, projectName } = parseProjectParts(entry.projectName);
      if (
        (!projectCode || projectCode === "—") &&
        (!projectName || projectName === "—")
      ) {
        continue;
      }

      const key = clockifyHoursKey(
        engineerName,
        projectCode,
        week.weekNumber,
        projectName,
      );
      hoursByKey[key] = (hoursByKey[key] ?? 0) + seconds / 3600;
    }

    // Round to 2 decimals for stable display
    for (const key of Object.keys(hoursByKey)) {
      hoursByKey[key] = Math.round(hoursByKey[key] * 100) / 100;
    }

    return NextResponse.json({
      year,
      month,
      hoursByKey,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Timesheets hours request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

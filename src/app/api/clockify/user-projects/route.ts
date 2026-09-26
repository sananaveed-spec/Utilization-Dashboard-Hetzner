import { NextRequest, NextResponse } from "next/server";
import { ClockifyClient, getClockifyConfig } from "@/lib/clockify/client";

export const dynamic = "force-dynamic";

function toWindowISO(
  start: string | null,
  end: string | null,
): { startISO: string; endISO: string } | undefined {
  const startKey = start?.trim() ?? "";
  const endKey = end?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startKey) || !/^\d{4}-\d{2}-\d{2}$/.test(endKey)) {
    return undefined;
  }
  return {
    startISO: `${startKey}T00:00:00Z`,
    endISO: `${endKey}T23:59:59Z`,
  };
}

export async function GET(request: NextRequest) {
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

  const userId = request.nextUrl.searchParams.get("userId")?.trim() ?? "";
  if (!userId) {
    return NextResponse.json(
      { error: "Query parameter userId is required." },
      { status: 400 },
    );
  }

  const range = toWindowISO(
    request.nextUrl.searchParams.get("start"),
    request.nextUrl.searchParams.get("end"),
  );

  try {
    const client = new ClockifyClient(config);
    const projects = await client.getActiveProjectsWorkedByUser(userId, range);

    return NextResponse.json({
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        clientName: project.clientName ?? null,
      })),
      count: projects.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Timesheets request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

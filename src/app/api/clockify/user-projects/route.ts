import { NextRequest, NextResponse } from "next/server";
import { ClockifyClient, getClockifyConfig } from "@/lib/clockify/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const config = getClockifyConfig();

  if (!config) {
    return NextResponse.json(
      {
        error:
          "Clockify is not configured. Set CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID in .env.local.",
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

  try {
    const client = new ClockifyClient(config);
    const projects = await client.getActiveProjectsWorkedByUser(userId);

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
      error instanceof Error ? error.message : "Clockify request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

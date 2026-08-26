import { NextResponse } from "next/server";
import { ClockifyClient, getClockifyConfig } from "@/lib/clockify/client";

export const dynamic = "force-dynamic";

export async function GET() {
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

  try {
    const client = new ClockifyClient(config);
    const [users, projects] = await Promise.all([
      client.getActiveUsers(),
      client.getActiveProjects(),
    ]);

    return NextResponse.json({
      employees: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
      })),
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        clientName: project.clientName ?? null,
      })),
      counts: {
        employees: users.length,
        projects: projects.length,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Timesheets request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

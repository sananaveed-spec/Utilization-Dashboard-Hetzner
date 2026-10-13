import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireEditor";
import {
  readTeams,
  removeTeam,
  upsertTeam,
} from "@/lib/teamsStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const teams = await readTeams();
    return NextResponse.json({ teams });
  } catch {
    return NextResponse.json(
      { error: "Failed to load teams." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) {
    return denied;
  }

  try {
    const body = (await request.json()) as {
      id?: unknown;
      name?: unknown;
      leadEngineerName?: unknown;
      memberEngineers?: unknown;
    };

    const result = await upsertTeam({
      id: typeof body.id === "string" ? body.id : undefined,
      name: typeof body.name === "string" ? body.name : undefined,
      leadEngineerName:
        typeof body.leadEngineerName === "string" ? body.leadEngineerName : "",
      memberEngineers: Array.isArray(body.memberEngineers)
        ? body.memberEngineers.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
    });

    if (result.error) {
      return NextResponse.json(
        { error: result.error, teams: result.teams },
        { status: 400 },
      );
    }

    return NextResponse.json({
      teams: result.teams,
      saved: result.saved,
      message: "Team saved.",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to save team." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) {
    return denied;
  }

  try {
    const body = (await request.json()) as { id?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json(
        { error: "Team id is required." },
        { status: 400 },
      );
    }

    const result = await removeTeam(id);
    return NextResponse.json({
      teams: result.teams,
      removed: result.removed,
      message: result.removed ? "Team removed." : "Team was not found.",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to remove team." },
      { status: 500 },
    );
  }
}

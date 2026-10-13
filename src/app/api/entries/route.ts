import { NextResponse } from "next/server";
import { canEditEngineerName } from "@/auth/access";
import { readEntries, writeEntries } from "@/lib/dashboardDataStore";
import {
  parseUtilizationEntries,
  type UtilizationEntry,
} from "@/lib/entries";
import {
  requireEditor,
  resolveRequestAccess,
} from "@/lib/requireEditor";

export const dynamic = "force-dynamic";

function mergeEntriesForScopedEditor(
  existing: UtilizationEntry[],
  incoming: UtilizationEntry[],
  access: {
    canEdit: boolean;
    canEditAll: boolean;
    editableEngineerNames: string[];
  },
): UtilizationEntry[] {
  const kept = existing.filter(
    (entry) => !canEditEngineerName(access, entry.engineerName),
  );
  const scopedIncoming = incoming.filter((entry) =>
    canEditEngineerName(access, entry.engineerName),
  );
  return parseUtilizationEntries([...kept, ...scopedIncoming]);
}

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
    const { access } = await resolveRequestAccess(request);
    if (!access?.canEdit) {
      return NextResponse.json(
        { error: "Edit access required." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as { entries?: unknown };
    const incoming = parseUtilizationEntries(body.entries ?? []);

    const entries = access.canEditAll
      ? await writeEntries(incoming)
      : await writeEntries(
          mergeEntriesForScopedEditor(
            await readEntries(),
            incoming,
            access,
          ),
        );

    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json(
      { error: "Failed to save entries." },
      { status: 500 },
    );
  }
}

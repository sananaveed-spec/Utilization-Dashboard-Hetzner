export type DashboardTeam = {
  id: string;
  /** Display name for the team (optional; defaults to "{lead} Team") */
  name: string;
  leadEngineerName: string;
  memberEngineers: string[];
};

export type DashboardTeamInput = {
  id?: string;
  name?: string;
  leadEngineerName: string;
  memberEngineers: string[];
};

export const TEAMS_CHANGED_EVENT = "dashboard-teams-changed";

export function createTeamId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `team-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const name = value.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

export function defaultTeamName(leadEngineerName: string): string {
  const lead = leadEngineerName.trim();
  return lead ? `${lead} — Team` : "Untitled team";
}

export function normalizeTeam(
  input: DashboardTeamInput,
): DashboardTeam | { error: string } {
  const leadEngineerName = input.leadEngineerName.trim();
  if (!leadEngineerName) {
    return { error: "Select a team lead." };
  }

  const memberEngineers = uniqueNames(input.memberEngineers).filter(
    (name) => name.toLowerCase() !== leadEngineerName.toLowerCase(),
  );

  const name =
    typeof input.name === "string" && input.name.trim()
      ? input.name.trim()
      : defaultTeamName(leadEngineerName);

  return {
    id:
      typeof input.id === "string" && input.id.trim()
        ? input.id.trim()
        : createTeamId(),
    name,
    leadEngineerName,
    memberEngineers,
  };
}

export function parseTeams(value: unknown): DashboardTeam[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const teams: DashboardTeam[] = [];
  const seenIds = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const normalized = normalizeTeam({
      id: typeof record.id === "string" ? record.id : undefined,
      name: typeof record.name === "string" ? record.name : undefined,
      leadEngineerName:
        typeof record.leadEngineerName === "string"
          ? record.leadEngineerName
          : "",
      memberEngineers: Array.isArray(record.memberEngineers)
        ? record.memberEngineers.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [],
    });
    if ("error" in normalized) continue;
    if (seenIds.has(normalized.id)) continue;
    seenIds.add(normalized.id);
    teams.push(normalized);
  }

  return teams.sort((a, b) =>
    a.leadEngineerName.localeCompare(b.leadEngineerName, undefined, {
      sensitivity: "base",
    }),
  );
}

/** Engineers a Lead may edit for this team (lead + members). */
export function teamEditableEngineers(team: DashboardTeam): string[] {
  return uniqueNames([team.leadEngineerName, ...team.memberEngineers]);
}

export function notifyTeamsChanged(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(TEAMS_CHANGED_EVENT));
}

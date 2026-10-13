import {
  normalizeTeam,
  parseTeams,
  type DashboardTeam,
  type DashboardTeamInput,
} from "@/lib/teams";
import { readJsonFile, writeJsonFile } from "@/lib/jsonDataStore";

const TEAMS_FILE = "teams.json";

export async function readTeams(): Promise<DashboardTeam[]> {
  const parsed = await readJsonFile<unknown>(TEAMS_FILE, []);
  return parseTeams(parsed);
}

export async function writeTeams(
  teams: DashboardTeam[],
): Promise<DashboardTeam[]> {
  const next = parseTeams(teams);
  return writeJsonFile(TEAMS_FILE, next);
}

export async function upsertTeam(
  input: DashboardTeamInput,
): Promise<{ teams: DashboardTeam[]; saved: boolean; error?: string }> {
  const normalized = normalizeTeam(input);
  if ("error" in normalized) {
    const teams = await readTeams();
    return { teams, saved: false, error: normalized.error };
  }

  const current = await readTeams();
  const without = current.filter((team) => team.id !== normalized.id);

  // One team per lead name (case-insensitive).
  const leadTaken = without.find(
    (team) =>
      team.leadEngineerName.toLowerCase() ===
      normalized.leadEngineerName.toLowerCase(),
  );
  if (leadTaken) {
    return {
      teams: current,
      saved: false,
      error: `${normalized.leadEngineerName} is already a team lead of another team.`,
    };
  }

  const teams = await writeTeams([...without, normalized]);
  return { teams, saved: true };
}

export async function removeTeam(id: string): Promise<{
  teams: DashboardTeam[];
  removed: boolean;
}> {
  const current = await readTeams();
  const next = current.filter((team) => team.id !== id);
  if (next.length === current.length) {
    return { teams: current, removed: false };
  }
  const teams = await writeTeams(next);
  return { teams, removed: true };
}

import {
  defaultAdminUsers,
  normalizeDashboardUser,
  normalizeEmail,
  parseDashboardUsers,
  type DashboardRole,
  type DashboardUser,
} from "@/lib/allowedUsers";
import { readJsonFile, writeJsonFile } from "@/lib/jsonDataStore";

const ALLOWED_USERS_FILE = "allowed-users.json";

export async function readDashboardUsers(): Promise<DashboardUser[]> {
  const parsed = await readJsonFile<unknown>(ALLOWED_USERS_FILE, defaultAdminUsers());
  return parseDashboardUsers(parsed);
}

/** @deprecated Use readDashboardUsers; returns admin emails for legacy callers. */
export async function readAllowedEmails(): Promise<string[]> {
  const users = await readDashboardUsers();
  return users.filter((user) => user.role === "admin").map((user) => user.email);
}

export async function writeDashboardUsers(
  users: DashboardUser[],
): Promise<DashboardUser[]> {
  const next = parseDashboardUsers(users);
  const toWrite = next.length > 0 ? next : defaultAdminUsers();
  return writeJsonFile(ALLOWED_USERS_FILE, toWrite);
}

function adminCount(users: DashboardUser[]): number {
  return users.filter((user) => user.role === "admin").length;
}

export async function upsertDashboardUser(input: {
  email: string;
  role: DashboardRole;
  engineerName?: string;
}): Promise<{ users: DashboardUser[]; saved: boolean; error?: string }> {
  const normalized = normalizeDashboardUser(input);
  if ("error" in normalized) {
    const users = await readDashboardUsers();
    return { users, saved: false, error: normalized.error };
  }

  const current = await readDashboardUsers();
  const existing = current.find((user) => user.email === normalized.email);
  const without = current.filter((user) => user.email !== normalized.email);

  if (
    existing?.role === "admin" &&
    normalized.role !== "admin" &&
    adminCount(current) <= 1
  ) {
    return {
      users: current,
      saved: false,
      error: "At least one admin is required.",
    };
  }

  const users = await writeDashboardUsers([...without, normalized]);
  return { users, saved: true };
}

export async function removeDashboardUser(email: string): Promise<{
  users: DashboardUser[];
  removed: boolean;
  error?: string;
}> {
  const normalized = normalizeEmail(email);
  const current = await readDashboardUsers();
  const existing = current.find((user) => user.email === normalized);

  if (!existing) {
    return { users: current, removed: false };
  }

  if (existing.role === "admin" && adminCount(current) <= 1) {
    return {
      users: current,
      removed: false,
      error: "At least one admin is required.",
    };
  }

  const users = await writeDashboardUsers(
    current.filter((user) => user.email !== normalized),
  );
  return { users, removed: true };
}

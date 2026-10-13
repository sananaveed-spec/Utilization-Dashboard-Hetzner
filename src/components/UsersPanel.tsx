"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccess } from "@/auth/accessContext";
import {
  AddUserDialog,
  type AddUserDialogResult,
  type AtsEmployeeOption,
} from "@/components/AddUserDialog";
import { TeamsSection } from "@/components/TeamsSection";
import { useTeams } from "@/hooks/useTeams";
import {
  ALLOWED_USERS_CHANGED_EVENT,
  DASHBOARD_ROLES,
  isValidEmail,
  normalizeEmail,
  notifyAllowedUsersChanged,
  type DashboardRole,
  type DashboardUser,
} from "@/lib/allowedUsers";
import { logDashboardAction } from "@/lib/history-client";
import {
  defaultTeamName,
  notifyTeamsChanged,
  type DashboardTeam,
} from "@/lib/teams";

type AllowedUsersResponse = {
  users?: DashboardUser[];
  error?: string;
  message?: string;
};

const ROLE_LABELS: Record<DashboardRole, string> = {
  admin: "Admin",
  manager: "Manager",
  lead: "Team Lead",
  employee: "Team Member",
};

function findAtsName(
  email: string,
  atsEmployees: AtsEmployeeOption[],
): string | undefined {
  return atsEmployees.find((employee) => employee.email === email)?.name;
}

export function UsersPanel() {
  const { email: signedInEmail } = useAccess();
  const { teams: loadedTeams } = useTeams();
  const [teams, setTeams] = useState<DashboardTeam[]>([]);
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [atsEmployees, setAtsEmployees] = useState<AtsEmployeeOption[]>([]);
  const [atsLoading, setAtsLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<DashboardUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTeams(loadedTeams);
  }, [loadedTeams]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);

    async function loadAts() {
      setAtsLoading(true);
      try {
        const response = await fetch("/api/clockify?scope=employees", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          employees?: AtsEmployeeOption[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to load ATS users.");
        }
        if (!active) return;
        const employees = Array.isArray(data.employees)
          ? data.employees
              .filter(
                (employee) =>
                  typeof employee?.email === "string" &&
                  isValidEmail(normalizeEmail(employee.email)),
              )
              .map((employee) => ({
                id: String(employee.id ?? employee.email),
                name: String(employee.name ?? "").trim() || employee.email,
                email: normalizeEmail(employee.email),
              }))
              .sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
              )
          : [];
        setAtsEmployees(employees);
      } catch {
        if (active) {
          setAtsEmployees([]);
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (active) {
          setAtsLoading(false);
        }
      }
    }

    void loadAts();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, []);

  const existingEmails = useMemo(
    () => new Set(users.map((user) => user.email)),
    [users],
  );

  const atsCandidates = useMemo(
    () =>
      atsEmployees.filter((employee) => !existingEmails.has(employee.email)),
    [atsEmployees, existingEmails],
  );

  function writeHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (signedInEmail) {
      headers["x-user-email"] = signedInEmail;
    }
    return headers;
  }

  const loadUsers = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/allowed-users", { cache: "no-store" });
      const data = (await response.json()) as AllowedUsersResponse;
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load users.");
      }
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load users.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    function onChanged() {
      void loadUsers();
    }
    window.addEventListener(ALLOWED_USERS_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(ALLOWED_USERS_CHANGED_EVENT, onChanged);
    };
  }, [loadUsers]);

  async function upsertTeamMembers(input: {
    leadEngineerName: string;
    addMember?: string;
    ensureLeadOnly?: boolean;
  }): Promise<DashboardTeam | null> {
    const lead = input.leadEngineerName.trim();
    if (!lead) return null;

    const existing = teams.find(
      (team) =>
        team.leadEngineerName.toLowerCase() === lead.toLowerCase(),
    );
    const members = existing ? [...existing.memberEngineers] : [];
    if (input.addMember) {
      const member = input.addMember.trim();
      if (
        member &&
        member.toLowerCase() !== lead.toLowerCase() &&
        !members.some((name) => name.toLowerCase() === member.toLowerCase())
      ) {
        members.push(member);
      }
    }

    const response = await fetch("/api/teams", {
      method: "POST",
      headers: writeHeaders(),
      body: JSON.stringify({
        id: existing?.id,
        name: existing?.name ?? defaultTeamName(lead),
        leadEngineerName: lead,
        memberEngineers: members,
      }),
    });
    const data = (await response.json()) as {
      teams?: DashboardTeam[];
      saved?: DashboardTeam;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error ?? "Failed to update team.");
    }
    const nextTeams = Array.isArray(data.teams) ? data.teams : [];
    setTeams(nextTeams);
    notifyTeamsChanged();
    return (
      nextTeams.find(
        (team) => team.leadEngineerName.toLowerCase() === lead.toLowerCase(),
      ) ?? null
    );
  }

  async function saveUser(input: {
    email: string;
    role: DashboardRole;
    engineerName?: string;
    leadEngineerName?: string;
    teamId?: string;
  }): Promise<boolean> {
    setSaving(true);
    setError(null);
    const existing = users.find(
      (user) => user.email === normalizeEmail(input.email),
    );
    try {
      const response = await fetch("/api/allowed-users", {
        method: "POST",
        headers: writeHeaders(),
        body: JSON.stringify(input),
      });
      const data = (await response.json()) as AllowedUsersResponse;
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save user.");
      }
      setUsers(Array.isArray(data.users) ? data.users : []);
      notifyAllowedUsersChanged();

      const action = existing ? "updated" : "created";
      const detailLines: string[] = [];
      if (!existing) {
        detailLines.push(`Role: ${ROLE_LABELS[input.role]}`);
        if (input.role === "employee" && input.engineerName) {
          detailLines.push(`Name: ${input.engineerName}`);
        }
      } else if (existing.role !== input.role) {
        detailLines.push(
          `Role: "${ROLE_LABELS[existing.role]}" → "${ROLE_LABELS[input.role]}"`,
        );
      }

      if (!existing || detailLines.length > 0) {
        void logDashboardAction({
          project: input.email,
          entityType: "users",
          entityLabel: input.email,
          action,
          summary: existing
            ? `User updated: ${input.email}`
            : `User added: ${input.email}`,
          details: detailLines.join("\n"),
          comment: "Changes saved on Users.",
        });
      }
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Failed to save user.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleAddFromDialog(
    result: AddUserDialogResult,
  ): Promise<boolean> {
    setError(null);
    try {
      if (result.role === "employee") {
        if (!result.leadEngineerName) {
          setError("Select a Team Lead for this Team Member.");
          return false;
        }
        const team = await upsertTeamMembers({
          leadEngineerName: result.leadEngineerName,
          addMember: result.name,
        });
        return saveUser({
          email: result.email,
          role: "employee",
          engineerName: result.name,
          leadEngineerName: result.leadEngineerName,
          teamId: team?.id,
        });
      }

      if (result.role === "lead") {
        const team = await upsertTeamMembers({
          leadEngineerName: result.name,
          ensureLeadOnly: true,
        });
        if (!team) {
          setError("Could not create or find a team for this Team Lead.");
          return false;
        }
        return saveUser({
          email: result.email,
          role: "lead",
          engineerName: result.name,
          teamId: team.id,
        });
      }

      return saveUser({
        email: result.email,
        role: result.role,
        engineerName: result.name,
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Failed to save user.",
      );
      return false;
    }
  }

  async function handleRoleChange(user: DashboardUser, role: DashboardRole) {
    const name =
      user.engineerName ||
      findAtsName(user.email, atsEmployees) ||
      user.email.split("@")[0] ||
      "";

    if (role === "lead") {
      const team = await upsertTeamMembers({
        leadEngineerName: name,
        ensureLeadOnly: true,
      });
      await saveUser({
        email: user.email,
        role: "lead",
        engineerName: name || undefined,
        teamId: team?.id ?? user.teamId,
      });
      return;
    }

    await saveUser({
      email: user.email,
      role,
      engineerName: role === "employee" ? name || undefined : undefined,
      leadEngineerName:
        role === "employee" ? user.leadEngineerName : undefined,
      teamId: role === "employee" ? user.teamId : undefined,
    });
  }

  async function handleDelete(email: string) {
    const confirmed = window.confirm(`Remove "${email}" from Users?`);
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/allowed-users", {
        method: "DELETE",
        headers: writeHeaders(),
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as AllowedUsersResponse;
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to remove user.");
      }
      setUsers(Array.isArray(data.users) ? data.users : []);
      notifyAllowedUsersChanged();
      void logDashboardAction({
        project: email,
        entityType: "users",
        entityLabel: email,
        action: "deleted",
        summary: `User removed: ${email}`,
        details: "",
        comment: "User deleted on Users.",
      });
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to remove user.",
      );
    } finally {
      setSaving(false);
    }
  }

  const adminCount = users.filter((user) => user.role === "admin").length;

  return (
    <div className="users-panel">
      <div className="analysis-header users-header-row">
        <div>
          <h2 className="analysis-title">Users</h2>
        </div>
        <button
          type="button"
          className="button primary button-small"
          disabled={saving}
          onClick={() => {
            setError(null);
            setEditingUser(null);
            setAddOpen(true);
          }}
        >
          + Add
        </button>
      </div>

      <div className="analysis-header analysis-header--compact">
        <div>
          <h3 className="analysis-chart-title">Dashboard users</h3>
        </div>
      </div>

      {error ? (
        <p className="users-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="holidays-table-wrap">
        <table className="holidays-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Lead</th>
              <th scope="col" className="holidays-actions-col">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="holidays-empty">
                  Loading users…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="holidays-empty">
                  No users yet. Click Add to create one.
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const displayName =
                  user.engineerName ||
                  findAtsName(user.email, atsEmployees) ||
                  "—";
                const leadLabel =
                  user.role === "employee"
                    ? user.leadEngineerName?.trim() || "—"
                    : "—";

                return (
                  <tr key={user.email}>
                    <td>
                      <span className="holidays-value">{displayName}</span>
                    </td>
                    <td>
                      <span className="holidays-value">{user.email}</span>
                    </td>
                    <td>
                      <select
                        className="holidays-input users-role-select"
                        value={user.role}
                        disabled={saving}
                        aria-label={`Role for ${user.email}`}
                        onChange={(event) =>
                          void handleRoleChange(
                            user,
                            event.target.value as DashboardRole,
                          )
                        }
                      >
                        {DASHBOARD_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className="holidays-value">{leadLabel}</span>
                    </td>
                    <td className="holidays-actions-col">
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-button icon-button--edit"
                          onClick={() => {
                            setError(null);
                            setEditingUser(user);
                            setAddOpen(true);
                          }}
                          disabled={saving}
                          aria-label={`Edit ${user.email}`}
                          title="Edit"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="icon-button icon-button--delete"
                          onClick={() => void handleDelete(user.email)}
                          disabled={
                            saving ||
                            (user.role === "admin" && adminCount <= 1)
                          }
                          aria-label={`Remove ${user.email}`}
                          title={
                            user.role === "admin" && adminCount <= 1
                              ? "At least one admin is required"
                              : "Remove"
                          }
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <TeamsSection users={users} />

      {addOpen ? (
        <AddUserDialog
          candidates={atsCandidates}
          atsEmployees={atsEmployees}
          users={users}
          teams={teams}
          loadingAts={atsLoading}
          saving={saving}
          initialUser={editingUser}
          onClose={() => {
            setAddOpen(false);
            setEditingUser(null);
          }}
          onSave={handleAddFromDialog}
        />
      ) : null}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAccess } from "@/auth/accessContext";
import {
  ALLOWED_USERS_CHANGED_EVENT,
  DASHBOARD_ROLES,
  isValidEmail,
  normalizeEmail,
  notifyAllowedUsersChanged,
  type DashboardRole,
  type DashboardUser,
} from "@/lib/allowedUsers";

type AllowedUsersResponse = {
  users?: DashboardUser[];
  error?: string;
  message?: string;
};

type UsersPanelProps = {
  engineerNames: string[];
};

const ROLE_LABELS: Record<DashboardRole, string> = {
  admin: "Admin",
  lead: "Lead",
  team: "Team",
};

export function UsersPanel({ engineerNames }: UsersPanelProps) {
  const { email: signedInEmail } = useAccess();
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [draftEmail, setDraftEmail] = useState("");
  const [draftRole, setDraftRole] = useState<DashboardRole>("lead");
  const [draftEngineer, setDraftEngineer] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function saveUser(input: {
    email: string;
    role: DashboardRole;
    engineerName?: string;
  }): Promise<boolean> {
    setSaving(true);
    setError(null);
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

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = normalizeEmail(draftEmail);
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (draftRole === "team" && !draftEngineer.trim()) {
      setError("Team members must be linked to an engineer name.");
      return;
    }

    const ok = await saveUser({
      email,
      role: draftRole,
      engineerName: draftRole === "team" ? draftEngineer : undefined,
    });
    if (ok) {
      setDraftEmail("");
      setDraftRole("lead");
      setDraftEngineer("");
    }
  }

  async function handleRoleChange(user: DashboardUser, role: DashboardRole) {
    await saveUser({
      email: user.email,
      role,
      engineerName:
        role === "team" ? user.engineerName ?? draftEngineer : undefined,
    });
  }

  async function handleEngineerChange(user: DashboardUser, engineerName: string) {
    await saveUser({
      email: user.email,
      role: user.role,
      engineerName,
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
      <div className="analysis-header">
        <div>
          <h2 className="analysis-title">Users</h2>
          <p className="analysis-subtitle">
            Admin can edit everything. Lead can view all data but not edit.
            Team can view only their linked engineer row on Overview and must
            be associated with an engineer name. Anyone with @allumiax.com who
            is not listed sees Access restricted.
          </p>
        </div>
      </div>

      <form className="users-add-form" onSubmit={(event) => void handleAdd(event)}>
        <label className="users-add-label" htmlFor="allowed-user-email">
          Add user
        </label>
        <div className="users-add-row users-add-row--roles">
          <input
            id="allowed-user-email"
            type="email"
            className="holidays-input"
            value={draftEmail}
            placeholder="name@allumiax.com"
            autoComplete="email"
            disabled={saving}
            onChange={(event) => setDraftEmail(event.target.value)}
          />
          <select
            className="holidays-input users-role-select"
            value={draftRole}
            disabled={saving}
            aria-label="Role"
            onChange={(event) =>
              setDraftRole(event.target.value as DashboardRole)
            }
          >
            {DASHBOARD_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          {draftRole === "team" ? (
            <select
              className="holidays-input users-engineer-select"
              value={draftEngineer}
              disabled={saving || engineerNames.length === 0}
              aria-label="Linked engineer"
              onChange={(event) => setDraftEngineer(event.target.value)}
            >
              <option value="">Select engineer…</option>
              {engineerNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="submit"
            className="button primary button-small"
            disabled={saving || !draftEmail.trim()}
          >
            + Add
          </button>
        </div>
      </form>

      {error ? (
        <p className="users-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="holidays-table-wrap">
        <table className="holidays-table">
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Linked engineer</th>
              <th scope="col" className="holidays-actions-col">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="holidays-empty">
                  Loading users…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="holidays-empty">
                  No users yet. Add an Admin to manage access.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.email}>
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
                    {user.role === "team" ? (
                      <select
                        className="holidays-input users-engineer-select"
                        value={user.engineerName ?? ""}
                        disabled={saving || engineerNames.length === 0}
                        aria-label={`Engineer for ${user.email}`}
                        onChange={(event) =>
                          void handleEngineerChange(user, event.target.value)
                        }
                      >
                        <option value="">Select engineer…</option>
                        {engineerNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="holidays-value">—</span>
                    )}
                  </td>
                  <td className="holidays-actions-col">
                    <div className="row-actions">
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState, type FormEvent } from "react";
import { SearchableSelect } from "@/components/SearchableSelect";
import {
  DASHBOARD_ROLES,
  type DashboardRole,
  type DashboardUser,
} from "@/lib/allowedUsers";
import type { DashboardTeam } from "@/lib/teams";

export type AtsEmployeeOption = {
  id: string;
  name: string;
  email: string;
};

export type AddUserDialogResult = {
  email: string;
  name: string;
  role: DashboardRole;
  /** Required when role is employee (Team Member) */
  leadEngineerName?: string;
};

type AddUserDialogProps = {
  candidates: AtsEmployeeOption[];
  /** Full ATS list (for lead-name choices), not only unassigned users */
  atsEmployees?: AtsEmployeeOption[];
  users?: DashboardUser[];
  teams: DashboardTeam[];
  loadingAts?: boolean;
  saving?: boolean;
  /** When set, dialog edits this user instead of creating a new one */
  initialUser?: DashboardUser | null;
  onSave: (result: AddUserDialogResult) => Promise<boolean> | boolean;
  onClose: () => void;
};

const ROLE_LABELS: Record<DashboardRole, string> = {
  admin: "Admin",
  manager: "Manager",
  lead: "Team Lead",
  employee: "Team Member",
};

function resolveInitialAts(
  initialUser: DashboardUser | null | undefined,
  atsEmployees: AtsEmployeeOption[],
  candidates: AtsEmployeeOption[],
): AtsEmployeeOption | null {
  if (!initialUser) return null;
  const fromAts =
    atsEmployees.find((employee) => employee.email === initialUser.email) ??
    candidates.find((employee) => employee.email === initialUser.email);
  if (fromAts) return fromAts;
  return {
    id: initialUser.email,
    name: initialUser.engineerName?.trim() || initialUser.email,
    email: initialUser.email,
  };
}

export function AddUserDialog({
  candidates,
  atsEmployees = [],
  users = [],
  teams,
  loadingAts = false,
  saving = false,
  initialUser = null,
  onSave,
  onClose,
}: AddUserDialogProps) {
  const isEdit = Boolean(initialUser);
  const initialAts = resolveInitialAts(initialUser, atsEmployees, candidates);

  const [selectedId, setSelectedId] = useState(initialAts?.id ?? "");
  const [role, setRole] = useState<DashboardRole>(
    initialUser?.role ?? "employee",
  );
  const [leadName, setLeadName] = useState(
    initialUser?.leadEngineerName ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  const editCandidates = useMemo(() => {
    if (!isEdit || !initialAts) return candidates;
    if (candidates.some((employee) => employee.email === initialAts.email)) {
      return candidates;
    }
    return [initialAts, ...candidates];
  }, [candidates, isEdit, initialAts]);

  const nameOptions = useMemo(
    () =>
      editCandidates.map((employee) => ({
        id: employee.id,
        label: employee.name,
      })),
    [editCandidates],
  );

  const selected =
    editCandidates.find((employee) => employee.id === selectedId) ??
    initialAts;

  const leadOptions = useMemo(() => {
    const fromUsers = users
      .filter((user) => user.role === "lead")
      .map((user) => user.engineerName?.trim() || user.email)
      .filter(Boolean);
    const fromMembers = users
      .map((user) => user.leadEngineerName?.trim() ?? "")
      .filter(Boolean);
    const fromTeams = teams
      .map((team) => team.leadEngineerName.trim())
      .filter(Boolean);
    const fromAts = atsEmployees
      .map((employee) => employee.name.trim())
      .filter(Boolean);
    return [
      ...new Set([...fromUsers, ...fromMembers, ...fromTeams, ...fromAts]),
    ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [users, teams, atsEmployees]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      setError("Select a user name from the ATS list.");
      return;
    }
    if (role === "employee" && !leadName.trim()) {
      setError("Select a Team Lead for this Team Member.");
      return;
    }

    setError(null);
    const ok = await onSave({
      email: isEdit && initialUser ? initialUser.email : selected.email,
      name: selected.name,
      role,
      leadEngineerName: role === "employee" ? leadName.trim() : undefined,
    });
    if (ok) {
      onClose();
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog-panel dialog-panel--add-user"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-user-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="add-user-title" className="dialog-title">
          {isEdit ? "Edit user" : "Add user"}
        </h2>

        <form
          className="dialog-form"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <SearchableSelect
            id="add-user-name"
            label="User name"
            placeholder={
              loadingAts
                ? "Loading ATS users…"
                : "Search active ATS user…"
            }
            options={nameOptions}
            value={selectedId}
            disabled={saving || loadingAts || isEdit}
            emptyMessage={
              loadingAts ? "Loading ATS users…" : "No ATS users available"
            }
            defaultOpen={!isEdit}
            clearable={!isEdit}
            onChange={(value) => {
              setSelectedId(value);
              setError(null);
            }}
          />

          <label className="field-label" htmlFor="add-user-email">
            Email
          </label>
          <input
            id="add-user-email"
            className="field-input"
            type="email"
            value={
              isEdit && initialUser
                ? initialUser.email
                : (selected?.email ?? "")
            }
            placeholder="Auto-filled from ATS"
            readOnly
            disabled
          />

          <label className="field-label" htmlFor="add-user-role">
            Role
          </label>
          <select
            id="add-user-role"
            className="field-input"
            value={role}
            disabled={saving}
            onChange={(event) => {
              setRole(event.target.value as DashboardRole);
              setError(null);
            }}
          >
            {DASHBOARD_ROLES.map((item) => (
              <option key={item} value={item}>
                {ROLE_LABELS[item]}
              </option>
            ))}
          </select>

          {role === "employee" ? (
            <SearchableSelect
              id="add-user-lead"
              label="Lead name"
              placeholder={
                leadOptions.length === 0
                  ? "No team leads available"
                  : "Search or select team lead…"
              }
              options={leadOptions.map((name) => ({
                id: name,
                label: name,
              }))}
              value={leadName}
              disabled={saving || leadOptions.length === 0}
              emptyMessage="No matching team leads"
              onChange={(value) => {
                setLeadName(value);
                setError(null);
              }}
            />
          ) : null}

          {error ? (
            <p className="form-message error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="dialog-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={
                saving ||
                loadingAts ||
                (!isEdit && editCandidates.length === 0) ||
                !selected
              }
            >
              {saving ? "Saving…" : isEdit ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

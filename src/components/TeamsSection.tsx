"use client";

import { useMemo } from "react";
import type { DashboardUser } from "@/lib/allowedUsers";

type TeamsSectionProps = {
  users: DashboardUser[];
};

type DerivedTeam = {
  leadName: string;
  members: string[];
};

function userDisplayName(user: DashboardUser): string {
  return user.engineerName?.trim() || user.email;
}

/** Build Team lead → Members from Dashboard users only. */
export function deriveTeamsFromUsers(users: DashboardUser[]): DerivedTeam[] {
  const leadNames = new Map<string, string>();

  for (const user of users) {
    if (user.role === "lead") {
      const name = userDisplayName(user);
      leadNames.set(name.toLowerCase(), name);
    }
  }

  for (const user of users) {
    if (user.role === "employee" && user.leadEngineerName?.trim()) {
      const name = user.leadEngineerName.trim();
      const key = name.toLowerCase();
      if (!leadNames.has(key)) {
        leadNames.set(key, name);
      }
    }
  }

  return [...leadNames.values()]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((leadName) => {
      const leadKey = leadName.toLowerCase();
      const leadUser = users.find(
        (user) =>
          user.role === "lead" &&
          userDisplayName(user).toLowerCase() === leadKey,
      );

      const members = users
        .filter((user) => {
          if (user.role !== "employee") return false;
          if (user.leadEngineerName?.trim().toLowerCase() === leadKey) {
            return true;
          }
          if (
            leadUser?.teamId &&
            user.teamId &&
            user.teamId === leadUser.teamId
          ) {
            return true;
          }
          return false;
        })
        .map((user) => userDisplayName(user))
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

      return { leadName, members };
    });
}

export function TeamsSection({ users }: TeamsSectionProps) {
  const managers = useMemo(
    () =>
      users
        .filter((user) => user.role === "manager")
        .map((user) => userDisplayName(user))
        .sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" }),
        ),
    [users],
  );

  const teams = useMemo(() => deriveTeamsFromUsers(users), [users]);

  return (
    <section className="teams-section">
      <div className="analysis-header analysis-header--compact">
        <div>
          <h3 className="analysis-chart-title">Teams</h3>
        </div>
      </div>

      <div className="teams-nested">
        <div className="holidays-table-wrap">
          <table className="holidays-table">
            <thead>
              <tr>
                <th scope="col">Manager</th>
              </tr>
            </thead>
            <tbody>
              {managers.length === 0 ? (
                <tr>
                  <td className="holidays-empty">No managers yet.</td>
                </tr>
              ) : (
                managers.map((name) => (
                  <tr key={name}>
                    <td>
                      <span className="holidays-value">{name}</span>
                    </td>
                  </tr>
                ))
              )}
              <tr>
                <td className="teams-nested-cell">
                  <div className="holidays-table-wrap teams-nested-inner">
                    <table className="holidays-table">
                      <thead>
                        <tr>
                          <th scope="col">Team lead</th>
                          <th scope="col">Team member</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teams.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="holidays-empty">
                              No team leads or members yet.
                            </td>
                          </tr>
                        ) : (
                          teams.map((team) => (
                            <tr key={team.leadName}>
                              <td>
                                <span className="holidays-value">
                                  {team.leadName}
                                </span>
                              </td>
                              <td>
                                {team.members.length === 0 ? (
                                  <span className="holidays-value">
                                    No members
                                  </span>
                                ) : (
                                  <div className="users-team-chips users-team-chips--compact">
                                    {team.members.map((name) => (
                                      <span
                                        key={name}
                                        className="users-team-chip"
                                      >
                                        {name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

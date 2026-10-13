import { getAccountEmail } from "@/auth/organization";
import type { HistoryAction, HistoryEntityType, HistoryInput } from "@/lib/history";

export type ActorInfo = {
  name: string;
  email: string;
};

let dashboardActor: ActorInfo = { name: "", email: "" };

/** Keep actor in sync with the signed-in MSAL account (set from AccessProvider). */
export function setDashboardActor(actor: ActorInfo): void {
  dashboardActor = {
    name: actor.name.trim() || actor.email || "Unknown",
    email: actor.email.trim().toLowerCase(),
  };
}

export function getDashboardActor(): ActorInfo {
  return dashboardActor;
}

export function getActorFromAccount(
  account?: { name?: string; username?: string } | null,
): ActorInfo {
  const email = getAccountEmail(account ?? undefined);
  return {
    name: account?.name?.trim() || email || "Unknown",
    email,
  };
}

async function postHistory(input: HistoryInput) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (dashboardActor.email) {
    headers["x-user-email"] = dashboardActor.email;
  }

  const response = await fetch("/api/history", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(data.error || "Failed to write history.");
  }
}

export async function logDashboardAction(params: {
  actor?: ActorInfo;
  project: string;
  entityType: HistoryEntityType;
  entityLabel: string;
  action: HistoryAction;
  summary: string;
  details?: string;
  comment?: string;
}) {
  const actor = params.actor ?? dashboardActor;
  if (!actor.email && !actor.name) {
    return;
  }

  try {
    await postHistory({
      employeeName: actor.name || actor.email || "Unknown",
      employeeEmail: actor.email,
      project: params.project,
      entityType: params.entityType,
      entityLabel: params.entityLabel,
      action: params.action,
      summary: params.summary,
      details: params.details ?? "",
      comment: params.comment ?? "",
    });
  } catch {
    // History must not block the main save/delete flow.
  }
}

const CLOCKIFY_BASE_URL = "https://api.clockify.me/api/v1";
const CLOCKIFY_REPORTS_BASE_URL = "https://reports.api.clockify.me/v1";

export type ClockifyUser = {
  id: string;
  name: string;
  email: string;
  status: "ACTIVE" | "PENDING_EMAIL_VERIFICATION" | "DECLINED";
};

export type ClockifyProject = {
  id: string;
  name: string;
  archived?: boolean;
  template?: boolean;
  clientName?: string | null;
};

export type ClockifyDetailedTimeEntry = {
  id: string;
  userName: string;
  projectName: string;
  timeInterval: {
    start: string;
    end: string | null;
    duration: string | number | null;
  };
};

type ClientConfig = {
  apiKey: string;
  workspaceId: string;
};

const MAX_RETRIES = 4;

function buildHeaders(apiKey: string): HeadersInit {
  return {
    "X-Api-Key": apiKey,
    "Content-Type": "application/json",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseIsoDurationToSeconds(duration: string | null): number {
  if (!duration) {
    return 0;
  }

  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) {
    return 0;
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);

  return hours * 3600 + minutes * 60 + seconds;
}

export function parseClockifyDurationToSeconds(
  value: string | number | null | undefined,
): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0;
  }

  return parseIsoDurationToSeconds(trimmed);
}

function getDetailedEntrySeconds(entry: ClockifyDetailedTimeEntry): number {
  const fromDuration = parseClockifyDurationToSeconds(
    entry.timeInterval.duration,
  );
  if (fromDuration > 0) {
    return fromDuration;
  }

  if (!entry.timeInterval.start) {
    return 0;
  }

  if (!entry.timeInterval.end) {
    const startMs = new Date(entry.timeInterval.start).getTime();
    return Math.max(Math.floor((Date.now() - startMs) / 1000), 0);
  }

  const startMs = new Date(entry.timeInterval.start).getTime();
  const endMs = new Date(entry.timeInterval.end).getTime();
  return Math.max(Math.floor((endMs - startMs) / 1000), 0);
}

function extractDetailedEntries(json: unknown): ClockifyDetailedTimeEntry[] {
  if (!json || typeof json !== "object") {
    return [];
  }

  const root = json as Record<string, unknown>;
  const raw =
    root.timeentries ??
    root.timeEntries ??
    root.entries ??
    root.timeentriesList;

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const record = row as Record<string, unknown>;
      const interval = (record.timeInterval ?? {}) as Record<string, unknown>;
      const project =
        record.project && typeof record.project === "object"
          ? (record.project as Record<string, unknown>)
          : null;
      const user =
        record.user && typeof record.user === "object"
          ? (record.user as Record<string, unknown>)
          : null;

      const projectName = String(
        record.projectName ?? project?.name ?? "",
      ).trim();
      const userName = String(
        record.userName ?? user?.name ?? record.userEmail ?? "",
      ).trim();

      return {
        id: String(record.id ?? record._id ?? ""),
        userName,
        projectName,
        timeInterval: {
          start: String(interval.start ?? ""),
          end:
            interval.end === null || interval.end === undefined
              ? null
              : String(interval.end),
          duration:
            (interval.duration as string | number | null | undefined) ?? null,
        },
      } satisfies ClockifyDetailedTimeEntry;
    })
    .filter((entry) => entry.timeInterval.start && entry.userName);
}

export class ClockifyClient {
  private readonly apiKey: string;
  private readonly workspaceId: string;

  constructor(config: ClientConfig) {
    this.apiKey = config.apiKey;
    this.workspaceId = config.workspaceId;
  }

  private async fetchWithRetry(
    url: string | URL,
    init?: RequestInit,
  ): Promise<Response> {
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      const response = await fetch(url.toString(), {
        ...init,
        headers: {
          ...buildHeaders(this.apiKey),
          ...(init?.headers ?? {}),
        },
        cache: "no-store",
      });

      if (response.status !== 429) {
        return response;
      }

      if (attempt === MAX_RETRIES) {
        return response;
      }

      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = Number(retryAfterHeader);
      const retryMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : 1000 * 2 ** attempt;
      await sleep(retryMs);
      attempt += 1;
    }

    throw new Error("Clockify retry loop unexpectedly ended.");
  }

  async getAllUsers(): Promise<ClockifyUser[]> {
    const pageSize = 50;
    let page = 1;
    const users: ClockifyUser[] = [];

    while (true) {
      const url = new URL(
        `${CLOCKIFY_BASE_URL}/workspaces/${this.workspaceId}/users`,
      );
      url.searchParams.set("page-size", String(pageSize));
      url.searchParams.set("page", String(page));

      const response = await this.fetchWithRetry(url);

      if (!response.ok) {
        throw new Error(`Clockify users request failed: ${response.status}`);
      }

      const batch = (await response.json()) as ClockifyUser[];
      if (!Array.isArray(batch) || batch.length === 0) {
        break;
      }

      users.push(...batch);

      if (batch.length < pageSize) {
        break;
      }

      page += 1;
    }

    return users;
  }

  async getActiveUsers(): Promise<ClockifyUser[]> {
    const users = await this.getAllUsers();
    return users
      .filter((user) => user.status === "ACTIVE")
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getProjects(): Promise<ClockifyProject[]> {
    const pageSize = 5000;
    let page = 1;
    const projects: ClockifyProject[] = [];

    while (true) {
      const url = new URL(
        `${CLOCKIFY_BASE_URL}/workspaces/${this.workspaceId}/projects`,
      );
      url.searchParams.set("page-size", String(pageSize));
      url.searchParams.set("page", String(page));
      url.searchParams.set("archived", "false");

      const response = await this.fetchWithRetry(url);

      if (!response.ok) {
        throw new Error(`Clockify projects request failed: ${response.status}`);
      }

      const batch = (await response.json()) as ClockifyProject[];
      if (!Array.isArray(batch) || batch.length === 0) {
        break;
      }

      projects.push(...batch);

      if (batch.length < pageSize) {
        break;
      }

      page += 1;
    }

    return projects;
  }

  async getActiveProjects(): Promise<ClockifyProject[]> {
    const projects = await this.getProjects();
    return projects
      .filter((project) => !project.archived && !project.template)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Unique project IDs the user has logged time against (lifetime),
   * collected from their time entries.
   */
  async getLifetimeWorkedProjectIds(userId: string): Promise<Set<string>> {
    const pageSize = 5000;
    let page = 1;
    const projectIds = new Set<string>();
    const maxPages = 200;

    while (page <= maxPages) {
      const url = new URL(
        `${CLOCKIFY_BASE_URL}/workspaces/${this.workspaceId}/user/${userId}/time-entries`,
      );
      url.searchParams.set("page-size", String(pageSize));
      url.searchParams.set("page", String(page));
      url.searchParams.set("project-required", "true");

      const response = await this.fetchWithRetry(url);

      if (!response.ok) {
        throw new Error(
          `Clockify user time entries request failed: ${response.status}`,
        );
      }

      const batch = (await response.json()) as Array<{
        projectId?: string | null;
      }>;

      if (!Array.isArray(batch) || batch.length === 0) {
        break;
      }

      for (const entry of batch) {
        const projectId = entry.projectId?.trim();
        if (projectId) {
          projectIds.add(projectId);
        }
      }

      if (batch.length < pageSize) {
        break;
      }

      page += 1;
    }

    return projectIds;
  }

  /**
   * Active (non-archived) projects the user has worked on at any time.
   */
  async getActiveProjectsWorkedByUser(
    userId: string,
  ): Promise<ClockifyProject[]> {
    const [workedProjectIds, activeProjects] = await Promise.all([
      this.getLifetimeWorkedProjectIds(userId),
      this.getActiveProjects(),
    ]);

    return activeProjects
      .filter((project) => workedProjectIds.has(project.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Detailed report for a date range (workspace timezone).
   * Used to sum hours per user + project within week date bounds.
   */
  async getDetailedReportEntries(
    dateRangeStart: string,
    dateRangeEnd: string,
    timezone: string,
  ): Promise<ClockifyDetailedTimeEntry[]> {
    const url = `${CLOCKIFY_REPORTS_BASE_URL}/workspaces/${this.workspaceId}/reports/detailed`;
    const pageSize = 1000;
    const maxPages = 50;
    let page = 1;
    const entries: ClockifyDetailedTimeEntry[] = [];

    while (page <= maxPages) {
      const response = await this.fetchWithRetry(url, {
        method: "POST",
        body: JSON.stringify({
          dateRangeStart,
          dateRangeEnd,
          exportType: "JSON",
          timeZone: timezone,
          weekStart: "SUNDAY",
          rounding: false,
          detailedFilter: {
            page,
            pageSize,
            sortColumn: "ID",
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Clockify detailed report failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const json: unknown = await response.json();
      const batch = extractDetailedEntries(json);
      entries.push(...batch);

      if (batch.length < pageSize) {
        break;
      }

      page += 1;
    }

    return entries;
  }

  getEntrySeconds(entry: ClockifyDetailedTimeEntry): number {
    return getDetailedEntrySeconds(entry);
  }
}

export function getClockifyConfig(): ClientConfig | null {
  const apiKey = process.env.CLOCKIFY_API_KEY?.trim() ?? "";
  const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID?.trim() ?? "";

  if (
    !apiKey ||
    !workspaceId ||
    apiKey === "your_clockify_api_key_here" ||
    workspaceId === "your_workspace_id_here"
  ) {
    return null;
  }

  return { apiKey, workspaceId };
}

export function getClockifyTimezone(): string {
  return (
    process.env.CLOCKIFY_WORKSPACE_TIMEZONE?.trim() || "America/Los_Angeles"
  );
}

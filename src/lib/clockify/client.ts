/**
 * Timesheets (SolidTime) client with Clockify-shaped exports so existing
 * /api/clockify* routes and UI keep working unchanged.
 * API: https://timesheets.allumiax.com/api/v1
 */

const DEFAULT_BASE_URL = "https://timesheets.allumiax.com/api/v1";

export type ClockifyUser = {
  id: string;
  name: string;
  email: string;
  status: "ACTIVE" | "PENDING_EMAIL_VERIFICATION" | "DECLINED";
  /** SolidTime user id (distinct from organization member id). */
  userId?: string;
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
  baseUrl?: string;
};

type RawMember = {
  id: string;
  user_id: string;
  name: string;
  email: string;
};

type RawTimeEntry = {
  id: string;
  start: string;
  end: string | null;
  duration: number | null;
  billable?: boolean;
  user_id?: string;
  project_id?: string | null;
};

type RawProject = {
  id: string;
  name: string;
  is_archived?: boolean;
  client?: { name?: string | null } | null;
  client_name?: string | null;
};

const MAX_RETRIES = 4;
const LIFETIME_START = "2015-01-01T00:00:00Z";

function buildHeaders(apiToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** SolidTime requires `Y-m-d\TH:i:s\Z` (no milliseconds). */
function toApiDate(isoOrDate: string | Date): string {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) {
    return String(isoOrDate).replace(/\.\d{3}Z$/, "Z");
  }
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
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

export class ClockifyClient {
  private readonly apiToken: string;
  private readonly organizationId: string;
  private readonly baseUrl: string;

  constructor(config: ClientConfig) {
    this.apiToken = config.apiKey;
    this.organizationId = config.workspaceId;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  private orgPath(path: string): string {
    return `${this.baseUrl}/organizations/${this.organizationId}${path}`;
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
          ...buildHeaders(this.apiToken),
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

    throw new Error("Timesheets retry loop unexpectedly ended.");
  }

  async getAllUsers(): Promise<ClockifyUser[]> {
    const response = await this.fetchWithRetry(this.orgPath("/members"));
    if (!response.ok) {
      throw new Error(`Timesheets members request failed: ${response.status}`);
    }

    const json = (await response.json()) as { data: RawMember[] };
    return (json.data ?? []).map((member) => ({
      id: member.id,
      userId: member.user_id,
      name: member.name,
      email: member.email,
      // Placeholders still track time; treat all members as active.
      status: "ACTIVE" as const,
    }));
  }

  async getActiveUsers(): Promise<ClockifyUser[]> {
    const users = await this.getAllUsers();
    return users
      .filter((user) => user.status === "ACTIVE")
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private async fetchProjects(archived: "false" | "true" | "all"): Promise<
    ClockifyProject[]
  > {
    const projects: ClockifyProject[] = [];
    let page = 1;

    while (true) {
      const url = new URL(this.orgPath("/projects"));
      url.searchParams.set("page", String(page));
      if (archived !== "all") {
        url.searchParams.set("archived", archived);
      }

      const response = await this.fetchWithRetry(url);
      if (!response.ok) {
        throw new Error(
          `Timesheets projects request failed: ${response.status}`,
        );
      }

      const json = (await response.json()) as {
        data: RawProject[];
        meta?: { last_page?: number };
      };
      const batch = json.data ?? [];
      if (batch.length === 0) {
        break;
      }

      for (const raw of batch) {
        projects.push({
          id: raw.id,
          name: raw.name,
          archived: Boolean(raw.is_archived),
          template: false,
          clientName: raw.client?.name ?? raw.client_name ?? null,
        });
      }

      const lastPage = json.meta?.last_page;
      if (typeof lastPage === "number") {
        if (page >= lastPage) {
          break;
        }
      } else if (batch.length < 15) {
        break;
      }

      page += 1;
    }

    return projects;
  }

  async getProjects(): Promise<ClockifyProject[]> {
    return this.fetchProjects("false");
  }

  async getActiveProjects(): Promise<ClockifyProject[]> {
    const projects = await this.getProjects();
    return projects
      .filter((project) => !project.archived && !project.template)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private async fetchTimeEntries(options: {
    startISO: string;
    endISO: string;
    memberId?: string;
  }): Promise<RawTimeEntry[]> {
    const entries: RawTimeEntry[] = [];
    const limit = 100;
    let offset = 0;

    while (true) {
      const url = new URL(this.orgPath("/time-entries"));
      url.searchParams.set("start", toApiDate(options.startISO));
      url.searchParams.set("end", toApiDate(options.endISO));
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("offset", String(offset));
      if (options.memberId) {
        url.searchParams.append("member_ids[]", options.memberId);
      }

      const response = await this.fetchWithRetry(url);
      if (!response.ok) {
        throw new Error(
          `Timesheets time entries request failed: ${response.status}`,
        );
      }

      const json = (await response.json()) as {
        data: RawTimeEntry[];
        meta?: { total?: number };
      };
      const batch = json.data ?? [];
      entries.push(...batch);

      const total = json.meta?.total;
      offset += batch.length;
      if (batch.length === 0) {
        break;
      }
      if (typeof total === "number" && offset >= total) {
        break;
      }
      if (batch.length < limit) {
        break;
      }
    }

    return entries;
  }

  /**
   * Unique project IDs the member has logged time against (from 2015 → now).
   */
  async getLifetimeWorkedProjectIds(userId: string): Promise<Set<string>> {
    const entries = await this.fetchTimeEntries({
      startISO: LIFETIME_START,
      endISO: new Date().toISOString(),
      memberId: userId,
    });

    const projectIds = new Set<string>();
    for (const entry of entries) {
      const projectId = entry.project_id?.trim();
      if (projectId) {
        projectIds.add(projectId);
      }
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
   * Time entries for a date range, shaped like Clockify detailed report rows
   * (userName + projectName resolved via members/projects).
   */
  async getDetailedReportEntries(
    dateRangeStart: string,
    dateRangeEnd: string,
    _timezone: string,
  ): Promise<ClockifyDetailedTimeEntry[]> {
    const [rawEntries, members, projects] = await Promise.all([
      this.fetchTimeEntries({
        startISO: dateRangeStart,
        endISO: dateRangeEnd,
      }),
      this.getAllUsers(),
      this.fetchProjects("all").catch(async () => {
        // Fallback if "all" is unsupported: merge active + archived.
        const [active, archived] = await Promise.all([
          this.fetchProjects("false"),
          this.fetchProjects("true").catch(() => [] as ClockifyProject[]),
        ]);
        return [...active, ...archived];
      }),
    ]);

    const nameByUserId = new Map<string, string>();
    for (const member of members) {
      if (member.userId) {
        nameByUserId.set(member.userId, member.name);
      }
      nameByUserId.set(member.id, member.name);
    }

    const nameByProjectId = new Map<string, string>();
    for (const project of projects) {
      nameByProjectId.set(project.id, project.name);
    }

    return rawEntries
      .map((raw) => {
        const userName = raw.user_id
          ? (nameByUserId.get(raw.user_id) ?? "")
          : "";
        const projectName = raw.project_id
          ? (nameByProjectId.get(raw.project_id) ?? "")
          : "";

        return {
          id: raw.id,
          userName,
          projectName,
          timeInterval: {
            start: raw.start,
            end: raw.end,
            duration:
              raw.duration === null || raw.duration === undefined
                ? null
                : raw.duration,
          },
        } satisfies ClockifyDetailedTimeEntry;
      })
      .filter((entry) => entry.timeInterval.start && entry.userName);
  }

  getEntrySeconds(entry: ClockifyDetailedTimeEntry): number {
    return getDetailedEntrySeconds(entry);
  }
}

export function getClockifyConfig(): ClientConfig | null {
  const apiKey =
    process.env.TIMESHEETS_API_TOKEN?.trim() ||
    process.env.CLOCKIFY_API_KEY?.trim() ||
    "";
  const workspaceId =
    process.env.TIMESHEETS_ORGANIZATION_ID?.trim() ||
    process.env.CLOCKIFY_WORKSPACE_ID?.trim() ||
    "";
  const baseUrl = process.env.TIMESHEETS_API_BASE_URL?.trim() || undefined;

  if (
    !apiKey ||
    !workspaceId ||
    apiKey === "your_clockify_api_key_here" ||
    apiKey === "your_api_token_here" ||
    workspaceId === "your_workspace_id_here" ||
    workspaceId === "your_organization_id_here"
  ) {
    return null;
  }

  return { apiKey, workspaceId, baseUrl };
}

export function getClockifyTimezone(): string {
  return (
    process.env.TIMESHEETS_TIMEZONE?.trim() ||
    process.env.CLOCKIFY_WORKSPACE_TIMEZONE?.trim() ||
    "America/Los_Angeles"
  );
}

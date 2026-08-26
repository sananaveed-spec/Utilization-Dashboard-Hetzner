const STORAGE_KEY = "utilization-dashboard-engineers";

export const DEFAULT_ENGINEER_NAMES = [
  "zain.abideen",
  "m.sulaiman",
  "irsa.sarfaraz",
  "Wareesha Azwar",
  "mustafa.abdullah",
  "zahir.hussain",
  "Areeb",
  "nawab.naveed",
] as const;

export function normalizeEngineerName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[\u00A0\u202F\u2007\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function sortEngineerNames(names: string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function loadEngineerNames(): string[] {
  if (typeof window === "undefined") {
    return [...DEFAULT_ENGINEER_NAMES];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [...DEFAULT_ENGINEER_NAMES];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [...DEFAULT_ENGINEER_NAMES];
    }

    const names = parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);

    return names.length > 0 ? sortEngineerNames(names) : [...DEFAULT_ENGINEER_NAMES];
  } catch {
    return [...DEFAULT_ENGINEER_NAMES];
  }
}

export function saveEngineerNames(names: string[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(sortEngineerNames(names)),
  );
}

export function isSameEngineerName(a: string, b: string): boolean {
  return normalizeEngineerName(a) === normalizeEngineerName(b);
}

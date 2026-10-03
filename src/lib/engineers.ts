const STORAGE_KEY = "utilization-dashboard-engineers";

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
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const names = parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);

    return sortEngineerNames(names);
  } catch {
    return [];
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

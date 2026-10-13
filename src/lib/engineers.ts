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

/**
 * Exact match, or first-name match when either side is a single token
 * (e.g. team nickname "Areeb" ↔ "Areeb Farhan").
 */
export function engineerNamesMatch(a: string, b: string): boolean {
  if (isSameEngineerName(a, b)) {
    return true;
  }
  const na = normalizeEngineerName(a);
  const nb = normalizeEngineerName(b);
  if (!na || !nb) {
    return false;
  }
  const aParts = na.split(" ");
  const bParts = nb.split(" ");
  if (aParts.length === 1 || bParts.length === 1) {
    return aParts[0] === bParts[0];
  }
  return false;
}

/** Resolve a team/link nickname to the canonical engineer list name when possible. */
export function resolveEngineerName(
  link: string,
  engineerNames: string[],
): string | undefined {
  const exact = engineerNames.find((name) => isSameEngineerName(name, link));
  if (exact) {
    return exact;
  }
  const fuzzy = engineerNames.filter((name) => engineerNamesMatch(name, link));
  if (fuzzy.length === 1) {
    return fuzzy[0];
  }
  // Prefer first-name uniqueness among multi-word roster names
  if (fuzzy.length > 1) {
    const first = normalizeEngineerName(link).split(" ")[0];
    const firstNameHits = fuzzy.filter(
      (name) => normalizeEngineerName(name).split(" ")[0] === first,
    );
    if (firstNameHits.length === 1) {
      return firstNameHits[0];
    }
  }
  return undefined;
}

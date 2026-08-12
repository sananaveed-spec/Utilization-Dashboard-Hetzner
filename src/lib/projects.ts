/**
 * Project codes combine letters and numbers (e.g. AIOE26001, GPS-26007, SBE26007.1).
 * After the first space following that code word, everything else is the project name.
 * Letter-only titles are not codes — Code is "—" and Name is the full title
 * (e.g. "ALX Internal Investment Projects (Wareesha)").
 */
export function isProjectCode(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  // Allow internal hyphens/dots (GPS-26007, SBE26007.1) but require letters + digits.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed)) {
    return false;
  }

  const hasLetter = /[A-Za-z]/.test(trimmed);
  const hasDigit = /\d/.test(trimmed);
  return hasLetter && hasDigit;
}

function normalizeProjectName(value: string): string {
  return value
    .trim()
    .replace(/^[-–—]+\s*/, "")
    .trim();
}

export function parseProjectParts(fullName: string): {
  projectCode: string;
  projectName: string;
} {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return {
      projectCode: "—",
      projectName: "—",
    };
  }

  const gapIndex = trimmed.search(/\s/);
  if (gapIndex === -1) {
    if (isProjectCode(trimmed)) {
      return {
        projectCode: trimmed,
        projectName: "—",
      };
    }

    return {
      projectCode: "—",
      projectName: trimmed,
    };
  }

  const firstWord = trimmed.slice(0, gapIndex).trim();
  const remainder = normalizeProjectName(trimmed.slice(gapIndex));

  if (isProjectCode(firstWord)) {
    return {
      projectCode: firstWord,
      projectName: remainder || "—",
    };
  }

  // First word is not a real code → Code empty, Name is the full title.
  return {
    projectCode: "—",
    projectName: trimmed,
  };
}

/** Stable identity for matching rows when code may be "—". */
export function projectLookupKey(
  projectCode: string,
  projectName: string,
): string {
  const code = projectCode.trim();
  if (code && code !== "—") {
    return code.toLowerCase();
  }

  return `name:${projectName.trim().toLowerCase()}`;
}

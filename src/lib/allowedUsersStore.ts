import {
  DEFAULT_ALLOWED_EMAILS,
  normalizeEmail,
  uniqueNormalizedEmails,
} from "@/lib/allowedUsers";
import { readJsonFile, writeJsonFile } from "@/lib/jsonDataStore";

const ALLOWED_USERS_FILE = "allowed-users.json";

function parseAllowedEmails(parsed: unknown): string[] {
  if (!Array.isArray(parsed)) {
    return uniqueNormalizedEmails([...DEFAULT_ALLOWED_EMAILS]);
  }

  const emails = uniqueNormalizedEmails(
    parsed.filter((value): value is string => typeof value === "string"),
  );

  return emails.length > 0
    ? emails
    : uniqueNormalizedEmails([...DEFAULT_ALLOWED_EMAILS]);
}

export async function readAllowedEmails(): Promise<string[]> {
  const parsed = await readJsonFile<unknown>(
    ALLOWED_USERS_FILE,
    [...DEFAULT_ALLOWED_EMAILS],
  );
  return parseAllowedEmails(parsed);
}

export async function writeAllowedEmails(emails: string[]): Promise<string[]> {
  const next = uniqueNormalizedEmails(emails);
  const toWrite =
    next.length > 0 ? next : uniqueNormalizedEmails([...DEFAULT_ALLOWED_EMAILS]);

  return writeJsonFile(ALLOWED_USERS_FILE, toWrite);
}

export async function addAllowedEmail(email: string): Promise<{
  emails: string[];
  added: boolean;
}> {
  const normalized = normalizeEmail(email);
  const current = await readAllowedEmails();

  if (current.includes(normalized)) {
    return { emails: current, added: false };
  }

  const emails = await writeAllowedEmails([...current, normalized]);
  return { emails, added: true };
}

export async function removeAllowedEmail(email: string): Promise<{
  emails: string[];
  removed: boolean;
  error?: string;
}> {
  const normalized = normalizeEmail(email);
  const current = await readAllowedEmails();

  if (!current.includes(normalized)) {
    return { emails: current, removed: false };
  }

  if (current.length <= 1) {
    return {
      emails: current,
      removed: false,
      error: "At least one allowed email is required.",
    };
  }

  const emails = await writeAllowedEmails(
    current.filter((item) => item !== normalized),
  );
  return { emails, removed: true };
}

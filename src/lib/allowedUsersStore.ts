import { promises as fs } from "fs";
import path from "path";
import {
  DEFAULT_ALLOWED_EMAILS,
  normalizeEmail,
  uniqueNormalizedEmails,
} from "@/lib/allowedUsers";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "allowed-users.json");

async function ensureStore(): Promise<string[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return uniqueNormalizedEmails([...DEFAULT_ALLOWED_EMAILS]);
    }

    const emails = uniqueNormalizedEmails(
      parsed.filter((value): value is string => typeof value === "string"),
    );

    return emails.length > 0
      ? emails
      : uniqueNormalizedEmails([...DEFAULT_ALLOWED_EMAILS]);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";

    if (code !== "ENOENT") {
      // Corrupt or unreadable file — fall back to defaults.
    }

    const defaults = uniqueNormalizedEmails([...DEFAULT_ALLOWED_EMAILS]);
    await writeAllowedEmails(defaults);
    return defaults;
  }
}

export async function readAllowedEmails(): Promise<string[]> {
  return ensureStore();
}

export async function writeAllowedEmails(emails: string[]): Promise<string[]> {
  const next = uniqueNormalizedEmails(emails);
  const toWrite =
    next.length > 0 ? next : uniqueNormalizedEmails([...DEFAULT_ALLOWED_EMAILS]);

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, `${JSON.stringify(toWrite, null, 2)}\n`, "utf8");
  return toWrite;
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

import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

export async function readJsonFile<T>(
  filename: string,
  fallback: T,
): Promise<T> {
  const filePath = path.join(DATA_DIR, filename);

  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";

    if (code !== "ENOENT") {
      // Corrupt or unreadable file — fall back to defaults.
    }

    await writeJsonFile(filename, fallback);
    return fallback;
  }
}

export async function writeJsonFile<T>(
  filename: string,
  data: T,
): Promise<T> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    path.join(DATA_DIR, filename),
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8",
  );
  return data;
}

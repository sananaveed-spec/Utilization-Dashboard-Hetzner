import { promises as fs } from "fs";
import path from "path";

/**
 * Persist dashboard JSON on the local filesystem (Hetzner / local disk).
 * Prefer absolute DATA_DIR in production (e.g. /app/data in Docker).
 */
function getDataDir(): string {
  const configured = process.env.DATA_DIR?.trim();
  if (configured && path.isAbsolute(configured)) {
    return configured;
  }
  // Statically scoped to ./data so standalone NFT does not trace the whole repo.
  return path.join(/* turbopackIgnore: true */ process.cwd(), "data");
}

function resolveDataFile(filename: string): string {
  return path.join(getDataDir(), path.basename(filename));
}

function serializeJson<T>(data: T): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export async function readFilesystemJson<T>(
  filename: string,
): Promise<T | null> {
  try {
    const raw = await fs.readFile(resolveDataFile(filename), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeFilesystemJson<T>(
  filename: string,
  data: T,
): Promise<T> {
  const filePath = resolveDataFile(filename);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, serializeJson(data), "utf8");
  return data;
}

export async function readJsonFile<T>(
  filename: string,
  fallback: T,
): Promise<T> {
  const fromDisk = await readFilesystemJson<T>(filename);
  if (fromDisk !== null) {
    return fromDisk;
  }

  await writeFilesystemJson(filename, fallback);
  return fallback;
}

export async function writeJsonFile<T>(
  filename: string,
  data: T,
): Promise<T> {
  return writeFilesystemJson(filename, data);
}

export { getDataDir };

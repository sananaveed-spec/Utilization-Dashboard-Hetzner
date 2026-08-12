import { promises as fs } from "fs";
import path from "path";
import { get, head, put } from "@vercel/blob";

const DATA_DIR = path.join(process.cwd(), "data");
const BLOB_PREFIX = "utilization-dashboard";

function useBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

function blobPathname(filename: string): string {
  return `${BLOB_PREFIX}/${filename}`;
}

function serializeJson<T>(data: T): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function isBlobNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "BlobNotFoundError" ||
      error.message.toLowerCase().includes("not found"))
  );
}

export async function readFilesystemJson<T>(
  filename: string,
): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, filename), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeFilesystemJson<T>(
  filename: string,
  data: T,
): Promise<T> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, filename), serializeJson(data), "utf8");
  return data;
}

async function readBlobJson<T>(filename: string): Promise<T | null> {
  const pathname = blobPathname(filename);

  try {
    await head(pathname);
  } catch (error) {
    if (isBlobNotFoundError(error)) {
      return null;
    }
    throw error;
  }

  const result = await get(pathname, {
    access: "private",
    useCache: false,
  });

  if (!result || result.statusCode !== 200 || !result.stream) {
    return null;
  }

  const raw = await new Response(result.stream).text();
  return JSON.parse(raw) as T;
}

async function writeBlobJson<T>(filename: string, data: T): Promise<T> {
  await put(blobPathname(filename), serializeJson(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return data;
}

export async function readJsonFile<T>(
  filename: string,
  fallback: T,
): Promise<T> {
  if (useBlobStorage()) {
    try {
      const fromBlob = await readBlobJson<T>(filename);
      if (fromBlob !== null) {
        return fromBlob;
      }
    } catch {
      // Blob read failed — fall back to the deployed data file.
    }

    const fromDisk = await readFilesystemJson<T>(filename);
    if (fromDisk !== null) {
      try {
        await writeBlobJson(filename, fromDisk);
      } catch {
        // Still return disk data even if blob write fails.
      }
      return fromDisk;
    }

    try {
      await writeBlobJson(filename, fallback);
    } catch {
      // ignore
    }
    return fallback;
  }

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
  if (useBlobStorage()) {
    try {
      return await writeBlobJson(filename, data);
    } catch {
      // Last resort for local/dev-like environments without blob access.
      return writeFilesystemJson(filename, data);
    }
  }
  return writeFilesystemJson(filename, data);
}

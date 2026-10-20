import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), ".data");
const CAPTURES_DIR = path.join(STORAGE_DIR, "captures");
const CAPTURE_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

// Capture ids are server-generated UUIDs; anything else is rejected before touching the disk,
// which also rules out path traversal.
const CAPTURE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let lastCleanupAt = 0;

export class CaptureNotFoundError extends Error {
  constructor() {
    super("Capture not found or expired.");
  }
}

export function isCaptureId(value: unknown): value is string {
  return typeof value === "string" && CAPTURE_ID_PATTERN.test(value);
}

export function getCapturePath(captureId: string) {
  if (!isCaptureId(captureId)) {
    throw new Error("Invalid capture id.");
  }
  return path.join(CAPTURES_DIR, `${captureId}.png`);
}

export async function saveCapture(png: Buffer) {
  const captureId = randomUUID();
  await mkdir(CAPTURES_DIR, { recursive: true });
  await writeFile(getCapturePath(captureId), png);
  return captureId;
}

export async function readCapture(captureId: string) {
  try {
    return await readFile(getCapturePath(captureId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CaptureNotFoundError();
    }
    throw error;
  }
}

// Deletes captures older than 24 hours. Runs at most once per 10 minutes per process,
// which keeps the volume bounded without a cron job.
export async function cleanupExpiredCaptures() {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
    return;
  }
  lastCleanupAt = now;

  let entries: string[];
  try {
    entries = await readdir(CAPTURES_DIR);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  let removed = 0;
  for (const entry of entries) {
    const filePath = path.join(CAPTURES_DIR, entry);
    try {
      const { mtimeMs } = await stat(filePath);
      if (now - mtimeMs > CAPTURE_TTL_MS) {
        await unlink(filePath);
        removed += 1;
      }
    } catch (error) {
      // Another request may have removed it first.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  if (removed > 0) {
    console.log("[captures] removed expired captures", { removed });
  }
}

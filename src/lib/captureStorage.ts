import { readFile } from "node:fs/promises";
import path from "node:path";

const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), ".data");
const CAPTURES_DIR = path.join(STORAGE_DIR, "captures");

// Capture ids are server-generated UUIDs; anything else is rejected before touching the disk,
// which also rules out path traversal.
const CAPTURE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

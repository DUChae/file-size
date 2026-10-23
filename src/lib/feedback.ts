import { db, query } from "@/lib/db";
import { unstable_noStore as noStore } from "next/cache";

const MAX_FEEDBACK_ITEMS = 200;

export interface FeedbackSubmission {
  id: string;
  type: "bug" | "improvement";
  title: string;
  details: string;
  createdAt: string;
  userId?: string;
  userName?: string;
}

interface FeedbackRow {
  id: string;
  type: "bug" | "improvement";
  title: string;
  details: string;
  user_id: string | null;
  user_name: string | null;
  created_at: Date;
}

export function getFeedbackStorageMode() {
  return db ? "postgres" : "unconfigured";
}

export async function addFeedbackSubmission(entry: FeedbackSubmission) {
  if (!db) {
    console.error("[feedback] addFeedbackSubmission failed: database is not configured");
    throw new Error("Feedback storage is not configured.");
  }

  console.log("[feedback] saving submission", {
    id: entry.id,
    type: entry.type,
    titleLength: entry.title.length,
    detailsLength: entry.details.length,
    createdAt: entry.createdAt,
  });

  await query(
    "INSERT INTO feedback (id, type, title, details, user_id, user_name, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [
      entry.id,
      entry.type,
      entry.title,
      entry.details,
      entry.userId ?? null,
      entry.userName || null,
      entry.createdAt,
    ],
  );
  console.log("[feedback] submission saved", { id: entry.id });
}

export async function deleteFeedbackSubmission(id: string) {
  if (!db) {
    console.error("[feedback] deleteFeedbackSubmission failed: database is not configured");
    throw new Error("Feedback storage is not configured.");
  }

  console.log("[feedback] deleting submission", { id });
  const result = await query("DELETE FROM feedback WHERE id = $1", [id]);

  if (!result.rowCount) {
    console.warn("[feedback] delete target not found", { id });
    return false;
  }

  console.log("[feedback] submission deleted", { id });
  return true;
}

export async function getFeedbackSubmissions(): Promise<FeedbackSubmission[]> {
  noStore();

  if (!db) {
    console.error("[feedback] getFeedbackSubmissions failed: database is not configured");
    return [];
  }

  console.log("[feedback] loading submissions");
  const result = await query<FeedbackRow>(
    "SELECT id, type, title, details, user_id, user_name, created_at FROM feedback ORDER BY created_at DESC LIMIT $1",
    [MAX_FEEDBACK_ITEMS],
  );
  console.log("[feedback] submission count", { count: result.rows.length });

  return result.rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    details: row.details,
    createdAt: row.created_at.toISOString(),
    ...(row.user_id !== null && { userId: row.user_id }),
    ...(row.user_name !== null && { userName: row.user_name }),
  }));
}

import { redis } from "@/lib/redis";
import { unstable_noStore as noStore } from "next/cache";

const FEEDBACK_LIST_KEY = "feedback:submissions";
const MAX_FEEDBACK_ITEMS = 200;

export interface FeedbackSubmission {
  id: string;
  type: "bug" | "improvement";
  title: string;
  details: string;
  createdAt: string;
}

export function getFeedbackStorageMode() {
  return redis ? "redis" : "unconfigured";
}

export async function addFeedbackSubmission(entry: FeedbackSubmission) {
  if (!redis) {
    console.error("[feedback] addFeedbackSubmission failed: Redis is not configured");
    throw new Error("Feedback storage is not configured.");
  }

  console.log("[feedback] saving submission", {
    id: entry.id,
    type: entry.type,
    titleLength: entry.title.length,
    detailsLength: entry.details.length,
    createdAt: entry.createdAt,
  });

  await redis.lpush(FEEDBACK_LIST_KEY, JSON.stringify(entry));
  await redis.ltrim(FEEDBACK_LIST_KEY, 0, MAX_FEEDBACK_ITEMS - 1);
  console.log("[feedback] submission saved", { id: entry.id });
}

export async function getFeedbackSubmissions(): Promise<FeedbackSubmission[]> {
  noStore();

  if (!redis) {
    console.error("[feedback] getFeedbackSubmissions failed: Redis is not configured");
    return [];
  }

  console.log("[feedback] loading submissions");
  const entries = await redis.lrange<string>(FEEDBACK_LIST_KEY, 0, MAX_FEEDBACK_ITEMS - 1);
  console.log("[feedback] raw submission count", { count: entries?.length ?? 0 });

  return (entries ?? [])
    .map((entry) => {
      try {
        return JSON.parse(entry) as FeedbackSubmission;
      } catch {
        console.error("[feedback] failed to parse submission entry");
        return null;
      }
    })
    .filter((entry): entry is FeedbackSubmission => entry !== null);
}

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

function isFeedbackSubmission(value: unknown): value is FeedbackSubmission {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    (candidate.type === "bug" || candidate.type === "improvement") &&
    typeof candidate.title === "string" &&
    typeof candidate.details === "string" &&
    typeof candidate.createdAt === "string"
  );
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

export async function deleteFeedbackSubmission(id: string) {
  if (!redis) {
    console.error("[feedback] deleteFeedbackSubmission failed: Redis is not configured");
    throw new Error("Feedback storage is not configured.");
  }

  console.log("[feedback] deleting submission", { id });
  const submissions = await getFeedbackSubmissions();
  const nextSubmissions = submissions.filter((submission) => submission.id !== id);

  if (nextSubmissions.length === submissions.length) {
    console.warn("[feedback] delete target not found", { id });
    return false;
  }

  await redis.del(FEEDBACK_LIST_KEY);
  if (nextSubmissions.length > 0) {
    await redis.rpush(
      FEEDBACK_LIST_KEY,
      ...nextSubmissions.map((submission) => JSON.stringify(submission)),
    );
  }

  console.log("[feedback] submission deleted", { id });
  return true;
}

export async function getFeedbackSubmissions(): Promise<FeedbackSubmission[]> {
  noStore();

  if (!redis) {
    console.error("[feedback] getFeedbackSubmissions failed: Redis is not configured");
    return [];
  }

  console.log("[feedback] loading submissions");
  const entries = await redis.lrange(FEEDBACK_LIST_KEY, 0, MAX_FEEDBACK_ITEMS - 1);
  console.log("[feedback] raw submission count", {
    count: entries?.length ?? 0,
    firstEntryType: entries?.[0] === undefined ? "undefined" : typeof entries[0],
  });

  return (entries ?? [])
    .map((entry) => {
      try {
        if (isFeedbackSubmission(entry)) {
          return entry;
        }

        if (typeof entry === "string") {
          const parsed = JSON.parse(entry) as unknown;
          return isFeedbackSubmission(parsed) ? parsed : null;
        }

        console.error("[feedback] unsupported submission entry type", {
          type: typeof entry,
        });
        return null;
      } catch {
        console.error("[feedback] failed to parse submission entry");
        return null;
      }
    })
    .filter((entry): entry is FeedbackSubmission => entry !== null);
}

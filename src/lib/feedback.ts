import { redis } from "@/lib/redis";
import { unstable_noStore as noStore } from "next/cache";

const FEEDBACK_LIST_KEY = "feedback:submissions";
const MAX_FEEDBACK_ITEMS = 200;
const memoryFeedbackStore: FeedbackSubmission[] = [];

export interface FeedbackSubmission {
  id: string;
  type: "bug" | "improvement";
  title: string;
  details: string;
  createdAt: string;
}

export function getFeedbackStorageMode() {
  return redis ? "redis" : "memory";
}

export async function addFeedbackSubmission(entry: FeedbackSubmission) {
  if (redis) {
    await redis.lpush(FEEDBACK_LIST_KEY, JSON.stringify(entry));
    await redis.ltrim(FEEDBACK_LIST_KEY, 0, MAX_FEEDBACK_ITEMS - 1);
    return;
  }

  memoryFeedbackStore.unshift(entry);
  if (memoryFeedbackStore.length > MAX_FEEDBACK_ITEMS) {
    memoryFeedbackStore.length = MAX_FEEDBACK_ITEMS;
  }
}

export async function getFeedbackSubmissions(): Promise<FeedbackSubmission[]> {
  noStore();

  if (!redis) {
    return [...memoryFeedbackStore];
  }

  const entries = await redis.lrange<string>(FEEDBACK_LIST_KEY, 0, MAX_FEEDBACK_ITEMS - 1);

  return (entries ?? [])
    .map((entry) => {
      try {
        return JSON.parse(entry) as FeedbackSubmission;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is FeedbackSubmission => entry !== null);
}

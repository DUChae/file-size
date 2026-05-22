import { redis } from "@/lib/redis";

const FEEDBACK_LIST_KEY = "feedback:submissions";
const MAX_FEEDBACK_ITEMS = 200;

export interface FeedbackSubmission {
  id: string;
  type: "bug" | "improvement";
  title: string;
  details: string;
  contact: string;
  createdAt: string;
}

export async function getFeedbackSubmissions(): Promise<FeedbackSubmission[]> {
  if (!redis) {
    return [];
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

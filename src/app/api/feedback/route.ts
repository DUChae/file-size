import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

const FEEDBACK_LIST_KEY = "feedback:submissions";
const MAX_FEEDBACK_ITEMS = 200;

interface FeedbackPayload {
  type?: string;
  title?: string;
  details?: string;
  contact?: string;
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as FeedbackPayload;
    const type = payload.type === "improvement" ? "improvement" : "bug";
    const title = payload.title?.trim();
    const details = payload.details?.trim();
    const contact = payload.contact?.trim() || "";

    if (!title) {
      return NextResponse.json(
        { success: false, error: "Title is required." },
        { status: 400 },
      );
    }

    if (!details) {
      return NextResponse.json(
        { success: false, error: "Details are required." },
        { status: 400 },
      );
    }

    const entry = {
      id: crypto.randomUUID(),
      type,
      title: title.slice(0, 120),
      details: details.slice(0, 4000),
      contact: contact.slice(0, 200),
      createdAt: new Date().toISOString(),
    };

    if (redis) {
      await redis.lpush(FEEDBACK_LIST_KEY, JSON.stringify(entry));
      await redis.ltrim(FEEDBACK_LIST_KEY, 0, MAX_FEEDBACK_ITEMS - 1);
    } else {
      console.warn("Feedback submitted without Redis storage:", entry);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to submit feedback.",
      },
      { status: 500 },
    );
  }
}

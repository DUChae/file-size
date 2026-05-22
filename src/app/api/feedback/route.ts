import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  addFeedbackSubmission,
  getFeedbackStorageMode,
  getFeedbackSubmissions,
} from "@/lib/feedback";

interface FeedbackPayload {
  type?: string;
  title?: string;
  details?: string;
}

export async function GET() {
  try {
    const feedback = await getFeedbackSubmissions();
    return NextResponse.json({
      success: true,
      feedback,
      storageMode: getFeedbackStorageMode(),
    });
  } catch (error) {
    console.error("[feedback-api] loading feedback failed", error);
    return NextResponse.json(
      {
        success: false,
        feedback: [],
        storageMode: getFeedbackStorageMode(),
        error: error instanceof Error ? error.message : "Failed to load feedback.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log("[feedback-api] request received");
    const payload = (await req.json()) as FeedbackPayload;
    const type: "bug" | "improvement" =
      payload.type === "improvement" ? "improvement" : "bug";
    const title = payload.title?.trim();
    const details = payload.details?.trim();

    console.log("[feedback-api] payload parsed", {
      type,
      hasTitle: Boolean(title),
      hasDetails: Boolean(details),
      titleLength: title?.length ?? 0,
      detailsLength: details?.length ?? 0,
    });

    if (!title) {
      console.error("[feedback-api] validation failed: missing title");
      return NextResponse.json(
        { success: false, error: "Title is required." },
        { status: 400 },
      );
    }

    if (!details) {
      console.error("[feedback-api] validation failed: missing details");
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
      createdAt: new Date().toISOString(),
    };

    await addFeedbackSubmission(entry);
    console.log("[feedback-api] submission persisted", { id: entry.id });
    revalidatePath("/admin");
    console.log("[feedback-api] /admin revalidated");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[feedback-api] submission failed", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to submit feedback.",
      },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { addFeedbackSubmission } from "@/lib/feedback";

interface FeedbackPayload {
  type?: string;
  title?: string;
  details?: string;
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as FeedbackPayload;
    const type = payload.type === "improvement" ? "improvement" : "bug";
    const title = payload.title?.trim();
    const details = payload.details?.trim();

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
      createdAt: new Date().toISOString(),
    };

    await addFeedbackSubmission(entry);
    revalidatePath("/admin");

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

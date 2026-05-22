import { NextRequest, NextResponse } from "next/server";
import { AnalyticsEvent, trackAnalyticsEvent } from "@/lib/analytics";

const VALID_TYPES = new Set<AnalyticsEvent["type"]>([
  "page_view",
  "image_job_started",
  "image_job_success",
  "image_job_error",
  "pdf_job_started",
  "pdf_job_success",
  "pdf_job_error",
]);

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as AnalyticsEvent;

    if (!payload.type || !VALID_TYPES.has(payload.type)) {
      return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
    }

    await trackAnalyticsEvent(payload);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Event logging failed" },
      { status: 500 },
    );
  }
}

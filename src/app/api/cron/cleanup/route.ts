import { list, del } from "@vercel/blob";
import { NextResponse } from "next/server";

/**
 * Vercel Cron Job to clean up optimized files older than 24 hours.
 * Runs daily according to vercel.json configuration.
 */
export async function GET(request: Request) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    let hasMore = true;
    let cursor: string | undefined;
    let deletedCount = 0;

    console.log(`[cleanup-cron] Starting cleanup. Threshold: ${threshold.toISOString()}`);

    while (hasMore) {
      const { blobs, cursor: nextCursor, hasMore: more } = await list({
        cursor,
        limit: 1000,
        prefix: "optimized/", // Only clean up files in the optimized directory
      });

      const expiredBlobs = blobs
        .filter((blob) => new Date(blob.uploadedAt) < threshold)
        .map((blob) => blob.url);

      if (expiredBlobs.length > 0) {
        await del(expiredBlobs);
        deletedCount += expiredBlobs.length;
        console.log(`[cleanup-cron] Deleted ${expiredBlobs.length} expired blobs.`);
      }

      hasMore = more;
      cursor = nextCursor;
    }

    console.log(`[cleanup-cron] Cleanup completed. Total deleted: ${deletedCount}`);

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
    });
  } catch (error) {
    console.error("[cleanup-cron] Cleanup failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

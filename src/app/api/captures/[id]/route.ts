import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { getCapturePath, isCaptureId } from "@/lib/captureStorage";

// `download` comes from the query string, so it is reduced to a safe header value.
function buildContentDisposition(download: string | null) {
  if (download === null) {
    return "inline";
  }

  const filename =
    download
      .normalize("NFC")
      .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, "-")
      .slice(0, 150) || "webpage-capture.png";
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/captures/[id]">) {
  const { id } = await ctx.params;
  if (!isCaptureId(id)) {
    return NextResponse.json({ error: "Invalid capture id." }, { status: 400 });
  }

  const filePath = getCapturePath(id);
  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return NextResponse.json({ error: "Capture not found or expired." }, { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(size),
      "Content-Disposition": buildContentDisposition(req.nextUrl.searchParams.get("download")),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

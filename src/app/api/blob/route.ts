import { get } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const filename = req.nextUrl.searchParams.get("filename") || "download";
  const shouldDownload = req.nextUrl.searchParams.get("download") === "1";

  if (!url) {
    return NextResponse.json({ error: "Missing blob url" }, { status: 400 });
  }

  const result = await get(url, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return NextResponse.json({ error: "Blob not found" }, { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", result.blob.contentType);
  headers.set("Cache-Control", "no-store");

  if (shouldDownload) {
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  }

  return new NextResponse(result.stream, { headers });
}

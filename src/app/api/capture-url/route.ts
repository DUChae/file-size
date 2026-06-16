import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomUUID } from "crypto";
import { lookup } from "dns/promises";
import net from "net";
import sharp from "sharp";
import { UrlCaptureResponse } from "@/types/image";
import { trackAnalyticsEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CAPTURE_HEIGHT = 30000;
const MINUTE_LIMIT = 20;
const DAY_LIMIT = 50;
const minuteRequests = new Map<string, { count: number; resetAt: number }>();
const dailyRequests = new Map<string, { count: number; date: string }>();

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip") || "unknown";
}

function checkRateLimit(ip: string) {
  const now = Date.now();
  const minuteBucket = minuteRequests.get(ip);
  if (!minuteBucket || minuteBucket.resetAt <= now) {
    minuteRequests.set(ip, { count: 1, resetAt: now + 60 * 1000 });
  } else if (minuteBucket.count >= MINUTE_LIMIT) {
    throw new Error("Too many capture requests. Try again in a minute.");
  } else {
    minuteBucket.count += 1;
  }

  const today = new Date().toISOString().slice(0, 10);
  const dayBucket = dailyRequests.get(ip);
  if (!dayBucket || dayBucket.date !== today) {
    dailyRequests.set(ip, { count: 1, date: today });
  } else if (dayBucket.count >= DAY_LIMIT) {
    throw new Error("Daily capture limit reached. Try again tomorrow.");
  } else {
    dayBucket.count += 1;
  }
}

function isBlockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "metadata.google.internal"
  );
}

function isBlockedIp(address: string) {
  if (net.isIPv4(address)) {
    const parts = address.split(".").map(Number);
    const [a, b] = parts;

    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }

  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.")
    );
  }

  return false;
}

async function validateCaptureUrl(rawUrl: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error("Enter a valid URL.");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("URLs with embedded credentials are not supported.");
  }

  if (isBlockedHostname(parsedUrl.hostname)) {
    throw new Error("This URL cannot be captured.");
  }

  if (net.isIP(parsedUrl.hostname) && isBlockedIp(parsedUrl.hostname)) {
    throw new Error("This URL cannot be captured.");
  }

  const records = await lookup(parsedUrl.hostname, { all: true, verbatim: true });
  if (records.some((record) => isBlockedIp(record.address))) {
    throw new Error("This URL cannot be captured.");
  }

  return parsedUrl;
}

function makeSafeFilename(url: URL) {
  const host = url.hostname.replace(/^www\./, "");
  const pathPart = url.pathname.replace(/\/+/g, "-").replace(/^-|-$/g, "");
  const base = `${host}${pathPart ? `-${pathPart}` : ""}`
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90);

  return `${base || "webpage-capture"}.png`;
}

export async function POST(request: NextRequest) {
  try {
    const accessKey = process.env.SCREENSHOTONE_ACCESS_KEY;
    if (!accessKey) {
      throw new Error("Screenshot capture is not configured.");
    }

    const body = (await request.json()) as { url?: string };
    const targetUrl = await validateCaptureUrl((body.url || "").trim());
    checkRateLimit(getClientIp(request));

    // Smart detection for iframe-only wrappers (common in Korean web agencies like i-web.kr)
    let captureUrlString = targetUrl.href;
    try {
      const probeResponse = await fetch(targetUrl.href, { next: { revalidate: 0 } });
      const html = await probeResponse.text();
      // If it's a small wrapper page with an iframe, target the iframe source instead
      if (html.length < 10000 && html.includes("<iframe")) {
        const iframeMatch = html.match(/id="contentFrame"\s+src="([^"]+)"/) || 
                           html.match(/<iframe[^>]+src="([^"]+)"/);
        if (iframeMatch && iframeMatch[1]) {
          const innerUrl = new URL(iframeMatch[1], targetUrl.href);
          captureUrlString = innerUrl.href;
        }
      }
    } catch (e) {
      console.warn("Iframe probe failed, using original URL:", e);
    }

    await trackAnalyticsEvent({
      type: "image_job_started",
      status: "started",
      tool: "url_capture",
      mode: "screenshot",
      filename: targetUrl.href,
    });

    const screenshotUrl = new URL("https://api.screenshotone.com/take");
    screenshotUrl.searchParams.set("access_key", accessKey);
    screenshotUrl.searchParams.set("url", captureUrlString);
    screenshotUrl.searchParams.set("format", "png");
    screenshotUrl.searchParams.set("response_type", "by_format");
    screenshotUrl.searchParams.set("full_page", "true");
    screenshotUrl.searchParams.set("full_page_scroll", "true");
    screenshotUrl.searchParams.set("viewport_width", "1440");
    screenshotUrl.searchParams.set("viewport_height", "900");
    screenshotUrl.searchParams.set("block_ads", "true");
    screenshotUrl.searchParams.set("block_cookie_banners", "true");
    screenshotUrl.searchParams.set("delay", "5");
    screenshotUrl.searchParams.set("wait_until", "networkidle2");
    screenshotUrl.searchParams.set("styles", "html, body { height: auto !important; overflow: visible !important; }");
    screenshotUrl.searchParams.set("timeout", "60");

    const screenshotResponse = await fetch(screenshotUrl, {
      headers: { Accept: "image/png" },
    });

    if (!screenshotResponse.ok) {
      const errorText = await screenshotResponse.text();
      throw new Error(errorText || "Failed to capture the page.");
    }

    const sourceBuffer = Buffer.from(await screenshotResponse.arrayBuffer());
    const image = sharp(sourceBuffer).rotate();
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("The capture result is not a valid image.");
    }

    let outputBuffer: Buffer<ArrayBufferLike> = sourceBuffer;
    let outputHeight = metadata.height;

    if (metadata.height > MAX_CAPTURE_HEIGHT) {
      outputBuffer = await image
        .extract({
          left: 0,
          top: 0,
          width: metadata.width,
          height: MAX_CAPTURE_HEIGHT,
        })
        .png({ compressionLevel: 9 })
        .toBuffer();
      outputHeight = MAX_CAPTURE_HEIGHT;
    }

    const captureId = randomUUID();
    const filename = makeSafeFilename(targetUrl);
    const blob = await put(`captures/${captureId}/${filename}`, outputBuffer, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false,
      allowOverwrite: true,
      multipart: outputBuffer.length > 5 * 1024 * 1024,
    });

    await trackAnalyticsEvent({
      type: "image_job_success",
      status: "success",
      tool: "url_capture",
      mode: "screenshot",
      filename,
      fileSize: outputBuffer.length,
    });

    return NextResponse.json<UrlCaptureResponse>({
      success: true,
      sourceUrl: blob.url,
      downloadUrl: blob.downloadUrl,
      filename,
      mimeType: "image/png",
      size: outputBuffer.length,
      width: metadata.width,
      height: outputHeight,
      captureId,
    });
  } catch (error) {
    console.error("URL capture error:", error);

    await trackAnalyticsEvent({
      type: "image_job_error",
      status: "error",
      tool: "url_capture",
      error: error instanceof Error ? error.message : "Internal server error",
    });

    return NextResponse.json<UrlCaptureResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 400 },
    );
  }
}

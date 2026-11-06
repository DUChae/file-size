import { NextRequest, NextResponse } from "next/server";
import { lookup } from "dns/promises";
import net from "net";
import sharp from "sharp";
import { UrlCaptureResponse } from "@/types/image";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { cleanupExpiredCaptures, saveCapture } from "@/lib/captureStorage";

export const runtime = "nodejs";

const MAX_CAPTURE_HEIGHT = 30000;
const MINUTE_LIMIT = 20;
const DAY_LIMIT = 50;
const minuteRequests = new Map<string, { count: number; resetAt: number }>();
const dailyRequests = new Map<string, { count: number; date: string }>();
const SWEEP_INTERVAL_MS = 60 * 1000;
let lastSweepAt = 0;

// iframe 래퍼 감지용 요청이 느리거나 끝없는 응답을 보내는 서버에 매달리지 않게 한다.
// 래퍼 판정은 문자 수 10000 미만이므로, 한글(UTF-8 3바이트)을 감안해 바이트는 그 3배까지 읽는다.
const PROBE_TIMEOUT_MS = 5000;
const PROBE_MAX_CHARS = 10000;
const PROBE_MAX_BYTES = PROBE_MAX_CHARS * 3;

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip") || "unknown";
}

// 한 번 온 IP의 항목이 계속 남지 않도록 만료된 항목을 1분에 한 번 지운다.
function sweepExpiredBuckets(now: number, today: string) {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;

  for (const [ip, bucket] of minuteRequests) {
    if (bucket.resetAt <= now) minuteRequests.delete(ip);
  }
  for (const [ip, bucket] of dailyRequests) {
    if (bucket.date !== today) dailyRequests.delete(ip);
  }
}

function checkRateLimit(ip: string) {
  const now = Date.now();
  sweepExpiredBuckets(now, new Date().toISOString().slice(0, 10));
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

function createScreenshotUrl(accessKey: string, captureUrlString: string) {
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
  screenshotUrl.searchParams.set(
    "styles",
    [
      "html, body { height: auto !important; overflow: visible !important; }",
      "*, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }",
    ].join(" "),
  );
  screenshotUrl.searchParams.set("timeout", "60");

  return screenshotUrl;
}

async function fetchScreenshot(accessKey: string, captureUrlString: string) {
  const screenshotResponse = await fetch(createScreenshotUrl(accessKey, captureUrlString), {
    headers: { Accept: "image/png" },
  });

  if (screenshotResponse.ok) {
    return Buffer.from(await screenshotResponse.arrayBuffer());
  }

  const errorText = await screenshotResponse.text();
  throw new Error(errorText || "Failed to capture the page.");
}

async function fetchScreenshotWithProtocolFallback(accessKey: string, captureUrlString: string) {
  try {
    return await fetchScreenshot(accessKey, captureUrlString);
  } catch (httpError) {
    const parsedUrl = new URL(captureUrlString);
    if (parsedUrl.protocol !== "http:") {
      throw httpError;
    }

    parsedUrl.protocol = "https:";

    try {
      return await fetchScreenshot(accessKey, parsedUrl.href);
    } catch (httpsError) {
      console.warn("URL capture failed over HTTP and HTTPS:", { httpError, httpsError });
      throw new Error("페이지 캡처에 실패했습니다. 사이트가 캡처 요청을 차단했거나 HTTP/HTTPS 접속을 지원하지 않을 수 있습니다. 잠시 후 다시 시도해 주세요.");
    }
  }
}

// 본문이 한도를 넘으면 null. 래퍼 페이지가 아니라는 뜻이므로 호출하는 쪽은 원래 URL을 쓴다.
async function readProbeHtml(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > PROBE_MAX_BYTES) return null;
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: NextRequest) {
  // Fire-and-forget: the response does not wait for old captures to be removed.
  cleanupExpiredCaptures().catch((error) => {
    console.error("[captures] cleanup failed", error);
  });

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
      // Only the validated URL is probed: following a redirect could reach internal hosts.
      const probeResponse = await fetch(targetUrl.href, {
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      const html = await readProbeHtml(probeResponse);
      // If it's a small wrapper page with an iframe, target the iframe source instead
      if (html !== null && html.length < PROBE_MAX_CHARS && html.includes("<iframe")) {
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

    const sourceBuffer = await fetchScreenshotWithProtocolFallback(accessKey, captureUrlString);
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

    const filename = makeSafeFilename(targetUrl);
    const captureId = await saveCapture(outputBuffer);

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
      sourceUrl: `/api/captures/${captureId}`,
      downloadUrl: `/api/captures/${captureId}?download=${encodeURIComponent(filename)}`,
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

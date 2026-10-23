import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { CompressionOptions, CompressionResponse } from "@/types/image";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { CaptureNotFoundError, isCaptureId, readCapture } from "@/lib/captureStorage";
import { stripMetadataLossless } from "@/lib/imageMetadata";

class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function parseOptions(value: FormDataEntryValue | null): CompressionOptions {
  if (typeof value !== "string") {
    throw new RequestError("Missing compression options.", 400);
  }

  let options: unknown;
  try {
    options = JSON.parse(value);
  } catch {
    throw new RequestError("Compression options must be valid JSON.", 400);
  }

  const candidate = options as Partial<CompressionOptions> | null;
  if (
    !candidate ||
    typeof candidate.filename !== "string" ||
    typeof candidate.mimeType !== "string" ||
    typeof candidate.targetFormat !== "string"
  ) {
    throw new RequestError("filename, mimeType and targetFormat are required.", 400);
  }

  return candidate as CompressionOptions;
}

// The source is either an uploaded file or a URL capture that is already on disk.
async function readSource(form: FormData) {
  const file = form.get("file");
  if (file instanceof File) {
    return Buffer.from(await file.arrayBuffer());
  }

  const captureId = form.get("captureId");
  if (captureId !== null) {
    if (!isCaptureId(captureId)) {
      throw new RequestError("Invalid capture id.", 400);
    }
    try {
      return await readCapture(captureId);
    } catch (error) {
      if (error instanceof CaptureNotFoundError) {
        throw new RequestError(error.message, 404);
      }
      throw error;
    }
  }

  throw new RequestError("Either file or captureId is required.", 400);
}

function parseWebSizeDimension(
  value: number | undefined,
  label: string,
  allowZero = false,
) {
  if (value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(
      `${label} must be ${allowZero ? "0 or greater" : "greater than 0"}.`,
    );
  }

  return Math.round(value);
}

function parseRangedInteger(
  value: number | undefined,
  label: string,
  min: number,
  max: number,
) {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }

  return Math.round(value);
}

// Encodes with a single user-chosen quality (1-100). 100 means lossless where the format supports it.
// `fast` trades compression efficiency for speed; the target-size search uses it for its probes.
function encodeWithQuality(
  instance: sharp.Sharp,
  outputMime: string,
  quality: number,
  fast = false,
) {
  const lossless = quality >= 100;

  if (outputMime === "image/png") {
    // libvips only emits 16- or 256-color palettes, so dithering is what actually trades
    // size for smoothness: 30-99 ramps dither 0 -> 1 at 256 colors, below 30 drops to 16 colors.
    return lossless
      ? instance.png({
          compressionLevel: fast ? 6 : 9,
          effort: fast ? 1 : 10,
          palette: false,
        })
      : instance.png({
          colours: quality < 30 ? 16 : 256,
          dither: quality < 30 ? 0 : (quality - 30) / 70,
          compressionLevel: fast ? 6 : 9,
          effort: fast ? 1 : 8,
          palette: true,
        });
  }

  if (outputMime === "image/webp") {
    return instance.webp({
      quality,
      effort: fast ? 1 : 6,
      smartSubsample: true,
      lossless,
    });
  }

  if (outputMime === "image/avif") {
    return instance.avif({
      quality,
      effort: fast ? 0 : 5,
      chromaSubsampling: quality >= 90 ? "4:4:4" : "4:2:0",
      lossless,
    });
  }

  if (outputMime === "image/gif") {
    return instance.gif({
      effort: fast ? 1 : lossless ? 9 : 7,
      // GIF color count scales with quality (2-256 colors).
      colours: Math.min(256, Math.max(2, Math.round((256 * quality) / 100))),
    });
  }

  return instance.jpeg({ quality, progressive: true, mozjpeg: true });
}

// Lossless metadata removal from the original bytes; null when the container is not
// supported (AVIF, GIF) or the stripped file does not parse back as the same image.
async function stripOriginalMetadata(input: Buffer, metadata: sharp.Metadata) {
  const stripped = stripMetadataLossless(
    input,
    `image/${metadata.format}`,
    metadata.orientation,
  );
  if (!stripped) return null;

  try {
    const check = await sharp(stripped).metadata();
    const intact =
      check.width === metadata.width &&
      check.height === metadata.height &&
      !check.xmp &&
      !check.iptc;
    return intact ? stripped : null;
  } catch {
    return null;
  }
}

// AVIF/WebP encodes of large images take tens of seconds, and Cloudflare cuts requests at
// 100s, so the search stops probing once this budget is spent and keeps what it has.
const TARGET_SEARCH_BUDGET_MS = 30_000;

// Binary-searches the highest quality whose output fits targetBytes using fast probes, then
// re-encodes that quality at full effort. When even quality 1 is too large, the smallest
// attempt is returned so the user still gets the best effort.
async function encodeToTargetSize(
  instance: sharp.Sharp,
  outputMime: string,
  targetBytes: number,
) {
  const startedAt = Date.now();
  let low = 1;
  let high = 100;
  let best: { buffer: Buffer; quality: number } | null = null;
  let smallest: { buffer: Buffer; quality: number } | null = null;

  while (
    low <= high &&
    (!smallest || Date.now() - startedAt < TARGET_SEARCH_BUDGET_MS)
  ) {
    const quality = Math.floor((low + high) / 2);
    const buffer = await encodeWithQuality(
      instance.clone(),
      outputMime,
      quality,
      true,
    ).toBuffer();

    if (!smallest || buffer.length < smallest.buffer.length) {
      smallest = { buffer, quality };
    }
    if (buffer.length <= targetBytes) {
      best = { buffer, quality };
      low = quality + 1;
    } else {
      high = quality - 1;
    }
  }

  const chosen = best ?? smallest!;
  const full = await encodeWithQuality(
    instance.clone(),
    outputMime,
    chosen.quality,
  ).toBuffer();

  // Full effort is almost always smaller; keep the probe if it is not, so a fit stays a fit.
  return full.length <= chosen.buffer.length
    ? { buffer: full, quality: chosen.quality }
    : chosen;
}

export async function POST(req: NextRequest) {
  // 실패 기록에도 어떤 파일의 어떤 작업이었는지 남기려고 try 밖에 둔다.
  let jobFilename: string | undefined;
  let jobMode: string | undefined;

  try {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new RequestError("Request body must be multipart/form-data.", 400);
    }

    const {
      filename,
      mimeType,
      category,
      targetFormat,
      webWidth,
      webHeight,
      webX,
      webY,
      ...options
    } = parseOptions(form.get("options"));
    jobFilename = filename;
    const quality = parseRangedInteger(options.quality, "Quality", 1, 100);
    const scalePercent = parseRangedInteger(
      options.scalePercent,
      "Scale",
      10,
      100,
    );
    const targetBytes = parseRangedInteger(
      options.targetBytes,
      "Target size",
      1024,
      Number.MAX_SAFE_INTEGER,
    );
    const stripMetadata = options.stripMetadata !== false;
    const isCustomQuality = quality !== undefined || targetBytes !== undefined;
    // 압축 설정과 출력 형식을 함께 남긴다. 예: "custom:webp", "target:original"
    const analyticsMode = `${
      targetBytes !== undefined ? "target" : isCustomQuality ? "custom" : category
    }:${targetFormat}`;
    jobMode = analyticsMode;

    await trackAnalyticsEvent({
      type: "image_job_started",
      status: "started",
      tool: "image",
      mode: analyticsMode,
      filename,
    });

    const inputBuffer = await readSource(form);
    const originalSize = inputBuffer.length;

    const isGif =
      mimeType === "image/gif" || filename.toLowerCase().endsWith(".gif");
    let sharpInstance = sharp(
      inputBuffer,
      isGif ? { animated: true } : undefined,
    );
    if (!isGif) {
      sharpInstance = sharpInstance.rotate();
    }
    const metadata = await sharpInstance.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Invalid image metadata");
    }

    let outputMime = mimeType;
    let outputExt = filename.includes(".")
      ? filename.split(".").pop() || ""
      : "";

    if (targetFormat === "png") {
      outputMime = "image/png";
      outputExt = "png";
    } else if (targetFormat === "jpeg") {
      outputMime = "image/jpeg";
      outputExt = "jpg";
    } else if (targetFormat === "webp") {
      outputMime = "image/webp";
      outputExt = "webp";
    } else if (targetFormat === "avif") {
      outputMime = "image/avif";
      outputExt = "avif";
    } else if (targetFormat === "gif") {
      outputMime = "image/gif";
      outputExt = "gif";
    }

    let presetQuality = 82;
    let resizeWidth: number | undefined;

    switch (category) {
      case "high-quality":
        presetQuality = 95;
        break;
      case "photo":
        presetQuality = 90;
        break;
      case "web":
        presetQuality = 82;
        resizeWidth = 1920;
        break;
      case "screenshot":
        presetQuality = 75;
        break;
    }

    const longSide = Math.max(metadata.width, metadata.height);
    if (isCustomQuality) {
      // User-controlled mode: keep the original resolution unless a scale is requested.
      resizeWidth = undefined;
      if (scalePercent !== undefined && scalePercent < 100) {
        // metadata reports pre-rotation dimensions; EXIF orientations 5-8 swap width/height.
        const rotatedWidth =
          (metadata.orientation ?? 1) >= 5 ? metadata.height : metadata.width;
        sharpInstance = sharpInstance.resize(
          Math.max(1, Math.round((rotatedWidth * scalePercent) / 100)),
          undefined,
          { fit: "inside", withoutEnlargement: true },
        );
      }
    } else if (!resizeWidth) {
      if (longSide >= 4000) resizeWidth = 3840;
      else if (longSide >= 3000) resizeWidth = 2560;
    }

    if (resizeWidth && longSide > resizeWidth) {
      sharpInstance = sharpInstance.resize(resizeWidth, undefined, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    const targetWidth = parseWebSizeDimension(webWidth, "Width");
    const targetHeight = parseWebSizeDimension(webHeight, "Height");
    const targetX = parseWebSizeDimension(webX ?? 0, "X position", true) ?? 0;
    const targetY = parseWebSizeDimension(webY ?? 0, "Y position", true) ?? 0;

    if (targetWidth && targetHeight) {
      if (category === "screenshot") {
        // For screenshots (URL capture), we CROP from the specified (X, Y) based on user's drag area
        const cropLeft = Math.max(0, Math.min(targetX, metadata.width - 1));
        const cropTop = Math.max(0, Math.min(targetY, metadata.height - 1));
        const cropWidth = Math.max(
          1,
          Math.min(targetWidth, metadata.width - cropLeft),
        );
        const cropHeight = Math.max(
          1,
          Math.min(targetHeight, metadata.height - cropTop),
        );

        sharpInstance = sharpInstance.extract({
          left: cropLeft,
          top: cropTop,
          width: cropWidth,
          height: cropHeight,
        });
      } else {
        // For other categories, we RESIZE (contain) to the target dimensions
        const background =
          outputMime === "image/png" ||
          outputMime === "image/webp" ||
          outputMime === "image/avif" ||
          outputMime === "image/gif"
            ? { r: 255, g: 255, b: 255, alpha: 0 }
            : { r: 255, g: 255, b: 255, alpha: 1 };

        sharpInstance = sharpInstance.resize(targetWidth, targetHeight, {
          fit: "contain",
          position: "centre",
          background,
          withoutEnlargement: true,
        });
      }
    }

    // sharp drops EXIF/XMP/IPTC unless asked to keep them; rotate() already reset orientation.
    if (!stripMetadata) {
      sharpInstance = sharpInstance.keepMetadata();
    }

    let outputBuffer: Buffer;
    let qualityUsed: number | undefined;
    if (targetBytes !== undefined) {
      const fitted = await encodeToTargetSize(
        sharpInstance,
        outputMime,
        targetBytes,
      );
      outputBuffer = fitted.buffer;
      qualityUsed = fitted.quality;
    } else if (quality !== undefined) {
      outputBuffer = await encodeWithQuality(
        sharpInstance,
        outputMime,
        quality,
      ).toBuffer();
    } else if (outputMime === "image/png") {
      if (category === "high-quality") {
        // High-Quality keeps full 24/32-bit truecolor for zero color loss
        outputBuffer = await sharpInstance
          .png({
            compressionLevel: 9,
            effort: 10,
            palette: false,
          })
          .toBuffer();
      } else {
        // Photo, Web, Screenshot use smart palette quantization matched to their respective quality
        outputBuffer = await sharpInstance
          .png({
            quality: presetQuality,
            compressionLevel: 9,
            effort: 8,
            palette: true,
            dither: category === "photo" ? 1.0 : 0.5,
          })
          .toBuffer();
      }
    } else if (outputMime === "image/webp") {
      outputBuffer = await sharpInstance
        .webp({
          quality: presetQuality,
          effort: 6,
          smartSubsample: true,
          lossless: category === "high-quality",
        })
        .toBuffer();
    } else if (outputMime === "image/avif") {
      const avifQuality = category === "high-quality" ? 95 : Math.max(50, presetQuality - 5);

      outputBuffer = await sharpInstance
        .avif({
          quality: avifQuality,
          effort: 5,
          chromaSubsampling: category === "screenshot" ? "4:4:4" : "4:2:0",
          lossless: category === "high-quality",
        })
        .toBuffer();
    } else if (outputMime === "image/gif") {
      let gifColours = 256;
      switch (category) {
        case "high-quality":
          gifColours = 256;
          break;
        case "photo":
          gifColours = 256;
          break;
        case "web":
          gifColours = 224;
          break;
        case "screenshot":
          gifColours = 192;
          break;
      }

      outputBuffer = await sharpInstance
        .gif({
          effort: category === "high-quality" ? 9 : 7,
          colours: gifColours,
        })
        .toBuffer();
    } else {
      outputBuffer = await sharpInstance
        .jpeg({
          quality: presetQuality,
          progressive: true,
          mozjpeg: true,
        })
        .toBuffer();
    }

    const dotIndex = filename.lastIndexOf(".");
    const nameOnly = dotIndex >= 0 ? filename.substring(0, dotIndex) : filename;
    const normalizedName = nameOnly.normalize("NFC");
    let safeBaseName = normalizedName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-");
    if (!safeBaseName.trim()) {
      safeBaseName = "optimized";
    }
    const outputFilename = `${safeBaseName}.${outputExt}`;

    // When re-encoding does not beat the original, hand back the original bytes. If the user
    // asked to strip metadata, cut the EXIF/XMP/IPTC segments out of those bytes instead of
    // falling back to the larger re-encode, so the result never grows and pixels are untouched.
    const sourceHasPrivateMetadata = Boolean(
      metadata.exif || metadata.xmp || metadata.iptc,
    );
    const returnOriginal =
      outputMime === mimeType && outputBuffer.length >= originalSize;
    let finalBuffer = outputBuffer;
    if (returnOriginal) {
      finalBuffer =
        stripMetadata && sourceHasPrivateMetadata
          ? ((await stripOriginalMetadata(inputBuffer, metadata)) ?? outputBuffer)
          : inputBuffer;
    }
    const keptOriginalPixels = finalBuffer !== outputBuffer;

    const targetHeaders: Record<string, string> = {};
    if (targetBytes !== undefined) {
      targetHeaders["X-Target-Met"] = finalBuffer.length <= targetBytes ? "1" : "0";
      if (!keptOriginalPixels && qualityUsed !== undefined) {
        targetHeaders["X-Quality-Used"] = String(qualityUsed);
      }
    }

    await trackAnalyticsEvent({
      type: "image_job_success",
      status: "success",
      tool: "image",
      mode: analyticsMode,
      filename,
      fileSize: originalSize,
      optimizedSize: finalBuffer.length,
    });

    return new NextResponse(new Uint8Array(finalBuffer), {
      headers: {
        "Content-Type": outputMime,
        "Content-Length": String(finalBuffer.length),
        "X-Original-Size": String(originalSize),
        "X-Optimized-Size": String(finalBuffer.length),
        "X-Output-Filename": encodeURIComponent(outputFilename),
        ...targetHeaders,
        // The page reads this with fetch(); if the URL is ever opened directly (e.g. a
        // cross-site form post), the browser downloads it instead of rendering it on our origin.
        "Content-Disposition": "attachment",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Compression error:", error);

    await trackAnalyticsEvent({
      type: "image_job_error",
      status: "error",
      tool: "image",
      mode: jobMode,
      filename: jobFilename,
      error: error instanceof Error ? error.message : "Internal server error",
    });

    return NextResponse.json<CompressionResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: error instanceof RequestError ? error.status : 500 },
    );
  }
}

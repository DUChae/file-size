import { NextRequest, NextResponse } from "next/server";
import { del, put } from "@vercel/blob";
import sharp from "sharp";
import { CompressionRequest, CompressionResponse } from "@/types/image";
import { trackAnalyticsEvent } from "@/lib/analytics";

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

export async function POST(req: NextRequest) {
  let sourceUrl: string | null = null;
  let shouldPreserveSource = false;

  try {
    const payload: CompressionRequest = await req.json();
    const {
      sourceUrl: requestSourceUrl,
      filename,
      mimeType,
      category,
      targetFormat,
      webWidth,
      webHeight,
      webX,
      webY,
      uploadId,
      preserveSource,
    } = payload;
    sourceUrl = requestSourceUrl;
    shouldPreserveSource = !!preserveSource;

    await trackAnalyticsEvent({
      type: "image_job_started",
      status: "started",
      tool: "image",
      mode: category,
      filename,
    });

    const sourceResponse = await fetch(sourceUrl);
    if (!sourceResponse.ok) {
      throw new Error("Failed to fetch source image");
    }

    const sourceArrayBuffer = await sourceResponse.arrayBuffer();
    const inputBuffer = Buffer.from(sourceArrayBuffer);
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

    let quality = 82;
    let resizeWidth: number | undefined;

    switch (category) {
      case "high-quality":
        quality = 95;
        break;
      case "photo":
        quality = 70;
        break;
      case "web":
        quality = 70;
        resizeWidth = 1920;
        break;
      case "screenshot":
        quality = 55;
        break;
    }

    const longSide = Math.max(metadata.width, metadata.height);
    if (!resizeWidth) {
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

    let outputBuffer: Buffer;
    if (outputMime === "image/png") {
      if (category === "photo" || category === "high-quality") {
        // Photo & High-Quality keep full 24/32-bit truecolor for zero color banding in photographs
        outputBuffer = await sharpInstance
          .png({
            compressionLevel: 9,
            effort: 10,
            palette: false,
          })
          .toBuffer();
      } else {
        // Screenshot & Web use smart palette quantization for max PNG size reduction while preserving sharp UI text
        outputBuffer = await sharpInstance
          .png({
            quality,
            compressionLevel: 9,
            effort: 8,
            palette: true,
            dither: 0.5,
          })
          .toBuffer();
      }
    } else if (outputMime === "image/webp") {
      outputBuffer = await sharpInstance
        .webp({
          quality,
          effort: 6,
          smartSubsample: true,
          lossless: category === "high-quality",
        })
        .toBuffer();
    } else if (outputMime === "image/avif") {
      const avifQuality = category === "high-quality" ? 95 : Math.max(50, quality - 5);

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
          quality,
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
    const outputPathname = `optimized/${uploadId}/${outputFilename}`;

    const finalBuffer =
      outputMime === mimeType && outputBuffer.length >= originalSize
        ? inputBuffer
        : outputBuffer;

    const blob = await put(outputPathname, finalBuffer, {
      access: "public",
      contentType: outputMime,
      addRandomSuffix: false,
      allowOverwrite: true,
      multipart: finalBuffer.length > 5 * 1024 * 1024,
    });

    await trackAnalyticsEvent({
      type: "image_job_success",
      status: "success",
      tool: "image",
      mode: category,
      filename,
      fileSize: originalSize,
      optimizedSize: finalBuffer.length,
    });

    if (!shouldPreserveSource) {
      await del(sourceUrl);
      sourceUrl = null;
    }

    return NextResponse.json<CompressionResponse>({
      success: true,
      originalSize,
      optimizedSize: finalBuffer.length,
      outputFilename,
      outputUrl: blob.url,
      outputDownloadUrl: blob.downloadUrl,
    });
  } catch (error) {
    console.error("Compression error:", error);

    await trackAnalyticsEvent({
      type: "image_job_error",
      status: "error",
      tool: "image",
      error: error instanceof Error ? error.message : "Internal server error",
    });

    if (sourceUrl && !shouldPreserveSource) {
      try {
        await del(sourceUrl);
      } catch {
        // Ignore cleanup failures.
      }
    }

    return NextResponse.json<CompressionResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
        originalSize: 0,
        outputFilename: "",
      },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { del, put } from "@vercel/blob";
import sharp from "sharp";
import { CompressionRequest, CompressionResponse } from "@/types/image";
import { trackAnalyticsEvent } from "@/lib/analytics";

function parseWebSizeDimension(value: number | undefined, label: string) {
  if (value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be greater than 0.`);
  }

  return Math.round(value);
}

export async function POST(req: NextRequest) {
  let sourceUrl: string | null = null;

  try {
    const payload: CompressionRequest = await req.json();
    const { sourceUrl: requestSourceUrl, filename, mimeType, category, targetFormat, webWidth, webHeight, uploadId } = payload;
    sourceUrl = requestSourceUrl;

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

    const isGif = mimeType === "image/gif" || filename.toLowerCase().endsWith(".gif");
    let sharpInstance = sharp(inputBuffer, isGif ? { animated: true } : undefined);
    if (!isGif) {
      sharpInstance = sharpInstance.rotate();
    }
    const metadata = await sharpInstance.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Invalid image metadata");
    }

    let outputMime = mimeType;
    let outputExt = filename.includes(".") ? filename.split(".").pop() || "" : "";

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
      case "screenshot":
        quality = 82;
        break;
      case "photo":
        quality = 75;
        break;
      case "web":
        quality = 65;
        resizeWidth = 1200;
        break;
      case "high-quality":
        quality = 92;
        break;
    }

    const longSide = Math.max(metadata.width, metadata.height);
    if (!resizeWidth) {
      if (longSide >= 4000) resizeWidth = 2560;
      else if (longSide >= 3000) resizeWidth = 2000;
    }

    if (resizeWidth && longSide > resizeWidth) {
      sharpInstance = sharpInstance.resize(resizeWidth, undefined, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    if (category === "web") {
      const targetWidth = parseWebSizeDimension(webWidth, "Width");
      const targetHeight = parseWebSizeDimension(webHeight, "Height");
      if (targetWidth && targetHeight) {
        const background = (outputMime === "image/png" || outputMime === "image/webp" || outputMime === "image/avif" || outputMime === "image/gif")
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
      outputBuffer = await sharpInstance
        .png({
          quality: category === "high-quality" ? 95 : 80,
          compressionLevel: 9,
          palette: category !== "high-quality",
          colors: 256,
        })
        .toBuffer();
    } else if (outputMime === "image/webp") {
      outputBuffer = await sharpInstance
        .webp({
          quality,
          effort: 6,
          lossless: category === "high-quality",
        })
        .toBuffer();
    } else if (outputMime === "image/avif") {
      outputBuffer = await sharpInstance
        .avif({
          quality: quality - 10, // AVIF usually needs lower quality value for same perceived quality
          effort: 4,
          chromaSubsampling: "4:2:0",
          lossless: category === "high-quality",
        })
        .toBuffer();
    } else if (outputMime === "image/gif") {
      outputBuffer = await sharpInstance
        .gif({
          effort: category === "high-quality" ? 9 : 7,
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
    let safeBaseName = normalizedName.replace(/[^\p{L}\p{N}._-]/gu, "-");
    if (!safeBaseName.replace(/-+/g, "").trim()) {
      safeBaseName = "optimized";
    }
    const outputFilename = `${safeBaseName}.${outputExt}`;
    const outputPathname = `optimized/${uploadId}/${outputFilename}`;

    const finalBuffer =
      outputMime === mimeType && outputBuffer.length >= originalSize ? inputBuffer : outputBuffer;

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

    await del(sourceUrl);
    sourceUrl = null;

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

    if (sourceUrl) {
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
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { del, put } from "@vercel/blob";
import sharp from "sharp";
import { CompressionRequest, CompressionResponse, WebAspectRatio } from "@/types/image";

const WEB_ASPECT_RATIO_DIMENSIONS: Record<Exclude<WebAspectRatio, "original">, { width: number; height: number }> = {
  "16:9": { width: 1200, height: 675 },
  "4:3": { width: 1200, height: 900 },
  "1:1": { width: 1200, height: 1200 },
  "3:4": { width: 900, height: 1200 },
  "9:16": { width: 675, height: 1200 },
};

export async function POST(req: NextRequest) {
  let sourceUrl: string | null = null;

  try {
    const payload: CompressionRequest = await req.json();
    const { sourceUrl: requestSourceUrl, filename, mimeType, category, targetFormat, webAspectRatio, uploadId } = payload;
    sourceUrl = requestSourceUrl;

    const sourceResponse = await fetch(sourceUrl);
    if (!sourceResponse.ok) {
      throw new Error("Failed to fetch source image");
    }

    const sourceArrayBuffer = await sourceResponse.arrayBuffer();
    const inputBuffer = Buffer.from(sourceArrayBuffer);
    const originalSize = inputBuffer.length;

    let sharpInstance = sharp(inputBuffer);
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

    if (category === "web" && webAspectRatio !== "original") {
      const dimensions = WEB_ASPECT_RATIO_DIMENSIONS[webAspectRatio];
      const background = outputMime === "image/png"
        ? { r: 255, g: 255, b: 255, alpha: 0 }
        : { r: 255, g: 255, b: 255, alpha: 1 };

      sharpInstance = sharpInstance.resize(dimensions.width, dimensions.height, {
        fit: "contain",
        position: "centre",
        background,
        withoutEnlargement: true,
      });
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
    const safeBaseName = nameOnly.replace(/[^\w.-]+/g, "-");
    const outputFilename = `${safeBaseName}.optimized.${outputExt}`;
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

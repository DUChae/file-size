import { NextRequest, NextResponse } from "next/server";
import { del, put } from "@vercel/blob";
import sharp from "sharp";
import { CompressionRequest, CompressionResponse } from "@/types/image";

function parseWebAspectRatio(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (!match) {
    throw new Error("Aspect ratio must be in `width:height` format.");
  }

  const widthRatio = Number(match[1]);
  const heightRatio = Number(match[2]);

  if (!Number.isFinite(widthRatio) || !Number.isFinite(heightRatio) || widthRatio <= 0 || heightRatio <= 0) {
    throw new Error("Aspect ratio values must be greater than 0.");
  }

  return { widthRatio, heightRatio };
}

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

    if (category === "web") {
      const parsedAspectRatio = parseWebAspectRatio(webAspectRatio);
      if (parsedAspectRatio) {
        const targetWidth = resizeWidth ?? 1200;
        const targetHeight = Math.round((targetWidth * parsedAspectRatio.heightRatio) / parsedAspectRatio.widthRatio);
        const safeTargetHeight = Math.max(targetHeight, 1);
      const background = outputMime === "image/png"
        ? { r: 255, g: 255, b: 255, alpha: 0 }
        : { r: 255, g: 255, b: 255, alpha: 1 };

        sharpInstance = sharpInstance.resize(targetWidth, safeTargetHeight, {
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

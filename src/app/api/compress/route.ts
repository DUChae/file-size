import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { CompressionChunk, CompressionResponse } from "@/types/image";

const chunkMap = new Map<string, string[]>();

export async function POST(req: NextRequest) {
  try {
    const chunk: CompressionChunk = await req.json();
    const { id, index, total, data, filename, mimeType, category, targetFormat } = chunk;

    if (!chunkMap.has(id)) {
      chunkMap.set(id, new Array(total).fill(""));
    }

    const chunks = chunkMap.get(id)!;
    chunks[index] = data;

    if (chunks.every((c) => c !== "")) {
      const fullBase64 = chunks.join("");
      chunkMap.delete(id);

      const inputBuffer = Buffer.from(fullBase64, "base64");
      const originalSize = inputBuffer.length;

      let sharpInstance = sharp(inputBuffer);
      const metadata = await sharpInstance.metadata();

      if (!metadata.width || !metadata.height) {
        throw new Error("Invalid image metadata");
      }

      // Determine Target Format
      let outputMime = mimeType;
      let outputExt = filename.split(".").pop() || "";
      
      if (targetFormat === "png") {
        outputMime = "image/png";
        outputExt = "png";
      } else if (targetFormat === "jpeg") {
        outputMime = "image/jpeg";
        outputExt = "jpg";
      }

      // Apply Category Logic (Presets)
      let quality = 82;
      let resizeWidth: number | undefined;

      switch (category) {
        case "screenshot":
          quality = 82; // High legibility
          break;
        case "photo":
          quality = 75; // Aggressive for photos
          break;
        case "web":
          quality = 65; // High compression
          resizeWidth = 1200; // Cap for web
          break;
        case "high-quality":
          quality = 92; // Minimal loss
          break;
      }

      // Universal Resize Policy (Safety)
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

      // Final Encoding
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
      const nameOnly = filename.substring(0, dotIndex);
      const outputFilename = `${nameOnly}.optimized.${outputExt}`;

      // Size Reversion Check (Only if format hasn't changed)
      if (outputMime === mimeType && outputBuffer.length >= originalSize) {
        return NextResponse.json<CompressionResponse>({
          success: true,
          data: fullBase64,
          originalSize,
          optimizedSize: originalSize,
          outputFilename,
        });
      }

      return NextResponse.json<CompressionResponse>({
        success: true,
        data: outputBuffer.toString("base64"),
        originalSize,
        optimizedSize: outputBuffer.length,
        outputFilename,
      });
    }

    return NextResponse.json({ success: true, message: "Chunk received" });
  } catch (error) {
    console.error("Compression error:", error);
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

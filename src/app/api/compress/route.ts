import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { CompressionChunk, CompressionResponse } from "@/types/image";

// In-memory storage for chunks (Caution: For production, consider Redis or similar for scale)
// But as per spec: "processed only in memory, no disk storage"
const chunkMap = new Map<string, string[]>();

export async function POST(req: NextRequest) {
  try {
    const chunk: CompressionChunk = await req.json();
    const { id, index, total, data, filename, mimeType } = chunk;

    if (!chunkMap.has(id)) {
      chunkMap.set(id, new Array(total).fill(""));
    }

    const chunks = chunkMap.get(id)!;
    chunks[index] = data;

    // Check if all chunks have arrived
    if (chunks.every((c) => c !== "")) {
      console.log(`All chunks received for ${id}. Total: ${total}. Reassembling...`);
      const fullBase64 = chunks.join("");
      chunkMap.delete(id); // Clear memory

      const inputBuffer = Buffer.from(fullBase64, "base64");
      const originalSize = inputBuffer.length;
      console.log(`Original buffer size: ${originalSize} bytes`);

      let sharpInstance = sharp(inputBuffer);
      const metadata = await sharpInstance.metadata();
      console.log(`Metadata received: ${metadata.format}, ${metadata.width}x${metadata.height}`);

      if (!metadata.width || !metadata.height) {
        throw new Error("Invalid image metadata");
      }

      // 10. Resize Policy
      const longSide = Math.max(metadata.width, metadata.height);
      let targetWidth: number | undefined;
      let targetHeight: number | undefined;

      if (longSide >= 4000) {
        if (metadata.width >= metadata.height) targetWidth = 2560;
        else targetHeight = 2560;
      } else if (longSide >= 3000) {
        if (metadata.width >= metadata.height) targetWidth = 2000;
        else targetHeight = 2000;
      }

      if (targetWidth || targetHeight) {
        sharpInstance = sharpInstance.resize(targetWidth, targetHeight, {
          fit: "inside",
          withoutEnlargement: true,
        });
      }

      // 9. Compression Strategies
      let outputBuffer: Buffer;

      if (mimeType === "image/png") {
        outputBuffer = await sharpInstance
          .png({
            quality: 80,
            compressionLevel: 9,
            palette: true,
            colors: 256,
            dither: 1.0,
          })
          .toBuffer();
      } else if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
        outputBuffer = await sharpInstance
          .jpeg({
            quality: 82,
            progressive: true,
            mozjpeg: true,
          })
          .toBuffer();
      } else {
        throw new Error("Unsupported format");
      }

      // 11. Size Reversion Check
      if (outputBuffer.length >= originalSize) {
        return NextResponse.json<CompressionResponse>({
          success: true,
          data: fullBase64,
          originalSize,
          optimizedSize: originalSize,
        });
      }

      return NextResponse.json<CompressionResponse>({
        success: true,
        data: outputBuffer.toString("base64"),
        originalSize,
        optimizedSize: outputBuffer.length,
      });
    }

    // Still waiting for more chunks
    return NextResponse.json({ success: true, message: "Chunk received" });
  } catch (error) {
    console.error("Compression error:", error);
    return NextResponse.json<CompressionResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
        originalSize: 0,
      },
      { status: 500 }
    );
  }
}

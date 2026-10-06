import { upload } from "@vercel/blob/client";
import { CompressionRequest, CompressionResponse, OutputFormat } from "@/types/image";

export interface CompressImageOptions {
  targetFormat: OutputFormat;
  quality: number;
  scalePercent?: number;
}

export async function compressImage(
  file: File,
  id: string,
  { targetFormat, quality, scalePercent }: CompressImageOptions,
): Promise<{
  optimizedFilename: string;
  optimizedUrl: string;
  optimizedDownloadUrl: string;
  originalSize: number;
  optimizedSize: number;
}> {
  const normalizedName = file.name.normalize("NFC");
  const sourceBlob = await upload(`uploads/${id}-${normalizedName}`, file, {
    access: "public",
    contentType: file.type,
    handleUploadUrl: "/api/upload",
    multipart: file.size > 5 * 1024 * 1024,
  });

  const payload: CompressionRequest = {
    sourceUrl: sourceBlob.url,
    filename: normalizedName,
    mimeType: file.type,
    targetFormat,
    quality,
    scalePercent: scalePercent && scalePercent < 100 ? scalePercent : undefined,
    uploadId: id,
  };

  let finalResponse: CompressionResponse;

  try {
    const response = await fetch("/api/compress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const responseData = (await response.json()) as CompressionResponse;
    if (!response.ok || !responseData.success) {
      throw new Error(responseData.error || "Compression failed");
    }

    finalResponse = responseData;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Network error during upload",
    );
  }

  if (
    !finalResponse.outputUrl ||
    !finalResponse.outputDownloadUrl ||
    !finalResponse.optimizedSize
  ) {
    throw new Error(finalResponse.error || "Compression failed");
  }

  return {
    optimizedFilename: finalResponse.outputFilename,
    optimizedUrl: finalResponse.outputUrl,
    optimizedDownloadUrl: finalResponse.outputDownloadUrl,
    originalSize: finalResponse.originalSize,
    optimizedSize: finalResponse.optimizedSize,
  };
}

import { upload } from "@vercel/blob/client";
import { CompressionRequest, CompressionResponse, ImageCategory, OutputFormat } from "@/types/image";

function buildBlobProxyUrl(url: string, filename?: string, download?: boolean) {
  const search = new URLSearchParams({ url });
  if (filename) search.set("filename", filename);
  if (download) search.set("download", "1");
  return `/api/blob?${search.toString()}`;
}

export async function compressImage(
  file: File,
  id: string,
  category: ImageCategory,
  targetFormat: OutputFormat
): Promise<{
  optimizedFilename: string;
  optimizedUrl: string;
  optimizedDownloadUrl: string;
  originalSize: number;
  optimizedSize: number;
}> {
  const sourceBlob = await upload(`uploads/${id}-${file.name}`, file, {
    access: "private",
    contentType: file.type,
    handleUploadUrl: "/api/upload",
    multipart: file.size > 5 * 1024 * 1024,
  });

  const payload: CompressionRequest = {
    sourceUrl: sourceBlob.url,
    filename: file.name,
    mimeType: file.type,
    category,
    targetFormat,
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
  } catch {
    throw new Error("Network error during upload");
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
    optimizedUrl: buildBlobProxyUrl(finalResponse.outputUrl, finalResponse.outputFilename),
    optimizedDownloadUrl: buildBlobProxyUrl(finalResponse.outputUrl, finalResponse.outputFilename, true),
    originalSize: finalResponse.originalSize,
    optimizedSize: finalResponse.optimizedSize,
  };
}

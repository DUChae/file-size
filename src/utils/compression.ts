import { CompressionOptions, CompressionResponse, OutputFormat } from "@/types/image";

export interface CompressImageOptions {
  targetFormat: OutputFormat;
  quality: number;
  scalePercent?: number;
  targetBytes?: number;
  stripMetadata?: boolean;
}

export interface CompressedImage {
  optimizedFilename: string;
  // A blob: URL owned by the caller; release it with URL.revokeObjectURL when done.
  optimizedUrl: string;
  optimizedDownloadUrl: string;
  originalSize: number;
  optimizedSize: number;
  // Only set for target-size requests.
  qualityUsed?: number;
  targetMet?: boolean;
}

// Posts the source to /api/compress, which answers with the compressed image itself.
// `source` is either a File or the id of a URL capture already stored on the server.
export async function requestCompression(
  source: { file: File } | { captureId: string },
  options: CompressionOptions,
): Promise<CompressedImage> {
  const body = new FormData();
  if ("file" in source) {
    body.append("file", source.file);
  } else {
    body.append("captureId", source.captureId);
  }
  body.append("options", JSON.stringify(options));

  let response: Response;
  try {
    response = await fetch("/api/compress", { method: "POST", body });
  } catch {
    throw new Error("Network error during compression");
  }

  if (!response.ok) {
    let message = "Compression failed";
    try {
      const data = (await response.json()) as CompressionResponse;
      message = data.error || message;
    } catch {
      // Non-JSON error body (e.g. a proxy error page).
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const encodedFilename = response.headers.get("X-Output-Filename");
  const targetMet = response.headers.get("X-Target-Met");
  const qualityUsed = response.headers.get("X-Quality-Used");

  return {
    optimizedFilename: encodedFilename
      ? decodeURIComponent(encodedFilename)
      : options.filename,
    optimizedUrl: objectUrl,
    optimizedDownloadUrl: objectUrl,
    originalSize: Number(response.headers.get("X-Original-Size")),
    optimizedSize: Number(response.headers.get("X-Optimized-Size")) || blob.size,
    qualityUsed: qualityUsed ? Number(qualityUsed) : undefined,
    targetMet: targetMet === null ? undefined : targetMet === "1",
  };
}

export async function compressImage(
  file: File,
  { targetFormat, quality, scalePercent, targetBytes, stripMetadata }: CompressImageOptions,
): Promise<CompressedImage> {
  return requestCompression(
    { file },
    {
      filename: file.name.normalize("NFC"),
      mimeType: file.type,
      targetFormat,
      quality,
      scalePercent: scalePercent && scalePercent < 100 ? scalePercent : undefined,
      targetBytes,
      stripMetadata,
    },
  );
}

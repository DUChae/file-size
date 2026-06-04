export type QueueStatus = "queued" | "uploading" | "compressing" | "done" | "error";

export type ImageCategory = "screenshot" | "photo" | "web" | "high-quality";

export type OutputFormat = "original" | "png" | "jpeg" | "webp" | "avif" | "gif";

export interface QueueItem {
  id: string;
  originalFile: File;
  originalSize: number;
  optimizedSize?: number;
  reductionRate?: number;
  status: QueueStatus;
  error?: string;
  category: ImageCategory;
  targetFormat: OutputFormat;
  webWidth: string;
  webHeight: string;
  optimizedFilename?: string;
  optimizedUrl?: string;
  optimizedDownloadUrl?: string;
}

export interface CompressionRequest {
  sourceUrl: string;
  filename: string;
  mimeType: string;
  category: ImageCategory;
  targetFormat: OutputFormat;
  webWidth?: number;
  webHeight?: number;
  uploadId: string;
}

export interface CompressionResponse {
  success: boolean;
  error?: string;
  originalSize: number;
  optimizedSize?: number;
  outputFilename: string;
  outputUrl?: string;
  outputDownloadUrl?: string;
}

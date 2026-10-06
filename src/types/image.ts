export type QueueStatus =
  | "queued"
  | "removing-bg"
  | "uploading"
  | "compressing"
  | "done"
  | "error";

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
  category?: ImageCategory;
  targetFormat: OutputFormat;
  webWidth: string;
  webHeight: string;
  quality?: number;
  // Per-file resize override (percent). Undefined follows the global scale.
  customScale?: number;
  width?: number;
  height?: number;
  optimizedFilename?: string;
  optimizedUrl?: string;
  optimizedDownloadUrl?: string;
  bgRemovalProgress?: number;
  bgRemovalStage?: string;
  removalMode?: "auto" | "ai" | "color";
}

export interface CompressionRequest {
  sourceUrl: string;
  filename: string;
  mimeType: string;
  // Legacy presets used by URL capture / background removal. Ignored when `quality` is set.
  category?: ImageCategory;
  targetFormat: OutputFormat;
  // 1-100. When present, encoding uses this value and the original resolution is kept.
  quality?: number;
  // 10-100. Resizes by percent of the (EXIF-rotated) source width, keeping aspect ratio.
  scalePercent?: number;
  webWidth?: number;
  webHeight?: number;
  webX?: number;
  webY?: number;
  uploadId: string;
  preserveSource?: boolean;
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

export interface UrlCaptureResponse {
  success: boolean;
  error?: string;
  sourceUrl?: string;
  downloadUrl?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  captureId?: string;
}

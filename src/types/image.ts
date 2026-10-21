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
  // Snapshotted at start: when set, the server searches for a quality that fits this size.
  targetBytes?: number;
  stripMetadata?: boolean;
  // Reported back by the server for target-size jobs.
  qualityUsed?: number;
  targetMet?: boolean;
  width?: number;
  height?: number;
  // Small preview made when the file is added (blob: URL owned by the queue).
  thumbnailUrl?: string;
  // Epoch ms; drive the elapsed-time label and "latest result" focus.
  startedAt?: number;
  completedAt?: number;
  optimizedFilename?: string;
  optimizedUrl?: string;
  optimizedDownloadUrl?: string;
  bgRemovalProgress?: number;
  bgRemovalStage?: string;
  removalMode?: "auto" | "ai" | "color";
}

// Sent to /api/compress as the `options` field (JSON) next to either `file` or `captureId`.
export interface CompressionOptions {
  filename: string;
  mimeType: string;
  // Legacy presets used by URL capture / background removal. Ignored when `quality` is set.
  category?: ImageCategory;
  targetFormat: OutputFormat;
  // 1-100. When present, encoding uses this value and the original resolution is kept.
  quality?: number;
  // 10-100. Resizes by percent of the (EXIF-rotated) source width, keeping aspect ratio.
  scalePercent?: number;
  // Bytes. When present, `quality` is ignored and the highest quality that fits is used.
  targetBytes?: number;
  // Defaults to true. false keeps EXIF/XMP/IPTC (orientation is still normalized).
  stripMetadata?: boolean;
  webWidth?: number;
  webHeight?: number;
  webX?: number;
  webY?: number;
}

// /api/compress returns the image itself on success; JSON is only used for errors.
export interface CompressionResponse {
  success: false;
  error: string;
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

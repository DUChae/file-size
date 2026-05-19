export type QueueStatus = "queued" | "uploading" | "compressing" | "done" | "error";

export type ImageCategory = "screenshot" | "photo" | "web" | "high-quality";

export type OutputFormat = "original" | "png" | "jpeg";

export interface QueueItem {
  id: string;
  originalFile: File;
  optimizedFile?: File;
  originalSize: number;
  optimizedSize?: number;
  reductionRate?: number;
  status: QueueStatus;
  error?: string;
  // New settings
  category: ImageCategory;
  targetFormat: OutputFormat;
}

export interface CompressionChunk {
  id: string;
  index: number;
  total: number;
  data: string; // Base64 chunk
  filename: string;
  mimeType: string;
  // Settings passed with each chunk or at the end
  category: ImageCategory;
  targetFormat: OutputFormat;
}

export interface CompressionResponse {
  success: boolean;
  data?: string; // Base64 optimized image
  error?: string;
  originalSize: number;
  optimizedSize?: number;
  outputFilename: string;
}

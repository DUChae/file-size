export type QueueStatus = "queued" | "uploading" | "compressing" | "done" | "error";

export interface QueueItem {
  id: string;
  originalFile: File;
  optimizedFile?: File;
  originalSize: number;
  optimizedSize?: number;
  reductionRate?: number;
  status: QueueStatus;
  error?: string;
}

export interface CompressionChunk {
  id: string;
  index: number;
  total: number;
  data: string; // Base64 chunk
  filename: string;
  mimeType: string;
}

export interface CompressionResponse {
  success: boolean;
  data?: string; // Base64 optimized image
  error?: string;
  originalSize: number;
  optimizedSize?: number;
}

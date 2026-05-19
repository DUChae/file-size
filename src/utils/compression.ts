import { CompressionChunk, CompressionResponse, ImageCategory, OutputFormat } from "@/types/image";

const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB

export async function compressImage(
  file: File,
  id: string,
  category: ImageCategory,
  targetFormat: OutputFormat
): Promise<{ optimizedFile: File; originalSize: number; optimizedSize: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      const totalChunks = Math.ceil(base64.length / CHUNK_SIZE);
      let finalResponse: CompressionResponse | null = null;

      try {
        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, base64.length);
          const chunkData = base64.substring(start, end);

          const chunk: CompressionChunk = {
            id,
            index: i,
            total: totalChunks,
            data: chunkData,
            filename: file.name,
            mimeType: file.type,
            category,
            targetFormat,
          };

          const response = await fetch("/api/compress", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(chunk),
          });

          if (!response.ok) {
            const errorData = await response.json();
            return reject(new Error(errorData.error || `Failed to upload chunk ${i + 1}/${totalChunks}`));
          }

          const responseData = await response.json();
          if (i === totalChunks - 1) {
            finalResponse = responseData;
          }
        }
      } catch (err) {
        return reject(new Error("Network error during upload"));
      }

      if (finalResponse && finalResponse.success && finalResponse.data) {
        const byteCharacters = atob(finalResponse.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        
        const outputMime = finalResponse.outputFilename.endsWith(".png") ? "image/png" : "image/jpeg";
        const optimizedBlob = new Blob([byteArray], { type: outputMime });

        const optimizedFile = new File([optimizedBlob], finalResponse.outputFilename, {
          type: outputMime,
        });

        resolve({
          optimizedFile,
          originalSize: finalResponse.originalSize,
          optimizedSize: finalResponse.optimizedSize || optimizedBlob.size,
        });
      } else {
        reject(new Error(finalResponse?.error || "Compression failed"));
      }
    };

    reader.onerror = () => reject(new Error("File reading failed"));
    reader.readAsDataURL(file);
  });
}

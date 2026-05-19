import { CompressionChunk, CompressionResponse } from "@/types/image";

const CHUNK_SIZE = 3 * 1024 * 1024; // 3MB

export async function compressImage(
  file: File,
  id: string
): Promise<{ optimizedFile: File; originalSize: number; optimizedSize: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      const totalChunks = Math.ceil(base64.length / CHUNK_SIZE);

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
          };

          const response = await fetch("/api/compress", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(chunk),
          });

          if (!response.ok) {
            const errorData = await response.json();
            console.error("Chunk upload failed:", errorData);
            return reject(new Error(errorData.error || `Failed to upload chunk ${i + 1}/${totalChunks}`));
          }

          const responseData = await response.json();
          if (i === totalChunks - 1) {
            finalResponse = responseData;
          }
        }
      } catch (err) {
        console.error("Error during chunk upload:", err);
        return reject(new Error("Network error during upload"));
      }

      if (finalResponse && finalResponse.success && finalResponse.data) {
        const byteCharacters = atob(finalResponse.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const optimizedBlob = new Blob([byteArray], { type: file.type });

        // 22. Filename Rule: 원본명.optimized.ext
        const dotIndex = file.name.lastIndexOf(".");
        const name = file.name.substring(0, dotIndex);
        const ext = file.name.substring(dotIndex + 1);
        const optimizedFilename = `${name}.optimized.${ext}`;

        const optimizedFile = new File([optimizedBlob], optimizedFilename, {
          type: file.type,
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

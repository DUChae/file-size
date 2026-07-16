import { saveAs } from "file-saver";
import JSZip from "jszip";
import { QueueItem } from "@/types/image";

export function downloadSingle(item: QueueItem) {
  if (item.optimizedDownloadUrl && item.optimizedFilename) {
    // 브라우저 캐시 방지를 위해 타임스탬프 쿼리 스트링을 붙여 다운로드합니다.
    const cacheBustedUrl = item.optimizedDownloadUrl + `?t=${Date.now()}`;
    saveAs(cacheBustedUrl, item.optimizedFilename.normalize("NFC"));
  }
}

export async function downloadAllAsZip(items: QueueItem[]) {
  const zip = new JSZip();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const usedFilenames = new Set<string>();

  for (const item of items) {
    if (item.optimizedUrl && item.optimizedFilename && item.status === "done") {
      // ZIP 생성 시에도 최신 버전 이미지를 가져오도록 캐시 버스팅을 적용합니다.
      const cacheBustedUrl = item.optimizedUrl + `?t=${Date.now()}`;
      const response = await fetch(cacheBustedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${item.optimizedFilename}`);
      }

      const blob = await response.blob();
      const baseFilename = item.optimizedFilename.normalize("NFC");
      let uniqueFilename = baseFilename;

      const dotIndex = baseFilename.lastIndexOf(".");
      const namePart = dotIndex >= 0 ? baseFilename.substring(0, dotIndex) : baseFilename;
      const extPart = dotIndex >= 0 ? baseFilename.substring(dotIndex) : "";

      let counter = 1;
      while (usedFilenames.has(uniqueFilename)) {
        uniqueFilename = `${namePart} (${counter})${extPart}`;
        counter++;
      }

      usedFilenames.add(uniqueFilename);
      zip.file(uniqueFilename, blob);
    }
  }

  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, `optimized_images_${timestamp}.zip`);
}

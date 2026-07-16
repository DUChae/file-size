import { saveAs } from "file-saver";
import JSZip from "jszip";
import { QueueItem } from "@/types/image";

export function downloadSingle(item: QueueItem) {
  if (item.optimizedDownloadUrl && item.optimizedFilename) {
    // 로컬 Blob URL인 경우 캐시 버스팅 쿼리를 생략하여 브라우저 fetch 오류를 방지합니다.
    const isBlobUrl = item.optimizedDownloadUrl.startsWith("blob:");
    const downloadUrl = isBlobUrl ? item.optimizedDownloadUrl : (item.optimizedDownloadUrl + `?t=${Date.now()}`);
    saveAs(downloadUrl, item.optimizedFilename.normalize("NFC"));
  }
}

export async function downloadAllAsZip(items: QueueItem[]) {
  const zip = new JSZip();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const usedFilenames = new Set<string>();

  for (const item of items) {
    if (item.optimizedUrl && item.optimizedFilename && item.status === "done") {
      const isBlobUrl = item.optimizedUrl.startsWith("blob:");
      const fetchUrl = isBlobUrl ? item.optimizedUrl : (item.optimizedUrl + `?t=${Date.now()}`);
      const response = await fetch(fetchUrl);
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

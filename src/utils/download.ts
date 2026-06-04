import { saveAs } from "file-saver";
import JSZip from "jszip";
import { QueueItem } from "@/types/image";

export function downloadSingle(item: QueueItem) {
  if (item.optimizedDownloadUrl && item.optimizedFilename) {
    saveAs(item.optimizedDownloadUrl, item.optimizedFilename.normalize("NFC"));
  }
}

export async function downloadAllAsZip(items: QueueItem[]) {
  const zip = new JSZip();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const usedFilenames = new Set<string>();

  for (const item of items) {
    if (item.optimizedUrl && item.optimizedFilename && item.status === "done") {
      const response = await fetch(item.optimizedUrl);
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

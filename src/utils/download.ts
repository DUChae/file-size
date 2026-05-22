import { saveAs } from "file-saver";
import JSZip from "jszip";
import { QueueItem } from "@/types/image";

export function downloadSingle(item: QueueItem) {
  if (item.optimizedDownloadUrl && item.optimizedFilename) {
    saveAs(item.optimizedDownloadUrl, item.optimizedFilename);
  }
}

export async function downloadAllAsZip(items: QueueItem[]) {
  const zip = new JSZip();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  for (const item of items) {
    if (item.optimizedUrl && item.optimizedFilename && item.status === "done") {
      const response = await fetch(item.optimizedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${item.optimizedFilename}`);
      }

      const blob = await response.blob();
      zip.file(item.optimizedFilename, blob);
    }
  }

  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, `optimized_images_${timestamp}.zip`);
}

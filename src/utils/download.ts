import { saveAs } from "file-saver";
import JSZip from "jszip";
import { QueueItem } from "@/types/image";

export function downloadSingle(item: QueueItem) {
  if (item.optimizedFile) {
    saveAs(item.optimizedFile, item.optimizedFile.name);
  }
}

export async function downloadAllAsZip(items: QueueItem[]) {
  const zip = new JSZip();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  for (const item of items) {
    if (item.optimizedFile && item.status === "done") {
      zip.file(item.optimizedFile.name, item.optimizedFile);
    }
  }

  const content = await zip.generateAsync({ type: "blob" });
  // 21. ZIP Filename Rule: optimized_images_[timestamp].zip
  saveAs(content, `optimized_images_${timestamp}.zip`);
}

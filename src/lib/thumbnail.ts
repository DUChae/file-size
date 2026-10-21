// 큐에 넣은 이미지의 해상도를 읽고 타일용 작은 미리보기를 만드는 함수

const THUMBNAIL_WIDTH = 480;

export interface ImageInfo {
  width: number;
  height: number;
  /** 호출한 쪽이 URL.revokeObjectURL로 해제해야 한다. */
  thumbnailUrl?: string;
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  // WebP 인코딩을 못 하는 브라우저는 PNG로 돌려준다.
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.82),
  );
}

/**
 * 원본을 한 번 디코딩해 해상도와 작은 미리보기를 함께 만든다.
 * 타일마다 원본을 그대로 띄우면 큰 사진 10장이 수백 MB를 차지하므로 미리보기만 쓴다.
 * createImageBitmap은 EXIF 방향을 반영하므로 서버의 rotate() 결과와 해상도가 맞는다.
 */
export async function readImageInfo(file: File): Promise<ImageInfo | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  const info: ImageInfo = { width: bitmap.width, height: bitmap.height };
  try {
    const scale = Math.min(1, THUMBNAIL_WIDTH / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return info;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas);
    if (blob) info.thumbnailUrl = URL.createObjectURL(blob);
    return info;
  } catch {
    return info;
  } finally {
    bitmap.close();
  }
}

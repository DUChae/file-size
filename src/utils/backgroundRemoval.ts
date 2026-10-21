/**
 * 이미지 파일 또는 블롭을 서버리스 API로 전송하여 remove.bg급 고품질 투명 PNG 블롭을 반환합니다.
 * @param image 원본 이미지 파일 또는 블롭
 * @param onProgress 진행 상태 백분율 및 현재 단계 콜백
 * @returns 배경이 제거된 투명 PNG 이미지 Blob
 */
export async function removeImageBackground(
  image: File | Blob,
  onProgress?: (progress: number, stage?: string) => void,
): Promise<Blob> {
  if (typeof window === "undefined") {
    throw new Error("배경 제거 기능은 클라이언트 브라우저 환경에서만 실행할 수 있습니다.");
  }

  // 자체 서버에는 요청 크기 제한이 없으므로 원본 해상도 그대로 전송합니다.
  onProgress?.(40, "AI GPU 서버로 전송 중...");
  const formData = new FormData();
  formData.append("file", image, image instanceof File ? image.name : "image.png");

  onProgress?.(65, "remove.bg급 고정밀 배경 분리 중...");

  const response = await fetch("/api/remove-bg", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let errorMsg = "배경 제거 처리 실패";
    try {
      const errJson = await response.json();
      errorMsg = errJson.error || errorMsg;
    } catch {
      errorMsg = await response.text();
    }
    throw new Error(errorMsg);
  }

  onProgress?.(95, "투명 PNG 이미지 수신 중...");
  const resultBlob = await response.blob();

  onProgress?.(100, "완료");
  return resultBlob;
}

/**
 * 투명 PNG Blob을 사용자가 지정한 최종 포맷(PNG, WEBP, JPEG 등)으로 브라우저에서 고속 변환합니다.
 * - PNG: 원본 투명 무손실 그대로 유지
 * - WEBP: 투명 알파 채널 100% 보존 + 70% 고압축 용량 절감
 * - JPEG: 투명 미지원 규격이므로 투명 영역을 깔끔한 흰색(White) 배경으로 채움
 */
export async function convertBlobFormat(
  sourceBlob: Blob,
  targetFormat: "png" | "webp" | "jpeg",
): Promise<Blob> {
  if (targetFormat === "png") {
    return sourceBlob;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(sourceBlob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(sourceBlob);
        return;
      }

      if (targetFormat === "jpeg") {
        // JPEG는 투명도를 지원하지 않으므로 배경을 흰색으로 먼저 채움
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.drawImage(img, 0, 0);

      const mimeType = targetFormat === "jpeg" ? "image/jpeg" : "image/webp";
      const quality = targetFormat === "jpeg" ? 0.92 : 0.90;

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            resolve(sourceBlob);
          }
        },
        mimeType,
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("포맷 변환 중 이미지 로드 실패"));
    };
    img.src = url;
  });
}

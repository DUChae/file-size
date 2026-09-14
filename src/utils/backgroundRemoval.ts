/**
 * 고화질 이미지를 안전하게 API로 전송하기 위해 필요한 경우 적응형 다운샘플링(최대 2560px)을 수행합니다.
 * (Vercel Serverless 요청 본문 4.5MB 제한 원천 방지)
 */
async function prepareImageForUpload(fileOrBlob: File | Blob): Promise<Blob> {
  if (fileOrBlob.size < 3.5 * 1024 * 1024) {
    return fileOrBlob;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(fileOrBlob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 2560;
      let width = img.naturalWidth;
      let height = img.naturalHeight;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(fileOrBlob);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          resolve(blob || fileOrBlob);
        },
        "image/png",
        0.95,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(fileOrBlob);
    };
    img.src = url;
  });
}

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

  onProgress?.(15, "이미지 최적화 준비 중...");
  const uploadBlob = await prepareImageForUpload(image);

  onProgress?.(40, "AI GPU 서버로 전송 중...");
  const formData = new FormData();
  formData.append("file", uploadBlob, image instanceof File ? image.name : "image.png");

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





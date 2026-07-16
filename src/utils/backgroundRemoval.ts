// 클라이언트 측 브라우저 WASM을 활용하여 이미지의 배경을 제거하는 유틸리티 함수

/**
 * 이미지 파일 또는 블롭을 입력받아 배경이 제거된 투명 PNG 블롭을 반환합니다.
 * @param image 원본 이미지 파일 또는 블롭
 * @param onProgress 진행 상태를 백분율(0-100)로 전달받는 콜백 함수
 * @returns 배경이 제거된 이미지 블롭(Blob)
 */
export async function removeImageBackground(
  image: File | Blob,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  if (typeof window === "undefined") {
    throw new Error("배경 제거 기능은 클라이언트 브라우저 환경에서만 실행할 수 있습니다.");
  }

  // Next.js SSR 빌드 시 에러 방지를 위해 dynamic import를 사용합니다.
  const { removeBackground } = await import("@imgly/background-removal");

  return removeBackground(image, {
    progress: (key: string, current: number, total: number) => {
      if (onProgress && total > 0) {
        const percentage = Math.round((current / total) * 100);
        onProgress(percentage);
      }
    },
  });
}

/**
 * 이미지의 픽셀 밝기(Luminance) 분포를 동적으로 분석하여 흰색/밝은 계열 배경 영역을 정밀하게 투명화합니다.
 * 서명 글씨의 안티앨리어싱 경계면에 흰색 테두리(Halo)가 남는 문제를 방지하기 위해 Color-to-Alpha 기법을 적용합니다.
 * @param imageFile 원본 이미지 파일 또는 블롭
 * @param thresholdStart 투명화 적용을 시작할 밝기 기준값 (생략 시 통계 분석을 통해 동적 계산)
 * @param thresholdEnd 완전히 투명하게 만들 밝기 기준값 (생략 시 통계 분석을 통해 동적 계산)
 * @returns 배경이 투명화 처리된 PNG 이미지 블롭(Blob)
 */
export async function removeBgByColorThreshold(
  imageFile: File | Blob,
  thresholdStart?: number,
  thresholdEnd?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(imageFile);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D 컨텍스트를 활성화할 수 없습니다."));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      let startVal = thresholdStart;
      let endVal = thresholdEnd;

      // 임계값이 지정되지 않았다면 이미지 픽셀의 밝기 통계를 기반으로 동적 탐지합니다.
      if (startVal === undefined || endVal === undefined) {
        const lumas: number[] = [];
        const step = Math.max(1, Math.floor(data.length / 4 / 2500)); // 최대 2500개 샘플링
        for (let i = 0; i < data.length; i += 4 * step) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          lumas.push(luma);
        }
        lumas.sort((a, b) => a - b);
        
        // 서명 이미지 배경 종이는 대개 전체 면적의 75% 이상이므로,
        // 상위 80% 분위수와 상위 97% 분위수를 밝기 판단의 임계 범위로 잡습니다.
        const p80 = lumas[Math.floor(lumas.length * 0.80)] || 200;
        const p97 = lumas[Math.floor(lumas.length * 0.97)] || 240;

        startVal = Math.max(120, p80 - 10);
        endVal = Math.max(150, p97 - 1);
      }

      // 1. 원본 RGB 색상을 100% 무손실 보존한 상태로, 밝기에 따라 알파(투명도) 채널만 조절합니다.
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;

        if (luma >= endVal) {
          // 배경은 완전 투명화합니다.
          data[i + 3] = 0;
        } else if (luma <= startVal) {
          // 글씨 영역은 완전 불투명 상태로 보존합니다.
          data[i + 3] = 255;
        } else {
          // 경계면 영역 (startVal < luma < endVal)
          // 원본 픽셀의 색상(RGB)에는 단 1%의 치환이나 변형도 가하지 않고 그대로 둔 채, 알파 채널만 밝기에 비례해 자연스럽게 감쇄시킵니다.
          const ratio = (luma - startVal) / (endVal - startVal);
          const alphaFactor = Math.pow(1 - ratio, 1.5);
          data[i + 3] = Math.round(alphaFactor * 255);
        }
      }

      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("결과 블롭 이미지 생성에 실패하였습니다."));
        }
      }, "image/png");
    };
    img.onerror = () => {
      reject(new Error("이미지 파일을 읽어오는 중 에러가 발생하였습니다."));
    };
  });
}

/**
 * 이미지의 픽셀 밝기 및 채도 분포를 분석하여 흰색 계열 배경 비율이 높은 자필 서명/텍스트 이미지인지 판별합니다.
 * @param imageFile 분석할 원본 이미지 파일 또는 블롭
 * @returns 자필 서명/텍스트로 판별되면 true, 일반 사진/덩어리면 false를 반환합니다.
 */
export async function detectIsSignatureOrText(imageFile: File | Blob): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }

    const img = new Image();
    img.src = URL.createObjectURL(imageFile);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const canvas = document.createElement("canvas");
      const sampleSize = 50;
      canvas.width = sampleSize;
      canvas.height = sampleSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(false);
        return;
      }
      ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
      try {
        const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
        const data = imageData.data;
        
        let maxLuma = 0;
        let minLuma = 255;
        let sumSaturation = 0;
        let brightPixels = 0;
        const total = sampleSize * sampleSize;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;

          if (luma > maxLuma) maxLuma = luma;
          if (luma < minLuma) minLuma = luma;

          const avg = (r + g + b) / 3;
          const sat = (Math.abs(r - avg) + Math.abs(g - avg) + Math.abs(b - avg)) / 3;
          sumSaturation += sat;

          if (luma > 150) {
            brightPixels++;
          }
        }

        const avgSat = sumSaturation / total;
        const brightRatio = brightPixels / total;
        const contrast = maxLuma - minLuma;

        // 1. 전체 이미지 명암 대비가 확실할 것 (대비 100 이상)
        // 2. 전체 면적 중 밝은 부분이 주를 이룰 것 (70% 이상)
        // 3. 색상 성분이 옅을 것 (채도 평균이 25 미만의 무채색 계열)
        const isSignature = contrast > 100 && brightRatio > 0.70 && avgSat < 25;
        resolve(isSignature);
      } catch {
        resolve(false);
      }
    };
    img.onerror = () => {
      resolve(false);
    };
  });
}



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
 * 이미지의 픽셀 밝기(Luminance)를 계산하여 흰색 배경 영역을 정밀하게 투명화합니다. (서명 및 캘리그라피 텍스트에 최적화)
 * @param imageFile 원본 이미지 파일 또는 블롭
 * @param thresholdStart 투명화 적용을 시작할 밝기 기준값 (기본값: 200)
 * @param thresholdEnd 완전히 투명하게 만들 밝기 기준값 (기본값: 240)
 * @returns 배경이 투명화 처리된 PNG 이미지 블롭(Blob)
 */
export async function removeBgByColorThreshold(
  imageFile: File | Blob,
  thresholdStart: number = 200,
  thresholdEnd: number = 240
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

      // 픽셀 루프를 돌며 알파 채널을 조절합니다.
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // 인간 시각 특성이 반영된 휘도(Luminance) 공식 적용
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;

        if (luma >= thresholdEnd) {
          // 배경 기준값 이상으로 밝은 영역은 완전 투명 처리
          data[i + 3] = 0;
        } else if (luma > thresholdStart) {
          // 경계면의 부드러운 안티앨리어싱 효과를 위해 선형 보간 알파 설정
          const ratio = (luma - thresholdStart) / (thresholdEnd - thresholdStart);
          data[i + 3] = Math.round((1 - ratio) * 255);
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
 * 이미지의 픽셀 밝기 분포를 분석하여 흰색 배경 비율이 높은 자필 서명/텍스트 이미지인지 판별합니다.
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
      // 초고속 처리를 위해 100x100 해상도로 서브샘플링하여 분석을 진행합니다.
      const sampleSize = 100;
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
        let whitePixels = 0;
        const totalPixels = sampleSize * sampleSize;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          // 각 RGB 채널이 215보다 높은 밝은 영역을 배경으로 간주합니다.
          if (r > 215 && g > 215 && b > 215) {
            whitePixels++;
          }
        }

        const whiteRatio = whitePixels / totalPixels;
        // 밝은 배경색 영역이 이미지 면적의 85% 이상을 차지할 경우 서명/텍스트로 인지합니다.
        resolve(whiteRatio >= 0.85);
      } catch {
        resolve(false);
      }
    };
    img.onerror = () => {
      resolve(false);
    };
  });
}



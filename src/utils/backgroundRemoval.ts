// 클라이언트 브라우저 WebGPU/WASM 환경에서 최신 SOTA 모델(briaai/RMBG-1.4)을 구동하는 배경 제거 유틸리티

interface RemovalModelBundle {
  model: any;
  processor: any;
  RawImage: any;
}

let modelBundlePromise: Promise<RemovalModelBundle> | null = null;

/**
 * WebGPU 지원 여부를 동적으로 판별합니다.
 */
async function getSupportedDevice(): Promise<"webgpu" | "wasm"> {
  if (typeof navigator !== "undefined") {
    const nav = navigator as any;
    if (nav.gpu && typeof nav.gpu.requestAdapter === "function") {
      try {
        const adapter = await nav.gpu.requestAdapter();
        if (adapter) {
          return "webgpu";
        }
      } catch {
        // WebGPU 어댑터 획득 실패 시 wasm으로 fallback
      }
    }
  }
  return "wasm";
}

/**
 * RMBG-1.4 모델 및 전처리기를 싱글톤으로 로드합니다.
 */
async function loadModelBundle(
  onProgress?: (progress: number, stage: string) => void,
): Promise<RemovalModelBundle> {
  if (typeof window === "undefined") {
    throw new Error("배경 제거 기능은 브라우저 클라이언트 환경에서만 실행할 수 있습니다.");
  }

  if (!modelBundlePromise) {
    modelBundlePromise = (async () => {
      const { AutoModel, AutoProcessor, RawImage, env } = await import(
        "@huggingface/transformers"
      );

      // 브라우저 최적화 설정
      env.allowLocalModels = false;
      env.useBrowserCache = true; // 브라우저 Cache API로 가중치를 영구 캐싱하여 이후 실행 시 0초 다운로드

      const device = await getSupportedDevice();
      const modelId = "briaai/RMBG-1.4";

      onProgress?.(5, "AI 모델 초기화 중...");

      const progressCallback = (info: any) => {
        if (info.status === "progress" || info.status === "progress_total") {
          const rawProgress = typeof info.progress === "number" ? info.progress : 0;
          // 모델 로딩 단계 진행률: 5% ~ 80%
          const mapped = Math.min(80, Math.round(5 + rawProgress * 0.75));
          onProgress?.(mapped, `AI 모델 다운로드 중 (${Math.round(rawProgress)}%)`);
        } else if (info.status === "done") {
          onProgress?.(85, "모델 가중치 준비 완료");
        }
      };

      const [model, processor] = await Promise.all([
        AutoModel.from_pretrained(modelId, {
          dtype: "q8",
          device,
          progress_callback: progressCallback,
        }),
        AutoProcessor.from_pretrained(modelId, {
          progress_callback: progressCallback,
        }),
      ]);

      return { model, processor, RawImage };
    })().catch((err) => {
      modelBundlePromise = null; // 실패 시 재시도 가능하도록 초기화
      throw err;
    });
  }

  return modelBundlePromise;
}

/**
 * 이미지 파일 또는 블롭을 입력받아 remove.bg급 고품질 투명 PNG 블롭을 반환합니다.
 * @param image 원본 이미지 파일 또는 블롭
 * @param onProgress 진행 상태 백분율(0-100) 및 현재 단계 문자열 콜백
 * @returns 배경이 제거된 투명 PNG 이미지 Blob
 */
export async function removeImageBackground(
  image: File | Blob,
  onProgress?: (progress: number, stage?: string) => void,
): Promise<Blob> {
  if (typeof window === "undefined") {
    throw new Error("배경 제거 기능은 클라이언트 브라우저 환경에서만 실행할 수 있습니다.");
  }

  onProgress?.(5, "AI 모델 로딩 중...");
  const { model, processor, RawImage } = await loadModelBundle(onProgress);

  onProgress?.(88, "이미지 분석 및 전처리 중...");
  const objectUrl = URL.createObjectURL(image);

  try {
    const rawImage = await RawImage.fromURL(objectUrl);
    const originalWidth = rawImage.width;
    const originalHeight = rawImage.height;

    // RMBG-1.4 전처리
    const inputs = await processor(rawImage);

    onProgress?.(92, "고정밀 배경 분리 추론 중...");
    const outputs = await model({ input: inputs.pixel_values });
    const maskTensor = outputs.output;

    onProgress?.(96, "투명 알파 매팅 처리 중...");
    const tensorData = maskTensor.data as Float32Array;
    const maskData = new Uint8ClampedArray(1024 * 1024);
    for (let i = 0; i < tensorData.length; ++i) {
      maskData[i] = Math.round(tensorData[i] * 255);
    }

    const maskRaw = new RawImage(maskData, 1024, 1024, 1);
    const resizedMask = await maskRaw.resize(originalWidth, originalHeight);

    const transparentImage = rawImage.clone();
    transparentImage.putAlpha(resizedMask);

    onProgress?.(98, "PNG 이미지 생성 중...");

    // 브라우저 Canvas를 활용해 무손실 투명 PNG Blob 추출
    const canvas = document.createElement("canvas");
    canvas.width = originalWidth;
    canvas.height = originalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D 컨텍스트를 생성할 수 없습니다.");
    }

    const rgba = transparentImage.rgba();
    const clampedBuffer = new Uint8ClampedArray(
      rgba.data.buffer,
      rgba.data.byteOffset,
      rgba.data.byteLength,
    );
    const imageData = new ImageData(clampedBuffer, originalWidth, originalHeight);
    ctx.putImageData(imageData, 0, 0);

    const resultBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("투명 PNG 블롭 생성에 실패했습니다."));
        }
      }, "image/png");
    });

    onProgress?.(100, "완료");
    return resultBlob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}





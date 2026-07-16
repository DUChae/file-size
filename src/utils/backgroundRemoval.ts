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

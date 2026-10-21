// 브라우저 안에서 처리하는 PDF 작업의 메모리 경고 기준

const MB = 1024 * 1024;

/** 경고 기준(데스크톱). 실측 기록은 DESIGN_REFRESH_PLAN.md §5.1 */
export const MEMORY_WARNING = {
  /** PDF → PNG: 결과 PNG를 모두 들고 있을 때의 추정 메모리(문서 밀도 보정) */
  pdfToPngPixels: 500 * MB,
  /** PDF 압축: 원본 파일 크기 */
  pdfCompressFile: 200 * MB,
  /** 이미지 → PDF: 원본 이미지 합계 */
  imageToPdfTotal: 300 * MB,
} as const;

/**
 * 메모리가 작은 기기(모바일·저사양)에서는 기준을 절반으로 낮춘다.
 * navigator.deviceMemory가 있으면 그 값을, 없으면 터치 위주 기기인지로 판단한다.
 */
export function memoryBudget(base: number) {
  if (typeof window === "undefined") return base;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  const small =
    (deviceMemory !== undefined && deviceMemory <= 4) ||
    window.matchMedia("(pointer: coarse)").matches;
  return small ? base / 2 : base;
}

// 파일 용량을 화면에 표시하는 공용 형식 함수

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];

/** 1024 단위로 줄이고 소수 한 자리까지 표시한다. 예: 1536 → "1.5 KB" */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    SIZE_UNITS.length - 1,
  );
  const value = bytes / Math.pow(1024, index);
  return `${parseFloat(value.toFixed(1))} ${SIZE_UNITS[index]}`;
}

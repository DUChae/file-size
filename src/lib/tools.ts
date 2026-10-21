// 상단 탭의 도구 목록, 포맷 변환 하위 모드, 도구별 URL 정의

export type ToolId =
  | "compress"
  | "pdf-compress"
  | "convert"
  | "capture"
  | "remove-bg";
export type ConvertMode = "pdf-to-png" | "image-to-pdf" | "webp" | "avif";
/** 화면 하나에 대응하는 키. 포맷 변환은 하위 모드마다 따로 화면을 갖는다. */
export type ToolKey = Exclude<ToolId, "convert"> | ConvertMode;

export interface ToolDefinition<T extends string> {
  id: T;
  label: string;
  href: string;
}

export const TOOLS: ToolDefinition<ToolId>[] = [
  { id: "compress", label: "이미지 압축", href: "/compress" },
  { id: "pdf-compress", label: "PDF 압축", href: "/pdf-compress" },
  { id: "convert", label: "포맷 변환", href: "/convert/pdf-to-png" },
  { id: "capture", label: "웹페이지 캡처", href: "/capture" },
  { id: "remove-bg", label: "배경 제거", href: "/remove-bg" },
];

export const CONVERT_MODES: ToolDefinition<ConvertMode>[] = [
  { id: "pdf-to-png", label: "PDF → PNG", href: "/convert/pdf-to-png" },
  { id: "image-to-pdf", label: "이미지 → PDF", href: "/convert/image-to-pdf" },
  { id: "webp", label: "WebP 변환", href: "/convert/webp" },
  { id: "avif", label: "AVIF 변환", href: "/convert/avif" },
];

const CONVERT_MODE_IDS = new Set<string>(CONVERT_MODES.map((mode) => mode.id));

export function isConvertMode(key: ToolKey): key is ConvertMode {
  return CONVERT_MODE_IDS.has(key);
}

/** 경로에서 도구 화면 키를 찾는다. 도구 화면이 아니면 null */
export function toolKeyFromPath(pathname: string): ToolKey | null {
  const [first, second] = pathname.split("/").filter(Boolean);
  if (first === "convert") {
    return CONVERT_MODE_IDS.has(second) ? (second as ConvertMode) : null;
  }
  const tool = TOOLS.find((item) => item.id === first && item.id !== "convert");
  return tool ? (tool.id as ToolKey) : null;
}

export function toolIdOf(key: ToolKey): ToolId {
  return isConvertMode(key) ? "convert" : key;
}

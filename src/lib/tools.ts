// 상단 탭에 나오는 도구 목록과 포맷 변환 하위 모드 정의

export type ToolId =
  | "compress"
  | "pdf-compress"
  | "convert"
  | "capture"
  | "remove-bg";
export type ConvertMode = "pdf-to-png" | "image-to-pdf" | "webp" | "avif";

export interface ToolDefinition<T extends string> {
  id: T;
  label: string;
  href: string;
}

export const TOOLS: ToolDefinition<ToolId>[] = [
  { id: "compress", label: "이미지 압축", href: "/?tool=compress" },
  { id: "pdf-compress", label: "PDF 압축", href: "/?tool=pdf-compress" },
  { id: "convert", label: "포맷 변환", href: "/?tool=convert" },
  { id: "capture", label: "웹페이지 캡처", href: "/?tool=capture" },
  { id: "remove-bg", label: "배경 제거", href: "/?tool=remove-bg" },
];

export const CONVERT_MODES: ToolDefinition<ConvertMode>[] = [
  {
    id: "pdf-to-png",
    label: "PDF → PNG",
    href: "/?tool=convert&mode=pdf-to-png",
  },
  {
    id: "image-to-pdf",
    label: "이미지 → PDF",
    href: "/?tool=convert&mode=image-to-pdf",
  },
  { id: "webp", label: "WebP 변환", href: "/?tool=convert&mode=webp" },
  { id: "avif", label: "AVIF 변환", href: "/?tool=convert&mode=avif" },
];

export function parseToolId(value: unknown): ToolId {
  return TOOLS.find((tool) => tool.id === value)?.id ?? "compress";
}

export function parseConvertMode(value: unknown): ConvertMode {
  return CONVERT_MODES.find((mode) => mode.id === value)?.id ?? "pdf-to-png";
}

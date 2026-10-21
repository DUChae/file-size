// 클립보드에서 붙여 넣은 이미지 파일을 처리하는 공용 함수

const PASTE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

// Clipboard images all arrive as "image.png"; give each a distinct, dated name.
export function renamePastedFiles(files: File[]): File[] {
  const stamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[-:]/g, "")
    .replace("T", "-");
  return files.map((file, index) => {
    const ext = PASTE_EXTENSIONS[file.type] ?? "png";
    const suffix = files.length > 1 ? `-${index + 1}` : "";
    return new File([file], `pasted-${stamp}${suffix}.${ext}`, {
      type: file.type,
      lastModified: Date.now(),
    });
  });
}

/**
 * 페이지 전역 붙여넣기를 파일 추가로 받아도 되는지 판단한다.
 * 입력창 안에 붙여 넣었거나 모달이 열려 있으면 무시한다.
 */
export function shouldHandlePaste(event: ClipboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, [contenteditable='true']"))
    return false;
  if (document.querySelector("dialog[open]")) return false;
  return true;
}

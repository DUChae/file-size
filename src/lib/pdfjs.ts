// Shared pdf.js loader for client components. Resource directories are copied
// into public/pdfjs by scripts/copy-pdfjs-assets.mjs.
type PdfjsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsPromise: Promise<PdfjsModule> | null = null;

export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

// Without these, CJK fonts (Korean CID fonts), JPEG2000/JBIG2 images,
// non-embedded standard fonts and ICC colors fail to render.
export const PDFJS_DOCUMENT_OPTIONS = {
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  wasmUrl: "/pdfjs/wasm/",
  iccUrl: "/pdfjs/iccs/",
} as const;

// Keep canvases under the smallest common browser limit (iOS Safari ~16.7M px).
export const MAX_CANVAS_PIXELS = 16_000_000;

export function getSafeRenderScale(
  pageWidthPt: number,
  pageHeightPt: number,
  desiredScale: number,
) {
  const pixels = pageWidthPt * desiredScale * pageHeightPt * desiredScale;
  if (pixels <= MAX_CANVAS_PIXELS) return desiredScale;
  return Math.sqrt(MAX_CANVAS_PIXELS / (pageWidthPt * pageHeightPt));
}

export function isPdfFile(file: File) {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

export function isPasswordError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: string }).name === "PasswordException"
  );
}

export function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
          return;
        }
        reject(new Error("이미지 인코딩에 실패했습니다."));
      },
      type,
      quality,
    );
  });
}

"use client";
// 선택한 PDF를 PDF.js로 열어 페이지 수·크기와 앞쪽 페이지 미리보기를 만드는 훅과 큰 미리보기 컴포넌트

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  PDFJS_DOCUMENT_OPTIONS,
  canvasToBlob,
  getSafeRenderScale,
  loadPdfjs,
  releaseCanvas,
} from "@/lib/pdfjs";

const THUMBNAIL_WIDTH = 240;
/** 미리보기를 만드는 앞쪽 페이지 수. 나머지는 자리만 보여 준다. */
export const MAX_PDF_THUMBNAILS = 30;

export interface PdfPageSize {
  /** pt 단위(1/72 inch) */
  width: number;
  height: number;
}

export interface PdfPreview {
  status: "idle" | "loading" | "ready" | "error";
  pageCount: number;
  pages: PdfPageSize[];
  thumbnails: (string | undefined)[];
  error?: unknown;
  /** 지정한 폭(px)으로 한 페이지를 렌더링해 blob URL을 돌려준다. 호출한 쪽이 해제한다. */
  renderPage?: (index: number, width: number) => Promise<string>;
}

interface PreviewState extends PdfPreview {
  file: File | null;
}

const EMPTY: PdfPreview = {
  status: "idle",
  pageCount: 0,
  pages: [],
  thumbnails: [],
};

async function renderToUrl(
  pdf: PDFDocumentProxy,
  index: number,
  width: number,
) {
  const page = await pdf.getPage(index + 1);
  try {
    const base = page.getViewport({ scale: 1 });
    const scale = getSafeRenderScale(
      base.width,
      base.height,
      width / base.width,
    );
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context를 만들 수 없습니다.");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    // 투명한 페이지가 어두운 바탕에 묻히지 않도록 종이색을 깐다.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.85);
    releaseCanvas(canvas);
    return URL.createObjectURL(blob);
  } finally {
    page.cleanup();
  }
}

export function usePdfPreview(file: File | null): PdfPreview {
  const [state, setState] = useState<PreviewState>({ ...EMPTY, file: null });

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let pdf: PDFDocumentProxy | null = null;
    const urls: string[] = [];

    void (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const data = await file.arrayBuffer();
        pdf = await pdfjs.getDocument({ data, ...PDFJS_DOCUMENT_OPTIONS })
          .promise;
        if (cancelled) return;
        const doc = pdf;

        const pages: PdfPageSize[] = [];
        for (let index = 1; index <= doc.numPages; index += 1) {
          const page = await doc.getPage(index);
          const viewport = page.getViewport({ scale: 1 });
          pages.push({ width: viewport.width, height: viewport.height });
          page.cleanup();
          if (cancelled) return;
        }

        const renderPage = (index: number, width: number) =>
          renderToUrl(doc, index, width);
        setState({
          file,
          status: "ready",
          pageCount: doc.numPages,
          pages,
          thumbnails: [],
          renderPage,
        });

        const count = Math.min(doc.numPages, MAX_PDF_THUMBNAILS);
        for (let index = 0; index < count; index += 1) {
          const url = await renderToUrl(doc, index, THUMBNAIL_WIDTH);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          urls.push(url);
          setState((current) => {
            if (current.file !== file) return current;
            const thumbnails = [...current.thumbnails];
            thumbnails[index] = url;
            return { ...current, thumbnails };
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ ...EMPTY, file, status: "error", error });
        }
      }
    })();

    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
      void pdf?.destroy();
    };
  }, [file]);

  // 새 파일을 고른 직후에는 이전 결과 대신 불러오는 중으로 보인다.
  if (!file) return EMPTY;
  if (state.file !== file) return { ...EMPTY, status: "loading" };
  return state;
}

/** 한 페이지를 큰 폭으로 렌더링해 보여 준다. 페이지가 바뀌면 key로 새로 마운트한다. */
export function PdfPagePreview({
  preview,
  index,
  width = 1088,
  alt,
}: {
  preview: PdfPreview;
  index: number;
  width?: number;
  alt: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const renderPage = preview.renderPage;
  const fallback = preview.thumbnails[index];

  useEffect(() => {
    if (!renderPage) return;
    let cancelled = false;
    renderPage(index, width)
      .then((next) => {
        if (cancelled) {
          URL.revokeObjectURL(next);
          return;
        }
        urlRef.current = next;
        setUrl(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, [renderPage, index, width]);

  const src = url ?? fallback;
  if (!src) {
    return (
      <span className="absolute inset-0 flex items-center justify-center text-sm text-muted">
        미리보기를 만드는 중
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="absolute inset-0 size-full object-contain p-3"
    />
  );
}

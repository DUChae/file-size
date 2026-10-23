"use client";

// PDF의 모든 페이지를 PNG로 렌더링해 저장하는 도구(여러 쪽이면 ZIP). 처리는 브라우저 안에서 한다.

import React, { useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { FileText } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { Dropzone } from "@/components/ui/dropzone";
import { FocusTile } from "@/components/ui/focus-tile";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ToolLayout } from "@/components/ui/tool-layout";
import { EmptyWall, TileBoard, type BoardTile } from "@/components/TileBoard";
import {
  PdfPagePreview,
  usePdfPreview,
  type PdfPageSize,
} from "@/components/usePdfPreview";
import { useReportBusy } from "@/components/ToolActivity";
import {
  PDFJS_DOCUMENT_OPTIONS,
  canvasToBlob,
  getSafeRenderScale,
  isPasswordError,
  isPdfFile,
  loadPdfjs,
  releaseCanvas,
} from "@/lib/pdfjs";
import { MEMORY_WARNING, memoryBudget } from "@/lib/memoryBudget";
import { formatSize } from "@/lib/format";
import { trackClientEvent } from "@/utils/analyticsClient";

const DPI_OPTIONS = [72, 144, 216, 300] as const;
type Dpi = (typeof DPI_OPTIONS)[number];
const ACCEPT = ".pdf,application/pdf";
// 보드에 올리는 최대 페이지 수. 더 긴 문서도 변환은 전체 페이지에 한다.
const MAX_BOARD_PAGES = 200;

function sanitizeFilename(name: string) {
  const normalized = name.normalize("NFC");
  let safe = normalized.replace(/[^\p{L}\p{N}._-]/gu, "-");
  if (!safe.replace(/-+/g, "").trim()) {
    safe = "converted";
  }
  return safe;
}

/** 실제 렌더링과 같은 규칙(캔버스 한도 포함)으로 출력 픽셀 크기를 구한다 */
function outputSize(page: PdfPageSize, dpi: number) {
  const scale = getSafeRenderScale(page.width, page.height, dpi / 72);
  return {
    width: Math.ceil(page.width * scale),
    height: Math.ceil(page.height * scale),
  };
}

// 실측(2026-10-21, DESIGN_REFRESH_PLAN.md §5.1): 결과 PNG가 메모리에 쌓이므로
// 글자 위주 문서는 원시 픽셀의 약 0.15배, 스캔·사진 문서는 약 1.2배를 썼다.
const IMAGE_HEAVY_BYTES_PER_PAGE = 200 * 1024;
const TEXT_FACTOR = 0.2;
const IMAGE_FACTOR = 1.2;

/** 모든 페이지를 PNG로 만들어 들고 있을 때의 메모리 추정치(바이트) */
function estimateBytes(pages: PdfPageSize[], dpi: number, fileSize: number) {
  if (pages.length === 0) return 0;
  const rawPixels = pages.reduce((sum, page) => {
    const size = outputSize(page, dpi);
    return sum + size.width * size.height * 4;
  }, 0);
  const imageHeavy = fileSize / pages.length > IMAGE_HEAVY_BYTES_PER_PAGE;
  return rawPixels * (imageHeavy ? IMAGE_FACTOR : TEXT_FACTOR);
}

export default function PdfToPngConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<
    "idle" | "converting" | "done" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [dpi, setDpi] = useState<Dpi>(144);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  // "그래도 계속"을 누른 파일·해상도 조합
  const [acknowledged, setAcknowledged] = useState<string | null>(null);
  const preview = usePdfPreview(file);
  const isBusy = status === "converting";
  useReportBusy(isBusy ? 1 : 0);

  const estimate =
    preview.status === "ready" && file
      ? estimateBytes(preview.pages, dpi, file.size)
      : 0;
  const budget = memoryBudget(MEMORY_WARNING.pdfToPngPixels);
  const warningKey = file ? `${file.name}:${file.size}:${dpi}` : null;
  const overBudget = estimate > budget;
  const blockedByWarning = overBudget && acknowledged !== warningKey;
  const lowerDpi = DPI_OPTIONS.filter((option) => option < dpi).at(-1);

  const handleFiles = (files: File[]) => {
    const nextFile = files[0];
    if (!nextFile || isBusy) return;
    setStatus("idle");
    setProgress(0);
    setSelectedPage(null);
    if (!isPdfFile(nextFile)) {
      setError("PDF 파일만 넣을 수 있습니다 · 확장자가 .pdf인 파일을 고르세요");
      return;
    }
    setError(null);
    setFile(nextFile);
  };

  const handleConvert = async () => {
    if (!file || blockedByWarning) return;

    setStatus("converting");
    setError(null);
    setProgress(0);

    await trackClientEvent({
      type: "pdf_job_started",
      status: "started",
      tool: "pdf",
      mode: "pdf-to-png",
      filename: file.name,
      fileSize: file.size,
    });

    let pdf: PDFDocumentProxy | null = null;

    try {
      const pdfjs = await loadPdfjs();
      const bytes = await file.arrayBuffer();
      pdf = await pdfjs.getDocument({ data: bytes, ...PDFJS_DOCUMENT_OPTIONS })
        .promise;

      const baseName = sanitizeFilename(file.name.replace(/\.pdf$/i, ""));
      const pages: Array<{ name: string; blob: Blob }> = [];
      const canvas = document.createElement("canvas");

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = getSafeRenderScale(
          baseViewport.width,
          baseViewport.height,
          dpi / 72,
        );
        const viewport = page.getViewport({ scale });
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Canvas context를 만들 수 없습니다.");
        }

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        await page.render({ canvas, canvasContext: context, viewport }).promise;

        const blob = await canvasToBlob(canvas, "image/png");
        pages.push({
          name: `${baseName}-page-${String(pageNumber).padStart(2, "0")}.png`,
          blob,
        });

        page.cleanup();
        setProgress(pageNumber);
      }

      releaseCanvas(canvas);

      if (pages.length === 1) {
        saveAs(pages[0].blob, `${baseName}.png`);
      } else {
        const zip = new JSZip();
        pages.forEach(({ name, blob }) => zip.file(name, blob));
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, `${baseName}-png.zip`);
      }

      await trackClientEvent({
        type: "pdf_job_success",
        status: "success",
        tool: "pdf",
        mode: "pdf-to-png",
        filename: file.name,
        fileSize: file.size,
        pageCount: pdf.numPages,
      });

      setStatus("done");
    } catch (conversionError) {
      const message = isPasswordError(conversionError)
        ? "암호로 보호된 PDF는 변환할 수 없습니다 · 암호를 해제한 뒤 다시 넣으세요"
        : conversionError instanceof Error
          ? conversionError.message
          : "PDF를 변환하지 못했습니다";

      await trackClientEvent({
        type: "pdf_job_error",
        status: "error",
        tool: "pdf",
        mode: "pdf-to-png",
        filename: file.name,
        fileSize: file.size,
        error: message,
      });

      setStatus("error");
      setError(message);
    } finally {
      await pdf?.destroy();
    }
  };

  const pageCount = preview.pageCount;
  const boardPages = Math.min(pageCount, MAX_BOARD_PAGES);
  const expandedId = selectedPage ?? (pageCount > 0 ? "0" : null);
  const firstSize = preview.pages[0] ? outputSize(preview.pages[0], dpi) : null;

  const tiles: BoardTile[] = Array.from({ length: boardPages }, (_, index) => {
    const size = preview.pages[index]
      ? outputSize(preview.pages[index], dpi)
      : null;
    const converted = status === "done" || (isBusy && index < progress);
    return {
      id: String(index),
      name: `${index + 1}쪽`,
      group: "pages",
      status:
        isBusy && index === progress
          ? "processing"
          : converted
            ? "done"
            : "queued",
      meta: size ? `${size.width} × ${size.height}px` : "",
      thumbnailUrl: preview.thumbnails[index],
      thumbnail: preview.thumbnails[index] ? undefined : (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-muted">
          {index + 1}쪽
        </span>
      ),
      thumbnailContain: true,
      expandable: true,
      removable: false,
    };
  });

  const renderExpanded = (id: string) => {
    const index = Number(id);
    const page = preview.pages[index];
    if (!file || !page) return null;
    const size = outputSize(page, dpi);
    return (
      <FocusTile
        media={
          <div className="absolute inset-0 bg-surface-2">
            <PdfPagePreview
              key={index}
              preview={preview}
              index={index}
              alt={`${index + 1}쪽 미리보기`}
            />
          </div>
        }
        badge={{ tone: "neutral", label: `${index + 1} / ${pageCount}쪽` }}
        title={`${index + 1}쪽`}
        subtitle={file.name}
        sizeLine={`${size.width} × ${size.height}px`}
        details={[
          { label: "해상도", value: `${dpi} DPI` },
          {
            label: "페이지 크기",
            value: `${Math.round((page.width / 72) * 25.4)} × ${Math.round((page.height / 72) * 25.4)}mm`,
          },
        ]}
      />
    );
  };

  const summary = file
    ? [
        file.name,
        formatSize(file.size),
        pageCount > 0 && `${pageCount}쪽`,
        pageCount > 0 && `${pageCount > 1 ? "ZIP" : "PNG"}으로 저장`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "PDF 하나 · 용량 제한 없음 · 처리는 이 브라우저 안에서 합니다";

  const previewError =
    preview.status === "error"
      ? isPasswordError(preview.error)
        ? "암호로 보호된 PDF입니다 · 암호를 해제한 뒤 다시 넣으세요"
        : "PDF를 열지 못했습니다 · 파일이 손상되지 않았는지 확인하세요"
      : null;

  return (
    <ToolLayout
      title="PDF → PNG"
      summary={summary}
      settingsTitle="변환 설정"
      settings={
        <div>
          <span
            id="png-dpi-label"
            className="mb-2 block text-xs font-semibold text-muted"
          >
            해상도
          </span>
          <ChipGroup
            aria-labelledby="png-dpi-label"
            columns={2}
            disabled={isBusy}
            value={String(dpi)}
            onValueChange={(value) => setDpi(Number(value) as Dpi)}
            options={DPI_OPTIONS.map((option) => ({
              value: String(option),
              label: `${option} DPI`,
            }))}
          />
          <p className="mt-2 text-xs text-muted">
            {firstSize
              ? `1쪽 기준 ${firstSize.width} × ${firstSize.height}px로 저장합니다.`
              : "화면용은 144 DPI, 인쇄용은 300 DPI를 권장합니다."}
          </p>
        </div>
      }
      settingsFooter={
        <Dropzone
          compact
          accept={ACCEPT}
          multiple={false}
          disabled={isBusy}
          onFiles={handleFiles}
          title={file ? "다른 PDF 선택" : "PDF 선택"}
          hint="끌어 놓기·클릭 · 한 번에 하나"
        />
      }
      onDropFiles={handleFiles}
      primary={
        <Button
          variant="primary"
          onClick={() => void handleConvert()}
          disabled={!file || preview.status !== "ready" || blockedByWarning}
          loading={isBusy}
        >
          {isBusy
            ? `변환 중 ${progress} / ${pageCount}쪽`
            : status === "done"
              ? "다시 변환"
              : "변환 시작"}
        </Button>
      }
    >
      <p className="sr-only" aria-live="polite">
        {status === "done"
          ? `${pageCount}쪽 변환 완료, 저장을 시작했습니다`
          : status === "error"
            ? `실패, ${error}`
            : ""}
      </p>

      <div className="space-y-6">
        {overBudget && acknowledged !== warningKey && (
          <InlineAlert
            tone="warning"
            title={`예상 메모리 사용량이 약 ${formatSize(estimate)}입니다`}
            actions={
              <>
                {lowerDpi && (
                  <Button size="sm" onClick={() => setDpi(lowerDpi)}>
                    {lowerDpi} DPI로 낮추기
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAcknowledged(warningKey)}
                >
                  그래도 계속
                </Button>
              </>
            }
          >
            {pageCount}쪽을 {dpi} DPI로 모두 메모리에 올린 뒤 묶어 저장합니다.
            브라우저 메모리가 부족하면 탭이 멈추거나 새로고침될 수 있습니다.
          </InlineAlert>
        )}
        {(error || previewError) && (
          <InlineAlert
            tone="danger"
            title={error ?? previewError}
            actions={
              status === "error" ? (
                <Button size="sm" onClick={() => void handleConvert()}>
                  다시 시도
                </Button>
              ) : undefined
            }
          />
        )}
        {status === "done" && (
          <InlineAlert
            tone="success"
            title={`${pageCount}쪽을 ${pageCount > 1 ? "ZIP" : "PNG"}으로 저장했습니다`}
          >
            브라우저의 다운로드 목록에서 확인하세요. 해상도를 바꿔 다시 변환할
            수 있습니다.
          </InlineAlert>
        )}

        {!file ? (
          <EmptyWall
            title="페이지"
            first={
              <Dropzone
                accept={ACCEPT}
                multiple={false}
                onFiles={handleFiles}
                title="PDF를 끌어 놓거나 눌러서 선택하세요"
                hint="한 번에 하나 · 용량 제한 없음 · 파일은 서버로 보내지 않습니다"
                className="h-full min-h-0 py-6"
              />
            }
          />
        ) : preview.status !== "ready" ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-tile border border-line text-sm text-muted">
            <FileText className="size-6" aria-hidden="true" />
            {preview.status === "error"
              ? "PDF를 열지 못했습니다"
              : "PDF를 여는 중"}
          </div>
        ) : (
          <>
            <TileBoard
              tiles={tiles}
              groups={[{ key: "pages", title: "페이지" }]}
              expandedId={expandedId}
              onExpand={setSelectedPage}
              renderExpanded={renderExpanded}
              hint="방향키로 페이지 이동 · 페이지를 누르면 크게 봅니다"
            />
            {pageCount > MAX_BOARD_PAGES && (
              <p className="text-xs text-muted">
                앞쪽 {MAX_BOARD_PAGES}쪽만 목록에 보여 줍니다. 변환은 전체{" "}
                {pageCount}쪽에 적용됩니다.
              </p>
            )}
          </>
        )}
      </div>
    </ToolLayout>
  );
}

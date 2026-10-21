"use client";

// 이미지 여러 장을 지금 순서대로 A4 페이지에 맞춰 PDF 하나로 묶는 도구. 처리는 브라우저 안에서 한다.

import React, { useCallback, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { saveAs } from "file-saver";
import { ArrowLeft, ArrowRight, FileOutput, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropzone } from "@/components/ui/dropzone";
import { FocusTile } from "@/components/ui/focus-tile";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ToolLayout } from "@/components/ui/tool-layout";
import { TileBoard, type BoardTile } from "@/components/TileBoard";
import { OriginalPreview } from "@/components/ImageResultBoard";
import { useReportBusy } from "@/components/ToolActivity";
import { usePasteImages, useReleaseBlobUrls } from "@/components/toolHooks";
import { MEMORY_WARNING, memoryBudget } from "@/lib/memoryBudget";
import { readImageInfo } from "@/lib/thumbnail";
import { formatSize } from "@/lib/format";
import { trackClientEvent } from "@/utils/analyticsClient";

const ACCEPT = "image/png,image/jpeg,image/jpg,image/webp";

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const A4_WIDTH_PX = 1240;
const A4_HEIGHT_PX = 1754;
const JPEG_QUALITY = 0.82;

type ConversionStatus = "idle" | "compressing" | "done" | "error";
type PdfImageMime = "image/jpeg" | "image/png";

interface ImageQueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  /** 타일용 작은 미리보기(blob: URL) */
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  compressedSize?: number;
}

interface PreparedImage {
  bytes: ArrayBuffer;
  mimeType: PdfImageMime;
  originalName: string;
  originalSize: number;
  compressedSize: number;
  pageWidth: number;
  pageHeight: number;
}

function sanitizeFilename(name: string) {
  const normalized = name.normalize("NFC");
  const withoutExt = normalized.replace(/\.[^.]+$/i, "");
  let safe = withoutExt.replace(/[^\p{L}\p{N}._-]/gu, "-");
  if (!safe.replace(/-+/g, "").trim()) {
    safe = "images";
  }
  return safe;
}

function isSupportedImage(file: File) {
  return ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(
    file.type,
  );
}

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new Error(
          `${file.name}을 읽지 못했습니다 · 손상된 이미지인지 확인하세요`,
        ),
      );
    };
    image.src = url;
  });
}

function hasTransparency(imageData: ImageData) {
  const data = imageData.data;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 255) return true;
  }
  return false;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: PdfImageMime,
  quality?: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("이미지 압축에 실패했습니다."));
      },
      type,
      quality,
    );
  });
}

async function prepareImageForPdf(
  item: ImageQueueItem,
): Promise<PreparedImage> {
  const image = await loadImageFromFile(item.file);
  const isLandscape = image.naturalWidth > image.naturalHeight;
  const targetWidthPx = isLandscape ? A4_HEIGHT_PX : A4_WIDTH_PX;
  const targetHeightPx = isLandscape ? A4_WIDTH_PX : A4_HEIGHT_PX;
  const pageWidth = isLandscape ? A4_HEIGHT_PT : A4_WIDTH_PT;
  const pageHeight = isLandscape ? A4_WIDTH_PT : A4_HEIGHT_PT;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", {
    willReadFrequently: item.type === "image/png",
  });

  if (!context) {
    throw new Error("Canvas context를 만들 수 없습니다.");
  }

  canvas.width = targetWidthPx;
  canvas.height = targetHeightPx;
  context.clearRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min(
    targetWidthPx / image.naturalWidth,
    targetHeightPx / image.naturalHeight,
  );
  const drawWidthPx = Math.round(image.naturalWidth * scale);
  const drawHeightPx = Math.round(image.naturalHeight * scale);
  const offsetXPx = Math.round((targetWidthPx - drawWidthPx) / 2);
  const offsetYPx = Math.round((targetHeightPx - drawHeightPx) / 2);

  let outputMime: PdfImageMime = "image/jpeg";

  if (item.type === "image/png") {
    context.drawImage(image, offsetXPx, offsetYPx, drawWidthPx, drawHeightPx);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    outputMime = hasTransparency(imageData) ? "image/png" : "image/jpeg";
  }

  if (outputMime === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, offsetXPx, offsetYPx, drawWidthPx, drawHeightPx);
  }

  const blob = await canvasToBlob(
    canvas,
    outputMime,
    outputMime === "image/jpeg" ? JPEG_QUALITY : undefined,
  );
  const bytes = await blob.arrayBuffer();

  return {
    bytes,
    mimeType: outputMime,
    originalName: item.name,
    originalSize: item.size,
    compressedSize: blob.size,
    pageWidth,
    pageHeight,
  };
}

async function createPdfBlob(preparedImages: PreparedImage[]) {
  const pdfDoc = await PDFDocument.create();

  for (const prepared of preparedImages) {
    const embeddedImage =
      prepared.mimeType === "image/png"
        ? await pdfDoc.embedPng(prepared.bytes)
        : await pdfDoc.embedJpg(prepared.bytes);
    const page = pdfDoc.addPage([prepared.pageWidth, prepared.pageHeight]);
    page.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: prepared.pageWidth,
      height: prepared.pageHeight,
    });
  }

  const pdfBytes = await pdfDoc.save();
  const pdfBytesCopy = new Uint8Array(pdfBytes);
  return new Blob([pdfBytesCopy.buffer], { type: "application/pdf" });
}

export default function ImageToPdfConverter() {
  const [items, setItems] = useState<ImageQueueItem[]>([]);
  const [status, setStatus] = useState<ConversionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [outputSize, setOutputSize] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [acknowledgedTotal, setAcknowledgedTotal] = useState<number | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<ImageQueueItem[]>([]);

  const isBusy = status === "compressing";
  useReportBusy(isBusy ? 1 : 0);
  useReleaseBlobUrls(items.map((item) => item.thumbnailUrl));

  const commit = useCallback(
    (change: (current: ImageQueueItem[]) => ImageQueueItem[]) => {
      itemsRef.current = change(itemsRef.current);
      setItems(itemsRef.current);
    },
    [],
  );

  const totalOriginalSize = items.reduce((sum, item) => sum + item.size, 0);
  const overBudget =
    totalOriginalSize > memoryBudget(MEMORY_WARNING.imageToPdfTotal);
  // 확인한 뒤 파일을 더 넣어 합계가 늘면 다시 묻는다.
  const blockedByWarning =
    overBudget &&
    (acknowledgedTotal === null || totalOriginalSize > acknowledgedTotal);

  const resetResult = () => {
    setStatus("idle");
    setOutputSize(null);
    setError(null);
  };

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      if (isBusy) return;
      const nextFiles = Array.from(files);
      const supported = nextFiles.filter(isSupportedImage);
      setNotice(
        supported.length < nextFiles.length
          ? `PNG·JPG·WebP만 넣을 수 있어 ${nextFiles.length - supported.length}개를 제외했습니다`
          : null,
      );
      if (supported.length === 0) return;
      resetResult();

      const createdItems: ImageQueueItem[] = supported.map((file) => ({
        id: `${crypto.randomUUID()}-${file.name}`,
        file,
        name: file.name.normalize("NFC"),
        size: file.size,
        type: file.type === "image/jpg" ? "image/jpeg" : file.type,
      }));
      commit((current) => [...current, ...createdItems]);

      createdItems.forEach(async (item) => {
        const info = await readImageInfo(item.file);
        if (!itemsRef.current.some((entry) => entry.id === item.id)) {
          if (info?.thumbnailUrl) URL.revokeObjectURL(info.thumbnailUrl);
          return;
        }
        commit((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? info
                ? { ...entry, ...info }
                : { ...entry, width: 0, height: 0 }
              : entry,
          ),
        );
      });
    },
    [isBusy, commit],
  );
  usePasteImages(handleFiles);

  const removeItem = (id: string) => {
    commit((current) => current.filter((item) => item.id !== id));
    resetResult();
  };

  const moveItem = (id: string, direction: -1 | 1) => {
    commit((current) => {
      const index = current.findIndex((item) => item.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length)
        return current;
      const next = [...current];
      const [target] = next.splice(index, 1);
      next.splice(nextIndex, 0, target);
      return next;
    });
    resetResult();
  };

  const clearItems = () => {
    commit(() => []);
    resetResult();
    setSelectedId(null);
  };

  const handleConvertSingle = async (item: ImageQueueItem) => {
    if (isBusy) return;

    setStatus("compressing");
    setActiveItemId(item.id);
    setError(null);
    setOutputSize(null);

    await trackClientEvent({
      type: "pdf_job_started",
      status: "started",
      tool: "pdf",
      mode: "image-to-pdf-single",
      fileSize: item.size,
      pageCount: 1,
    });

    try {
      const prepared = await prepareImageForPdf(item);
      commit((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, compressedSize: prepared.compressedSize }
            : entry,
        ),
      );

      const pdfBlob = await createPdfBlob([prepared]);
      saveAs(pdfBlob, `${sanitizeFilename(item.name)}.pdf`);
      setOutputSize(pdfBlob.size);
      setStatus("done");

      await trackClientEvent({
        type: "pdf_job_success",
        status: "success",
        tool: "pdf",
        mode: "image-to-pdf-single",
        fileSize: prepared.originalSize,
        optimizedSize: pdfBlob.size,
        pageCount: 1,
      });
    } catch (conversionError) {
      const message =
        conversionError instanceof Error
          ? conversionError.message
          : "PDF를 만들지 못했습니다";

      await trackClientEvent({
        type: "pdf_job_error",
        status: "error",
        tool: "pdf",
        mode: "image-to-pdf-single",
        fileSize: item.size,
        pageCount: 1,
        error: message,
      });

      setStatus("error");
      setError(message);
    } finally {
      setActiveItemId(null);
    }
  };

  const handleConvert = async () => {
    if (items.length === 0 || isBusy || blockedByWarning) return;

    const orderedItems = [...items];
    setStatus("compressing");
    setActiveItemId(null);
    setError(null);
    setOutputSize(null);
    setProgress(0);

    await trackClientEvent({
      type: "pdf_job_started",
      status: "started",
      tool: "pdf",
      mode: "image-to-pdf",
      fileSize: orderedItems.reduce((sum, item) => sum + item.size, 0),
      pageCount: orderedItems.length,
    });

    try {
      const preparedImages: PreparedImage[] = [];

      for (const item of orderedItems) {
        const prepared = await prepareImageForPdf(item);
        preparedImages.push(prepared);
        setProgress(preparedImages.length);
        commit((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, compressedSize: prepared.compressedSize }
              : entry,
          ),
        );
      }

      const pdfBlob = await createPdfBlob(preparedImages);
      const baseName = sanitizeFilename(orderedItems[0]?.name ?? "images");

      saveAs(pdfBlob, `${baseName}-merged.pdf`);
      setOutputSize(pdfBlob.size);
      setStatus("done");

      await trackClientEvent({
        type: "pdf_job_success",
        status: "success",
        tool: "pdf",
        mode: "image-to-pdf",
        fileSize: preparedImages.reduce(
          (sum, item) => sum + item.originalSize,
          0,
        ),
        optimizedSize: pdfBlob.size,
        pageCount: preparedImages.length,
      });
    } catch (conversionError) {
      const message =
        conversionError instanceof Error
          ? conversionError.message
          : "PDF를 만들지 못했습니다";

      await trackClientEvent({
        type: "pdf_job_error",
        status: "error",
        tool: "pdf",
        mode: "image-to-pdf",
        fileSize: orderedItems.reduce((sum, item) => sum + item.size, 0),
        pageCount: orderedItems.length,
        error: message,
      });

      setStatus("error");
      setError(message);
    }
  };

  const expandedId = items.some((item) => item.id === selectedId)
    ? selectedId
    : null;

  const tiles: BoardTile[] = items.map((item, index) => {
    const busyHere =
      isBusy &&
      (activeItemId === item.id || (!activeItemId && index === progress));
    return {
      id: item.id,
      name: `${index + 1}. ${item.name}`,
      group: "pages",
      status: busyHere ? "processing" : "queued",
      meta: [
        formatSize(item.size),
        item.width && item.height ? `${item.width}×${item.height}` : null,
        item.compressedSize
          ? `PDF 안 ${formatSize(item.compressedSize)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      thumbnailUrl: item.thumbnailUrl,
      expandable: true,
      removable: !isBusy,
    };
  });

  const renderExpanded = (id: string) => {
    const index = items.findIndex((item) => item.id === id);
    const item = items[index];
    if (!item) return null;
    const landscape = (item.width ?? 0) > (item.height ?? 0);
    return (
      <FocusTile
        media={<OriginalPreview file={item.file} name={item.name} />}
        badge={{ tone: "neutral", label: `${index + 1} / ${items.length}쪽` }}
        title={item.name}
        subtitle={
          item.width && item.height
            ? `${item.width} × ${item.height}`
            : undefined
        }
        sizeLine={formatSize(item.size)}
        details={[
          { label: "PDF 페이지", value: landscape ? "A4 가로" : "A4 세로" },
          ...(item.compressedSize
            ? [{ label: "PDF 안 용량", value: formatSize(item.compressedSize) }]
            : []),
        ]}
        extra={
          <div className="flex gap-2 [&>*]:flex-1">
            <Button
              size="sm"
              onClick={() => moveItem(item.id, -1)}
              disabled={isBusy || index === 0}
            >
              <ArrowLeft aria-hidden="true" />
              앞으로
            </Button>
            <Button
              size="sm"
              onClick={() => moveItem(item.id, 1)}
              disabled={isBusy || index === items.length - 1}
            >
              뒤로
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        }
        actions={
          <>
            <Button
              variant="danger"
              onClick={() => removeItem(item.id)}
              disabled={isBusy}
            >
              <Trash2 aria-hidden="true" />
              제거
            </Button>
            <Button
              variant="inverse"
              onClick={() => void handleConvertSingle(item)}
              disabled={isBusy && activeItemId !== item.id}
              loading={activeItemId === item.id}
            >
              <FileOutput aria-hidden="true" />이 장만 PDF
            </Button>
          </>
        }
      />
    );
  };

  const summary =
    items.length === 0
      ? "PNG·JPG·WebP · 지금 순서대로 A4 PDF 하나로 묶습니다"
      : [
          `${items.length}쪽`,
          formatSize(totalOriginalSize),
          outputSize !== null &&
            status === "done" &&
            `PDF ${formatSize(outputSize)}`,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <ToolLayout
      title="이미지 → PDF"
      summary={summary}
      settingsTitle="PDF 설정"
      settings={
        <div className="space-y-3 text-sm">
          <p>
            세로 이미지는 A4 세로, 가로 이미지는 A4 가로 페이지에 비율을 지켜
            맞춥니다.
          </p>
          <p className="text-xs text-muted">
            사진은 JPEG(품질 82)로 다시 저장하고, 투명한 부분이 있는 PNG는 PNG로
            넣습니다. 페이지 순서는 목록 순서와 같습니다.
          </p>
        </div>
      }
      settingsFooter={
        <Dropzone
          compact
          accept={ACCEPT}
          disabled={isBusy}
          onFiles={handleFiles}
          title="이미지 추가"
          hint="끌어 놓기·클릭·Ctrl+V"
        />
      }
      onDropFiles={handleFiles}
      actions={
        <>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
            aria-keyshortcuts="Control+V"
          >
            <Plus aria-hidden="true" />
            이미지 추가 (Ctrl+V)
          </Button>
          <span
            className="mx-1 hidden h-6 w-px bg-line sm:block"
            aria-hidden="true"
          />
          <Button
            variant="ghost"
            onClick={clearItems}
            disabled={isBusy || items.length === 0}
          >
            비우기
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleConvert()}
            disabled={items.length === 0 || blockedByWarning}
            loading={isBusy && !activeItemId}
          >
            {isBusy && !activeItemId
              ? `PDF 만드는 중 ${progress} / ${items.length}`
              : `PDF 만들기${items.length > 0 ? ` (${items.length}쪽)` : ""}`}
          </Button>
        </>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        tabIndex={-1}
        onChange={(event) => {
          if (event.target.files) handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <p className="sr-only" aria-live="polite">
        {status === "done" && outputSize !== null
          ? `PDF 저장 완료, ${formatSize(outputSize)}`
          : status === "error"
            ? `실패, ${error}`
            : ""}
      </p>

      <div className="space-y-6">
        {notice && (
          <InlineAlert
            tone="warning"
            title={notice}
            onDismiss={() => setNotice(null)}
          />
        )}
        {blockedByWarning && (
          <InlineAlert
            tone="warning"
            title={`이미지 합계가 ${formatSize(totalOriginalSize)}입니다`}
            actions={
              <Button
                size="sm"
                onClick={() => setAcknowledgedTotal(totalOriginalSize)}
              >
                계속하기
              </Button>
            }
          >
            모든 이미지를 브라우저 메모리에서 다시 저장한 뒤 PDF로 묶습니다.
            메모리가 부족하면 탭이 멈추거나 새로고침될 수 있습니다.
          </InlineAlert>
        )}
        {error && (
          <InlineAlert
            tone="danger"
            title={error}
            actions={
              <Button size="sm" onClick={() => void handleConvert()}>
                다시 시도
              </Button>
            }
          />
        )}
        {status === "done" && outputSize !== null && (
          <InlineAlert
            tone="success"
            title={`PDF를 저장했습니다 · ${formatSize(outputSize)}`}
          >
            순서를 바꾸거나 이미지를 더해 다시 만들 수 있습니다.
          </InlineAlert>
        )}

        {items.length === 0 ? (
          <Dropzone
            accept={ACCEPT}
            onFiles={handleFiles}
            title="이미지를 끌어 놓거나 Ctrl+V로 붙여 넣으세요"
            hint="눌러서 파일 선택 · PNG·JPG·WebP · 넣은 순서가 페이지 순서가 됩니다"
            className="min-h-[min(60dvh,28rem)]"
          />
        ) : (
          <TileBoard
            tiles={tiles}
            groups={[{ key: "pages", title: "페이지 순서" }]}
            expandedId={expandedId}
            onExpand={setSelectedId}
            renderExpanded={renderExpanded}
            onRemove={removeItem}
            hint="타일에서 방향키로 이동 · 누르면 순서를 바꾸는 버튼이 나옵니다 · Delete로 제거"
          />
        )}
      </div>
    </ToolLayout>
  );
}

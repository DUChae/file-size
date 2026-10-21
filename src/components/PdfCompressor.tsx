"use client";

// PDF 안의 이미지를 다시 압축하거나(표준) 페이지를 이미지로 바꿔(강력) 용량을 줄이는 도구. 처리는 브라우저 안에서 한다.

import React, { useState } from "react";
import { saveAs } from "file-saver";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { Dropzone } from "@/components/ui/dropzone";
import { FocusTile } from "@/components/ui/focus-tile";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Slider } from "@/components/ui/slider";
import { ToolLayout } from "@/components/ui/tool-layout";
import { MediaTile } from "@/components/ui/media-tile";
import {
  PdfPagePreview,
  usePdfPreview,
  MAX_PDF_THUMBNAILS,
} from "@/components/usePdfPreview";
import { formatChange } from "@/components/ImageResultBoard";
import { useReportBusy } from "@/components/ToolActivity";
import { isPasswordError, isPdfFile } from "@/lib/pdfjs";
import { MEMORY_WARNING, memoryBudget } from "@/lib/memoryBudget";
import { formatSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  PdfCompressionMode,
  PdfCompressionResult,
  compressPdf,
} from "@/utils/pdfCompression";
import { trackClientEvent } from "@/utils/analyticsClient";

const DEFAULT_QUALITY = 75;
const IMAGE_SIDE_OPTIONS = [
  { value: "0", label: "원본 유지" },
  { value: "2400", label: "2400px" },
  { value: "1600", label: "1600px" },
  { value: "1200", label: "1200px" },
];
const RASTER_DPI_OPTIONS = ["72", "100", "150", "200"].map((value) => ({
  value,
  label: `${value} DPI`,
}));
const ACCEPT = ".pdf,application/pdf";

function isEncryptedError(error: unknown) {
  return (
    isPasswordError(error) ||
    (error instanceof Error && /encrypt/i.test(error.message))
  );
}

function SettingLabel({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <span id={id} className="mb-2 block text-xs font-semibold text-muted">
      {children}
    </span>
  );
}

export default function PdfCompressor() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<
    "idle" | "compressing" | "done" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<PdfCompressionMode>("standard");
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [maxImageSide, setMaxImageSide] = useState<number>(1600);
  const [rasterDpi, setRasterDpi] = useState<number>(150);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [result, setResult] = useState<PdfCompressionResult | null>(null);
  // 큰 파일 경고를 확인했는지(파일마다 다시 묻는다)
  const [acknowledged, setAcknowledged] = useState<File | null>(null);
  const preview = usePdfPreview(file);

  const isBusy = status === "compressing";
  useReportBusy(isBusy ? 1 : 0);

  const sizeWarning =
    file !== null && file.size > memoryBudget(MEMORY_WARNING.pdfCompressFile);
  const blockedByWarning = sizeWarning && acknowledged !== file;

  const handleFiles = (files: File[]) => {
    const nextFile = files[0];
    if (!nextFile || isBusy) return;
    setStatus("idle");
    setResult(null);
    setProgress(null);
    if (!isPdfFile(nextFile)) {
      setError("PDF 파일만 넣을 수 있습니다 · 확장자가 .pdf인 파일을 고르세요");
      return;
    }
    setError(null);
    setFile(nextFile);
  };

  const handleCompress = async () => {
    if (!file || blockedByWarning) return;

    setStatus("compressing");
    setError(null);
    setResult(null);
    setProgress(null);

    const analyticsMode = `compress-${mode}`;
    await trackClientEvent({
      type: "pdf_job_started",
      status: "started",
      tool: "pdf",
      mode: analyticsMode,
      filename: file.name,
      fileSize: file.size,
    });

    try {
      const nextResult = await compressPdf(file, {
        mode,
        quality,
        maxImageSide,
        rasterDpi,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResult(nextResult);
      setStatus("done");

      await trackClientEvent({
        type: "pdf_job_success",
        status: "success",
        tool: "pdf",
        mode: analyticsMode,
        filename: file.name,
        fileSize: file.size,
        optimizedSize: Math.min(nextResult.compressedSize, file.size),
        pageCount: nextResult.pageCount,
      });
    } catch (compressionError) {
      const message = isEncryptedError(compressionError)
        ? "암호로 보호된 PDF는 압축할 수 없습니다 · 암호를 해제한 뒤 다시 넣으세요"
        : compressionError instanceof Error
          ? compressionError.message
          : "PDF를 압축하지 못했습니다";

      await trackClientEvent({
        type: "pdf_job_error",
        status: "error",
        tool: "pdf",
        mode: analyticsMode,
        filename: file.name,
        fileSize: file.size,
        error: message,
      });

      setStatus("error");
      setError(message);
    }
  };

  const handleDownload = () => {
    if (!file || !result) return;
    const baseName = file.name.normalize("NFC").replace(/\.pdf$/i, "");
    saveAs(
      new Blob([result.bytes as Uint8Array<ArrayBuffer>], {
        type: "application/pdf",
      }),
      `${baseName}-compressed.pdf`,
    );
  };

  const isSmaller = !!result && result.compressedSize < result.originalSize;
  const previewError =
    preview.status === "error"
      ? isPasswordError(preview.error)
        ? "암호로 보호된 PDF입니다 · 암호를 해제한 뒤 다시 넣으세요"
        : "미리보기를 만들지 못했습니다 · 압축은 시도할 수 있습니다"
      : null;

  const progressLabel = progress
    ? `${mode === "strong" ? "페이지" : "이미지"} ${progress.done} / ${progress.total}`
    : "분석 중";

  const summary = file
    ? [
        file.name,
        formatSize(file.size),
        preview.pageCount > 0 && `${preview.pageCount}쪽`,
        result && `결과 ${formatSize(result.compressedSize)}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "PDF 하나 · 용량 제한 없음 · 처리는 이 브라우저 안에서 합니다";

  const settings = (
    <>
      <div>
        <SettingLabel id="pdf-mode-label">압축 방식</SettingLabel>
        <SegmentedControl
          aria-labelledby="pdf-mode-label"
          value={mode}
          onValueChange={setMode}
          disabled={isBusy}
          options={[
            { value: "standard", label: "표준 압축" },
            { value: "strong", label: "강력 압축" },
          ]}
        />
        <p
          className={cn(
            "mt-2 text-xs",
            mode === "strong" ? "text-warning" : "text-muted",
          )}
        >
          {mode === "standard"
            ? "내장 이미지만 다시 압축합니다. 텍스트 선택·검색·링크가 그대로 남습니다."
            : "모든 페이지를 이미지로 바꿔 크게 줄입니다. 텍스트 선택·검색과 링크가 사라집니다."}
        </p>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <SettingLabel>품질</SettingLabel>
          <span className="text-base font-semibold">{quality}</span>
        </div>
        <Slider
          min={1}
          max={100}
          step={1}
          value={[quality]}
          onValueChange={([value]) => setQuality(value)}
          disabled={isBusy}
          aria-label="품질"
        />
        <div className="flex justify-between text-xs text-muted">
          <span>작은 용량</span>
          <span>높은 화질</span>
        </div>
      </div>

      {mode === "standard" ? (
        <div>
          <SettingLabel id="pdf-side-label">
            최대 이미지 해상도 (긴 변)
          </SettingLabel>
          <ChipGroup
            aria-labelledby="pdf-side-label"
            columns={2}
            disabled={isBusy}
            value={String(maxImageSide)}
            onValueChange={(value) => setMaxImageSide(Number(value))}
            options={IMAGE_SIDE_OPTIONS}
          />
          <p className="mt-2 text-xs text-muted">
            A4 기준 1600px ≈ 137dpi, 2400px ≈ 205dpi. 화면용은 1600px, 인쇄용은
            2400px 이상을 권장합니다.
          </p>
        </div>
      ) : (
        <div>
          <SettingLabel id="pdf-dpi-label">렌더링 해상도</SettingLabel>
          <ChipGroup
            aria-labelledby="pdf-dpi-label"
            columns={2}
            disabled={isBusy}
            value={String(rasterDpi)}
            onValueChange={(value) => setRasterDpi(Number(value))}
            options={RASTER_DPI_OPTIONS}
          />
          <p className="mt-2 text-xs text-muted">
            화면용은 100~150 DPI, 인쇄용은 200 DPI를 권장합니다.
          </p>
        </div>
      )}
    </>
  );

  const badge =
    status === "done"
      ? isSmaller
        ? { tone: "success" as const, label: "완료" }
        : { tone: "warning" as const, label: "더 줄일 수 없음" }
      : status === "error"
        ? { tone: "warning" as const, label: "실패" }
        : { tone: "neutral" as const, label: isBusy ? "압축 중" : "대기" };

  return (
    <ToolLayout
      title="PDF 압축"
      summary={summary}
      settingsTitle="압축 설정"
      settings={settings}
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
      actions={
        <>
          {status === "done" && isSmaller && (
            <Button onClick={handleDownload}>
              <Download aria-hidden="true" />
              저장
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => void handleCompress()}
            disabled={!file || blockedByWarning}
            loading={isBusy}
          >
            {isBusy
              ? `압축 중 · ${progressLabel}`
              : status === "done"
                ? "다시 압축"
                : "압축 시작"}
          </Button>
        </>
      }
    >
      <p className="sr-only" aria-live="polite">
        {status === "done"
          ? isSmaller
            ? `압축 완료, ${formatSize(result!.originalSize)}에서 ${formatSize(result!.compressedSize)}로 줄었습니다`
            : "이미 최적화된 PDF라 더 줄일 수 없습니다"
          : status === "error"
            ? `실패, ${error}`
            : ""}
      </p>

      <div className="space-y-6">
        {sizeWarning && acknowledged !== file && (
          <InlineAlert
            tone="warning"
            title={`${formatSize(file.size)} PDF는 브라우저 메모리를 많이 씁니다`}
            actions={
              <Button size="sm" onClick={() => setAcknowledged(file)}>
                계속하기
              </Button>
            }
          >
            이 파일은 브라우저 안에서 통째로 다시 저장합니다. 메모리가 부족하면
            탭이 멈추거나 새로고침될 수 있습니다.
          </InlineAlert>
        )}
        {error && (
          <InlineAlert
            tone="danger"
            title={error}
            actions={
              file && status === "error" ? (
                <Button size="sm" onClick={() => void handleCompress()}>
                  다시 시도
                </Button>
              ) : undefined
            }
          />
        )}
        {status === "done" && !isSmaller && (
          <InlineAlert
            tone="info"
            title="이미 최적화된 PDF라 더 줄일 수 없습니다"
          >
            {mode === "standard"
              ? "품질이나 최대 해상도를 낮추거나, 강력 압축을 시도해 보세요."
              : "렌더링 해상도나 품질을 낮춰 보세요."}
          </InlineAlert>
        )}

        {!file ? (
          <Dropzone
            accept={ACCEPT}
            multiple={false}
            onFiles={handleFiles}
            title="PDF를 끌어 놓거나 눌러서 선택하세요"
            hint="한 번에 하나 · 용량 제한 없음 · 파일은 서버로 보내지 않습니다"
            className="min-h-[min(60dvh,28rem)]"
          />
        ) : (
          <>
            <FocusTile
              media={
                <div className="absolute inset-0 bg-surface-2">
                  {preview.status === "ready" ? (
                    <PdfPagePreview
                      preview={preview}
                      index={0}
                      alt={`${file.name} 1쪽`}
                    />
                  ) : (
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted">
                      <FileText className="size-6" aria-hidden="true" />
                      {preview.status === "error"
                        ? previewError
                        : "PDF를 여는 중"}
                    </span>
                  )}
                  {isBusy && (
                    <span
                      role="progressbar"
                      aria-label="PDF 압축 진행률"
                      aria-valuemin={0}
                      aria-valuemax={progress?.total ?? 100}
                      aria-valuenow={progress?.done}
                      className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-bg/70"
                    >
                      {progress ? (
                        <span
                          className="block h-full bg-text transition-[width] duration-300"
                          style={{
                            width: `${(progress.done / Math.max(1, progress.total)) * 100}%`,
                          }}
                        />
                      ) : (
                        <span className="absolute inset-y-0 w-1/3 animate-indeterminate bg-text" />
                      )}
                    </span>
                  )}
                </div>
              }
              badge={badge}
              title={file.name}
              subtitle={[
                preview.pageCount > 0 && `${preview.pageCount}쪽`,
                formatSize(file.size),
              ]
                .filter(Boolean)
                .join(" · ")}
              metric={
                result && isSmaller
                  ? formatChange(result.originalSize, result.compressedSize)
                  : undefined
              }
              sizeLine={
                result
                  ? `${formatSize(result.originalSize)} → ${formatSize(result.compressedSize)}`
                  : isBusy
                    ? progressLabel
                    : undefined
              }
              details={
                result
                  ? [
                      {
                        label: "방식",
                        value: mode === "standard" ? "표준 압축" : "강력 압축",
                      },
                      ...(mode === "standard"
                        ? [
                            {
                              label: "재압축한 이미지",
                              value: `${result.imagesRecompressed}개`,
                            },
                            {
                              label: "그대로 둔 이미지",
                              value: `${result.imagesSkipped}개`,
                            },
                          ]
                        : [
                            {
                              label: "렌더링 해상도",
                              value: `${rasterDpi} DPI`,
                            },
                          ]),
                    ]
                  : previewError
                    ? [{ label: "미리보기", value: previewError }]
                    : undefined
              }
              actions={
                status === "done" && isSmaller ? (
                  <Button variant="inverse" onClick={handleDownload}>
                    <Download aria-hidden="true" />
                    저장
                  </Button>
                ) : undefined
              }
            />

            {preview.pageCount > 1 && (
              <section aria-labelledby="pdf-pages-title" className="space-y-3">
                <h2
                  id="pdf-pages-title"
                  className="flex items-baseline gap-1.5 text-base font-bold"
                >
                  페이지
                  <span className="font-medium text-muted">
                    ({preview.pageCount})
                  </span>
                </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-4">
                  {Array.from(
                    { length: Math.min(preview.pageCount, MAX_PDF_THUMBNAILS) },
                    (_, index) => (
                      <MediaTile
                        key={index}
                        name={`${index + 1}쪽`}
                        status="done"
                        thumbnailUrl={preview.thumbnails[index]}
                        thumbnail={
                          preview.thumbnails[index] ? undefined : (
                            <span className="absolute inset-0 animate-pulse bg-surface-2" />
                          )
                        }
                        thumbnailContain
                        announceStatus={false}
                      />
                    ),
                  )}
                </div>
                {preview.pageCount > MAX_PDF_THUMBNAILS && (
                  <p className="text-xs text-muted">
                    앞쪽 {MAX_PDF_THUMBNAILS}쪽만 미리 보여 줍니다. 압축은 전체{" "}
                    {preview.pageCount}
                    쪽에 적용됩니다.
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </ToolLayout>
  );
}

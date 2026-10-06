"use client";

import React, { useState } from "react";
import { saveAs } from "file-saver";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  FileSearch,
  FileDown,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Download,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isPasswordError, isPdfFile } from "@/lib/pdfjs";
import {
  PdfCompressionMode,
  PdfCompressionResult,
  compressPdf,
} from "@/utils/pdfCompression";

const MAX_PDF_SIZE = 100 * 1024 * 1024;
const DEFAULT_QUALITY = 75;
const IMAGE_SIDE_OPTIONS = [
  { value: 0, label: "원본 유지" },
  { value: 2400, label: "2400px" },
  { value: 1600, label: "1600px" },
  { value: 1200, label: "1200px" },
] as const;
const RASTER_DPI_OPTIONS = [72, 100, 150, 200] as const;

function formatSize(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

async function trackPdfEvent(payload: Record<string, unknown>) {
  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Ignore analytics failures in the client.
  }
}

function isEncryptedError(error: unknown) {
  return (
    isPasswordError(error) ||
    (error instanceof Error && /encrypt/i.test(error.message))
  );
}

export default function PdfCompressor() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "compressing" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<PdfCompressionMode>("standard");
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [maxImageSide, setMaxImageSide] = useState<number>(1600);
  const [rasterDpi, setRasterDpi] = useState<number>(150);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<PdfCompressionResult | null>(null);

  const isBusy = status === "compressing";

  const handleFileChange = (nextFile: File | null) => {
    setError(null);
    setStatus("idle");
    setResult(null);
    setProgress(null);

    if (!nextFile) {
      setFile(null);
      return;
    }

    if (!isPdfFile(nextFile)) {
      setFile(null);
      setError("PDF 파일만 업로드할 수 있습니다.");
      return;
    }

    if (nextFile.size > MAX_PDF_SIZE) {
      setFile(null);
      setError(`PDF 파일은 ${formatSize(MAX_PDF_SIZE)} 이하여야 합니다.`);
      return;
    }

    setFile(nextFile);
  };

  const handleCompress = async () => {
    if (!file) return;

    setStatus("compressing");
    setError(null);
    setResult(null);
    setProgress(null);

    const analyticsMode = `compress-${mode}`;
    await trackPdfEvent({
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

      await trackPdfEvent({
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
        ? "암호로 보호된 PDF는 압축할 수 없습니다. 암호를 해제한 뒤 다시 시도해주세요."
        : compressionError instanceof Error
          ? compressionError.message
          : "PDF 압축에 실패했습니다.";

      await trackPdfEvent({
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
      new Blob([result.bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
      `${baseName}-compressed.pdf`,
    );
  };

  const isSmaller = !!result && result.compressedSize < result.originalSize;
  const reduction = result
    ? ((result.originalSize - result.compressedSize) / result.originalSize) * 100
    : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-16 py-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-12 pb-16 border-b border-white/5">
        <div className="space-y-6 max-w-2xl">
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-teal-300 flex items-center gap-2">
              <FileDown className="w-4 h-4" />
              Document Processing
            </h4>
            <h2 className="text-4xl font-black text-white tracking-ultra-tight uppercase">
              PDF Compression
            </h2>
          </div>
          <p className="text-base text-slate-400 font-medium leading-relaxed">
            PDF 안의 이미지를 다시 압축해 용량을 줄입니다. 텍스트와 벡터는 그대로 유지되며, 모든
            처리는 브라우저 안에서만 이루어집니다.
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(event) => {
                handleFileChange(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="lg"
              asChild
              className="rounded-full border-white/10 hover:bg-white/5 text-white h-14 px-10"
            >
              <div className="cursor-pointer font-black text-xs tracking-widest">
                <FileSearch className="w-5 h-5 mr-3" />
                SELECT PDF
              </div>
            </Button>
          </label>
          <Button
            variant="blue"
            size="lg"
            onClick={handleCompress}
            disabled={!file || isBusy}
            className="rounded-2xl h-14 px-8 text-xs font-black tracking-widest active:scale-[0.98]"
          >
            {isBusy ? (
              <>
                <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                PROCESSING
              </>
            ) : (
              <>
                <FileDown className="w-5 h-5 mr-3" />
                COMPRESS NOW
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <div className="space-y-8 rounded-3xl border border-white/10 bg-white/[0.025] p-6 md:p-8">
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-slate-500">Mode</h4>
            <div className="grid grid-cols-2 gap-2 p-1.5 bg-black/20 border border-white/10 rounded-2xl">
              {(
                [
                  { id: "standard", label: "표준 압축" },
                  { id: "strong", label: "강력 압축" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  onClick={() => setMode(option.id)}
                  disabled={isBusy}
                  className={cn(
                    "py-3 rounded-xl text-xs font-black transition-all active:scale-[0.98] disabled:opacity-40",
                    mode === option.id ? "bg-white text-black shadow-xl" : "text-slate-500 hover:text-white",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {mode === "standard" ? (
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                내장 이미지만 다시 압축합니다. 텍스트 선택·검색·링크가 그대로 유지됩니다.
              </p>
            ) : (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
                <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-100/80 font-medium leading-relaxed">
                  모든 페이지를 이미지로 바꿔 크게 줄입니다. 텍스트 선택·검색과 링크가 사라집니다.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-4 pt-6 border-t border-white/10">
            <div className="flex items-end justify-between">
              <h4 className="text-xs font-semibold text-slate-500">Quality</h4>
              <span className="text-2xl font-black text-teal-300 tabular-nums leading-none">
                {quality}%
              </span>
            </div>
            <Slider
              min={1}
              max={100}
              step={1}
              value={[quality]}
              onValueChange={([value]) => setQuality(value)}
              disabled={isBusy}
              aria-label="Quality"
            />
            <div className="flex justify-between text-[10px] font-bold text-slate-600 uppercase tracking-wider">
              <span>작은 용량</span>
              <span>높은 화질</span>
            </div>
          </div>
        </div>

        <div className="space-y-8 rounded-3xl border border-white/10 bg-white/[0.025] p-6 md:p-8">
          {mode === "standard" ? (
            <div className="space-y-4">
              <h4 className="text-xs font-semibold text-slate-500">최대 이미지 해상도 (긴 변)</h4>
              <div className="grid grid-cols-4 gap-2 p-1.5 bg-black/20 border border-white/10 rounded-2xl">
                {IMAGE_SIDE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setMaxImageSide(option.value)}
                    disabled={isBusy}
                    className={cn(
                      "py-3 rounded-xl text-[11px] font-black transition-all active:scale-[0.98] disabled:opacity-40",
                      maxImageSide === option.value ? "bg-white text-black shadow-xl" : "text-slate-500 hover:text-white",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                A4 기준 1600px ≈ 137dpi, 2400px ≈ 205dpi. 화면용은 1600px, 인쇄용은 2400px 이상을 권장합니다.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <h4 className="text-xs font-semibold text-slate-500">렌더링 해상도</h4>
              <div className="grid grid-cols-4 gap-2 p-1.5 bg-black/20 border border-white/10 rounded-2xl">
                {RASTER_DPI_OPTIONS.map((option) => (
                  <button
                    key={option}
                    onClick={() => setRasterDpi(option)}
                    disabled={isBusy}
                    className={cn(
                      "py-3 rounded-xl text-[11px] font-black transition-all active:scale-[0.98] disabled:opacity-40",
                      rasterDpi === option ? "bg-white text-black shadow-xl" : "text-slate-500 hover:text-white",
                    )}
                  >
                    {option} DPI
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                화면용은 100~150dpi, 인쇄용은 200dpi를 권장합니다.
              </p>
            </div>
          )}

          <div className="space-y-3 pt-6 border-t border-white/10">
            <div className="text-xs font-semibold text-slate-500">Source Document</div>
            <div className="text-sm text-white font-bold truncate flex items-center gap-3">
              <div className={cn("w-2 h-2 rounded-full", file ? "bg-teal-300" : "bg-slate-800")} />
              {file ? `${file.name} (${formatSize(file.size)})` : "No selection"}
            </div>
            <div
              className={cn(
                "text-xs font-black flex items-center gap-3 uppercase tracking-widest",
                status === "done"
                  ? "text-green-500"
                  : status === "error"
                    ? "text-red-500"
                    : status === "compressing"
                      ? "text-teal-300"
                      : "text-slate-500",
              )}
            >
              {status === "idle" && "Ready"}
              {status === "compressing" && <Loader2 className="w-4 h-4 animate-spin" />}
              {status === "compressing" &&
                (progress
                  ? `${mode === "strong" ? "Page" : "Image"} ${progress.done} / ${progress.total}`
                  : "Analyzing...")}
              {status === "done" && <CheckCircle2 className="w-4 h-4" />}
              {status === "done" && "Complete"}
              {status === "error" && <AlertCircle className="w-4 h-4" />}
              {status === "error" && "Engine Error"}
            </div>
          </div>
        </div>
      </div>

      {result && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-8 flex flex-col md:flex-row md:items-center justify-between gap-8 animate-fade-in">
          <div className="space-y-3">
            <div className="text-xs font-black text-slate-600 uppercase tracking-widest">Result</div>
            <div className="text-3xl font-black text-white tabular-nums">
              {formatSize(result.originalSize)} → {formatSize(result.compressedSize)}
              {isSmaller && (
                <span className="ml-4 text-teal-300">-{reduction.toFixed(1)}%</span>
              )}
            </div>
            <div className="text-xs font-bold text-slate-500">
              {result.pageCount} pages
              {mode === "standard" &&
                ` · 이미지 ${result.imagesTotal}개 중 ${result.imagesRecompressed}개 재압축, ${result.imagesSkipped}개 유지`}
            </div>
            {!isSmaller && (
              <p className="text-sm text-amber-200/80 font-medium">
                이미 최적화된 PDF라 더 줄일 수 없습니다.
                {mode === "standard" && " 품질을 낮추거나 강력 압축을 시도해보세요."}
              </p>
            )}
          </div>
          {isSmaller && (
            <Button
              size="lg"
              onClick={handleDownload}
              className="rounded-2xl h-14 px-8 text-xs font-black tracking-widest bg-white text-black hover:bg-teal-100 active:scale-[0.98]"
            >
              <Download className="w-5 h-5 mr-3" />
              DOWNLOAD PDF
            </Button>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/10 bg-red-500/[0.04] p-8 flex items-start gap-6 animate-fade-in shadow-2xl">
          <AlertCircle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h5 className="text-sm font-black text-red-500 uppercase tracking-widest">System Alert</h5>
            <p className="text-base text-red-200/80 font-medium leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-6 text-slate-600 bg-white/[0.01] p-6 rounded-2xl border border-white/5">
        <Info className="w-5 h-5 shrink-0" />
        <p className="text-xs font-bold uppercase tracking-[0.15em] leading-relaxed">
          Up to 100MB. All processing remains private and occurs locally within your browser.
        </p>
      </div>
    </div>
  );
}

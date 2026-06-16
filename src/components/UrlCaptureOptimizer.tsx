"use client";

import React, { useCallback, useRef, useState } from "react";
import { saveAs } from "file-saver";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  Globe2,
  Grip,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CompressionRequest,
  CompressionResponse,
  OutputFormat,
  UrlCaptureResponse,
} from "@/types/image";

type CaptureState = "idle" | "capturing" | "captured" | "compressing" | "done" | "error";

interface OptimizedResult {
  filename: string;
  url: string;
  downloadUrl: string;
  originalSize: number;
  optimizedSize: number;
}

const FORMAT_OPTIONS: Array<Exclude<OutputFormat, "original" | "gif">> = [
  "png",
  "jpeg",
  "webp",
  "avif",
];

function formatSize(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export default function UrlCaptureOptimizer() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<CaptureState>("idle");
  const [error, setError] = useState("");
  const [capture, setCapture] = useState<UrlCaptureResponse | null>(null);
  const [targetFormat, setTargetFormat] = useState<OutputFormat>("png");
  const [targetWidth, setTargetWidth] = useState(0);
  const [targetHeight, setTargetHeight] = useState(0);
  const [result, setResult] = useState<OptimizedResult | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const resetResult = useCallback(() => {
    setResult(null);
    if (status === "done") {
      setStatus("captured");
    }
  }, [status]);

  const handleCapture = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("capturing");
    setError("");
    setCapture(null);
    setResult(null);

    try {
      const response = await fetch("/api/capture-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as UrlCaptureResponse;

      if (!response.ok || !data.success || !data.sourceUrl || !data.width || !data.height) {
        throw new Error(data.error || "Failed to capture the page.");
      }

      setCapture(data);
      setTargetWidth(data.width);
      setTargetHeight(data.height);
      setStatus("captured");
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "Capture failed.");
      setStatus("error");
    }
  };

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!capture?.width || !capture.height || !previewRef.current) return;

      event.preventDefault();
      const captureWidth = capture.width;
      const captureHeight = capture.height;
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = targetWidth;
      const startHeight = targetHeight;
      const previewRect = previewRef.current.getBoundingClientRect();
      const widthScale = captureWidth / previewRect.width;
      const heightScale = captureHeight / previewRect.height;

      const handleMove = (moveEvent: PointerEvent) => {
        const nextWidth = Math.round(startWidth + (moveEvent.clientX - startX) * widthScale);
        const nextHeight = Math.round(startHeight + (moveEvent.clientY - startY) * heightScale);
        setTargetWidth(Math.max(320, Math.min(captureWidth, nextWidth)));
        setTargetHeight(Math.max(240, Math.min(captureHeight, nextHeight)));
        resetResult();
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [capture, resetResult, targetHeight, targetWidth],
  );

  const handleCompress = async () => {
    if (!capture?.sourceUrl || !capture.filename || !capture.mimeType || !capture.captureId) return;

    setStatus("compressing");
    setError("");
    setResult(null);

    const payload: CompressionRequest = {
      sourceUrl: capture.sourceUrl,
      filename: capture.filename,
      mimeType: capture.mimeType,
      category: "screenshot",
      targetFormat,
      webWidth: targetWidth,
      webHeight: targetHeight,
      uploadId: capture.captureId,
      preserveSource: true,
    };

    try {
      const response = await fetch("/api/compress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as CompressionResponse;

      if (!response.ok || !data.success || !data.outputUrl || !data.outputDownloadUrl || !data.optimizedSize) {
        throw new Error(data.error || "Compression failed.");
      }

      setResult({
        filename: data.outputFilename,
        url: data.outputUrl,
        downloadUrl: data.outputDownloadUrl,
        originalSize: data.originalSize,
        optimizedSize: data.optimizedSize,
      });
      setStatus("done");
    } catch (compressError) {
      setError(compressError instanceof Error ? compressError.message : "Compression failed.");
      setStatus("error");
    }
  };

  const reductionRate = result
    ? ((result.originalSize - result.optimizedSize) / result.originalSize) * 100
    : null;
  const previewWidthPercent = capture?.width ? (targetWidth / capture.width) * 100 : 100;
  const previewHeightPercent = capture?.height ? (targetHeight / capture.height) * 100 : 100;

  return (
    <div className="max-w-5xl mx-auto space-y-16">
      <form onSubmit={handleCapture} className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
        <div className="flex items-center gap-4 bg-white/[0.03] border border-white/10 rounded-2xl px-5">
          <Globe2 className="w-5 h-5 text-slate-500 shrink-0" />
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com"
            className="w-full bg-transparent py-5 text-sm font-bold text-white outline-none placeholder:text-slate-700"
          />
        </div>
        <Button
          type="submit"
          variant="blue"
          size="xl"
          disabled={!url.trim() || status === "capturing" || status === "compressing"}
          className="rounded-2xl"
        >
          {status === "capturing" ? <Loader2 className="animate-spin" /> : <Maximize2 />}
          전체 페이지 캡처
        </Button>
      </form>

      {error && (
        <div className="border border-red-500/20 bg-red-500/10 text-red-200 rounded-2xl px-5 py-4 text-sm font-bold">
          {error}
        </div>
      )}

      {capture?.sourceUrl && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-10 items-start">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black text-white tracking-tight">Page Preview</h3>
                <p className="text-xs text-slate-500 font-black uppercase tracking-[0.25em] mt-2">
                  {capture.width} x {capture.height}px / {formatSize(capture.size || 0)}
                </p>
              </div>
              {capture.downloadUrl && capture.filename && (
                <button
                  onClick={() => {
                    if (capture.downloadUrl && capture.filename) {
                      saveAs(capture.downloadUrl, capture.filename);
                    }
                  }}
                  className="flex items-center gap-2 text-xs font-black text-white bg-white/5 border border-white/10 rounded-full px-5 py-3 hover:bg-white/10 transition-all"
                >
                  <Download className="w-4 h-4" />
                  원본 다운로드
                </button>
              )}
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/40 p-4 overflow-auto max-h-[720px]">
              <div
                ref={previewRef}
                className="relative mx-auto overflow-hidden rounded-2xl border border-white/10 bg-white/5"
                style={{ width: "min(100%, 720px)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={capture.sourceUrl}
                  alt="Captured webpage preview"
                  className="block w-full select-none"
                  draggable={false}
                />
                <div
                  className="absolute left-0 top-0 border-2 border-blue-400 bg-blue-500/10 shadow-[0_0_40px_rgba(59,130,246,0.25)]"
                  style={{
                    width: `${previewWidthPercent}%`,
                    height: `${previewHeightPercent}%`,
                    maxWidth: "100%",
                    maxHeight: "100%",
                  }}
                >
                  <button
                    type="button"
                    onPointerDown={handleResizeStart}
                    className="absolute -bottom-4 -right-4 h-9 w-9 rounded-full bg-blue-500 text-white border border-white/30 flex items-center justify-center cursor-nwse-resize shadow-xl"
                    title="출력 크기 조절"
                  >
                    <Grip className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8 bg-white/[0.02] border border-white/10 rounded-[28px] p-6">
            <div className="space-y-3">
              <h4 className="text-xs font-black text-white uppercase tracking-[0.35em] opacity-50">
                Output Size
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                  <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">
                    Width
                  </div>
                  <div className="text-xl font-black text-white">{targetWidth}px</div>
                </div>
                <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                  <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">
                    Height
                  </div>
                  <div className="text-xl font-black text-white">{targetHeight}px</div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-black text-white uppercase tracking-[0.35em] opacity-50">
                Export Format
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {FORMAT_OPTIONS.map((format) => (
                  <button
                    key={format}
                    onClick={() => {
                      setTargetFormat(format);
                      resetResult();
                    }}
                    className={cn(
                      "rounded-xl px-4 py-3 text-xs font-black uppercase tracking-wider transition-all",
                      targetFormat === format
                        ? "bg-white text-black"
                        : "bg-white/[0.04] text-slate-500 hover:text-white",
                    )}
                  >
                    {format}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleCompress}
              variant="blue"
              size="xl"
              disabled={status === "compressing"}
              className="w-full rounded-2xl"
            >
              {status === "compressing" ? <Loader2 className="animate-spin" /> : <ArrowRight />}
              이미지 압축
            </Button>

            {result && (
              <div className="space-y-4 border-t border-white/10 pt-6">
                <div className="flex items-center gap-3 text-green-400 text-sm font-black">
                  <CheckCircle2 className="w-5 h-5" />
                  압축 완료
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs font-black">
                  <div className="rounded-xl bg-white/[0.03] p-4 text-slate-500">
                    BEFORE
                    <div className="text-white text-lg mt-1">{formatSize(result.originalSize)}</div>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] p-4 text-slate-500">
                    AFTER
                    <div className="text-white text-lg mt-1">{formatSize(result.optimizedSize)}</div>
                  </div>
                </div>
                {reductionRate !== null && (
                  <div className="text-xs font-black text-blue-300 uppercase tracking-widest">
                    {reductionRate >= 0 ? "-" : "+"}
                    {Math.abs(reductionRate).toFixed(1)}% SIZE CHANGE
                  </div>
                )}
                <button
                  onClick={() => saveAs(result.downloadUrl, result.filename)}
                  className="w-full flex items-center justify-center gap-3 rounded-2xl bg-white text-black px-6 py-4 text-sm font-black hover:scale-[1.01] active:scale-[0.99] transition-all"
                >
                  <Download className="w-5 h-5" />
                  다운로드
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!capture && status !== "capturing" && (
        <div className="flex flex-col items-center justify-center py-32 rounded-[48px] border-2 border-dashed border-white/5 bg-transparent">
          <div className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-2xl mb-8">
            {status === "error" ? <X className="w-7 h-7" /> : <ImageIcon className="w-7 h-7" />}
          </div>
          <h3 className="text-2xl font-bold text-white tracking-tight">URL을 입력해 캡처를 시작하세요</h3>
          <p className="text-xs text-slate-500 font-black uppercase tracking-[0.3em] mt-3">
            FULL PAGE CAPTURE / SCREENSHOT PRESET COMPRESSION
          </p>
        </div>
      )}
    </div>
  );
}

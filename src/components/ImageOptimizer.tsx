import React, { useState, useCallback } from "react";
import { QueueItem, QueueStatus, OutputFormat } from "@/types/image";
import { compressImage } from "@/utils/compression";
import { downloadSingle, downloadAllAsZip } from "@/utils/download";
import {
  dropImageInFigma,
  isInsideFigma,
  sendImageToFigma,
} from "@/utils/figmaBridge";
import {
  Upload,
  Download,
  X,
  Loader2,
  Info,
  Image as ImageIcon,
  Sparkles,
  Play,
  RotateCcw,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const MAX_FILES = 10;
const CONCURRENCY = 2;
const DEFAULT_QUALITY = 80;
const DEFAULT_SCALE = 50;
const QUALITY_PRESETS = [60, 75, 90, 100];

interface CompressionJob {
  item: QueueItem;
  scalePercent: number;
}

function createId() {
  return Math.random().toString(36).substring(2, 9);
}

function formatSize(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// createImageBitmap applies EXIF orientation, matching sharp's rotate() on the server.
async function readImageDimensions(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return null;
  }
}

function getScaledDimensions(width: number, height: number, percent: number) {
  const scaledWidth = Math.max(1, Math.round((width * percent) / 100));
  return {
    width: scaledWidth,
    height: Math.max(1, Math.round((height * scaledWidth) / width)),
  };
}

function getQualityHint(format: OutputFormat) {
  switch (format) {
    case "png":
      return "100% = 무손실(트루컬러), 그 미만은 품질에 맞춰 팔레트 양자화합니다.";
    case "webp":
    case "avif":
      return "100% = 무손실 인코딩, 그 미만은 손실 압축입니다.";
    case "gif":
      return "품질에 비례해 색상 수(최대 256색)를 줄입니다.";
    case "jpeg":
      return "JPEG는 무손실을 지원하지 않습니다. 75~85%가 일반적인 웹 권장값입니다.";
    default:
      return "원본 포맷 그대로 선택한 품질로 다시 인코딩합니다. PNG·WebP·AVIF는 100%에서 무손실입니다.";
  }
}

export default function ImageOptimizer({
  forcedFormat,
}: {
  forcedFormat?: "webp" | "avif";
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [globalFormat, setGlobalFormat] = useState<OutputFormat>("original");
  const activeFormat = forcedFormat || globalFormat;
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [resizeEnabled, setResizeEnabled] = useState(false);
  const [globalScale, setGlobalScale] = useState(DEFAULT_SCALE);
  const [isRunning, setIsRunning] = useState(false);

  const updateItem = useCallback(
    (id: string, patch: Partial<QueueItem>) =>
      setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...patch } : it))),
    [],
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (queue.length + fileArray.length > MAX_FILES) return;

      const newItems: QueueItem[] = fileArray
        .filter(
          (f) =>
            [
              "image/jpeg",
              "image/jpg",
              "image/png",
              "image/webp",
              "image/gif",
            ].includes(f.type) ||
            f.name.toLowerCase().endsWith(".avif") ||
            f.name.toLowerCase().endsWith(".gif"),
        )
        .map((file) => ({
          id: createId(),
          originalFile: file,
          originalSize: file.size,
          status: "queued",
          targetFormat: activeFormat,
          webWidth: "",
          webHeight: "",
        }));

      setQueue((prev) => [...prev, ...newItems]);

      newItems.forEach(async (item) => {
        const dimensions = await readImageDimensions(item.originalFile);
        if (dimensions) updateItem(item.id, dimensions);
      });
    },
    [queue.length, activeFormat, updateItem],
  );

  const runJob = useCallback(
    async ({ item, scalePercent }: CompressionJob) => {
      updateItem(item.id, { status: "compressing" });
      try {
        // A fresh upload id per run keeps re-compression from colliding with earlier blobs.
        const res = await compressImage(item.originalFile, createId(), {
          targetFormat: item.targetFormat,
          quality: item.quality ?? DEFAULT_QUALITY,
          scalePercent,
        });
        updateItem(item.id, {
          status: "done",
          optimizedFilename: res.optimizedFilename,
          optimizedUrl: res.optimizedUrl,
          optimizedDownloadUrl: res.optimizedDownloadUrl,
          optimizedSize: res.optimizedSize,
          reductionRate:
            ((res.originalSize - res.optimizedSize) / res.originalSize) * 100,
        });
      } catch (e) {
        updateItem(item.id, {
          status: "error",
          error: e instanceof Error ? e.message : "Error",
        });
      }
    },
    [updateItem],
  );

  // Settings are snapshotted when the user presses start, not when files are dropped.
  const startCompression = async (includeFinished: boolean) => {
    if (isRunning) return;

    const jobs: CompressionJob[] = [];
    const nextQueue = queue.map((item) => {
      const isFinished = item.status === "done" || item.status === "error";
      if (item.status !== "queued" && !(includeFinished && isFinished)) {
        return item;
      }

      const updated: QueueItem = {
        ...item,
        status: "queued",
        targetFormat: activeFormat,
        quality,
        error: undefined,
        optimizedFilename: undefined,
        optimizedUrl: undefined,
        optimizedDownloadUrl: undefined,
        optimizedSize: undefined,
        reductionRate: undefined,
      };
      jobs.push({
        item: updated,
        scalePercent: resizeEnabled ? (item.customScale ?? globalScale) : 100,
      });
      return updated;
    });

    if (jobs.length === 0) return;

    setQueue(nextQueue);
    setIsRunning(true);

    let cursor = 0;
    const worker = async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor];
        cursor += 1;
        await runJob(job);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker),
    );

    setIsRunning(false);
  };

  const queuedCount = queue.filter((i) => i.status === "queued").length;
  const hasFinished = queue.some(
    (i) => i.status === "done" || i.status === "error",
  );
  const hasDone = queue.some((i) => i.status === "done");

  return (
    <div className="max-w-5xl mx-auto space-y-16">
      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 items-start">
        <div className="space-y-8 rounded-3xl border border-white/10 bg-white/[0.025] p-6 md:p-8 backdrop-blur-xl">
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-slate-500">
              Configuration
            </h4>
            <h3 className="text-3xl font-black tracking-ultra-tight text-white flex items-center gap-4">
              {forcedFormat ? (
                <>
                  <span className="text-teal-300">
                    {forcedFormat.toUpperCase()}
                  </span>{" "}
                  Converter
                </>
              ) : (
                "Image Compression"
              )}
            </h3>
            <p className="text-base text-slate-400 font-medium leading-relaxed">
              품질과 크기를 직접 조절해 원하는 용량으로 압축합니다. 설정을 마친
              뒤 압축 시작을 누르세요.
            </p>
          </div>

          {/* Quality */}
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
              disabled={isRunning}
              aria-label="Quality"
            />
            <div className="flex justify-between text-[10px] font-bold text-slate-600 uppercase tracking-wider">
              <span>작은 용량</span>
              <span>높은 화질</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {QUALITY_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setQuality(preset)}
                  disabled={isRunning}
                  className={cn(
                    "py-2 rounded-xl text-[11px] font-black border transition-all active:scale-[0.98] disabled:opacity-40",
                    quality === preset
                      ? "bg-white text-black border-white"
                      : "border-white/10 text-slate-500 hover:text-white hover:border-white/20",
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              {getQualityHint(activeFormat)}
            </p>
          </div>

          {/* Resize */}
          <div className="space-y-4 pt-6 border-t border-white/10">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={resizeEnabled}
                onChange={(event) => setResizeEnabled(event.target.checked)}
                disabled={isRunning}
                className="h-4 w-4 accent-teal-300"
              />
              <span className="text-sm font-bold text-white">
                크기 조절 사용
              </span>
            </label>
            {resizeEnabled ? (
              <>
                <div className="flex items-end justify-between">
                  <h4 className="text-xs font-semibold text-slate-500">
                    Scale
                  </h4>
                  <span className="text-2xl font-black text-teal-300 tabular-nums leading-none">
                    {globalScale}%
                  </span>
                </div>
                <Slider
                  min={10}
                  max={100}
                  step={5}
                  value={[globalScale]}
                  onValueChange={([value]) => setGlobalScale(value)}
                  disabled={isRunning}
                  aria-label="Scale"
                />
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  각 파일의 원본 크기를 기준으로 같은 비율이 적용되며, 가로세로
                  비율은 유지됩니다. 파일별로 다르게 하려면 목록에서 개별 크기를
                  체크하세요.
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                꺼져 있으면 원본 해상도를 그대로 유지합니다.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-8 rounded-3xl border border-white/10 bg-white/[0.025] p-6 md:p-8 backdrop-blur-xl">
          <div className="space-y-6">
            <h4 className="text-xs font-semibold text-slate-500">
              Export Format
            </h4>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 p-1.5 bg-black/20 border border-white/10 rounded-2xl">
              {(
                ["original", "png", "jpeg", "webp", "avif", "gif"] as const
              ).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => !forcedFormat && setGlobalFormat(fmt)}
                  disabled={!!forcedFormat || isRunning}
                  className={cn(
                    "py-3 rounded-xl text-[10px] font-black transition-all tracking-wider active:scale-[0.98]",
                    activeFormat === fmt
                      ? "bg-white text-black shadow-xl"
                      : "text-slate-500 hover:text-white disabled:opacity-20",
                  )}
                >
                  {fmt === "original" ? "ORIG" : fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-teal-300/[0.045] border border-teal-300/10 rounded-2xl p-6">
            <div className="text-[11px] font-black text-teal-300 mb-2 flex items-center gap-2 tracking-widest uppercase">
              <Info className="w-3.5 h-3.5" />
              Technical Insight
            </div>
            <p className="text-sm text-teal-50/60 font-medium leading-relaxed">
              {activeFormat === "original" &&
                "원본 인코딩 프로토콜을 계승하며 메타데이터 정제와 고효율 블록 압축을 동시에 수행합니다."}
              {activeFormat === "png" &&
                "알파 채널의 무결성을 보존하고 8비트/24비트 가변 샘플링으로 최적의 용량을 도출합니다."}
              {activeFormat === "jpeg" &&
                "크로마 서브샘플링 제어를 통해 인간의 시각적 한계 내에서 최대의 압축 효율을 달성합니다."}
              {activeFormat === "webp" &&
                "차세대 예측 인코딩 기술을 활용하여 JPEG 대비 시각적 품질 저하 없이 현격한 용량 감소를 제공합니다."}
              {activeFormat === "avif" &&
                "최신 AV1 비디오 코덱 기반 기술로 현존하는 이미지 포맷 중 가장 압축 효율이 뛰어나며 광범위한 색역을 지원합니다."}
              {activeFormat === "gif" &&
                "프레임 간 차분 압축 알고리즘을 사용하며, 애니메이션 정보 유실 없이 파일 크기를 최적화합니다."}
            </p>
          </div>
        </div>
      </div>

      {/* Main Action Surface */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => document.getElementById("fileInput")?.click()}
        className={cn(
          "group relative flex flex-col items-center justify-center py-24 rounded-3xl transition-all cursor-pointer border border-dashed backdrop-blur-xl",
          isDragging
            ? "bg-teal-300/10 border-teal-300/70 scale-[0.99]"
            : "bg-white/[0.025] border-white/10 hover:bg-white/[0.045] hover:border-white/20",
        )}
      >
        <input
          id="fileInput"
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.avif,.gif"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex flex-col items-center space-y-8">
          <div className="w-16 h-16 bg-white text-black rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform shadow-2xl">
            <Upload className="w-7 h-7" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold text-white tracking-tight">
              작업을 시작하려면 파일을 드롭하세요
            </h3>
            <p className="text-xs text-slate-500 font-semibold">
              최대 {MAX_FILES}개 · 파일을 추가한 뒤 압축 시작을 누르세요
            </p>
          </div>
        </div>
      </div>

      {/* Processing Table */}
      {queue.length > 0 && (
        <div className="space-y-10 animate-fade-in pb-20">
          <div className="flex flex-wrap justify-between items-center gap-4 px-6">
            <div className="flex items-center gap-6">
              <h2 className="text-base font-black text-white">
                Processing Queue
              </h2>
              <span className="text-[10px] font-black bg-white/5 text-slate-400 px-3 py-1.5 rounded-full border border-white/10">
                {queue.length} UNITS
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {queuedCount > 0 && (
                <button
                  onClick={() => void startCompression(false)}
                  disabled={isRunning}
                  className="flex items-center gap-3 text-xs font-black bg-teal-300 text-black px-6 py-3.5 rounded-2xl hover:bg-teal-200 transition-all active:scale-[0.98] disabled:opacity-40"
                >
                  {isRunning ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  압축 시작 ({queuedCount})
                </button>
              )}
              {!isRunning && hasFinished && (
                <button
                  onClick={() => void startCompression(true)}
                  className="flex items-center gap-3 text-xs font-black bg-white/5 hover:bg-white/10 text-white px-6 py-3.5 rounded-2xl transition-all active:scale-[0.98] border border-white/10"
                >
                  <RotateCcw className="w-4 h-4" />
                  현재 설정으로 다시 압축
                </button>
              )}
              {!isRunning && hasDone && (
                <button
                  onClick={() => downloadAllAsZip(queue)}
                  className="flex items-center gap-3 text-xs font-black bg-white text-black px-6 py-3.5 rounded-2xl hover:bg-teal-100 transition-all active:scale-[0.98]"
                >
                  <Download className="w-4 h-4" />
                  EXPORT ALL (.ZIP)
                </button>
              )}
              {!isRunning && (
                <button
                  onClick={() => setQueue([])}
                  className="flex items-center gap-3 text-xs font-black bg-white/5 hover:bg-white/10 text-white px-6 py-3.5 rounded-2xl transition-all active:scale-[0.98] border border-white/10"
                >
                  <X className="w-4 h-4" />
                  CLEAR
                </button>
              )}
            </div>
          </div>

          <div className="bg-white/[0.025] border border-white/10 rounded-3xl overflow-hidden backdrop-blur-xl">
            <div className="divide-y divide-white/[0.05]">
              {queue.map((item) => {
                const isBusy =
                  item.status === "compressing" || item.status === "uploading";
                const effectiveScale = item.customScale ?? globalScale;
                const scaled =
                  resizeEnabled && item.width && item.height
                    ? getScaledDimensions(item.width, item.height, effectiveScale)
                    : null;

                return (
                  <div
                    key={item.id}
                    draggable={isInsideFigma() && item.status === "done"}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "copy";
                      event.dataTransfer.setData(
                        "text/plain",
                        item.originalFile.name,
                      );
                    }}
                    onDragEnd={(event) => {
                      if (!item.optimizedUrl || !event.view) return;

                      void dropImageInFigma(
                        item.optimizedUrl,
                        item.optimizedFilename || "image.png",
                        event.clientX,
                        event.clientY,
                      );
                    }}
                    className={cn(
                      "p-6 flex items-center gap-6 group hover:bg-white/[0.035] transition-colors",
                      isInsideFigma() &&
                        item.status === "done" &&
                        "cursor-grab active:cursor-grabbing",
                    )}
                  >
                    <div className="flex-1 min-w-0 flex items-center gap-8">
                      <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0 shadow-inner group-hover:border-white/20 transition-colors">
                        <ImageIcon className="w-5 h-5 text-slate-500" />
                      </div>
                      <div className="flex flex-col gap-2 min-w-0 flex-1">
                        <span className="text-sm font-bold text-white truncate leading-none">
                          {item.originalFile.name}
                        </span>
                        <div className="flex flex-wrap items-center gap-3">
                          <StatusBadge status={item.status} />
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                            {formatSize(item.originalSize)}
                            {item.optimizedSize !== undefined &&
                              ` → ${formatSize(item.optimizedSize)}`}
                          </span>
                          {item.width && item.height && (
                            <span className="text-[10px] font-black text-slate-600 tracking-widest tabular-nums">
                              {item.width}×{item.height}
                              {scaled &&
                                effectiveScale < 100 &&
                                ` → ${scaled.width}×${scaled.height}`}
                            </span>
                          )}
                        </div>
                        {item.status === "error" && item.error && (
                          <span className="text-[11px] font-semibold text-red-400 truncate">
                            {item.error}
                          </span>
                        )}
                        {resizeEnabled && (
                          <div className="flex flex-wrap items-center gap-4 pt-1">
                            <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-bold text-slate-400">
                              <input
                                type="checkbox"
                                checked={item.customScale !== undefined}
                                disabled={isRunning}
                                onChange={(event) =>
                                  updateItem(item.id, {
                                    customScale: event.target.checked
                                      ? globalScale
                                      : undefined,
                                  })
                                }
                                className="h-3.5 w-3.5 accent-teal-300"
                              />
                              개별 크기
                            </label>
                            {item.customScale !== undefined && (
                              <div className="flex items-center gap-3 w-56">
                                <Slider
                                  min={10}
                                  max={100}
                                  step={5}
                                  value={[item.customScale]}
                                  disabled={isRunning}
                                  onValueChange={([value]) =>
                                    updateItem(item.id, { customScale: value })
                                  }
                                  aria-label={`${item.originalFile.name} scale`}
                                />
                                <span className="text-xs font-black text-teal-300 tabular-nums w-10 text-right">
                                  {item.customScale}%
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="hidden md:flex flex-col items-end gap-2 min-w-[140px] pr-4">
                      <div className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                        Storage Efficiency
                      </div>
                      <div
                        className={cn(
                          "text-2xl font-black tracking-tighter leading-none",
                          item.reductionRate !== undefined
                            ? "text-white"
                            : "text-slate-900",
                        )}
                      >
                        {item.reductionRate !== undefined
                          ? `${item.reductionRate >= 0 ? "-" : "+"}${Math.abs(item.reductionRate).toFixed(1)}%`
                          : "00.0%"}
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-2 min-w-[48px]">
                      {item.status === "done" ? (
                        <>
                          {isInsideFigma() && (
                            <button
                              onClick={async () => {
                                if (item.optimizedUrl) {
                                  const response = await fetch(
                                    item.optimizedUrl,
                                  );
                                  const blob = await response.blob();
                                  await sendImageToFigma(
                                    blob,
                                    item.optimizedFilename || "image.png",
                                  );
                                }
                              }}
                              className="w-12 h-12 rounded-full border border-teal-300/30 bg-teal-300/10 text-teal-300 flex items-center justify-center hover:bg-teal-300 hover:text-black transition-all shadow-lg active:scale-90"
                              title="Figma에 반영"
                            >
                              <Sparkles className="w-5 h-5" />
                            </button>
                          )}
                          <button
                            onClick={() => downloadSingle(item)}
                            className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center hover:bg-white hover:text-black transition-all shadow-lg group-hover:scale-110 active:scale-90"
                          >
                            <Download className="w-5 h-5" />
                          </button>
                        </>
                      ) : isBusy ? (
                        <Loader2 className="w-6 h-6 text-teal-300 animate-spin" />
                      ) : (
                        <button
                          onClick={() =>
                            setQueue((q) => q.filter((i) => i.id !== item.id))
                          }
                          disabled={isRunning}
                          className="w-12 h-12 flex items-center justify-center text-slate-600 hover:text-red-500 transition-all hover:scale-110 disabled:opacity-30"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: QueueStatus }) {
  const labels: Record<QueueStatus, string> = {
    queued: "Ready",
    "removing-bg": "Removing BG",
    uploading: "Uploading",
    compressing: "Processing",
    done: "Optimized",
    error: "Failed",
  };
  return (
    <span
      className={cn(
        "text-[10px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded",
        status === "done"
          ? "text-green-500 bg-green-500/10"
          : status === "error"
            ? "text-red-500 bg-red-500/10"
            : status === "compressing" || status === "removing-bg"
              ? "text-teal-300 bg-teal-300/10 animate-pulse"
              : "text-slate-600 bg-white/5",
      )}
    >
      {labels[status]}
    </span>
  );
}

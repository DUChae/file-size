import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  QueueItem,
  QueueStatus,
  ImageCategory,
  OutputFormat,
} from "@/types/image";
import { compressImage } from "@/utils/compression";
import { downloadSingle, downloadAllAsZip } from "@/utils/download";
import { isInsideFigma, sendImageToFigma } from "@/utils/figmaBridge";
import {
  Upload,
  Download,
  X,
  Loader2,
  Info,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_FILES = 10;
const CONCURRENCY = 2;

export default function ImageOptimizer({
  category,
  forcedFormat,
}: {
  category: ImageCategory;
  forcedFormat?: "webp" | "avif";
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [globalFormat, setGlobalFormat] = useState<OutputFormat>(
    forcedFormat || "original",
  );
  const [globalWebWidth, setGlobalWebWidth] = useState("");
  const [globalWebHeight, setGlobalWebHeight] = useState("");
  const processingRef = useRef<number>(0);

  useEffect(() => {
    if (forcedFormat) {
      setGlobalFormat(forcedFormat);
    }
  }, [forcedFormat]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (queue.length + fileArray.length > MAX_FILES) return;

      const newItems: QueueItem[] = fileArray
        .filter(
          (f) =>
            ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"].includes(
              f.type,
            ) || f.name.toLowerCase().endsWith(".avif") || f.name.toLowerCase().endsWith(".gif"),
        )
        .map((file) => ({
          id: Math.random().toString(36).substring(2, 9),
          originalFile: file,
          originalSize: file.size,
          status: "queued",
          category: category,
          targetFormat: forcedFormat || globalFormat,
          webWidth: globalWebWidth,
          webHeight: globalWebHeight,
        }));

      setQueue((prev) => [...prev, ...newItems]);
    },
    [
      queue.length,
      category,
      globalFormat,
      globalWebWidth,
      globalWebHeight,
      forcedFormat,
    ],
  );

  const processQueue = useCallback(async () => {
    if (processingRef.current >= CONCURRENCY) return;
    setQueue((prev) => {
      const nextItem = prev.find((i) => i.status === "queued");
      if (!nextItem || processingRef.current >= CONCURRENCY) return prev;
      processingRef.current += 1;
      (async () => {
        try {
          setQueue((q) =>
            q.map((it) =>
              it.id === nextItem.id ? { ...it, status: "compressing" } : it,
            ),
          );
          const res = await compressImage(
            nextItem.originalFile,
            nextItem.id,
            nextItem.category,
            nextItem.targetFormat,
            nextItem.webWidth,
            nextItem.webHeight,
          );
          setQueue((q) =>
            q.map((it) =>
              it.id === nextItem.id
                ? {
                    ...it,
                    status: "done",
                    optimizedFilename: res.optimizedFilename,
                    optimizedUrl: res.optimizedUrl,
                    optimizedDownloadUrl: res.optimizedDownloadUrl,
                    optimizedSize: res.optimizedSize,
                    reductionRate:
                      ((res.originalSize - res.optimizedSize) /
                        res.originalSize) *
                      100,
                  }
                : it,
            ),
          );
        } catch (e) {
          setQueue((q) =>
            q.map((it) =>
              it.id === nextItem.id
                ? {
                    ...it,
                    status: "error",
                    error: e instanceof Error ? e.message : "Error",
                  }
                : it,
            ),
          );
        } finally {
          processingRef.current -= 1;
          processQueue();
        }
      })();
      return prev.map((it) =>
        it.id === nextItem.id ? { ...it, status: "uploading" } : it,
      );
    });
  }, []);

  useEffect(() => {
    if (
      queue.some((i) => i.status === "queued") &&
      processingRef.current < CONCURRENCY
    )
      processQueue();
  }, [queue, processQueue]);

  const isAllDone =
    queue.length > 0 &&
    queue.every((i) => i.status === "done" || i.status === "error");

  return (
    <div className="max-w-5xl mx-auto space-y-16">
      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 items-start">
        <div className="space-y-8 rounded-3xl border border-white/10 bg-white/[0.025] p-6 md:p-8 backdrop-blur-xl">
          <div className="space-y-6">
            <h4 className="text-xs font-semibold text-slate-500">
              Configuration
            </h4>
            <div className="space-y-4">
              <h3 className="text-3xl font-black tracking-ultra-tight text-white flex items-center gap-4">
                {forcedFormat ? (
                  <>
                    <span className="text-teal-300">
                      {forcedFormat.toUpperCase()}
                    </span>{" "}
                    Converter
                  </>
                ) : (
                  <>
                    {category === "screenshot" && "Screenshot Engine"}
                    {category === "photo" && "Photography Engine"}
                    {category === "web" && "Web Optimization"}
                    {category === "high-quality" && "Lossless Master"}
                  </>
                )}
              </h3>
              <p className="text-base text-slate-400 font-medium leading-relaxed">
                {forcedFormat ? (
                  `${forcedFormat.toUpperCase()} 인코딩을 위해 최적화된 고성능 연산 모델을 적용합니다.`
                ) : (
                  <>
                    {category === "screenshot" &&
                      "정밀한 엣지 보존 알고리즘으로 텍스트 가독성을 최상으로 유지하며 압축합니다."}
                    {category === "photo" &&
                      "지능형 질감 분석을 통해 자연스러운 색조와 세부 디테일을 완벽하게 보존합니다."}
                    {category === "web" &&
                      "현대적 웹 성능 지표를 고려한 리사이징과 화질 최적화로 로딩 속도를 혁신합니다."}
                    {category === "high-quality" &&
                      "데이터 무결성을 보장하는 무손실 압축으로 원본의 품질을 그대로 유지합니다."}
                  </>
                )}
              </p>
            </div>
          </div>

          {category === "web" && (
            <div className="space-y-6 pt-6 border-t border-white/10">
              <h4 className="text-xs font-semibold text-slate-500">
                Output Dimensions
              </h4>
              <div className="flex items-center gap-6 bg-black/20 border border-white/10 rounded-2xl p-1.5 px-4">
                <input
                  value={globalWebWidth}
                  onChange={(event) =>
                    setGlobalWebWidth(event.target.value.replace(/[^\d]/g, ""))
                  }
                  placeholder="Width"
                  className="w-full bg-transparent py-4 text-sm font-bold text-white outline-none placeholder:text-slate-700"
                />
                <span className="text-xs font-black text-slate-700">X</span>
                <input
                  value={globalWebHeight}
                  onChange={(event) =>
                    setGlobalWebHeight(event.target.value.replace(/[^\d]/g, ""))
                  }
                  placeholder="Height"
                  className="w-full bg-transparent py-4 text-sm font-bold text-white outline-none placeholder:text-slate-700 text-right"
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-8 rounded-3xl border border-white/10 bg-white/[0.025] p-6 md:p-8 backdrop-blur-xl">
          <div className="space-y-6">
            <h4 className="text-xs font-semibold text-slate-500">
              Export Format
            </h4>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 p-1.5 bg-black/20 border border-white/10 rounded-2xl">
              {(["original", "png", "jpeg", "webp", "avif", "gif"] as const).map(
                (fmt) => (
                  <button
                    key={fmt}
                    onClick={() => !forcedFormat && setGlobalFormat(fmt)}
                    disabled={!!forcedFormat}
                    className={cn(
                      "py-3 rounded-xl text-[10px] font-black transition-all tracking-wider active:scale-[0.98]",
                      globalFormat === fmt
                        ? "bg-white text-black shadow-xl"
                        : "text-slate-500 hover:text-white disabled:opacity-20",
                    )}
                  >
                    {fmt === "original" ? "ORIG" : fmt.toUpperCase()}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="bg-teal-300/[0.045] border border-teal-300/10 rounded-2xl p-6">
            <div className="text-[11px] font-black text-teal-300 mb-2 flex items-center gap-2 tracking-widest uppercase">
              <Info className="w-3.5 h-3.5" />
              Technical Insight
            </div>
            <p className="text-sm text-teal-50/60 font-medium leading-relaxed">
              {globalFormat === "original" &&
                "원본 인코딩 프로토콜을 계승하며 메타데이터 정제와 고효율 블록 압축을 동시에 수행합니다."}
              {globalFormat === "png" &&
                "알파 채널의 무결성을 보존하고 8비트/24비트 가변 샘플링으로 최적의 용량을 도출합니다."}
              {globalFormat === "jpeg" &&
                "크로마 서브샘플링 제어를 통해 인간의 시각적 한계 내에서 최대의 압축 효율을 달성합니다."}
              {globalFormat === "webp" &&
                "차세대 예측 인코딩 기술을 활용하여 JPEG 대비 시각적 품질 저하 없이 현격한 용량 감소를 제공합니다."}
              {globalFormat === "avif" &&
                "최신 AV1 비디오 코덱 기반 기술로 현존하는 이미지 포맷 중 가장 압축 효율이 뛰어나며 광범위한 색역을 지원합니다."}
              {globalFormat === "gif" &&
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
          accept=".png,.jpg,.jpeg,.webp,.avif"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
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
              Large uploads supported through direct Blob upload
            </p>
          </div>
        </div>
      </div>

      {/* Processing Table */}
      {queue.length > 0 && (
        <div className="space-y-10 animate-fade-in pb-20">
          <div className="flex justify-between items-center px-6">
            <div className="flex items-center gap-6">
              <h2 className="text-base font-black text-white">
                Processing Queue
              </h2>
              <span className="text-[10px] font-black bg-white/5 text-slate-400 px-3 py-1.5 rounded-full border border-white/10">
                {queue.length} UNITS
              </span>
            </div>
            {isAllDone && (
              <div className="flex items-center gap-4">
                <button
                  onClick={() => downloadAllAsZip(queue)}
                  className="flex items-center gap-3 text-xs font-black bg-white text-black px-6 py-3.5 rounded-2xl hover:bg-teal-100 transition-all active:scale-[0.98]"
                >
                  <Download className="w-4 h-4" />
                  EXPORT ALL AS BUNDLE (.ZIP)
                </button>
                <button
                  onClick={() => setQueue([])}
                  className="flex items-center gap-3 text-xs font-black bg-white/5 hover:bg-white/10 text-white px-6 py-3.5 rounded-2xl transition-all active:scale-[0.98] border border-white/10"
                >
                  <X className="w-4 h-4" />
                  CLEAR
                </button>
              </div>
            )}
          </div>

          <div className="bg-white/[0.025] border border-white/10 rounded-3xl overflow-hidden backdrop-blur-xl">
            <div className="divide-y divide-white/[0.05]">
              {queue.map((item) => (
                <div
                  key={item.id}
                  className="p-6 flex items-center gap-6 group hover:bg-white/[0.035] transition-colors"
                >
                  <div className="flex-1 min-w-0 flex items-center gap-8">
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0 shadow-inner group-hover:border-white/20 transition-colors">
                      <ImageIcon className="w-5 h-5 text-slate-500" />
                    </div>
                    <div className="flex flex-col gap-2 min-w-0">
                      <span className="text-sm font-bold text-white truncate leading-none">
                        {item.originalFile.name}
                      </span>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={item.status} />
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                          {formatSize(item.originalSize)}
                        </span>
                      </div>
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
                        ? `-${item.reductionRate.toFixed(1)}%`
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
                                const response = await fetch(item.optimizedUrl);
                                const blob = await response.blob();
                                await sendImageToFigma(blob, item.optimizedFilename || "image.png");
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
                    ) : item.status === "queued" ? (
                      <button
                        onClick={() =>
                          setQueue((q) => q.filter((i) => i.id !== item.id))
                        }
                        className="w-12 h-12 flex items-center justify-center text-slate-600 hover:text-red-500 transition-all hover:scale-110"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    ) : (
                      <Loader2 className="w-6 h-6 text-teal-300 animate-spin" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: QueueStatus }) {
  const labels: Record<QueueStatus, string> = {
    queued: "Queued",
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

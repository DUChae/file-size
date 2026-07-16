"use client";

// 클라이언트 측에서 이미지 배경을 지운 후 최적화 압축을 연계하여 처리하는 컴포넌트

import React, { useState, useCallback, useEffect, useRef } from "react";
import { QueueItem } from "@/types/image";
import { downloadSingle, downloadAllAsZip } from "@/utils/download";
import { removeImageBackground } from "@/utils/backgroundRemoval";
import { isInsideFigma, sendImageToFigma } from "@/utils/figmaBridge";
import {
  Download,
  X,
  Loader2,
  Info,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_FILES = 10;
const CONCURRENCY = 1; // 배경 제거는 CPU 연산이 매우 무거우므로 동시성 제한을 1로 설정하여 메인 스레드 병목을 예방합니다.

export default function ImageBgRemover() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const processingRef = useRef<number>(0);

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
            ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(
              f.type,
            ),
        )
        .map((file) => ({
          id: Math.random().toString(36).substring(2, 9),
          originalFile: file,
          originalSize: file.size,
          status: "queued",
          category: "screenshot", 
          targetFormat: "png",    
          webWidth: "",
          webHeight: "",
          bgRemovalProgress: 0,
          removalMode: "auto", // 기본값은 항상 지능형 자동 판별 모드로 작동합니다.
        }));

      setQueue((prev) => [...prev, ...newItems]);
    },
    [queue.length],
  );

  const processQueue = useCallback(async () => {
    if (processingRef.current >= CONCURRENCY) return;
    setQueue((prev) => {
      const nextItem = prev.find((i) => i.status === "queued");
      if (!nextItem || processingRef.current >= CONCURRENCY) return prev;
      processingRef.current += 1;

      (async () => {
        try {
          // 1단계: 브라우저 기반 배경 제거 처리 시작
          setQueue((q) =>
            q.map((it) =>
              it.id === nextItem.id
                ? { ...it, status: "removing-bg", bgRemovalProgress: 0 }
                : it,
            ),
          );

          // 2단계: 브라우저 온디바이스 AI 매팅 엔진을 활용하여 배경을 소거합니다.
          const transparentBlob = await removeImageBackground(
            nextItem.originalFile,
            (progress) => {
              setQueue((q) =>
                q.map((it) =>
                  it.id === nextItem.id
                    ? { ...it, bgRemovalProgress: progress }
                    : it,
                ),
              );
            },
          );

          // 2단계: 결과 PNG 블롭을 기반으로 즉시 브라우저 로컬 Object URL을 발행하여 완료합니다. (서버 전송 스킵)
          const originalName = nextItem.originalFile.name;
          const extIndex = originalName.lastIndexOf(".");
          const nameWithoutExt = extIndex !== -1 ? originalName.substring(0, extIndex) : originalName;
          
          const localUrl = URL.createObjectURL(transparentBlob);

          setQueue((q) =>
            q.map((it) =>
              it.id === nextItem.id
                ? {
                    ...it,
                    status: "done",
                    optimizedFilename: `${nameWithoutExt}.optimized.png`,
                    optimizedUrl: localUrl,
                    optimizedDownloadUrl: localUrl,
                    optimizedSize: transparentBlob.size,
                    reductionRate:
                      ((nextItem.originalSize - transparentBlob.size) /
                        nextItem.originalSize) *
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
        it.id === nextItem.id ? { ...it, status: "removing-bg" } : it,
      );
    });
  }, []);

  useEffect(() => {
    if (
      queue.some((i) => i.status === "queued") &&
      processingRef.current < CONCURRENCY
    ) {
      processQueue();
    }
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
                <span className="text-teal-300">BG REMOVER</span> Engine
              </h3>
              <p className="text-base text-slate-400 font-medium leading-relaxed">
                업로드된 이미지의 특성을 스스로 분석하여 AI 피사체 인식 또는 서명/텍스트 최적화 기법을 자동으로 선택해 배경을 지워줍니다.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-8 rounded-3xl border border-white/10 bg-white/[0.025] p-6 md:p-8 backdrop-blur-xl">
          <div className="space-y-6">
            <h4 className="text-xs font-semibold text-slate-500">
              Export Format Info
            </h4>
            <div className="flex items-center gap-4 bg-black/20 border border-white/10 rounded-2xl p-4">
              <span className="bg-white text-black text-xs font-black px-4 py-2.5 rounded-xl">
                PNG (FORCED)
              </span>
              <p className="text-xs text-slate-400 font-semibold leading-relaxed">
                배경의 투명 알파 채널을 완벽하게 보존해야 하므로 최종 결과물은 항상 PNG 포맷으로 강제 인코딩됩니다.
              </p>
            </div>
          </div>
          <div className="bg-teal-300/[0.045] border border-teal-300/10 rounded-2xl p-6">
            <div className="text-[11px] font-black text-teal-300 mb-2 flex items-center gap-2 tracking-widest uppercase">
              <Info className="w-3.5 h-3.5" />
              Technical Insight
            </div>
            <p className="text-sm text-teal-50/60 font-medium leading-relaxed">
              본 엔진은 이미지 속 배경색 비율과 채도를 분석해 자필 서명 여부를 판별합니다. 서명인 경우 초고속 픽셀 단위 Color-to-Alpha 기법을 적용해 흰 테두리 흔적까지 완벽히 소거하며, 일반 사물은 로컬 AI 피사체 인식 모델로 지워냅니다.
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
          accept=".png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <div className="flex flex-col items-center space-y-8">
          <div className="w-16 h-16 bg-white text-black rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform shadow-2xl">
            <Sparkles className="w-7 h-7" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold text-white tracking-tight">
              자동으로 분류 및 처리할 파일을 드롭하거나 클릭하세요
            </h3>
            <p className="text-xs text-slate-500 font-semibold">
              서명은 초고속 Color-to-Alpha 필터로, 일반 사진은 AI 엔진 가속 모델로 자동 분석 및 처리됩니다.
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
                Background Removal Queue
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
                        <StatusBadge item={item} />
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                          {formatSize(item.originalSize)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="hidden md:flex flex-col items-end gap-2 min-w-[140px] pr-4">
                    <div className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                      Total Reduction
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

function StatusBadge({ item }: { item: QueueItem }) {
  const labels = {
    queued: "Queued",
    "removing-bg": `Removing BG (${item.bgRemovalProgress || 0}%)`,
    uploading: "Uploading",
    compressing: "Processing",
    done: "Completed",
    error: "Failed",
  };
  return (
    <span
      className={cn(
        "text-[10px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded",
        item.status === "done"
          ? "text-green-500 bg-green-500/10"
          : item.status === "error"
            ? "text-red-500 bg-red-500/10"
            : item.status === "removing-bg" || item.status === "compressing"
              ? "text-teal-300 bg-teal-300/10 animate-pulse"
              : "text-slate-600 bg-white/5",
      )}
    >
      {labels[item.status]}
    </span>
  );
}

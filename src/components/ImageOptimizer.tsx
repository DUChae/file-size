"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { QueueItem, QueueStatus, ImageCategory, OutputFormat } from "@/types/image";
import { compressImage } from "@/utils/compression";
import { downloadSingle, downloadAllAsZip } from "@/utils/download";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const CONCURRENCY = 2;

export default function ImageOptimizer() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [globalCategory, setGlobalCategory] = useState<ImageCategory>("screenshot");
  const [globalFormat, setGlobalFormat] = useState<OutputFormat>("original");
  const processingRef = useRef<number>(0);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (queue.length + fileArray.length > MAX_FILES) return;

    const newItems: QueueItem[] = fileArray.filter(f => ["image/jpeg", "image/jpg", "image/png"].includes(f.type) && f.size <= MAX_FILE_SIZE)
      .map(file => ({
        id: Math.random().toString(36).substring(2, 9),
        originalFile: file,
        originalSize: file.size,
        status: "queued",
        category: globalCategory,
        targetFormat: globalFormat,
      }));

    setQueue(prev => [...prev, ...newItems]);
  }, [queue.length, globalCategory, globalFormat]);

  const processQueue = useCallback(async () => {
    if (processingRef.current >= CONCURRENCY) return;
    setQueue(prev => {
      const nextItem = prev.find(i => i.status === "queued");
      if (!nextItem || processingRef.current >= CONCURRENCY) return prev;
      processingRef.current += 1;
      (async () => {
        try {
          setQueue(q => q.map(it => it.id === nextItem.id ? { ...it, status: "compressing" } : it));
          const res = await compressImage(nextItem.originalFile, nextItem.id, nextItem.category, nextItem.targetFormat);
          setQueue(q => q.map(it => it.id === nextItem.id ? { ...it, status: "done", optimizedFile: res.optimizedFile, optimizedSize: res.optimizedSize, reductionRate: ((res.originalSize - res.optimizedSize) / res.originalSize) * 100 } : it));
        } catch (e) {
          setQueue(q => q.map(it => it.id === nextItem.id ? { ...it, status: "error", error: e instanceof Error ? e.message : "Error" } : it));
        } finally {
          processingRef.current -= 1;
          processQueue();
        }
      })();
      return prev.map(it => it.id === nextItem.id ? { ...it, status: "uploading" } : it);
    });
  }, []);

  useEffect(() => {
    if (queue.some(i => i.status === "queued") && processingRef.current < CONCURRENCY) processQueue();
  }, [queue, processQueue]);

  const isAllDone = queue.length > 0 && queue.every(i => i.status === "done" || i.status === "error");

  return (
    <div className="max-w-6xl mx-auto px-4">
      {/* Settings Panel - Ultra Glass */}
      <div className="glass-panel rounded-3xl p-8 mb-12 flex flex-col md:flex-row items-start gap-10">
        <div className="flex-[1.4] w-full">
          <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-4">Mode Configuration</h4>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {(['screenshot', 'photo', 'web', 'high-quality'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setGlobalCategory(cat)}
                className={`px-3 py-2.5 rounded-xl text-[12px] font-bold border transition-all ${
                  globalCategory === cat 
                    ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20" 
                    : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
                }`}
              >
                {cat === 'screenshot' && 'Screenshot'}
                {cat === 'photo' && 'Photography'}
                {cat === 'web' && 'Web Engine'}
                {cat === 'high-quality' && 'Lossless'}
              </button>
            ))}
          </div>
          <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4 min-h-[70px] flex items-center">
            <p className="text-[13px] text-blue-200 leading-relaxed font-medium">
              {globalCategory === 'screenshot' && "📄 텍스트 가독성을 유지하며 배경 용량을 극단적으로 줄입니다. (PNG 최적화 특화)"}
              {globalCategory === 'photo' && "🖼️ 풍경이나 인물 사진의 질감을 살리면서 용량을 효율적으로 압축합니다. (JPEG/JPG 특화)"}
              {globalCategory === 'web' && "🌐 빠른 웹 로딩을 위해 품질과 크기를 공격적으로 조정합니다. (최대 1200px 리사이즈 포함)"}
              {globalCategory === 'high-quality' && "✨ 육안상 손실 없이 불필요한 데이터만 제거하여 원본 품질을 보관합니다."}
            </p>
          </div>
        </div>
        
        <div className="flex-1 w-full">
          <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-4">Output Format</h4>
          <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10 mb-6">
            {(['original', 'png', 'jpeg'] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => setGlobalFormat(fmt)}
                className={`flex-1 py-2 rounded-xl text-[11px] font-black transition-all ${
                  globalFormat === fmt ? "bg-white text-slate-900" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="bg-white/5 border border-white/5 rounded-2xl p-4 min-h-[70px] flex items-center">
            <p className="text-[13px] text-slate-300 leading-relaxed font-medium">
              {globalFormat === 'original' && "• 업로드한 파일의 확장자를 그대로 유지합니다."}
              {globalFormat === 'png' && "• 투명도가 필요하거나 선명한 텍스트가 중요한 경우 권장합니다."}
              {globalFormat === 'jpeg' && "• 색상이 화려한 사진의 용량을 줄일 때 가장 효율적입니다."}
            </p>
          </div>
        </div>
      </div>

      {/* Drop Zone - High Contrast & Glow */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => document.getElementById("fileInput")?.click()}
        className={`group relative rounded-[40px] p-20 text-center transition-all cursor-pointer border-2 border-white/5 ${
          isDragging ? "animate-glow bg-blue-500/5 scale-[0.98]" : "bg-slate-950/40 hover:bg-slate-900/40 hover:border-white/10"
        }`}
      >
        <input id="fileInput" type="file" multiple accept=".png,.jpg,.jpeg" className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
        <div className="relative pointer-events-none">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-blue-500/20 group-hover:scale-110 transition-transform">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
          <h3 className="text-3xl font-black text-white tracking-tighter mb-3">DROP ASSETS HERE.</h3>
          <p className="text-slate-500 font-bold text-sm tracking-tight uppercase opacity-60">Max 20MB / PNG, JPG, JPEG</p>
        </div>
      </div>

      {/* Queue List */}
      {queue.length > 0 && (
        <div className="mt-20">
          <div className="flex justify-between items-center mb-10">
            <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Processing Queue</h2>
            {isAllDone && (
              <button onClick={() => downloadAllAsZip(queue)} className="px-8 py-3 bg-white text-slate-950 rounded-2xl text-sm font-black hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/5">
                EXPORT ALL (.ZIP)
              </button>
            )}
          </div>

          <div className="space-y-4">
            {queue.map((item) => (
              <div key={item.id} className="glass-card rounded-[32px] p-6 flex items-center gap-6 animate-slide-up">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-4 mb-2">
                    <span className="text-lg font-black text-white truncate">{item.originalFile.name}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="flex gap-4 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    <span>In: {formatSize(item.originalSize)}</span>
                    {item.optimizedSize && <span className="text-blue-400">Out: {formatSize(item.optimizedSize)}</span>}
                  </div>
                </div>

                <div className="text-right hidden sm:block">
                  <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Savings</div>
                  <div className={`text-2xl font-black ${item.reductionRate !== undefined ? "text-green-500" : "text-slate-800"}`}>
                    {item.reductionRate !== undefined ? `-${item.reductionRate.toFixed(1)}%` : "00.0%"}
                  </div>
                </div>

                <div className="w-px h-10 bg-white/5 mx-2 hidden sm:block"></div>

                <div>
                  {item.status === "done" ? (
                    <button onClick={() => downloadSingle(item)} className="p-4 bg-white/5 hover:bg-white text-white hover:text-slate-950 rounded-2xl transition-all group/btn">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    </button>
                  ) : item.status === "queued" ? (
                    <button onClick={() => setQueue(q => q.filter(i => i.id !== item.id))} className="p-4 text-slate-600 hover:text-red-500 transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  ) : (
                    <div className="w-10 h-10 border-4 border-white/5 border-t-blue-500 rounded-full animate-spin"></div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: QueueStatus }) {
  const styles = {
    queued: "text-slate-600",
    uploading: "text-blue-500 animate-pulse",
    compressing: "text-amber-500 animate-pulse",
    done: "text-green-500",
    error: "text-red-500",
  };
  return (
    <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${styles[status]}`}>
      {status}
    </span>
  );
}

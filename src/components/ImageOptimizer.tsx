import React, { useState, useCallback, useEffect, useRef } from "react";
import { QueueItem, QueueStatus, ImageCategory, OutputFormat } from "@/types/image";
import { compressImage } from "@/utils/compression";
import { downloadSingle, downloadAllAsZip } from "@/utils/download";
import { Button } from "@/components/ui/button";
import { Upload, Download, X, Loader2, Sparkles, CheckCircle2, Info, ArrowRight, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const CONCURRENCY = 2;

export default function ImageOptimizer({ category, forcedFormat }: { category: ImageCategory, forcedFormat?: "webp" | "avif" }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [globalFormat, setGlobalFormat] = useState<OutputFormat>(forcedFormat || "original");
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

  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (queue.length + fileArray.length > MAX_FILES) return;

    const newItems: QueueItem[] = fileArray.filter(f => ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(f.type) || f.name.toLowerCase().endsWith('.avif'))
      .map(file => ({
        id: Math.random().toString(36).substring(2, 9),
        originalFile: file,
        originalSize: file.size,
        status: "queued",
        category: category,
        targetFormat: forcedFormat || globalFormat,
        webWidth: globalWebWidth,
        webHeight: globalWebHeight,
      }));

    setQueue(prev => [...prev, ...newItems]);
  }, [queue.length, category, globalFormat, globalWebWidth, globalWebHeight, forcedFormat]);

  const processQueue = useCallback(async () => {
    if (processingRef.current >= CONCURRENCY) return;
    setQueue(prev => {
      const nextItem = prev.find(i => i.status === "queued");
      if (!nextItem || processingRef.current >= CONCURRENCY) return prev;
      processingRef.current += 1;
      (async () => {
        try {
          setQueue(q => q.map(it => it.id === nextItem.id ? { ...it, status: "compressing" } : it));
          const res = await compressImage(nextItem.originalFile, nextItem.id, nextItem.category, nextItem.targetFormat, nextItem.webWidth, nextItem.webHeight);
          setQueue(q => q.map(it => it.id === nextItem.id ? { ...it, status: "done", optimizedFilename: res.optimizedFilename, optimizedUrl: res.optimizedUrl, optimizedDownloadUrl: res.optimizedDownloadUrl, optimizedSize: res.optimizedSize, reductionRate: ((res.originalSize - res.optimizedSize) / res.originalSize) * 100 } : it));
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
    <div className="max-w-4xl mx-auto space-y-20">
      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
        <div className="space-y-8">
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-white uppercase tracking-[0.3em] opacity-40">Configuration</h4>
            <div className="space-y-2">
              <h3 className="text-2xl font-black tracking-ultra-tight text-white flex items-center gap-3">
                {forcedFormat ? (
                  <>
                    <span className="text-blue-500">{forcedFormat.toUpperCase()}</span> Converter
                  </>
                ) : (
                  <>
                    {category === 'screenshot' && "Screenshot Engine"}
                    {category === 'photo' && "Photography Engine"}
                    {category === 'web' && "Web Optimization"}
                    {category === 'high-quality' && "Lossless Master"}
                  </>
                )}
              </h3>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                {forcedFormat ? `${forcedFormat.toUpperCase()} 인코딩을 위해 최적화된 연산 모델을 사용합니다.` : (
                  <>
                    {category === 'screenshot' && "정밀한 엣지 보존 알고리즘으로 텍스트 가독성을 최우선으로 합니다."}
                    {category === 'photo' && "심층 질감 분석을 통해 자연스러운 색조와 세부 수치를 보존합니다."}
                    {category === 'web' && "성능 중심 리사이징으로 웹 코어 바이탈 지표를 개선합니다."}
                    {category === 'high-quality' && "메타데이터 정제 및 무손실 압축으로 데이터 무결성을 보장합니다."}
                  </>
                )}
              </p>
            </div>
          </div>

          {category === "web" && (
            <div className="space-y-4 pt-4 border-t border-white/5">
              <h4 className="text-[10px] font-black text-white uppercase tracking-[0.3em] opacity-40">Output Dimensions</h4>
              <div className="flex items-center gap-4 bg-white/[0.02] border border-white/10 rounded-xl p-1 px-3">
                <input
                  value={globalWebWidth}
                  onChange={(event) => setGlobalWebWidth(event.target.value.replace(/[^\d]/g, ""))}
                  placeholder="Width"
                  className="w-full bg-transparent py-3 text-xs font-bold text-white outline-none placeholder:text-slate-700"
                />
                <span className="text-[10px] font-black text-slate-700">X</span>
                <input
                  value={globalWebHeight}
                  onChange={(event) => setGlobalWebHeight(event.target.value.replace(/[^\d]/g, ""))}
                  placeholder="Height"
                  className="w-full bg-transparent py-3 text-xs font-bold text-white outline-none placeholder:text-slate-700 text-right"
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-8">
          <div className="space-y-4">
             <h4 className="text-[10px] font-black text-white uppercase tracking-[0.3em] opacity-40">Export Format</h4>
             <div className="grid grid-cols-5 gap-1.5 p-1 bg-white/[0.03] border border-white/10 rounded-xl">
               {(['original', 'png', 'jpeg', 'webp', 'avif'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => !forcedFormat && setGlobalFormat(fmt)}
                  disabled={!!forcedFormat}
                  className={cn(
                    "py-2 rounded-lg text-[9px] font-black transition-all",
                    globalFormat === fmt 
                      ? "bg-white text-black" 
                      : "text-slate-600 hover:text-white disabled:opacity-20"
                  )}
                >
                  {fmt === 'original' ? 'ORIG' : fmt.toUpperCase()}
                </button>
              ))}
             </div>
          </div>
          <div className="bg-blue-600/[0.03] border border-blue-500/10 rounded-xl p-4">
             <div className="text-[10px] font-bold text-blue-500/80 mb-1 flex items-center gap-2">
               <Info className="w-3 h-3" />
               SYSTEM NOTE
             </div>
             <p className="text-[11px] text-blue-200/60 font-medium leading-relaxed">
              {globalFormat === 'original' && "원본 인코딩 방식을 유지하면서 메타데이터 최적화 및 용량 압축을 진행합니다."}
              {globalFormat === 'png' && "투명도 채널(Alpha)을 보존하며 고정밀 색상 샘플링을 적용합니다."}
              {globalFormat === 'jpeg' && "서브샘플링 제어를 통해 시각적 손실 없이 효율적인 용량 절감을 수행합니다."}
              {globalFormat === 'webp' && "현대적 인코더를 사용하여 동일 품질 대비 JPEG 대비 최대 30% 더 낮은 용량을 제공합니다."}
              {globalFormat === 'avif' && "최신 AOMedia 비디오 1 코덱 기반으로 최고 수준의 품질과 압축비를 구현합니다."}
            </p>
          </div>
        </div>
      </div>

      {/* Main Action Surface */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => document.getElementById("fileInput")?.click()}
        className={cn(
          "group relative flex flex-col items-center justify-center py-24 rounded-[40px] transition-all cursor-pointer border-2 border-dashed",
          isDragging 
            ? "bg-white/10 border-white scale-[0.99] shadow-[0_0_50px_rgba(255,255,255,0.1)]" 
            : "bg-transparent border-white/5 hover:bg-white/[0.02] hover:border-white/20"
        )}
      >
        <input id="fileInput" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.avif" className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
        <div className="flex flex-col items-center space-y-6">
          <div className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
            <Upload className="w-5 h-5" />
          </div>
          <div className="text-center space-y-1">
            <h3 className="text-lg font-bold text-white tracking-tight">Drop images to process</h3>
            <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.2em]">MAX 20MB PER FILE</p>
          </div>
        </div>
      </div>

      {/* Processing Table */}
      {queue.length > 0 && (
        <div className="space-y-8 animate-fade-in">
          <div className="flex justify-between items-center px-4">
            <div className="flex items-center gap-4">
              <h2 className="text-sm font-black text-white uppercase tracking-widest">Active Queue</h2>
              <span className="text-[9px] font-black bg-white/5 text-slate-500 px-2 py-1 rounded border border-white/5">{queue.length} FILES</span>
            </div>
            {isAllDone && (
              <button 
                onClick={() => downloadAllAsZip(queue)}
                className="flex items-center gap-2 text-[10px] font-black bg-blue-600 text-white px-5 py-2.5 rounded-full hover:bg-blue-500 transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)]"
              >
                <Download className="w-3.5 h-3.5" />
                EXPORT ALL AS ZIP
              </button>
            )}
          </div>

          <div className="bg-white/[0.01] border border-white/5 rounded-[24px] overflow-hidden">
            <div className="divide-y divide-white/[0.03]">
              {queue.map((item) => (
                <div key={item.id} className="p-5 flex items-center gap-8 group hover:bg-white/[0.01] transition-colors">
                  <div className="flex-1 min-w-0 flex items-center gap-6">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="text-xs font-bold text-white truncate">{item.originalFile.name}</span>
                      <div className="flex items-center gap-2">
                         <StatusBadge status={item.status} />
                         <span className="text-[9px] font-bold text-slate-700 uppercase tracking-widest">{formatSize(item.originalSize)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="hidden sm:flex flex-col items-end gap-1 min-w-[120px]">
                    <div className="text-[9px] font-black text-slate-700 uppercase tracking-widest">Efficiency</div>
                    <div className={cn(
                      "text-lg font-black tracking-tighter",
                      item.reductionRate !== undefined ? "text-white" : "text-slate-900"
                    )}>
                      {item.reductionRate !== undefined ? `-${item.reductionRate.toFixed(1)}%` : "00.0%"}
                    </div>
                  </div>

                  <div className="flex items-center justify-center min-w-[40px]">
                    {item.status === "done" ? (
                      <button 
                        onClick={() => downloadSingle(item)}
                        className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white hover:text-black transition-all"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    ) : item.status === "queued" ? (
                      <button 
                        onClick={() => setQueue(q => q.filter(i => i.id !== item.id))}
                        className="w-10 h-10 flex items-center justify-center text-slate-700 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : (
                      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
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
  const labels = {
    queued: "Queued",
    uploading: "Uploading",
    compressing: "Processing",
    done: "Optimized",
    error: "Failed",
  };
  return (
    <span className={cn(
      "text-[8px] font-black uppercase tracking-[0.15em]",
      status === 'done' ? 'text-green-500' : status === 'error' ? 'text-red-500' : status === 'compressing' ? 'text-blue-500 animate-pulse' : 'text-slate-700'
    )}>
      {labels[status]}
    </span>
  );
}

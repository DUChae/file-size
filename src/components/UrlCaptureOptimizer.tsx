"use client";

import React, { useCallback, useRef, useState } from "react";
import { saveAs } from "file-saver";
import JSZip from "jszip";
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
  Plus,
  Trash2,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CompressionRequest,
  CompressionResponse,
  OutputFormat,
  UrlCaptureResponse,
} from "@/types/image";

type CaptureStatus = "idle" | "capturing" | "captured" | "compressing" | "done" | "error";

interface CaptureItem {
  id: string;
  url: string;
  displayUrl: string;
  status: CaptureStatus;
  error?: string;
  captureData?: UrlCaptureResponse;
  result?: OptimizedResult;
  targetWidth: number;
  targetHeight: number;
  targetX: number;
  targetY: number;
}

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

function createCaptureItem(rawUrl: string): CaptureItem | null {
  const normalized = rawUrl.trim().replace(/[)\].,;]+$/g, "");
  const withoutProtocol = normalized.replace(/^https?:\/\//i, "");
  const domain = withoutProtocol.split(/[/?#]/)[0]?.replace(/\.$/, "");

  if (!domain || !domain.includes(".")) {
    return null;
  }

  return {
    id: Math.random().toString(36).substring(2, 9),
    url: `http://${domain}`,
    displayUrl: domain.replace(/^www\./i, ""),
    status: "idle",
    targetWidth: 0,
    targetHeight: 0,
    targetX: 0,
    targetY: 0,
  };
}

export default function UrlCaptureOptimizer() {
  const [urls, setUrls] = useState<CaptureItem[]>([]);
  const [inputUrl, setInputUrl] = useState("");
  const [globalFormat, setGlobalFormat] = useState<OutputFormat>("png");
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const activeItem = urls.find((item) => item.id === activeItemId);

  const addUrl = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputUrl.trim()) return;
    
    // Robust regex to find URLs in any text
    const urlRegex = /(https?:\/\/[^\s,]+|(?:[a-zA-Z0-9가-힣][a-zA-Z0-9가-힣-]*\.)+[a-zA-Z가-힣]{2,}(?:\/[^\s,]*)?)/gi;
    const matches = inputUrl.match(urlRegex) || [];
    
    const newUrls = matches
      .map(createCaptureItem)
      .filter((item): item is CaptureItem => Boolean(item));

    if (newUrls.length > 0) {
      setUrls(prev => [...prev, ...newUrls]);
      setInputUrl("");
      if (!activeItemId) setActiveItemId(newUrls[0].id);
    }
  };

  const removeUrl = (id: string) => {
    setUrls(prev => prev.filter(item => item.id !== id));
    if (activeItemId === id) setActiveItemId(null);
  };

  const updateItem = useCallback((id: string, updates: Partial<CaptureItem>) => {
    setUrls(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  }, []);

  const handleCapture = async (item: CaptureItem) => {
    updateItem(item.id, { status: "capturing", error: undefined, captureData: undefined, result: undefined });

    try {
      const response = await fetch("/api/capture-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.url }),
      });
      const data = (await response.json()) as UrlCaptureResponse;

      if (!response.ok || !data.success || !data.sourceUrl || !data.width || !data.height) {
        throw new Error(data.error || "Failed to capture the page.");
      }

      updateItem(item.id, {
        status: "captured",
        captureData: data,
        targetWidth: data.width || 1440,
        targetHeight: data.height || 900,
        targetX: 0,
        targetY: 0,
      });
    } catch (err) {
      updateItem(item.id, {
        status: "error",
        error: err instanceof Error ? err.message : "Capture failed.",
      });
    }
  };

  const handleBatchCapture = async () => {
    const idleItems = urls.filter(u => u.status === "idle" || u.status === "error");
    for (const item of idleItems) {
      await handleCapture(item);
    }
  };

  const handleCompress = async (item: CaptureItem) => {
    if (!item.captureData?.sourceUrl || !item.captureData.filename || !item.captureData.captureId) return;

    updateItem(item.id, { status: "compressing", error: undefined, result: undefined });

    const payload: CompressionRequest = {
      sourceUrl: item.captureData.sourceUrl,
      filename: item.captureData.filename,
      mimeType: item.captureData.mimeType || "image/png",
      category: "screenshot",
      targetFormat: globalFormat,
      webWidth: item.targetWidth,
      webHeight: item.targetHeight,
      webX: item.targetX,
      webY: item.targetY,
      uploadId: item.captureData.captureId,
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

      const displayFilename = item.displayUrl + `.${globalFormat}`;

      updateItem(item.id, {
        status: "done",
        result: {
          filename: displayFilename,
          url: data.outputUrl,
          downloadUrl: data.outputDownloadUrl,
          originalSize: data.originalSize,
          optimizedSize: data.optimizedSize,
        }
      });
    } catch (err) {
      updateItem(item.id, {
        status: "error",
        error: err instanceof Error ? err.message : "Compression failed.",
      });
    }
  };

  const handleBatchCompress = async () => {
    const capturedItems = urls.filter(u => u.status === "captured" || u.status === "done");
    for (const item of capturedItems) {
      // Use full dimensions if they haven't been customized, or just force them for batch
      await handleCompress(item);
    }
  };

  const downloadZip = async () => {
    const completedResults = urls.filter(u => u.result).map(u => u.result!);
    if (completedResults.length === 0) return;

    const zip = new JSZip();
    const folder = zip.folder("captured-images");

    for (const res of completedResults) {
      const imgResponse = await fetch(res.url);
      const blob = await imgResponse.blob();
      folder?.file(res.filename, blob);
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "url-capture.zip");
  };

  const handleMoveStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!activeItem?.captureData || !previewRef.current) return;
      if ((event.target as HTMLElement).closest("button")) return;

      event.preventDefault();
      const { width: captureWidth, height: captureHeight } = activeItem.captureData;
      const startClientX = event.clientX;
      const startClientY = event.clientY;
      const startX = activeItem.targetX;
      const startY = activeItem.targetY;
      const previewRect = previewRef.current.getBoundingClientRect();
      const widthScale = (captureWidth || 1440) / previewRect.width;
      const heightScale = (captureHeight || 900) / previewRect.height;

      const handleMove = (moveEvent: PointerEvent) => {
        const deltaX = (moveEvent.clientX - startClientX) * widthScale;
        const deltaY = (moveEvent.clientY - startClientY) * heightScale;
        
        const nextX = Math.round(startX + deltaX);
        const nextY = Math.round(startY + deltaY);
        
        updateItem(activeItem.id, {
          targetX: Math.max(0, Math.min((captureWidth || 1440) - activeItem.targetWidth, nextX)),
          targetY: Math.max(0, Math.min((captureHeight || 900) - activeItem.targetHeight, nextY)),
          result: undefined,
          status: "captured"
        });
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [activeItem, updateItem],
  );

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!activeItem?.captureData || !previewRef.current) return;

      event.preventDefault();
      const { width: captureWidth, height: captureHeight } = activeItem.captureData;
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = activeItem.targetWidth;
      const startHeight = activeItem.targetHeight;
      const previewRect = previewRef.current.getBoundingClientRect();
      const widthScale = (captureWidth || 1440) / previewRect.width;
      const heightScale = (captureHeight || 900) / previewRect.height;

      const handleMove = (moveEvent: PointerEvent) => {
        const nextWidth = Math.round(startWidth + (moveEvent.clientX - startX) * widthScale);
        const nextHeight = Math.round(startHeight + (moveEvent.clientY - startY) * heightScale);
        
        updateItem(activeItem.id, {
          targetWidth: Math.max(320, Math.min((captureWidth || 1440) - activeItem.targetX, nextWidth)),
          targetHeight: Math.max(240, Math.min((captureHeight || 900) - activeItem.targetY, nextHeight)),
          result: undefined,
          status: "captured"
        });
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [activeItem, updateItem],
  );

  return (
    <div className="max-w-6xl mx-auto space-y-12">
      {/* Input Section */}
      <div className="bg-white/[0.02] border border-white/10 rounded-[32px] p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white">Capture Queue</h3>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Add multiple URLs to batch process</p>
            </div>
          </div>
          {urls.length > 0 && (
            <div className="flex gap-4">
              <Button 
                variant="outline" 
                onClick={handleBatchCapture}
                disabled={urls.every(u => u.status !== "idle" && u.status !== "error")}
                className="rounded-full border-white/10 text-xs font-black"
              >
                일괄 캡처 ({urls.filter(u => u.status === "idle" || u.status === "error").length})
              </Button>
              <Button 
                variant="blue" 
                onClick={handleBatchCompress}
                disabled={!urls.some(u => u.status === "captured" || u.status === "done")}
                className="rounded-full text-xs font-black px-8"
              >
                일괄 압축
              </Button>
            </div>
          )}
        </div>

        <form onSubmit={addUrl} className="flex gap-4">
          <div className="flex-1 flex items-center gap-4 bg-white/[0.03] border border-white/10 rounded-2xl px-5">
            <Globe2 className="w-5 h-5 text-slate-500 shrink-0" />
            <textarea
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="URL을 입력하세요 (엔터나 콤마로 여러 개 입력 가능)"
              className="w-full bg-transparent py-5 text-sm font-bold text-white outline-none placeholder:text-slate-700 resize-none h-16"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  addUrl();
                }
              }}
            />
          </div>
          <Button type="submit" variant="blue" size="xl" className="rounded-2xl px-10">
            큐에 추가
          </Button>
        </form>

        {urls.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {urls.map((item) => (
              <div 
                key={item.id}
                onClick={() => setActiveItemId(item.id)}
                className={cn(
                  "relative group flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer",
                  activeItemId === item.id 
                    ? "bg-white/10 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.1)]" 
                    : "bg-white/[0.03] border-white/5 hover:border-white/20"
                )}
              >
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                  {item.status === "capturing" || item.status === "compressing" ? (
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  ) : item.status === "done" ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <Globe2 className="w-4 h-4 text-slate-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-black text-white truncate">{item.displayUrl}</div>
                  <div className={cn(
                    "text-[9px] font-black uppercase tracking-widest mt-1",
                    item.status === "error" ? "text-red-500" : "text-slate-500"
                  )}>
                    {item.error || (item.status === "done" ? "최적화 완료" : item.status)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {item.result && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        saveAs(item.result!.downloadUrl, item.result!.filename);
                      }}
                      className="p-2 text-blue-400 hover:text-blue-300 transition-all"
                      title="개별 다운로드"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                  <button 
                    onClick={(e) => { e.stopPropagation(); removeUrl(item.id); }}
                    className="p-2 text-slate-600 hover:text-red-500 transition-all"
                    title="제거"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeItem && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-12 items-start animate-fade-in">
          {/* Preview Area */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black text-white tracking-tight">Workspace</h3>
                <p className="text-xs text-slate-500 font-black uppercase tracking-widest mt-1">{activeItem.displayUrl}</p>
              </div>
              <div className="flex gap-3">
                {(activeItem.status === "idle" || activeItem.status === "error") && (
                  <Button variant="blue" onClick={() => handleCapture(activeItem)} className="rounded-full px-8">
                    Start Capture
                  </Button>
                )}
                {activeItem.captureData?.downloadUrl && (
                  <Button 
                    variant="outline" 
                    onClick={() => saveAs(activeItem.captureData!.downloadUrl!, activeItem.captureData!.filename!)}
                    className="rounded-full border-white/10 text-xs font-black"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Original
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-black/40 p-6 overflow-auto max-h-[800px]">
              {activeItem.status === "capturing" ? (
                <div className="flex flex-col items-center justify-center py-40 space-y-6">
                  <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                  <div className="text-sm font-black text-slate-500 uppercase tracking-widest">Capturing Full Page...</div>
                </div>
              ) : activeItem.captureData?.sourceUrl ? (
                <div
                  ref={previewRef}
                  className="relative mx-auto overflow-hidden rounded-2xl border border-white/10 bg-white/5"
                  style={{ width: "min(100%, 800px)" }}
                >
                  <img
                    src={activeItem.captureData.sourceUrl}
                    alt="Preview"
                    className="block w-full select-none"
                    draggable={false}
                  />
                  <div
                    className="absolute border-2 border-blue-400 bg-blue-500/10 shadow-[0_0_40px_rgba(59,130,246,0.25)] cursor-move"
                    onPointerDown={handleMoveStart}
                    style={{
                      left: `${(activeItem.targetX / activeItem.captureData.width!) * 100}%`,
                      top: `${(activeItem.targetY / activeItem.captureData.height!) * 100}%`,
                      width: `${(activeItem.targetWidth / activeItem.captureData.width!) * 100}%`,
                      height: `${(activeItem.targetHeight / activeItem.captureData.height!) * 100}%`,
                    }}
                  >
                    <button
                      type="button"
                      onPointerDown={handleResizeStart}
                      className="absolute -bottom-4 -right-4 h-9 w-9 rounded-full bg-blue-500 text-white border border-white/30 flex items-center justify-center cursor-nwse-resize shadow-xl"
                    >
                      <Grip className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-40 opacity-20">
                  <Maximize2 className="w-16 h-16 mb-6" />
                  <div className="text-xs font-black uppercase tracking-widest">Select an item to preview</div>
                </div>
              )}
            </div>
          </div>

          {/* Settings Area */}
          <div className="space-y-8 bg-white/[0.02] border border-white/10 rounded-[32px] p-8">
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Batch Settings</h4>
              <div className="grid grid-cols-2 gap-2">
                {FORMAT_OPTIONS.map((format) => (
                  <button
                    key={format}
                    onClick={() => setGlobalFormat(format)}
                    className={cn(
                      "rounded-xl px-4 py-3 text-xs font-black uppercase tracking-wider transition-all",
                      globalFormat === format
                        ? "bg-white text-black"
                        : "bg-white/[0.04] text-slate-500 hover:text-white",
                    )}
                  >
                    {format}
                  </button>
                ))}
              </div>
            </div>

            {(activeItem.status === "captured" || activeItem.status === "done" || activeItem.status === "compressing") ? (
              <div className="space-y-6 pt-6 border-t border-white/5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Width</div>
                    <div className="text-lg font-black text-white">{activeItem.targetWidth}px</div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Height</div>
                    <div className="text-lg font-black text-white">{activeItem.targetHeight}px</div>
                  </div>
                </div>
                <Button 
                  onClick={() => handleCompress(activeItem)} 
                  variant="blue" 
                  size="xl" 
                  className="w-full rounded-2xl"
                  disabled={activeItem.status === "compressing"}
                >
                  {activeItem.status === "compressing" ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                  {activeItem.status === "done" ? "Re-compress" : "Compress Selection"}
                </Button>
              </div>
            ) : null}

            {urls.some(u => u.result) && (
              <div className="space-y-6 pt-8 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-green-400 text-xs font-black">
                    <CheckCircle2 className="w-4 h-4" />
                    {urls.filter(u => u.result).length} READY
                  </div>
                  <Button 
                    variant="ghost" 
                    onClick={downloadZip}
                    className="text-xs font-black text-blue-400 hover:text-blue-300"
                  >
                    <Layers className="w-4 h-4 mr-2" />
                    Export all (.ZIP)
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {urls.length === 0 && (
        <div className="flex flex-col items-center justify-center py-40 rounded-[48px] border-2 border-dashed border-white/5">
          <Globe2 className="w-16 h-16 text-slate-800 mb-8" />
          <h3 className="text-2xl font-bold text-white tracking-tight">Ready to capture the web.</h3>
          <p className="text-xs text-slate-600 font-black uppercase tracking-[0.3em] mt-3">Enter a URL above to start your batch session</p>
        </div>
      )}
    </div>
  );
}

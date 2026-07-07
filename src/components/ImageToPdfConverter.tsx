"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { saveAs } from "file-saver";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FileImage,
  FileOutput,
  FileSearch,
  Info,
  Loader2,
  Trash2,
} from "lucide-react";

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const A4_WIDTH_PX = 1240;
const A4_HEIGHT_PX = 1754;
const JPEG_QUALITY = 0.82;
const MAX_TOTAL_SIZE = 300 * 1024 * 1024;

type ConversionStatus = "idle" | "compressing" | "done" | "error";
type PdfImageMime = "image/jpeg" | "image/png";

interface ImageQueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  previewUrl: string;
  width: number | null;
  height: number | null;
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

function formatSize(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
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
  return ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type);
}

function getObjectUrlDimensions(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("이미지 크기를 읽을 수 없습니다."));
    image.src = url;
  });
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
      reject(new Error(`${file.name} 이미지를 읽을 수 없습니다.`));
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

function canvasToBlob(canvas: HTMLCanvasElement, type: PdfImageMime, quality?: number) {
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

async function prepareImageForPdf(item: ImageQueueItem): Promise<PreparedImage> {
  const image = await loadImageFromFile(item.file);
  const isLandscape = image.naturalWidth > image.naturalHeight;
  const targetWidthPx = isLandscape ? A4_HEIGHT_PX : A4_WIDTH_PX;
  const targetHeightPx = isLandscape ? A4_WIDTH_PX : A4_HEIGHT_PX;
  const pageWidth = isLandscape ? A4_HEIGHT_PT : A4_WIDTH_PT;
  const pageHeight = isLandscape ? A4_WIDTH_PT : A4_HEIGHT_PT;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: item.type === "image/png" });

  if (!context) {
    throw new Error("Canvas context를 만들 수 없습니다.");
  }

  canvas.width = targetWidthPx;
  canvas.height = targetHeightPx;
  context.clearRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min(targetWidthPx / image.naturalWidth, targetHeightPx / image.naturalHeight);
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

async function trackImagePdfEvent(payload: Record<string, unknown>) {
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

export default function ImageToPdfConverter() {
  const [items, setItems] = useState<ImageQueueItem[]>([]);
  const [status, setStatus] = useState<ConversionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [outputSize, setOutputSize] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const itemsRef = useRef<ImageQueueItem[]>([]);

  const isBusy = status === "compressing";
  const totalOriginalSize = useMemo(
    () => items.reduce((sum, item) => sum + item.size, 0),
    [items],
  );
  const totalCompressedSize = useMemo(
    () => items.reduce((sum, item) => sum + (item.compressedSize ?? 0), 0),
    [items],
  );

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  const handleFiles = async (files: FileList | null) => {
    if (!files || isBusy) return;

    setError(null);
    setStatus("idle");
    setOutputSize(null);

    const nextFiles = Array.from(files);
    const invalidFile = nextFiles.find((file) => !isSupportedImage(file));
    if (invalidFile) {
      setError("PNG, JPG, WebP 이미지만 업로드할 수 있습니다.");
      return;
    }

    const nextTotal = totalOriginalSize + nextFiles.reduce((sum, file) => sum + file.size, 0);
    if (nextTotal > MAX_TOTAL_SIZE) {
      setError(`총 업로드 용량은 ${formatSize(MAX_TOTAL_SIZE)} 이하여야 합니다.`);
      return;
    }

    const createdItems: ImageQueueItem[] = nextFiles.map((file) => ({
      id: `${crypto.randomUUID()}-${file.name}`,
      file,
      name: file.name.normalize("NFC"),
      size: file.size,
      type: file.type === "image/jpg" ? "image/jpeg" : file.type,
      previewUrl: URL.createObjectURL(file),
      width: null,
      height: null,
    }));

    setItems((current) => [...current, ...createdItems]);

    await Promise.all(
      createdItems.map(async (item) => {
        try {
          const dimensions = await getObjectUrlDimensions(item.previewUrl);
          setItems((current) =>
            current.map((currentItem) =>
              currentItem.id === item.id
                ? { ...currentItem, width: dimensions.width, height: dimensions.height }
                : currentItem,
            ),
          );
        } catch {
          setItems((current) =>
            current.map((currentItem) =>
              currentItem.id === item.id ? { ...currentItem, width: 0, height: 0 } : currentItem,
            ),
          );
        }
      }),
    );
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isBusy) setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files);
  };

  const removeItem = (id: string) => {
    setItems((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
    setStatus("idle");
    setOutputSize(null);
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    setItems((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;

      const next = [...current];
      const [target] = next.splice(index, 1);
      next.splice(nextIndex, 0, target);
      return next;
    });
    setStatus("idle");
    setOutputSize(null);
  };

  const clearItems = () => {
    items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setItems([]);
    setStatus("idle");
    setError(null);
    setOutputSize(null);
  };

  const handleConvert = async () => {
    if (items.length === 0 || isBusy) return;

    const orderedItems = [...items];
    setStatus("compressing");
    setError(null);
    setOutputSize(null);

    await trackImagePdfEvent({
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
        setItems((current) =>
          current.map((currentItem) =>
            currentItem.id === item.id
              ? { ...currentItem, compressedSize: prepared.compressedSize }
              : currentItem,
          ),
        );
      }

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
      const pdfBlob = new Blob([pdfBytesCopy.buffer], { type: "application/pdf" });
      const baseName = sanitizeFilename(orderedItems[0]?.name ?? "images");

      saveAs(pdfBlob, `${baseName}-merged.pdf`);
      setOutputSize(pdfBlob.size);
      setStatus("done");

      await trackImagePdfEvent({
        type: "pdf_job_success",
        status: "success",
        tool: "pdf",
        mode: "image-to-pdf",
        fileSize: preparedImages.reduce((sum, item) => sum + item.originalSize, 0),
        optimizedSize: pdfBlob.size,
        pageCount: preparedImages.length,
      });
    } catch (conversionError) {
      const message =
        conversionError instanceof Error
          ? conversionError.message
          : "Image to PDF 변환에 실패했습니다.";

      await trackImagePdfEvent({
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

  return (
    <div className="max-w-5xl mx-auto space-y-16 py-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-12 pb-16 border-b border-white/5">
        <div className="space-y-6 max-w-2xl">
          <div className="space-y-3">
            <h4 className="text-xs font-black text-blue-500 uppercase tracking-[0.4em] opacity-80 flex items-center gap-2">
              <FileImage className="w-4 h-4" />
              Document Assembly
            </h4>
            <h2 className="text-4xl font-black text-white tracking-ultra-tight uppercase">
              Image to PDF
            </h2>
          </div>
          <p className="text-base text-slate-400 font-medium leading-relaxed">
            PNG, JPG, WebP 이미지를 업로드한 뒤 페이지 순서를 조정하고, 현재 순서 그대로 A4 PDF 1개를 생성합니다. 가로 이미지는 A4 가로 페이지, 세로 이미지는 A4 세로 페이지에 맞춰 압축됩니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 shrink-0">
          <label className={cn("cursor-pointer", isBusy && "pointer-events-none opacity-60")}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              multiple
              className="hidden"
              disabled={isBusy}
              onChange={(event) => {
                void handleFiles(event.target.files);
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
                SELECT IMAGES
              </div>
            </Button>
          </label>
          <Button
            variant="blue"
            size="lg"
            onClick={handleConvert}
            disabled={items.length === 0 || isBusy}
            className="rounded-full h-14 px-10 text-xs font-black tracking-widest shadow-[0_0_30px_rgba(59,130,246,0.3)] hover:scale-105"
          >
            {isBusy ? (
              <>
                <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                PROCESSING
              </>
            ) : (
              <>
                <FileOutput className="w-5 h-5 mr-3" />
                PDF 변환
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-8 space-y-4">
          <div className="text-xs font-black text-slate-600 uppercase tracking-widest">
            Page Order
          </div>
          <div className="text-sm text-white font-bold flex items-center gap-3">
            <div className={cn("w-2 h-2 rounded-full", items.length ? "bg-blue-500" : "bg-slate-800")} />
            {items.length ? `${items.length} pages ready` : "No images"}
          </div>
        </div>
        <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-8 space-y-4">
          <div className="text-xs font-black text-slate-600 uppercase tracking-widest">
            Source Size
          </div>
          <div className="text-3xl font-black text-white">{formatSize(totalOriginalSize)}</div>
        </div>
        <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-8 space-y-4">
          <div className="text-xs font-black text-slate-600 uppercase tracking-widest">
            Job Status
          </div>
          <div
            className={cn(
              "text-xs font-black flex items-center gap-3 uppercase tracking-widest",
              status === "done"
                ? "text-green-500"
                : status === "error"
                  ? "text-red-500"
                  : status === "compressing"
                    ? "text-blue-500"
                    : "text-slate-500",
            )}
          >
            {status === "idle" && "Arrange pages"}
            {status === "compressing" && <Loader2 className="w-4 h-4 animate-spin" />}
            {status === "compressing" && "Compressing..."}
            {status === "done" && <CheckCircle2 className="w-4 h-4" />}
            {status === "done" && `Complete ${outputSize ? formatSize(outputSize) : ""}`}
            {status === "error" && <AlertCircle className="w-4 h-4" />}
            {status === "error" && "Engine Error"}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/10 bg-red-500/[0.04] p-8 flex items-start gap-6 animate-fade-in shadow-2xl">
          <AlertCircle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h5 className="text-sm font-black text-red-500 uppercase tracking-widest">
              System Alert
            </h5>
            <p className="text-base text-red-200/80 font-medium leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      <div
        className={cn(
          "space-y-5 rounded-3xl border border-transparent transition-all",
          isDragging && "border-blue-500/40 bg-blue-500/[0.04] p-4",
        )}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-slate-500 bg-white/[0.01] p-5 rounded-2xl border border-white/5">
            <Info className="w-5 h-5 shrink-0" />
            <p className="text-xs font-bold uppercase tracking-[0.15em] leading-relaxed">
              The visible list order becomes the PDF page order. Conversion starts only after pressing PDF 변환.
            </p>
          </div>
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearItems}
              disabled={isBusy}
              className="self-start md:self-auto rounded-full text-slate-500 hover:bg-white/5 hover:text-white"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {items.length === 0 ? (
            <div
              className={cn(
                "rounded-3xl border border-dashed bg-white/[0.02] p-12 text-center transition-all",
                isDragging ? "border-blue-500/60" : "border-white/10",
              )}
            >
              <div className="space-y-3">
                <div className="text-sm font-black text-slate-500 uppercase tracking-widest">
                  Drop PNG, JPG, or WebP images
                </div>
                <div className="text-xs font-bold uppercase tracking-[0.15em] text-slate-700">
                  or use SELECT IMAGES
                </div>
              </div>
            </div>
          ) : (
            items.map((item, index) => (
              <div
                key={item.id}
                className="grid grid-cols-[64px_1fr_auto] items-center gap-5 rounded-2xl border border-white/5 bg-white/[0.02] p-4"
              >
                <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-white/10 bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.previewUrl}
                    alt=""
                    className="h-full w-full object-contain"
                  />
                  <div className="absolute left-1 top-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-black text-white">
                    {index + 1}
                  </div>
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="truncate text-sm font-black text-white">{item.name}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold uppercase tracking-widest text-slate-600">
                    <span>{formatSize(item.size)}</span>
                    {item.width && item.height ? <span>{item.width} x {item.height}</span> : null}
                    {item.compressedSize ? <span>PDF asset {formatSize(item.compressedSize)}</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveItem(index, -1)}
                    disabled={isBusy || index === 0}
                    className="rounded-full text-slate-500 hover:bg-white/5 hover:text-white"
                    title="Move up"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveItem(index, 1)}
                    disabled={isBusy || index === items.length - 1}
                    className="rounded-full text-slate-500 hover:bg-white/5 hover:text-white"
                    title="Move down"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(item.id)}
                    disabled={isBusy}
                    className="rounded-full text-slate-500 hover:bg-red-500/10 hover:text-red-400"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {totalCompressedSize > 0 && (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 text-xs font-bold uppercase tracking-[0.15em] text-slate-500">
          Compressed image assets: {formatSize(totalCompressedSize)}
        </div>
      )}
    </div>
  );
}

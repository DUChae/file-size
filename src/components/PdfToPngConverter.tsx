"use client";

import React, { useMemo, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Button } from "@/components/ui/button";
import { FileSearch, FileOutput, Loader2, CheckCircle2, AlertCircle, Info, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  PDFJS_DOCUMENT_OPTIONS,
  canvasToBlob,
  getSafeRenderScale,
  isPasswordError,
  isPdfFile,
  loadPdfjs,
  releaseCanvas,
} from "@/lib/pdfjs";

const MAX_PDF_SIZE = 20 * 1024 * 1024;
const DPI_OPTIONS = [72, 144, 216, 300] as const;
type Dpi = (typeof DPI_OPTIONS)[number];

function formatSize(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function sanitizeFilename(name: string) {
  const normalized = name.normalize("NFC");
  let safe = normalized.replace(/[^\p{L}\p{N}._-]/gu, "-");
  if (!safe.replace(/-+/g, "").trim()) {
    safe = "converted";
  }
  return safe;
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

export default function PdfToPngConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "converting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [dpi, setDpi] = useState<Dpi>(144);

  const fileSummary = useMemo(() => {
    if (!file) return null;
    return `${file.name} (${formatSize(file.size)})`;
  }, [file]);

  const handleFileChange = (nextFile: File | null) => {
    setError(null);
    setStatus("idle");
    setPageCount(null);
    setProgress(0);

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
      setError("PDF 파일은 20MB 이하여야 합니다.");
      return;
    }

    setFile(nextFile);
  };

  const handleConvert = async () => {
    if (!file) return;

    setStatus("converting");
    setError(null);

    await trackPdfEvent({
      type: "pdf_job_started",
      status: "started",
      tool: "pdf",
      filename: file.name,
      fileSize: file.size,
    });

    let pdf: PDFDocumentProxy | null = null;

    try {
      const pdfjs = await loadPdfjs();
      const bytes = await file.arrayBuffer();
      pdf = await pdfjs.getDocument({ data: bytes, ...PDFJS_DOCUMENT_OPTIONS }).promise;
      setPageCount(pdf.numPages);
      setProgress(0);

      const baseName = sanitizeFilename(file.name.replace(/\.pdf$/i, ""));
      const pages: Array<{ name: string; blob: Blob }> = [];
      const canvas = document.createElement("canvas");

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = getSafeRenderScale(baseViewport.width, baseViewport.height, dpi / 72);
        const viewport = page.getViewport({ scale });
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Canvas context를 만들 수 없습니다.");
        }

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        await page.render({
          canvas,
          canvasContext: context,
          viewport,
        }).promise;

        const blob = await canvasToBlob(canvas, "image/png");
        pages.push({
          name: `${baseName}-page-${String(pageNumber).padStart(2, "0")}.png`,
          blob,
        });

        page.cleanup();
        setProgress(pageNumber);
      }

      releaseCanvas(canvas);

      if (pages.length === 1) {
        saveAs(pages[0].blob, `${baseName}.png`);
      } else {
        const zip = new JSZip();
        pages.forEach(({ name, blob }) => zip.file(name, blob));
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, `${baseName}-png.zip`);
      }

      await trackPdfEvent({
        type: "pdf_job_success",
        status: "success",
        tool: "pdf",
        filename: file.name,
        fileSize: file.size,
        pageCount: pdf.numPages,
      });

      setStatus("done");
    } catch (conversionError) {
      const message = isPasswordError(conversionError)
        ? "암호로 보호된 PDF는 변환할 수 없습니다. 암호를 해제한 뒤 다시 시도해주세요."
        : conversionError instanceof Error
          ? conversionError.message
          : "PDF 변환에 실패했습니다.";

      await trackPdfEvent({
        type: "pdf_job_error",
        status: "error",
        tool: "pdf",
        filename: file.name,
        fileSize: file.size,
        error: message,
      });

      setStatus("error");
      setError(message);
    } finally {
      await pdf?.destroy();
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-20 py-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-12 pb-16 border-b border-white/5">
        <div className="space-y-6 max-w-2xl">
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-teal-300 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Document Processing
            </h4>
            <h2 className="text-4xl font-black text-white tracking-ultra-tight uppercase">PDF to PNG</h2>
          </div>
          <p className="text-base text-slate-400 font-medium leading-relaxed">
            고해상도 렌더링 엔진을 통해 PDF 문서를 정밀하게 분석하고 고품질 PNG 이미지로 변환합니다. 여러 페이지는 단일 ZIP 패키지로, 한 페이지는 PNG 파일로 즉시 다운로드됩니다.
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            />
            <Button variant="outline" size="lg" asChild className="rounded-full border-white/10 hover:bg-white/5 text-white h-14 px-10">
              <div className="cursor-pointer font-black text-xs tracking-widest">
                <FileSearch className="w-5 h-5 mr-3" />
                SELECT PDF
              </div>
            </Button>
          </label>
          <Button 
            variant="blue" 
            size="lg" 
            onClick={handleConvert}
            disabled={!file || status === "converting"}
            className="rounded-2xl h-14 px-8 text-xs font-black tracking-widest active:scale-[0.98]"
          >
            {status === "converting" ? (
              <>
                <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                PROCESSING
              </>
            ) : (
              <>
                <FileOutput className="w-5 h-5 mr-3" />
                CONVERT NOW
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-8 space-y-4">
        <div className="text-xs font-black text-slate-600 uppercase tracking-widest">Resolution</div>
        <div className="grid grid-cols-4 gap-2 p-1.5 bg-black/20 border border-white/10 rounded-2xl">
          {DPI_OPTIONS.map((option) => (
            <button
              key={option}
              onClick={() => setDpi(option)}
              disabled={status === "converting"}
              className={cn(
                "py-3 rounded-xl text-[11px] font-black transition-all tracking-wider active:scale-[0.98] disabled:opacity-40",
                dpi === option ? "bg-white text-black shadow-xl" : "text-slate-500 hover:text-white",
              )}
            >
              {option} DPI
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-8 space-y-4">
          <div className="text-xs font-black text-slate-600 uppercase tracking-widest">Source Document</div>
          <div className="text-sm text-white font-bold truncate flex items-center gap-3">
            {file ? <div className="w-2 h-2 rounded-full bg-teal-300" /> : <div className="w-2 h-2 rounded-full bg-slate-800" />}
            {fileSummary ?? "No selection"}
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-8 space-y-4">
          <div className="text-xs font-black text-slate-600 uppercase tracking-widest">Page Count</div>
          <div className="text-3xl font-black text-white">{pageCount ?? "--"}</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-8 space-y-4">
          <div className="text-xs font-black text-slate-600 uppercase tracking-widest">Job Status</div>
          <div className={cn(
            "text-xs font-black flex items-center gap-3 uppercase tracking-widest",
            status === 'done' ? "text-green-500" : status === 'error' ? "text-red-500" : status === 'converting' ? "text-teal-300" : "text-slate-500"
          )}>
            {status === "idle" && "Ready"}
            {status === "converting" && <Loader2 className="w-4 h-4 animate-spin" />}
            {status === "converting" &&
              (pageCount ? `Converting ${progress} / ${pageCount}` : "Converting...")}
            {status === "done" && <CheckCircle2 className="w-4 h-4" />}
            {status === "done" && "Complete"}
            {status === "error" && <AlertCircle className="w-4 h-4" />}
            {status === "error" && "Engine Error"}
          </div>
        </div>
      </div>

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
          Optimized for professional documents under 20MB. All processing remains private and occurs locally within your secure browser environment.
        </p>
      </div>
    </div>
  );
}

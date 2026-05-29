"use client";

import React, { useMemo, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Button } from "@/components/ui/button";
import { FileSearch, FileOutput, Download, Loader2, CheckCircle2, AlertCircle, Info, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_PDF_SIZE = 20 * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function sanitizeFilename(name: string) {
  return name.replace(/[^\w.-]+/g, "-");
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  return pdfjs;
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

  const fileSummary = useMemo(() => {
    if (!file) return null;
    return `${file.name} (${formatSize(file.size)})`;
  }, [file]);

  const handleFileChange = (nextFile: File | null) => {
    setError(null);
    setStatus("idle");
    setPageCount(null);

    if (!nextFile) {
      setFile(null);
      return;
    }

    if (nextFile.type !== "application/pdf") {
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

    try {
      const pdfjs = await loadPdfjs();
      const bytes = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: bytes }).promise;
      setPageCount(pdf.numPages);

      const zip = new JSZip();
      const baseName = sanitizeFilename(file.name.replace(/\.pdf$/i, ""));

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
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

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((result) => {
            if (result) {
              resolve(result);
              return;
            }

            reject(new Error("PNG 변환에 실패했습니다."));
          }, "image/png");
        });

        zip.file(`${baseName}-page-${String(pageNumber).padStart(2, "0")}.png`, blob);
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${baseName}-png.zip`);

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
      const message = conversionError instanceof Error ? conversionError.message : "PDF 변환에 실패했습니다.";

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
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-16 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 pb-12 border-b border-white/5">
        <div className="space-y-4 max-w-xl">
          <div className="space-y-2">
            <h4 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] opacity-80 flex items-center gap-2">
              <FileText className="w-3 h-3" />
              Document Processing
            </h4>
            <h2 className="text-3xl font-black text-white tracking-ultra-tight uppercase">PDF to PNG</h2>
          </div>
          <p className="text-sm text-slate-500 font-medium leading-relaxed">
            고해상도 엔진을 통해 PDF 문서를 픽셀 단위로 분석하고 고품질 PNG 이미지로 변환합니다. 모든 페이지는 단일 ZIP 패키지로 자동 구성됩니다.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            />
            <Button variant="outline" size="lg" asChild className="rounded-full border-white/10 hover:bg-white/5 text-white h-12 px-8">
              <div className="cursor-pointer font-bold text-xs">
                <FileSearch className="w-4 h-4 mr-2" />
                SELECT PDF
              </div>
            </Button>
          </label>
          <Button 
            variant="blue" 
            size="lg" 
            onClick={handleConvert}
            disabled={!file || status === "converting"}
            className="rounded-full h-12 px-8 text-xs font-bold"
          >
            {status === "converting" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                PROCESSING
              </>
            ) : (
              <>
                <FileOutput className="w-4 h-4 mr-2" />
                CONVERT NOW
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-3">
          <div className="text-[9px] font-black text-slate-700 uppercase tracking-widest">Source Document</div>
          <div className="text-xs text-white font-bold truncate flex items-center gap-2">
            {file ? <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> : <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />}
            {fileSummary ?? "No selection"}
          </div>
        </div>
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-3">
          <div className="text-[9px] font-black text-slate-700 uppercase tracking-widest">Page Count</div>
          <div className="text-xl font-black text-white">{pageCount ?? "--"}</div>
        </div>
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-3">
          <div className="text-[9px] font-black text-slate-700 uppercase tracking-widest">Job Status</div>
          <div className={cn(
            "text-[10px] font-black flex items-center gap-2 uppercase tracking-wide",
            status === 'done' ? "text-green-500" : status === 'error' ? "text-red-500" : status === 'converting' ? "text-blue-500" : "text-slate-600"
          )}>
            {status === "idle" && "Ready"}
            {status === "converting" && <Loader2 className="w-3 h-3 animate-spin" />}
            {status === "converting" && "Converting..."}
            {status === "done" && <CheckCircle2 className="w-3 h-3" />}
            {status === "done" && "Complete"}
            {status === "error" && <AlertCircle className="w-3 h-3" />}
            {status === "error" && "Engine Error"}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/10 bg-red-500/[0.03] p-5 flex items-start gap-4 animate-fade-in">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h5 className="text-xs font-black text-red-500 uppercase tracking-wider">System Alert</h5>
            <p className="text-xs text-red-200/60 font-medium">{error}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 text-slate-700">
        <Info className="w-3.5 h-3.5" />
        <p className="text-[10px] font-bold uppercase tracking-[0.1em]">
          Optimized for documents under 20MB. Processing happens locally in-browser.
        </p>
      </div>
    </div>
  );
}

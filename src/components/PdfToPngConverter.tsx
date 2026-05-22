"use client";

import React, { useMemo, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

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
    return `${file.name} · ${formatSize(file.size)}`;
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
    <div className="glass-panel rounded-3xl p-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-black text-white tracking-tighter uppercase mb-3">PDF to PNG</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            PDF 각 페이지를 브라우저에서 렌더링한 뒤 PNG로 변환하고 ZIP 파일로 내려줍니다.
          </p>
        </div>

        <div className="flex gap-3">
          <label className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-sm font-black text-slate-200 cursor-pointer hover:bg-white/10 transition-colors">
            SELECT PDF
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            />
          </label>
          <button
            onClick={handleConvert}
            disabled={!file || status === "converting"}
            className="px-5 py-3 rounded-2xl bg-blue-600 text-white text-sm font-black disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors"
          >
            {status === "converting" ? "CONVERTING" : "EXPORT PNG"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Input</div>
          <div className="text-sm text-white font-bold break-all">{fileSummary ?? "No PDF selected"}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Pages</div>
          <div className="text-sm text-white font-bold">{pageCount ?? "-"}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Status</div>
          <div className="text-sm font-bold text-white">
            {status === "idle" && "Ready"}
            {status === "converting" && "Converting"}
            {status === "done" && "Done"}
            {status === "error" && "Error"}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}

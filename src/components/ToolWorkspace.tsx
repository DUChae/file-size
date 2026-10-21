"use client";

import ImageOptimizer from "@/components/ImageOptimizer";
import ImageToPdfConverter from "@/components/ImageToPdfConverter";
import PdfToPngConverter from "@/components/PdfToPngConverter";
import UrlCaptureOptimizer from "@/components/UrlCaptureOptimizer";
import ImageBgRemover from "@/components/ImageBgRemover";
import PdfCompressor from "@/components/PdfCompressor";
import { AppShell } from "@/components/ui/app-shell";
import { ToolTabs } from "@/components/ui/tool-tabs";
import { CONVERT_MODES, TOOLS, type ConvertMode, type ToolId } from "@/lib/tools";

interface ToolWorkspaceProps {
  tool: ToolId;
  mode: ConvertMode;
}

export default function ToolWorkspace({ tool, mode }: ToolWorkspaceProps) {
  const title = TOOLS.find((item) => item.id === tool)?.label;

  return (
    <AppShell activeTool={tool}>
      <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <h1 className="text-title font-bold tracking-[-0.02em]">{title}</h1>
          {tool === "convert" && (
            <ToolTabs
              items={CONVERT_MODES}
              activeId={mode}
              variant="sub"
              aria-label="변환 종류"
            />
          )}
        </div>

        {/* 같은 자리의 같은 컴포넌트는 상태를 이어받는다(기존 동작 유지). */}
        <div className="relative min-h-[500px] animate-fade-in">
          {tool === "capture" ? (
            <UrlCaptureOptimizer />
          ) : tool === "remove-bg" ? (
            <ImageBgRemover />
          ) : tool === "compress" ? (
            <ImageOptimizer />
          ) : tool === "pdf-compress" ? (
            <PdfCompressor />
          ) : mode === "pdf-to-png" ? (
            <PdfToPngConverter />
          ) : mode === "image-to-pdf" ? (
            <ImageToPdfConverter />
          ) : (
            <ImageOptimizer forcedFormat={mode} />
          )}
        </div>
      </div>
    </AppShell>
  );
}

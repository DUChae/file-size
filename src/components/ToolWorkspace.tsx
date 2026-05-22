"use client";

import React, { useState } from "react";
import ImageOptimizer from "@/components/ImageOptimizer";
import PdfToPngConverter from "@/components/PdfToPngConverter";

type WorkspaceMode = "image-optimizer" | "pdf-to-png";

const WORKSPACE_MODES: Array<{ id: WorkspaceMode; label: string; description: string }> = [
  {
    id: "image-optimizer",
    label: "Image Optimizer",
    description: "PNG, JPG, JPEG optimization with mode presets.",
  },
  {
    id: "pdf-to-png",
    label: "PDF to PNG",
    description: "Render each PDF page as PNG and export a ZIP.",
  },
];

export default function ToolWorkspace() {
  const [mode, setMode] = useState<WorkspaceMode>("image-optimizer");

  return (
    <div className="max-w-6xl mx-auto px-4">
      <div className="glass-panel rounded-3xl p-8 mb-12">
        <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-4">Mode Configuration</h4>
        <div className="grid gap-3 md:grid-cols-2">
          {WORKSPACE_MODES.map((option) => (
            <button
              key={option.id}
              onClick={() => setMode(option.id)}
              className={`rounded-2xl border p-4 text-left transition-all ${
                mode === option.id
                  ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20"
                  : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
              }`}
            >
              <div className="text-sm font-black uppercase tracking-wide">{option.label}</div>
              <div className={`mt-2 text-xs font-medium ${mode === option.id ? "text-blue-100" : "text-slate-500"}`}>
                {option.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {mode === "image-optimizer" ? <ImageOptimizer /> : <PdfToPngConverter />}
    </div>
  );
}

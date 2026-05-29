"use client";

import React, { useState } from "react";
import ImageOptimizer from "@/components/ImageOptimizer";
import PdfToPngConverter from "@/components/PdfToPngConverter";
import { ImageCategory } from "@/types/image";

type Category = "compressing" | "converter";
type ToolMode = ImageCategory | "pdf-to-png" | "webp" | "avif";

const CATEGORIES: Array<{ id: Category; label: string; description: string }> = [
  {
    id: "compressing",
    label: "Compressing",
    description: "PNG, JPG, JPEG optimization with mode presets.",
  },
  {
    id: "converter",
    label: "Converter",
    description: "Convert documents to images and other formats.",
  },
];

const COMPRESSING_MODES: Array<{ id: ImageCategory; label: string; description: string }> = [
  { id: "screenshot", label: "Screenshot", description: "Extreme compression for UI/Text" },
  { id: "photo", label: "Photography", description: "Texture-preserved JPEG compression" },
  { id: "web", label: "Web Engine", description: "Aggressive optimization with resizing" },
  { id: "high-quality", label: "Lossless", description: "Metadata removal only" },
];

const CONVERTER_MODES: Array<{ id: "pdf-to-png" | "webp" | "avif"; label: string; description: string }> = [
  { id: "pdf-to-png", label: "PDF to PNG", description: "Render PDF pages as images" },
  { id: "webp", label: "Image to WebP", description: "Convert any image to WebP" },
  { id: "avif", label: "Image to AVIF", description: "Convert any image to AVIF" },
];

export default function ToolWorkspace() {
  const [category, setCategory] = useState<Category>("compressing");
  const [mode, setMode] = useState<ToolMode>("screenshot");

  const handleCategoryChange = (newCat: Category) => {
    setCategory(newCat);
    if (newCat === "compressing") {
      setMode("screenshot");
    } else {
      setMode("pdf-to-png");
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4">
      {/* Category Selection */}
      <div className="glass-panel rounded-3xl p-8 mb-6">
        <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-4">Category Configuration</h4>
        <div className="grid gap-3 md:grid-cols-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryChange(cat.id)}
              className={`rounded-2xl border p-4 text-left transition-all ${
                category === cat.id
                  ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20"
                  : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
              }`}
            >
              <div className="text-sm font-black uppercase tracking-wide">{cat.label}</div>
              <div className={`mt-2 text-xs font-medium ${category === cat.id ? "text-blue-100" : "text-slate-500"}`}>
                {cat.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Sub-mode Selection */}
      <div className="glass-panel rounded-3xl p-8 mb-12">
        <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-4">Mode Selection</h4>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(category === "compressing" ? COMPRESSING_MODES : CONVERTER_MODES).map((option) => (
            <button
              key={option.id}
              onClick={() => setMode(option.id)}
              className={`px-3 py-3 rounded-xl text-[12px] font-bold border transition-all ${
                mode === option.id
                  ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20"
                  : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
              }`}
            >
              <div className="uppercase tracking-wide">{option.label}</div>
              <div className={`mt-1 text-[10px] opacity-60 ${mode === option.id ? "text-blue-100" : "text-slate-500"}`}>
                {option.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {category === "compressing" ? (
        <ImageOptimizer category={mode as ImageCategory} />
      ) : mode === "pdf-to-png" ? (
        <PdfToPngConverter />
      ) : (
        <ImageOptimizer category="photo" forcedFormat={mode as "webp" | "avif"} />
      )}
    </div>
  );
}

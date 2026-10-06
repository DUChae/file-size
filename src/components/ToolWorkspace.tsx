"use client";

import React, { useState } from "react";
import ImageOptimizer from "@/components/ImageOptimizer";
import ImageToPdfConverter from "@/components/ImageToPdfConverter";
import PdfToPngConverter from "@/components/PdfToPngConverter";
import UrlCaptureOptimizer from "@/components/UrlCaptureOptimizer";
import ImageBgRemover from "@/components/ImageBgRemover";
import PdfCompressor from "@/components/PdfCompressor";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Package,
  RefreshCcw,
  FileType,
  FileOutput,
  Layers,
  Command,
  Camera,
  Files,
  Sparkles,
  FileDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Category =
  | "compressing"
  | "pdf-compress"
  | "converter"
  | "url-capture"
  | "bg-removal";
type ConverterMode = "pdf-to-png" | "image-to-pdf" | "webp" | "avif";

const CONVERTER_MODES: Array<{
  id: ConverterMode;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: "pdf-to-png",
    label: "PDF → PNG",
    description: "고해상도 이미지 변환",
    icon: <FileType className="w-4 h-4" />,
  },
  {
    id: "image-to-pdf",
    label: "Image → PDF",
    description: "순서 기반 A4 PDF 생성",
    icon: <Files className="w-4 h-4" />,
  },
  {
    id: "webp",
    label: "WebP 변환",
    description: "현대적 웹 포맷 인코딩",
    icon: <FileOutput className="w-4 h-4" />,
  },
  {
    id: "avif",
    label: "AVIF 변환",
    description: "차세대 초고압축 인코딩",
    icon: <Layers className="w-4 h-4" />,
  },
];

export default function ToolWorkspace() {
  const [category, setCategory] = useState<Category>("compressing");
  const [mode, setMode] = useState<ConverterMode>("pdf-to-png");

  const handleCategoryChange = (newCat: string) => {
    setCategory(newCat as Category);
  };

  return (
    <div className="max-w-6xl mx-auto px-5 py-14 md:py-16 animate-fade-in">
      {/* Hero Section */}
      <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-end mb-16">
        <div className="space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3.5 py-1.5 text-xs font-semibold text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <Command className="w-3.5 h-3.5" />
          Pro Image Processing
        </div>
        <h1 className="max-w-3xl text-5xl md:text-7xl font-black tracking-ultra-tight text-white leading-[0.95]">
          IMAGE <span className="text-teal-300">LAB.</span>
        </h1>
        <p className="text-lg md:text-xl text-slate-400 font-medium max-w-2xl leading-relaxed">
          압축/변환을 목적으로 합니다.
          <br /> 개선사항 혹은 요청사항은 우측상단 feedback을 남겨주세요.
        </p>
        </div>
        <div className="hidden md:grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-2 backdrop-blur-xl">
          {["Local", "A4 PDF", "Batch"].map((item) => (
            <div key={item} className="rounded-xl bg-black/20 px-4 py-3 text-center text-xs font-bold text-slate-300">
              {item}
            </div>
          ))}
        </div>
      </div>

      <Tabs
        value={category}
        onValueChange={handleCategoryChange}
        className="w-full space-y-12"
      >
        <div className="flex justify-start overflow-x-auto pb-2">
          <TabsList className="h-[52px] rounded-2xl border border-white/10 bg-white/[0.045] p-1.5 backdrop-blur-xl">
            <TabsTrigger
              value="compressing"
              className="rounded-xl px-6 text-sm font-bold text-slate-400 data-[state=active]:bg-white data-[state=active]:text-black transition-all"
            >
              <Package className="w-4 h-4 mr-2" />
              이미지 압축
            </TabsTrigger>
            <TabsTrigger
              value="pdf-compress"
              className="rounded-xl px-6 text-sm font-bold text-slate-400 data-[state=active]:bg-white data-[state=active]:text-black transition-all"
            >
              <FileDown className="w-4 h-4 mr-2" />
              PDF 압축
            </TabsTrigger>
            <TabsTrigger
              value="converter"
              className="rounded-xl px-6 text-sm font-bold text-slate-400 data-[state=active]:bg-white data-[state=active]:text-black transition-all"
            >
              <RefreshCcw className="w-4 h-4 mr-2" />
              포맷 변환
            </TabsTrigger>
            <TabsTrigger
              value="url-capture"
              className="rounded-xl px-6 text-sm font-bold text-slate-400 data-[state=active]:bg-white data-[state=active]:text-black transition-all"
            >
              <Camera className="w-4 h-4 mr-2" />
              웹페이지 캡처
            </TabsTrigger>
            <TabsTrigger
              value="bg-removal"
              className="rounded-xl px-6 text-sm font-bold text-slate-400 data-[state=active]:bg-white data-[state=active]:text-black transition-all"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              배경 제거
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Command Center Layout */}
        <div className="grid grid-cols-1 gap-1 border-t border-white/10 pt-10">
          {/* Sub-mode Selector - Minimalist Pill Buttons */}
          {category === "converter" && (
            <div className="flex flex-wrap gap-3 mb-14">
              {CONVERTER_MODES.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setMode(option.id)}
                  className={cn(
                    "group relative flex items-center gap-2.5 px-5 py-3.5 rounded-2xl border text-sm font-bold transition-all active:scale-[0.98]",
                    mode === option.id
                      ? "bg-white border-white text-black shadow-[0_16px_50px_rgba(255,255,255,0.12)]"
                      : "bg-white/[0.025] border-white/10 text-slate-500 hover:border-white/20 hover:bg-white/[0.045] hover:text-white",
                  )}
                >
                  {option.icon}
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Tool Surface */}
          <div className="relative min-h-[500px]">
            {category === "url-capture" ? (
              <UrlCaptureOptimizer />
            ) : category === "bg-removal" ? (
              <ImageBgRemover />
            ) : category === "compressing" ? (
              <ImageOptimizer />
            ) : category === "pdf-compress" ? (
              <PdfCompressor />
            ) : mode === "pdf-to-png" ? (
              <PdfToPngConverter />
            ) : mode === "image-to-pdf" ? (
              <ImageToPdfConverter />
            ) : (
              <ImageOptimizer forcedFormat={mode as "webp" | "avif"} />
            )}
          </div>
        </div>
      </Tabs>

      {/* Footer Branding */}
      <div className="mt-28 pt-10 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-6 opacity-60 hover:opacity-100 transition-all">
        <div className="text-xs font-semibold text-white">
          Engineered for performance & privacy.
        </div>
        <div className="flex flex-wrap justify-center gap-5 text-xs font-medium text-slate-400">
          <span>GPU Accelerated</span>
          <span>Lossless Encoding</span>
          <span>Zero Server Storage</span>
        </div>
      </div>
    </div>
  );
}

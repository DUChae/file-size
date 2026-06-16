"use client";

import React, { useState } from "react";
import ImageOptimizer from "@/components/ImageOptimizer";
import PdfToPngConverter from "@/components/PdfToPngConverter";
import UrlCaptureOptimizer from "@/components/UrlCaptureOptimizer";
import { ImageCategory } from "@/types/image";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Package,
  RefreshCcw,
  Layout,
  Image as ImageIcon,
  Globe,
  ShieldCheck,
  FileType,
  FileOutput,
  Layers,
  Command,
  Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Category = "compressing" | "converter" | "url-capture";
type ToolMode = ImageCategory | "pdf-to-png" | "webp" | "avif";

const COMPRESSING_MODES: Array<{
  id: ImageCategory;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: "screenshot",
    label: "스크린샷",
    description: "UI 및 텍스트 최적화",
    icon: <Layout className="w-4 h-4" />,
  },
  {
    id: "photo",
    label: "사진",
    description: "질감 보존 JPEG 압축",
    icon: <ImageIcon className="w-4 h-4" />,
  },
  {
    id: "web",
    label: "웹 엔진",
    description: "리사이징 및 초경량화",
    icon: <Globe className="w-4 h-4" />,
  },
  {
    id: "high-quality",
    label: "고품질",
    description: "메타데이터 무손실 압축",
    icon: <ShieldCheck className="w-4 h-4" />,
  },
];

const CONVERTER_MODES: Array<{
  id: "pdf-to-png" | "webp" | "avif";
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
  const [mode, setMode] = useState<ToolMode>("screenshot");

  const handleCategoryChange = (newCat: string) => {
    const cat = newCat as Category;
    setCategory(cat);
    if (cat === "compressing") {
      setMode("screenshot");
    } else if (cat === "converter") {
      setMode("pdf-to-png");
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-20 animate-fade-in">
      {/* Hero Section */}
      <div className="flex flex-col items-center text-center space-y-6 mb-24">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-black text-slate-400 uppercase tracking-widest">
          <Command className="w-3.5 h-3.5" />
          Pro Image Processing
        </div>
        <h1 className="text-6xl md:text-8xl font-black tracking-ultra-tight text-white leading-none">
          IMAGE <span className="text-blue-500">LAB.</span>
        </h1>
        <p className="text-xl md:text-2xl text-slate-400 font-medium max-w-2xl leading-relaxed">
          압축/변환을 목적으로 합니다.
          <br /> 개선사항 혹은 요청사항은 우측상단 feedback을 남겨주세요.
        </p>
      </div>

      <Tabs
        value={category}
        onValueChange={handleCategoryChange}
        className="w-full space-y-16"
      >
        <div className="flex justify-center">
          <TabsList className="bg-white/[0.03] border border-white/[0.08] p-1.5 h-14 rounded-full">
            <TabsTrigger
              value="compressing"
              className="rounded-full px-10 text-sm font-black data-[state=active]:bg-white data-[state=active]:text-black transition-all"
            >
              <Package className="w-4 h-4 mr-2" />
              이미지 압축
            </TabsTrigger>
            <TabsTrigger
              value="converter"
              className="rounded-full px-10 text-sm font-black data-[state=active]:bg-white data-[state=active]:text-black transition-all"
            >
              <RefreshCcw className="w-4 h-4 mr-2" />
              포맷 변환
            </TabsTrigger>
            <TabsTrigger
              value="url-capture"
              className="rounded-full px-10 text-sm font-black data-[state=active]:bg-white data-[state=active]:text-black transition-all"
            >
              <Camera className="w-4 h-4 mr-2" />
              웹페이지 캡처
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Command Center Layout */}
        <div className="grid grid-cols-1 gap-1 border-t border-white/5 pt-16">
          {/* Sub-mode Selector - Minimalist Pill Buttons */}
          {category !== "url-capture" && (
            <div className="flex flex-wrap justify-center gap-3 mb-24">
              {(category === "compressing"
                ? COMPRESSING_MODES
                : CONVERTER_MODES
              ).map((option) => (
                <button
                  key={option.id}
                  onClick={() => setMode(option.id)}
                  className={cn(
                    "group relative flex items-center gap-3 px-8 py-4 rounded-full border text-sm font-black transition-all",
                    mode === option.id
                      ? "bg-white border-white text-black shadow-[0_0_40px_rgba(255,255,255,0.2)]"
                      : "bg-transparent border-white/10 text-slate-500 hover:border-white/30 hover:text-white",
                  )}
                >
                  {option.icon}
                  {option.label}
                  {mode === option.id && (
                    <span className="text-[10px] font-black opacity-40 ml-1 hidden md:inline tracking-widest">
                      ACTIVE
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Tool Surface */}
          <div className="relative min-h-[500px]">
            {category === "url-capture" ? (
              <UrlCaptureOptimizer />
            ) : category === "compressing" ? (
              <ImageOptimizer category={mode as ImageCategory} />
            ) : mode === "pdf-to-png" ? (
              <PdfToPngConverter />
            ) : (
              <ImageOptimizer
                category="photo"
                forcedFormat={mode as "webp" | "avif"}
              />
            )}
          </div>
        </div>
      </Tabs>

      {/* Footer Branding */}
      <div className="mt-40 pt-16 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8 opacity-40 grayscale hover:opacity-100 hover:grayscale-0 transition-all">
        <div className="text-xs font-black text-white uppercase tracking-widest">
          Engineered for performance & privacy.
        </div>
        <div className="flex gap-12 text-xs font-bold text-slate-400 uppercase tracking-widest">
          <span>GPU Accelerated</span>
          <span>Lossless Encoding</span>
          <span>Zero Server Storage</span>
        </div>
      </div>
    </div>
  );
}

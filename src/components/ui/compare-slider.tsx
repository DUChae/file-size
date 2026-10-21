"use client";
// 원본과 결과를 겹쳐 놓고 경계선을 끌어 비교하는 슬라이더

import { useEffect, useRef, useState } from "react";
import { ChevronsLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Dimensions {
  width: number;
  height: number;
}

interface CompareSliderProps {
  originalFile: File;
  resultUrl: string;
  /** 접근 가능한 이름에 쓰는 파일명 */
  name: string;
  originalLabel?: React.ReactNode;
  resultLabel?: React.ReactNode;
  /** 투명 배경 결과를 체커보드 위에 그린다 */
  checkerboard?: boolean;
  onOriginalLoad?: (dimensions: Dimensions) => void;
  onResultLoad?: (dimensions: Dimensions) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function CompareSlider({
  originalFile,
  resultUrl,
  name,
  originalLabel = "원본",
  resultLabel = "결과",
  checkerboard,
  onOriginalLoad,
  onResultLoad,
  className,
  style,
}: CompareSliderProps) {
  const originalRef = useRef<HTMLImageElement>(null);
  const [position, setPosition] = useState(50);

  // 큐에는 File만 있다. 원본 미리보기 URL은 이 슬라이더가 보이는 동안만 유지한다.
  useEffect(() => {
    const img = originalRef.current;
    if (!img) return;
    const url = URL.createObjectURL(originalFile);
    img.src = url;
    return () => {
      img.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [originalFile]);

  return (
    <div
      className={cn(
        "relative select-none overflow-hidden bg-bg",
        checkerboard &&
          "bg-[conic-gradient(var(--color-surface-2)_25%,var(--color-surface)_0_50%,var(--color-surface-2)_0_75%,var(--color-surface)_0)] bg-[length:20px_20px]",
        className,
      )}
      style={style}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resultUrl}
        alt={`${name} 결과`}
        onLoad={(event) =>
          onResultLoad?.({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          })
        }
        className="absolute inset-0 size-full object-contain"
        draggable={false}
      />
      {/* src는 위 effect가 넣어 blob: URL을 해제할 수 있게 한다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={originalRef}
        alt={`${name} 원본`}
        onLoad={(event) =>
          onOriginalLoad?.({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          })
        }
        className="absolute inset-0 size-full object-contain"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        draggable={false}
      />

      <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-bg/85 px-2 py-1 text-xs font-semibold text-text">
        {originalLabel}
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-md bg-bg/85 px-2 py-1 text-xs font-semibold text-text">
        {resultLabel}
      </span>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-label={`${name} 비교 위치`}
        aria-valuetext={`원본 ${position}% · 결과 ${100 - position}%`}
        className="peer absolute inset-0 z-10 size-full cursor-ew-resize opacity-0"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-text"
        style={{ left: `${position}%` }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-text text-bg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
        style={{ left: `${position}%` }}
      >
        <ChevronsLeftRight className="size-4" />
      </span>
    </div>
  );
}

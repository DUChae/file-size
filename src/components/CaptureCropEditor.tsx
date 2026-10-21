"use client";
// 전체 페이지 캡처 위에서 저장할 영역을 끌어 옮기고 크기를 바꾸는 편집기

import { useRef } from "react";
import { MoveDiagonal2 } from "lucide-react";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_CROP_WIDTH = 320;
export const MIN_CROP_HEIGHT = 240;

/** 캡처 범위와 최소 크기 안으로 영역을 맞춘다 */
export function clampCrop(
  rect: CropRect,
  pageWidth: number,
  pageHeight: number,
): CropRect {
  const width = Math.round(
    Math.min(pageWidth, Math.max(MIN_CROP_WIDTH, rect.width)),
  );
  const height = Math.round(
    Math.min(pageHeight, Math.max(MIN_CROP_HEIGHT, rect.height)),
  );
  return {
    width,
    height,
    x: Math.round(Math.max(0, Math.min(pageWidth - width, rect.x))),
    y: Math.round(Math.max(0, Math.min(pageHeight - height, rect.y))),
  };
}

interface CaptureCropEditorProps {
  src: string;
  name: string;
  pageWidth: number;
  pageHeight: number;
  rect: CropRect;
  onChange: (rect: CropRect) => void;
  disabled?: boolean;
}

export function CaptureCropEditor({
  src,
  name,
  pageWidth,
  pageHeight,
  rect,
  onChange,
  disabled,
}: CaptureCropEditorProps) {
  const pageRef = useRef<HTMLDivElement>(null);

  // 화면 좌표의 이동량을 캡처 픽셀로 바꿔 드래그 동안 계속 반영한다.
  const startDrag = (event: React.PointerEvent, mode: "move" | "resize") => {
    if (disabled || !pageRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = pageRef.current.getBoundingClientRect();
    const scaleX = pageWidth / bounds.width;
    const scaleY = pageHeight / bounds.height;
    const startX = event.clientX;
    const startY = event.clientY;
    const start = rect;

    const onMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) * scaleX;
      const dy = (moveEvent.clientY - startY) * scaleY;
      const next =
        mode === "move"
          ? { ...start, x: start.x + dx, y: start.y + dy }
          : {
              ...start,
              width: Math.min(start.width + dx, pageWidth - start.x),
              height: Math.min(start.height + dy, pageHeight - start.y),
            };
      onChange(clampCrop(next, pageWidth, pageHeight));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="absolute inset-0 overflow-y-auto overscroll-contain">
      <div ref={pageRef} className="relative overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`${name} 전체 페이지 캡처`}
          className="block w-full select-none"
          draggable={false}
        />
        <div
          onPointerDown={(event) => startDrag(event, "move")}
          className="absolute cursor-move touch-none border-2 border-text shadow-[0_0_0_9999px_rgb(14_15_18/0.6)]"
          style={{
            left: `${(rect.x / pageWidth) * 100}%`,
            top: `${(rect.y / pageHeight) * 100}%`,
            width: `${(rect.width / pageWidth) * 100}%`,
            height: `${(rect.height / pageHeight) * 100}%`,
          }}
          aria-hidden="true"
        >
          <span
            onPointerDown={(event) => startDrag(event, "resize")}
            className="absolute -bottom-1 -right-1 flex size-8 cursor-nwse-resize touch-none items-center justify-center rounded-md bg-text text-bg"
          >
            <MoveDiagonal2 className="size-4" />
          </span>
        </div>
      </div>
    </div>
  );
}

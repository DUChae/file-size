"use client";

// 압축 전후 이미지를 슬라이더로 겹쳐 비교하는 모달

import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { QueueItem } from "@/types/image";
import { downloadSingle } from "@/utils/download";
import { Button } from "@/components/ui/button";
import { formatSize } from "@/lib/format";

const CHECKERBOARD =
  "repeating-conic-gradient(#1f2024 0% 25%, #141518 0% 50%) 50% / 20px 20px";

interface Dimensions {
  width: number;
  height: number;
}

export default function ImageCompareDialog({
  item,
  onClose,
}: {
  item: QueueItem;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const originalImgRef = useRef<HTMLImageElement>(null);
  const [position, setPosition] = useState(50);
  const [originalDims, setOriginalDims] = useState<Dimensions | null>(
    item.width && item.height
      ? { width: item.width, height: item.height }
      : null,
  );
  const [resultDims, setResultDims] = useState<Dimensions | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // The queue only keeps the File; this preview URL lives as long as the dialog.
  useEffect(() => {
    const img = originalImgRef.current;
    if (!img) return;
    const url = URL.createObjectURL(item.originalFile);
    img.src = url;
    return () => {
      img.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [item.originalFile]);

  const optimizedSize = item.optimizedSize ?? 0;
  const change =
    item.originalSize > 0
      ? ((optimizedSize - item.originalSize) / item.originalSize) * 100
      : 0;
  const aspect = originalDims
    ? originalDims.width / originalDims.height
    : 4 / 3;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="compare-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-5xl rounded-3xl border border-white/10 bg-[#0c0d10] p-0 text-slate-50 shadow-2xl shadow-black/60 backdrop:bg-black/80 backdrop:backdrop-blur-sm"
    >
      <div className="space-y-5 p-4 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">결과 비교</p>
            <h2
              id="compare-title"
              className="truncate text-lg font-black text-white"
            >
              {item.originalFile.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="비교 닫기"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className="relative mx-auto select-none overflow-hidden rounded-2xl border border-white/10"
          style={{
            aspectRatio: String(aspect),
            width: `min(100%, calc(65dvh * ${aspect}))`,
            background: CHECKERBOARD,
          }}
        >
          {item.optimizedUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.optimizedUrl}
              alt={`${item.originalFile.name} 압축 결과`}
              onLoad={(event) =>
                setResultDims({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              className="absolute inset-0 h-full w-full object-contain"
            />
          )}
          {/* src is set by the effect above so the blob: URL can be revoked. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={originalImgRef}
            alt={`${item.originalFile.name} 원본`}
            onLoad={(event) =>
              setOriginalDims({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            className="absolute inset-0 h-full w-full object-contain"
            style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          />

          <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white">
            원본
          </span>
          <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-teal-300/90 px-2.5 py-1 text-[11px] font-bold text-black">
            결과
          </span>

          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={position}
            onChange={(event) => setPosition(Number(event.target.value))}
            aria-label="비교 위치"
            aria-valuetext={`원본 ${position}% · 결과 ${100 - position}%`}
            className="peer absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.4)]"
            style={{ left: `${position}%` }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xs font-black text-black shadow-lg peer-focus-visible:ring-2 peer-focus-visible:ring-teal-300 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black"
            style={{ left: `${position}%` }}
          >
            ⇆
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:flex sm:gap-8">
            <div>
              <dt className="text-xs font-semibold text-slate-500">원본</dt>
              <dd className="font-bold text-white tabular-nums">
                {formatSize(item.originalSize)}
                {originalDims &&
                  ` · ${originalDims.width}×${originalDims.height}`}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">결과</dt>
              <dd className="font-bold text-white tabular-nums">
                {formatSize(optimizedSize)}
                {resultDims && ` · ${resultDims.width}×${resultDims.height}`}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">변화</dt>
              <dd
                className={
                  change <= 0
                    ? "font-bold text-teal-300 tabular-nums"
                    : "font-bold text-amber-300 tabular-nums"
                }
              >
                {change <= 0 ? "-" : "+"}
                {Math.abs(change).toFixed(1)}%{change > 0 && " (용량 증가)"}
              </dd>
            </div>
          </dl>
          <Button
            type="button"
            variant="primary"
            onClick={() => downloadSingle(item)}
            className="rounded-2xl"
          >
            <Download />
            결과 저장
            {item.optimizedFilename && (
              <span className="sr-only"> {item.optimizedFilename}</span>
            )}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

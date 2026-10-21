"use client";
// 이미지 큐를 상태별 행(완료·처리 중·대기·실패)의 타일로 보여 주고, 초점 받은 타일 하나를 크게 펼친다

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Download, Maximize2, Trash2, X } from "lucide-react";
import type { QueueItem } from "@/types/image";
import { Button } from "@/components/ui/button";
import { CompareSlider, type Dimensions } from "@/components/ui/compare-slider";
import { FocusTile } from "@/components/ui/focus-tile";
import { MediaTile, type TileStatus } from "@/components/ui/media-tile";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { formatSize } from "@/lib/format";
import { cn } from "@/lib/utils";

const GROUPS: { status: TileStatus; title: string }[] = [
  { status: "done", title: "처리 완료" },
  { status: "processing", title: "처리 중" },
  { status: "queued", title: "대기" },
  { status: "error", title: "실패" },
];

const TILE_WIDTH = 200;
const TILE_GAP = 16;
// 펼친 타일: 비교 544 + 정보 292 + 테두리 4
const FOCUS_WIDTH = 840;

export function tileStatusOf(item: QueueItem): TileStatus {
  switch (item.status) {
    case "done":
      return "done";
    case "error":
      return "error";
    case "queued":
      return "queued";
    default:
      return "processing";
  }
}

export function isExpandable(item: QueueItem) {
  return item.status === "done" || item.status === "queued";
}

/** 감소율 표기. 줄면 "−84%", 늘면 "+12%" */
export function formatChange(original: number, optimized: number) {
  if (original <= 0) return "0%";
  const change = ((optimized - original) / original) * 100;
  const sign = change > 0 ? "+" : change < 0 ? "−" : "";
  return `${sign}${Math.abs(change).toFixed(Math.abs(change) >= 10 ? 0 : 1)}%`;
}

function formatLabelOf(item: QueueItem) {
  const ext = item.originalFile.name.split(".").pop()?.toUpperCase() ?? "";
  return ext === "JPG" ? "JPEG" : ext;
}

function outputFormatLabel(item: QueueItem) {
  if (item.targetFormat === "original") return `원본 (${formatLabelOf(item)})`;
  return item.targetFormat === "webp"
    ? "WebP"
    : item.targetFormat.toUpperCase();
}

// 투명도를 가질 수 있는 결과만 체커보드 위에 그린다.
function mayHaveAlpha(item: QueueItem) {
  const format =
    item.targetFormat === "original"
      ? formatLabelOf(item).toLowerCase()
      : item.targetFormat;
  return ["png", "webp", "avif", "gif"].includes(format);
}

function scaledSize(item: QueueItem, percent: number) {
  if (!item.width || !item.height) return null;
  const width = Math.max(1, Math.round((item.width * percent) / 100));
  return {
    width,
    height: Math.max(1, Math.round((item.height * width) / item.width)),
  };
}

/** 원본 파일을 초점 타일에서만 크게 보여 준다. URL은 펼친 동안만 유지한다. */
function OriginalPreview({ file, name }: { file: File; name: string }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = ref.current;
    if (!img) return;
    const url = URL.createObjectURL(file);
    img.src = url;
    return () => {
      img.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [file]);
  return (
    // 원본 File의 blob: URL이라 next/image 최적화를 거치지 않는다.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      alt={`${name} 원본`}
      className="absolute inset-0 size-full object-contain"
    />
  );
}

interface BoardProps {
  queue: QueueItem[];
  expandedId: string | null;
  /** 사용자가 직접 고른 타일을 펼친다 */
  onExpand: (id: string) => void;
  now: number;
  isRunning: boolean;
  /** "압축" 또는 "변환" */
  verb: string;
  resizeEnabled: boolean;
  globalScale: number;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onCompare: (id: string) => void;
  onSave: (item: QueueItem) => void;
  onCustomScale: (id: string, value: number | undefined) => void;
  describeError: (item: QueueItem) => string;
}

function DoneFocus({
  item,
  onCompare,
  onSave,
}: {
  item: QueueItem;
  onCompare: () => void;
  onSave: () => void;
}) {
  const [resultDims, setResultDims] = useState<Dimensions | null>(null);
  const name = item.originalFile.name;
  const optimized = item.optimizedSize ?? 0;
  const increased = optimized > item.originalSize;
  const resized =
    resultDims &&
    item.width &&
    (resultDims.width !== item.width || resultDims.height !== item.height);

  const badge =
    item.targetBytes !== undefined
      ? item.targetMet
        ? {
            tone: "success" as const,
            label: `목표 ${formatSize(item.targetBytes)} 달성`,
          }
        : {
            tone: "warning" as const,
            label: `목표 ${formatSize(item.targetBytes)} 미달`,
          }
      : increased
        ? { tone: "warning" as const, label: "용량 증가" }
        : { tone: "success" as const, label: "완료" };

  const details = [
    { label: "품질", value: item.qualityUsed ?? item.quality ?? "—" },
    {
      label: "메타데이터",
      value: item.stripMetadata === false ? "유지" : "EXIF·GPS 제거됨",
    },
    { label: "출력 포맷", value: outputFormatLabel(item) },
  ];
  if (resized && resultDims) {
    details.push({
      label: "해상도",
      value: `${resultDims.width} × ${resultDims.height}`,
    });
  }
  if (item.targetBytes !== undefined && !item.targetMet) {
    details.push({ label: "도움말", value: "크기 조절을 함께 켜 보세요" });
  }

  return (
    <FocusTile
      media={
        item.optimizedUrl ? (
          <CompareSlider
            originalFile={item.originalFile}
            resultUrl={item.optimizedUrl}
            name={name}
            originalLabel={`원본 · ${formatSize(item.originalSize)}`}
            resultLabel={`결과 · ${formatSize(optimized)}`}
            checkerboard={mayHaveAlpha(item)}
            onResultLoad={setResultDims}
            className="absolute inset-0"
          />
        ) : null
      }
      badge={badge}
      title={name}
      subtitle={
        item.width && item.height
          ? `${item.width} × ${item.height} · ${formatLabelOf(item)}`
          : formatLabelOf(item)
      }
      metric={formatChange(item.originalSize, optimized)}
      metricTone={increased ? "warning" : "default"}
      sizeLine={`${formatSize(item.originalSize)} → ${formatSize(optimized)}`}
      details={details}
      actions={
        <>
          <Button onClick={onCompare}>
            <Maximize2 aria-hidden="true" />
            크게 비교
          </Button>
          <Button variant="inverse" onClick={onSave}>
            <Download aria-hidden="true" />
            저장
            <span className="sr-only"> {item.optimizedFilename ?? name}</span>
          </Button>
        </>
      }
    />
  );
}

function QueuedFocus({
  item,
  isRunning,
  resizeEnabled,
  globalScale,
  onRemove,
  onCustomScale,
}: {
  item: QueueItem;
  isRunning: boolean;
  resizeEnabled: boolean;
  globalScale: number;
  onRemove: () => void;
  onCustomScale: (value: number | undefined) => void;
}) {
  const name = item.originalFile.name;
  const scale = resizeEnabled ? (item.customScale ?? globalScale) : 100;
  const target = scaledSize(item, scale);

  return (
    <FocusTile
      media={<OriginalPreview file={item.originalFile} name={name} />}
      badge={{ tone: "neutral", label: "대기" }}
      title={name}
      subtitle={
        item.width && item.height
          ? `${item.width} × ${item.height} · ${formatLabelOf(item)}`
          : formatLabelOf(item)
      }
      sizeLine={formatSize(item.originalSize)}
      details={[
        { label: "출력 포맷", value: outputFormatLabel(item) },
        {
          label: "결과 해상도",
          value:
            target && scale < 100
              ? `${target.width} × ${target.height}`
              : "원본 유지",
        },
      ]}
      extra={
        resizeEnabled ? (
          <div className="space-y-1">
            <Switch
              label="이 파일만 다른 비율"
              checked={item.customScale !== undefined}
              disabled={isRunning}
              onCheckedChange={(checked) =>
                onCustomScale(checked ? globalScale : undefined)
              }
            />
            {item.customScale !== undefined && (
              <div className="flex items-center gap-3">
                <Slider
                  min={10}
                  max={100}
                  step={5}
                  value={[item.customScale]}
                  disabled={isRunning}
                  onValueChange={([value]) => onCustomScale(value)}
                  aria-label={`${name} 비율`}
                />
                <span className="w-11 text-right text-sm font-semibold">
                  {item.customScale}%
                </span>
              </div>
            )}
          </div>
        ) : undefined
      }
      actions={
        <Button variant="danger" onClick={onRemove} disabled={isRunning}>
          <Trash2 aria-hidden="true" />
          목록에서 제거
        </Button>
      }
    />
  );
}

export function ImageResultBoard({
  queue,
  expandedId,
  onExpand,
  now,
  isRunning,
  verb,
  resizeEnabled,
  globalScale,
  onRemove,
  onRetry,
  onCompare,
  onSave,
  onCustomScale,
  describeError,
}: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  // 그리드 전체가 Tab 한 번에 들어오고, 안에서는 방향키로 옮긴다.
  const [rovingId, setRovingId] = useState<string | null>(null);
  const tabStopId =
    (rovingId && queue.some((item) => item.id === rovingId)
      ? rovingId
      : null) ??
    expandedId ??
    queue[0]?.id;

  const groups = GROUPS.map((group) => ({
    ...group,
    items: queue.filter((item) => tileStatusOf(item) === group.status),
  })).filter((group) => group.items.length > 0);

  // 클릭하면 focus와 click이 연달아 오므로 진행 중인 전환과 같은 요청은 한 번만 처리한다.
  const pendingRef = useRef<string | null>(null);
  const expand = (id: string) => {
    if (id === expandedId || id === pendingRef.current) return;
    const item = queue.find((entry) => entry.id === id);
    if (!item || !isExpandable(item)) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (!document.startViewTransition || reduceMotion) {
      onExpand(id);
      return;
    }
    pendingRef.current = id;
    const transition = document.startViewTransition(() =>
      flushSync(() => onExpand(id)),
    );
    // 다른 전환이 끼어들어 건너뛰어도 오류로 남기지 않는다.
    transition.ready.catch(() => {});
    transition.finished
      .catch(() => {})
      .finally(() => {
        if (pendingRef.current === id) pendingRef.current = null;
      });
  };

  const focusTile = (id: string | undefined) => {
    if (!id) return;
    setRovingId(id);
    boardRef.current
      ?.querySelector<HTMLElement>(`[data-tile-id="${id}"]`)
      ?.focus();
  };

  const onTileKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    item: QueueItem,
  ) => {
    // 비교 슬라이더·버튼 등 타일 안 컨트롤의 키는 건드리지 않는다.
    if (event.target !== event.currentTarget) return;
    const ids = Array.from(
      boardRef.current?.querySelectorAll<HTMLElement>("[data-tile-id]") ?? [],
    ).map((element) => element.dataset.tileId as string);
    const index = ids.indexOf(item.id);

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusTile(ids[Math.min(index + 1, ids.length - 1)]);
        return;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusTile(ids[Math.max(index - 1, 0)]);
        return;
      case "Home":
        event.preventDefault();
        focusTile(ids[0]);
        return;
      case "End":
        event.preventDefault();
        focusTile(ids[ids.length - 1]);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        if (item.status === "done") onCompare(item.id);
        else if (item.status === "error") onRetry(item.id);
        else expand(item.id);
        return;
      case "Delete":
      case "Backspace":
        if (isRunning || (item.status !== "queued" && item.status !== "error"))
          return;
        event.preventDefault();
        onRemove(item.id);
        focusTile(ids[index + 1] ?? ids[index - 1]);
        return;
    }
  };

  const metaOf = (item: QueueItem) => {
    const size = formatSize(item.originalSize);
    switch (tileStatusOf(item)) {
      case "done":
        return `${size} → ${formatSize(item.optimizedSize ?? 0)} · ${formatChange(
          item.originalSize,
          item.optimizedSize ?? 0,
        )}`;
      case "processing": {
        const seconds = item.startedAt
          ? Math.max(0, Math.floor((now - item.startedAt) / 1000))
          : 0;
        return `${size} · ${verb} 중 ${seconds}초`;
      }
      case "error":
        return `${size} · 실패`;
      default:
        return item.customScale !== undefined && resizeEnabled
          ? `${size} · 대기 중 · 비율 ${item.customScale}%`
          : `${size} · 대기 중`;
    }
  };

  return (
    <div ref={boardRef} className="space-y-3">
      <p className="text-xs text-muted">
        타일에서 방향키로 이동 · Enter로 크게 비교 · Delete로 목록에서 제거
      </p>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-7">
        {groups.map((group) => {
          const hasExpanded = group.items.some(
            (item) => item.id === expandedId,
          );
          const basis =
            group.items.length * (TILE_WIDTH + TILE_GAP) +
            (hasExpanded ? FOCUS_WIDTH - TILE_WIDTH : 0);
          return (
            <section
              key={group.status}
              aria-labelledby={`group-${group.status}`}
              className="min-w-0 space-y-3"
              style={{ flex: `${group.items.length} 1 ${basis}px` }}
            >
              <h2
                id={`group-${group.status}`}
                className="flex items-baseline gap-1.5 text-base font-bold"
              >
                {group.title}
                <span className="font-medium text-muted">
                  ({group.items.length})
                </span>
              </h2>
              <div className="flex flex-wrap items-start gap-4">
                {group.items.map((item) => {
                  const expanded = item.id === expandedId;
                  const name = item.originalFile.name;
                  const status = tileStatusOf(item);
                  return (
                    <div
                      key={item.id}
                      data-tile-id={item.id}
                      tabIndex={item.id === tabStopId ? 0 : -1}
                      role="group"
                      aria-label={`${name} · ${metaOf(item)}`}
                      onFocus={(event) => {
                        if (event.target !== event.currentTarget) return;
                        setRovingId(item.id);
                        expand(item.id);
                      }}
                      onClick={() => {
                        setRovingId(item.id);
                        expand(item.id);
                      }}
                      onKeyDown={(event) => onTileKeyDown(event, item)}
                      style={{ viewTransitionName: `tile-${item.id}` }}
                      className={cn(
                        "rounded-tile outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-accent",
                        expanded
                          ? "w-full @min-[54rem]:w-[840px]"
                          : "w-[calc(50%-0.5rem)] cursor-pointer sm:w-[200px]",
                      )}
                    >
                      {expanded && item.status === "done" ? (
                        <DoneFocus
                          item={item}
                          onCompare={() => onCompare(item.id)}
                          onSave={() => onSave(item)}
                        />
                      ) : expanded && item.status === "queued" ? (
                        <QueuedFocus
                          item={item}
                          isRunning={isRunning}
                          resizeEnabled={resizeEnabled}
                          globalScale={globalScale}
                          onRemove={() => onRemove(item.id)}
                          onCustomScale={(value) =>
                            onCustomScale(item.id, value)
                          }
                        />
                      ) : (
                        <MediaTile
                          name={name}
                          status={status}
                          thumbnailUrl={item.thumbnailUrl}
                          meta={metaOf(item)}
                          error={
                            status === "error" ? describeError(item) : undefined
                          }
                          onRetry={
                            status === "error"
                              ? () => onRetry(item.id)
                              : undefined
                          }
                          dimmed={hasExpanded}
                          checkerboard={mayHaveAlpha(item)}
                          actions={
                            (status === "queued" || status === "error") &&
                            !isRunning ? (
                              <button
                                type="button"
                                // 키보드는 타일에서 Delete로 지운다. 이 버튼은 마우스·터치용.
                                tabIndex={-1}
                                aria-label={`${name} 목록에서 제거`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onRemove(item.id);
                                }}
                                className="flex size-8 items-center justify-center rounded-md bg-bg/85 text-muted transition-colors hover:text-text"
                              >
                                <X className="size-4" aria-hidden="true" />
                              </button>
                            ) : undefined
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

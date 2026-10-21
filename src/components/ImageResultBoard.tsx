"use client";
// 이미지 큐를 공용 타일 보드에 올리고, 펼친 타일에 압축 결과 비교나 대기 파일 설정을 보여 준다

import { useEffect, useRef, useState } from "react";
import { Download, Maximize2, Trash2 } from "lucide-react";
import type { QueueItem } from "@/types/image";
import { Button } from "@/components/ui/button";
import { CompareSlider, type Dimensions } from "@/components/ui/compare-slider";
import { FocusTile } from "@/components/ui/focus-tile";
import type { TileStatus } from "@/components/ui/media-tile";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { TileBoard, type BoardGroup } from "@/components/TileBoard";
import { formatSize } from "@/lib/format";

const GROUPS: BoardGroup[] = [
  { key: "done", title: "처리 완료" },
  { key: "processing", title: "처리 중" },
  { key: "queued", title: "대기" },
  { key: "error", title: "실패" },
];

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
export function OriginalPreview({ file, name }: { file: File; name: string }) {
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

  const tiles = queue.map((item) => {
    const status = tileStatusOf(item);
    return {
      id: item.id,
      name: item.originalFile.name,
      group: status,
      status,
      meta: metaOf(item),
      thumbnailUrl: item.thumbnailUrl,
      error: status === "error" ? describeError(item) : undefined,
      checkerboard: mayHaveAlpha(item),
      expandable: isExpandable(item),
      removable: !isRunning && (status === "queued" || status === "error"),
    };
  });

  const renderExpanded = (id: string) => {
    const item = queue.find((entry) => entry.id === id);
    if (!item) return null;
    if (item.status === "done") {
      return (
        <DoneFocus
          item={item}
          onCompare={() => onCompare(item.id)}
          onSave={() => onSave(item)}
        />
      );
    }
    return (
      <QueuedFocus
        item={item}
        isRunning={isRunning}
        resizeEnabled={resizeEnabled}
        globalScale={globalScale}
        onRemove={() => onRemove(item.id)}
        onCustomScale={(value) => onCustomScale(item.id, value)}
      />
    );
  };

  return (
    <TileBoard
      tiles={tiles}
      groups={GROUPS}
      expandedId={expandedId}
      onExpand={onExpand}
      renderExpanded={renderExpanded}
      onEnter={(id) => {
        if (queue.find((item) => item.id === id)?.status === "done")
          onCompare(id);
      }}
      onRetry={onRetry}
      onRemove={onRemove}
      hint="타일에서 방향키로 이동 · Enter로 크게 비교 · Delete로 목록에서 제거"
    />
  );
}

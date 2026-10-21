"use client";
// 큐의 파일 하나를 16:10 썸네일과 이름·용량으로 보여 주는 타일

import { cn } from "@/lib/utils";

export type TileStatus = "queued" | "processing" | "done" | "error";

const STATUS_LABEL: Record<TileStatus, string> = {
  queued: "대기",
  processing: "처리 중",
  done: "완료",
  error: "실패",
};

interface MediaTileProps {
  name: string;
  status: TileStatus;
  /** 이미지 썸네일 주소(blob URL 등) */
  thumbnailUrl?: string;
  /** PDF 페이지 캔버스처럼 이미지가 아닌 썸네일 */
  thumbnail?: React.ReactNode;
  /** 긴 페이지 캡처처럼 위쪽을 기준으로 자른다 */
  thumbnailTop?: boolean;
  /** 이름 아래 한 줄. 예: "2.4 MB · 압축 중 62%" */
  meta?: React.ReactNode;
  /** 0~1. 처리 중인데 값이 없으면 무한 진행 막대를 그린다. */
  progress?: number;
  /** 실패 원인. 타일 위에 그대로 보여 준다. */
  error?: React.ReactNode;
  onRetry?: () => void;
  /** 누르면 초점 타일로 연다 */
  onSelect?: () => void;
  selected?: boolean;
  dimmed?: boolean;
  /** 투명 배경 결과를 체커보드 위에 그린다 */
  checkerboard?: boolean;
  /** 썸네일 오른쪽 위에 겹치는 작은 버튼(삭제 등) */
  actions?: React.ReactNode;
  className?: string;
}

export function MediaTile({
  name,
  status,
  thumbnailUrl,
  thumbnail,
  thumbnailTop,
  meta,
  progress,
  error,
  onRetry,
  onSelect,
  selected,
  dimmed,
  checkerboard,
  actions,
  className,
}: MediaTileProps) {
  const percent =
    progress === undefined
      ? undefined
      : Math.round(Math.min(Math.max(progress, 0), 1) * 100);

  return (
    <article className={cn("group relative min-w-0", className)}>
      <div
        className={cn(
          // 어둡게 할 때도 글자 대비를 지키려고 썸네일만 흐리게 한다.
          "relative aspect-[16/10] overflow-hidden rounded-lg border bg-surface transition-opacity duration-200",
          dimmed && "opacity-55",
          selected ? "border-accent ring-1 ring-accent" : "border-line",
          checkerboard &&
            "bg-[conic-gradient(var(--color-surface-2)_25%,var(--color-surface)_0_50%,var(--color-surface-2)_0_75%,var(--color-surface)_0)] bg-[length:16px_16px]",
        )}
      >
        {thumbnail ??
          (thumbnailUrl && (
            // blob URL 썸네일이라 next/image 최적화를 거치지 않는다.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnailUrl}
              alt=""
              className={cn(
                "absolute inset-0 size-full object-cover",
                thumbnailTop && "object-top",
              )}
              draggable={false}
            />
          ))}

        {status === "processing" && (
          <>
            <span className="absolute inset-0 bg-bg/35" aria-hidden="true" />
            <span
              role="progressbar"
              aria-label={`${name} 처리 진행률`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-bg/70"
            >
              {percent === undefined ? (
                <span className="absolute inset-y-0 w-1/3 animate-indeterminate bg-text" />
              ) : (
                <span
                  className="block h-full bg-text transition-[width] duration-300"
                  style={{ width: `${percent}%` }}
                />
              )}
            </span>
          </>
        )}

        {status === "error" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-bg/80 px-3 pb-3 pt-11 text-center">
            <p className="line-clamp-3 text-sm font-semibold text-danger">
              {error ?? "처리하지 못했습니다"}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="h-8 rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-text transition-colors hover:border-line-strong hover:bg-surface-2"
              >
                다시 시도
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-2 min-w-0">
        <p className="truncate text-sm font-semibold" title={name}>
          {onSelect ? (
            // 타일 전체를 누를 수 있게 버튼 영역을 타일 크기로 늘린다.
            <button
              type="button"
              onClick={onSelect}
              aria-pressed={selected}
              className="text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-solid focus-visible:after:outline-offset-2 focus-visible:after:outline-accent"
            >
              {name}
            </button>
          ) : (
            name
          )}
        </p>
        <p className="truncate text-xs text-muted">
          <span className="sr-only">{STATUS_LABEL[status]} · </span>
          {meta}
        </p>
      </div>

      {actions && (
        <div className="absolute right-2 top-2 z-20 flex gap-1">{actions}</div>
      )}
    </article>
  );
}

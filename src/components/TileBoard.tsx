"use client";
// 큐를 상태별 행의 타일로 보여 주고, 초점 받은 타일 하나를 제자리에서 크게 펼치는 공용 보드

import { useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { X } from "lucide-react";
import { MediaTile, type TileStatus } from "@/components/ui/media-tile";
import { cn } from "@/lib/utils";

export interface BoardTile {
  id: string;
  name: string;
  /** 어느 행에 놓을지 */
  group: string;
  /** 타일 위의 표시(진행 막대·실패 덮개) */
  status: TileStatus;
  meta: string;
  thumbnailUrl?: string;
  thumbnail?: React.ReactNode;
  /** 썸네일을 위쪽 기준으로 자른다(긴 페이지 캡처 등) */
  thumbnailTop?: boolean;
  error?: string;
  checkerboard?: boolean;
  expandable: boolean;
  /** 마우스용 X 버튼과 Delete 키로 지울 수 있는가 */
  removable: boolean;
}

export interface BoardGroup {
  key: string;
  title: string;
}

interface TileBoardProps {
  tiles: BoardTile[];
  groups: BoardGroup[];
  expandedId: string | null;
  /** 사용자가 직접 고른 타일을 펼친다 */
  onExpand: (id: string) => void;
  renderExpanded: (id: string) => React.ReactNode;
  /** Enter. 펼칠 수 있는 타일은 이미 펼쳐진 뒤에 호출된다. */
  onEnter?: (id: string) => void;
  onRetry?: (id: string) => void;
  onRemove?: (id: string) => void;
  hint?: string;
}

const TILE_WIDTH = 200;
const TILE_GAP = 16;
// 펼친 타일: 미디어 544 + 정보 292 + 테두리 4
const FOCUS_WIDTH = 840;

export function TileBoard({
  tiles,
  groups,
  expandedId,
  onExpand,
  renderExpanded,
  onEnter,
  onRetry,
  onRemove,
  hint,
}: TileBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  // 그리드 전체가 Tab 한 번에 들어오고, 안에서는 방향키로 옮긴다.
  const [rovingId, setRovingId] = useState<string | null>(null);
  const tabStopId =
    (rovingId && tiles.some((tile) => tile.id === rovingId)
      ? rovingId
      : null) ??
    expandedId ??
    tiles[0]?.id;

  const rows = groups
    .map((group) => ({
      ...group,
      tiles: tiles.filter((tile) => tile.group === group.key),
    }))
    .filter((group) => group.tiles.length > 0);

  // 클릭하면 focus와 click이 연달아 오므로 진행 중인 전환과 같은 요청은 한 번만 처리한다.
  const pendingRef = useRef<string | null>(null);
  const expand = (id: string) => {
    if (id === expandedId || id === pendingRef.current) return;
    const tile = tiles.find((entry) => entry.id === id);
    if (!tile?.expandable) return;
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
    tile: BoardTile,
  ) => {
    // 비교 슬라이더·버튼 등 타일 안 컨트롤의 키는 건드리지 않는다.
    if (event.target !== event.currentTarget) return;
    const ids = Array.from(
      boardRef.current?.querySelectorAll<HTMLElement>("[data-tile-id]") ?? [],
    ).map((element) => element.dataset.tileId as string);
    const index = ids.indexOf(tile.id);

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
        if (tile.status === "error" && onRetry) onRetry(tile.id);
        else if (tile.expandable) {
          expand(tile.id);
          onEnter?.(tile.id);
        } else onEnter?.(tile.id);
        return;
      case "Delete":
      case "Backspace":
        if (!tile.removable || !onRemove) return;
        event.preventDefault();
        onRemove(tile.id);
        focusTile(ids[index + 1] ?? ids[index - 1]);
        return;
    }
  };

  return (
    <div ref={boardRef} className="space-y-3">
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <div className="flex flex-wrap items-start gap-x-8 gap-y-7">
        {rows.map((row) => {
          const hasExpanded = row.tiles.some((tile) => tile.id === expandedId);
          const basis =
            row.tiles.length * (TILE_WIDTH + TILE_GAP) +
            (hasExpanded ? FOCUS_WIDTH - TILE_WIDTH : 0);
          const headingId = `${uid}-${row.key}`;
          return (
            <section
              key={row.key}
              aria-labelledby={headingId}
              className="min-w-0 space-y-3"
              style={{ flex: `${row.tiles.length} 1 ${basis}px` }}
            >
              <h2
                id={headingId}
                className="flex items-baseline gap-1.5 text-base font-bold"
              >
                {row.title}
                <span className="font-medium text-muted">
                  ({row.tiles.length})
                </span>
              </h2>
              <div className="flex flex-wrap items-start gap-4">
                {row.tiles.map((tile) => {
                  const expanded = tile.id === expandedId;
                  return (
                    <div
                      key={tile.id}
                      data-tile-id={tile.id}
                      tabIndex={tile.id === tabStopId ? 0 : -1}
                      role="group"
                      aria-label={`${tile.name} · ${tile.meta}`}
                      onFocus={(event) => {
                        if (event.target !== event.currentTarget) return;
                        setRovingId(tile.id);
                        expand(tile.id);
                      }}
                      onClick={() => {
                        setRovingId(tile.id);
                        expand(tile.id);
                      }}
                      onKeyDown={(event) => onTileKeyDown(event, tile)}
                      style={{ viewTransitionName: `tile-${tile.id}` }}
                      className={cn(
                        "rounded-tile outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-accent",
                        expanded
                          ? "w-full @min-[54rem]:w-[840px]"
                          : "w-[calc(50%-0.5rem)] sm:w-[200px]",
                        !expanded && tile.expandable && "cursor-pointer",
                      )}
                    >
                      {expanded ? (
                        renderExpanded(tile.id)
                      ) : (
                        <MediaTile
                          name={tile.name}
                          status={tile.status}
                          thumbnailUrl={tile.thumbnailUrl}
                          thumbnail={tile.thumbnail}
                          thumbnailTop={tile.thumbnailTop}
                          meta={tile.meta}
                          error={tile.error}
                          onRetry={onRetry ? () => onRetry(tile.id) : undefined}
                          dimmed={hasExpanded}
                          checkerboard={tile.checkerboard}
                          actions={
                            tile.removable && onRemove ? (
                              <button
                                type="button"
                                // 키보드는 타일에서 Delete로 지운다. 이 버튼은 마우스·터치용.
                                tabIndex={-1}
                                aria-label={`${tile.name} 목록에서 제거`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onRemove(tile.id);
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

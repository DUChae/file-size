"use client";
// 도구별 설정 서랍. 1024px 이상은 펼친 채, 그 아래는 접힌 채 시작하고 모바일에서는 바텀 시트가 된다.

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronLeft, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsDrawerProps {
  title: string;
  children: React.ReactNode;
  /** 서랍 맨 아래에 붙는 영역(작은 파일 추가 등) */
  footer?: React.ReactNode;
  className?: string;
}

const WIDE_QUERY = "(min-width: 1024px)";
const SHEET_QUERY = "(max-width: 767px)";

function useMediaQuery(query: string, serverValue: boolean) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export function SettingsDrawer({
  title,
  children,
  footer,
  className,
}: SettingsDrawerProps) {
  // null이면 화면 폭이 기본값을 정한다. 사용자가 한 번 누르면 그 선택을 따른다.
  const [choice, setChoice] = useState<boolean | null>(null);
  const wide = useMediaQuery(WIDE_QUERY, true);
  const sheet = useMediaQuery(SHEET_QUERY, false);
  const open = choice ?? wide;
  const contentId = useId();

  // 바텀 시트가 열려 있을 때 Esc로 닫는다.
  useEffect(() => {
    if (!sheet || !open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChoice(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, open]);

  const toggle = () => setChoice(!open);
  // "auto"는 CSS 중단점이 펼침 여부를 정해 첫 렌더에서도 깜빡이지 않는다.
  const state = choice === null ? "auto" : open ? "open" : "closed";

  return (
    <>
      {sheet && open && (
        <div
          className="fixed inset-0 z-30 bg-bg/70 md:hidden"
          aria-hidden="true"
          onClick={() => setChoice(false)}
        />
      )}
      <aside
        aria-label={title}
        data-state={state}
        className={cn(
          "z-40 flex flex-col border-line bg-surface",
          // 모바일: 아래에 제목 줄만 보이는 바텀 시트
          "fixed inset-x-0 bottom-0 max-h-[85dvh] rounded-t-tile border-t transition-transform duration-200 ease-out",
          state === "open"
            ? "translate-y-0"
            : "translate-y-[calc(100%-3.5rem)]",
          // 태블릿·데스크톱: 왼쪽 서랍, 접으면 56px 레일
          "md:sticky md:top-14 md:h-[calc(100dvh-3.5rem)] md:max-h-none md:translate-y-0 md:rounded-none md:border-r md:border-t-0 md:transition-[width]",
          state === "auto" ? "md:w-14 lg:w-80" : open ? "md:w-80" : "md:w-14",
          className,
        )}
      >
        <div
          className={cn(
            "flex h-14 shrink-0 items-center justify-between gap-2 px-4 md:px-5",
            state !== "open" && "md:justify-center md:px-0",
            state === "auto" && "lg:justify-between lg:px-5",
          )}
        >
          <h2
            className={cn(
              "text-base font-bold",
              state !== "open" && "md:sr-only",
              state === "auto" && "lg:not-sr-only",
            )}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={contentId}
            aria-label={open ? `${title} 접기` : `${title} 펼치기`}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-line-strong hover:text-text"
          >
            {sheet ? (
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  !open && "rotate-180",
                )}
                aria-hidden="true"
              />
            ) : open ? (
              <ChevronLeft className="size-4" aria-hidden="true" />
            ) : (
              <SlidersHorizontal className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <div
          id={contentId}
          inert={!open}
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-6 pt-1 md:px-6",
            state !== "open" && "md:hidden",
            state === "auto" && "lg:flex",
          )}
        >
          {children}
          {footer && <div className="mt-auto pt-2">{footer}</div>}
        </div>
      </aside>
    </>
  );
}

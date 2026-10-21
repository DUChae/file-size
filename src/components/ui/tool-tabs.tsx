"use client";
// 상단 도구 탭과 포맷 변환 하위 모드 탭. 도구 이동은 링크로 한다.

import { useEffect, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ToolDefinition } from "@/lib/tools";

interface ToolTabsProps<T extends string> {
  items: ToolDefinition<T>[];
  activeId?: T;
  /** 처리 중인 파일 수. 다른 도구에 있어도 진행 중임을 알린다. */
  busy?: Partial<Record<T, number>>;
  /** primary: 상단 바 밑줄 탭, sub: 본문 머리의 하위 모드 */
  variant?: "primary" | "sub";
  "aria-label": string;
  className?: string;
}

export function ToolTabs<T extends string>({
  items,
  activeId,
  busy,
  variant = "primary",
  className,
  "aria-label": ariaLabel,
}: ToolTabsProps<T>) {
  const primary = variant === "primary";
  const listRef = useRef<HTMLUListElement>(null);

  // 좁은 화면에서 가로로 스크롤되는 탭 줄이 현재 도구를 가리지 않게 한다.
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !current) return;
    const listBox = list.getBoundingClientRect();
    const box = current.getBoundingClientRect();
    if (box.left < listBox.left || box.right > listBox.right) {
      list.scrollLeft += box.left - listBox.left - 16;
    }
  }, [activeId]);

  return (
    <nav aria-label={ariaLabel} className={className}>
      <ul
        ref={listRef}
        className={cn(
          primary
            ? "flex h-full gap-1 overflow-x-auto [scrollbar-width:none]"
            : "grid grid-cols-2 gap-1 rounded-lg border border-line bg-bg p-[3px] sm:inline-flex",
        )}
      >
        {items.map((item) => {
          const active = item.id === activeId;
          const count = busy?.[item.id] ?? 0;
          return (
            <li key={item.id} className={primary ? "flex shrink-0" : "flex"}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors duration-150",
                  primary
                    ? "-mb-px border-b-2 px-2.5 md:px-3.5"
                    : "h-8 w-full rounded-md px-3",
                  primary &&
                    (active
                      ? "border-text font-semibold text-text"
                      : "border-transparent font-medium text-muted hover:text-text"),
                  !primary &&
                    (active
                      ? "bg-surface-2 font-semibold text-text shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
                      : "text-muted hover:text-text"),
                )}
              >
                {item.label}
                {count > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-text">
                    <span
                      className="size-1.5 rounded-full bg-text"
                      aria-hidden="true"
                    />
                    {count}
                    <span className="sr-only">개 처리 중</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

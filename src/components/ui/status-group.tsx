// 상태별 행(처리 완료·처리 중·대기·실패)의 제목과 개수, 타일 그리드

import { useId } from "react";
import { cn } from "@/lib/utils";

interface StatusGroupProps {
  title: string;
  count: number;
  children: React.ReactNode;
  /** 타일 그리드 대신 직접 배치할 때 false */
  grid?: boolean;
  className?: string;
}

export function StatusGroup({
  title,
  count,
  children,
  grid = true,
  className,
}: StatusGroupProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className={cn("space-y-3", className)}>
      <h2
        id={headingId}
        className="flex items-baseline gap-1.5 text-base font-bold"
      >
        {title}
        <span className="font-medium text-muted">({count})</span>
      </h2>
      {grid ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

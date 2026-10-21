"use client";
// 네이티브 <dialog> 기반 모달. 공지·비교 팝업이 같은 틀을 쓴다.

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  /** Esc, 바깥 클릭, 닫기 버튼 모두 여기로 모인다. */
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** 하단 버튼 줄 */
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "full";
  closeLabel?: string;
  className?: string;
}

const SIZE_CLASS = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-5xl",
  full: "max-w-[min(1440px,calc(100%-2rem))]",
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "sm",
  closeLabel = "닫기",
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={() => open && onClose()}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-tile border border-line bg-surface p-0 text-text backdrop:bg-bg/80 open:animate-fade-in",
        SIZE_CLASS[size],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 px-6 pt-5">
        <div className="space-y-1">
          <h2 id={titleId} className="text-xl font-bold tracking-[-0.02em]">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="text-sm text-muted">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="-mr-2 flex size-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      {children && <div className="px-6 pt-4">{children}</div>}
      {footer ? (
        <div className="flex flex-wrap justify-end gap-2 px-6 pb-6 pt-6">
          {footer}
        </div>
      ) : (
        <div className="pb-6" />
      )}
    </dialog>
  );
}

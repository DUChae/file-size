"use client";
// 크기 조절·메타데이터 제거처럼 켜고 끄는 설정 스위치

import { useId } from "react";
import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** 보이는 라벨. 없으면 aria-label을 넘긴다. */
  label?: React.ReactNode;
  /** 라벨 아래 보조 설명 */
  hint?: React.ReactNode;
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  hint,
  disabled,
  className,
  "aria-label": ariaLabel,
}: SwitchProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;

  const control = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ? undefined : ariaLabel}
      aria-describedby={hintId}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45",
        checked ? "bg-text" : "bg-line-strong",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-0.5 top-0.5 size-4 rounded-full transition-transform duration-150 ease-out",
          checked ? "translate-x-4 bg-bg" : "translate-x-0 bg-muted",
        )}
      />
    </button>
  );

  if (!label) return <span className={className}>{control}</span>;

  return (
    <div className={cn("space-y-1.5", className)}>
      {/* 라벨 줄 전체를 눌러도 켜고 끌 수 있게 label로 감싼다(최소 40px 높이). */}
      <label
        htmlFor={id}
        className={cn(
          "flex min-h-10 cursor-pointer items-center justify-between gap-4 text-sm font-medium text-text",
          disabled && "cursor-not-allowed opacity-45",
        )}
      >
        <span>{label}</span>
        {control}
      </label>
      {hint && (
        <p id={hintId} className="-mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

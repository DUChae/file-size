"use client";
// 압축 방식·출력 포맷처럼 둘~넷 중 하나를 고르는 세그먼트 컨트롤

import { cn } from "@/lib/utils";
import { handleRadioKeyDown, type RadioOption } from "./radio-keys";

interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: RadioOption<T>[];
  "aria-label"?: string;
  "aria-labelledby"?: string;
  disabled?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  disabled,
  className,
  ...aria
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      {...aria}
      aria-disabled={disabled || undefined}
      onKeyDown={(event) =>
        !disabled && handleRadioKeyDown(event, options, value, onValueChange)
      }
      className={cn(
        "flex rounded-lg border border-line bg-bg p-[3px]",
        disabled && "opacity-45",
        className,
      )}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            data-value={option.value}
            tabIndex={checked ? 0 : -1}
            disabled={disabled || option.disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "h-8 min-w-0 flex-1 rounded-md px-3 text-sm transition-colors duration-150 disabled:cursor-not-allowed",
              checked
                ? "bg-surface-2 font-semibold text-text shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
                : "text-muted hover:text-text",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

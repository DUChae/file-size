"use client";
// 품질·목표 용량 프리셋처럼 값 하나를 고르는 칩 묶음

import { cn } from "@/lib/utils";
import { handleRadioKeyDown, type RadioOption } from "./radio-keys";

interface ChipGroupProps<T extends string> {
  /** 프리셋에 없는 값을 직접 입력한 상태라면 null */
  value: T | null;
  onValueChange: (value: T) => void;
  options: RadioOption<T>[];
  "aria-label"?: string;
  "aria-labelledby"?: string;
  columns?: 2 | 3 | 4;
  disabled?: boolean;
  className?: string;
}

const COLUMN_CLASS = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" };

export function ChipGroup<T extends string>({
  value,
  onValueChange,
  options,
  columns = 3,
  disabled,
  className,
  ...aria
}: ChipGroupProps<T>) {
  // 선택된 칩이 없으면 첫 칩이 Tab 진입점이 된다.
  const focusValue =
    value ?? options.find((option) => !option.disabled)?.value ?? null;

  return (
    <div
      role="radiogroup"
      {...aria}
      aria-disabled={disabled || undefined}
      onKeyDown={(event) =>
        !disabled &&
        focusValue !== null &&
        handleRadioKeyDown(event, options, focusValue, onValueChange)
      }
      className={cn("grid gap-1.5", COLUMN_CLASS[columns], className)}
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
            tabIndex={option.value === focusValue ? 0 : -1}
            disabled={disabled || option.disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "h-8 whitespace-nowrap rounded-md border px-1 text-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45",
              checked
                ? "border-text bg-bg font-semibold text-text"
                : "border-line bg-bg text-muted hover:border-line-strong hover:text-text",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

"use client";
// 목표 용량·해상도처럼 단위가 붙는 숫자 입력

import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

interface NumberFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: React.ReactNode;
  /** 입력칸 오른쪽에 붙는 단위. 문자열 또는 단위 선택 컨트롤 */
  unit?: React.ReactNode;
  hint?: React.ReactNode;
  /** 값이 잘못됐을 때 보여 줄 문구. 있으면 hint 대신 표시한다. */
  error?: React.ReactNode;
}

export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(
  function NumberField(
    { label, unit, hint, error, id, className, disabled, ...props },
    ref,
  ) {
    const autoId = useId();
    const inputId = id ?? autoId;
    const messageId = error || hint ? `${inputId}-message` : undefined;

    return (
      <div className={cn("space-y-2", className)}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold text-muted"
          >
            {label}
          </label>
        )}
        <div
          className={cn(
            "flex h-10 items-center gap-2 rounded-lg border bg-bg px-3 transition-colors duration-150 focus-within:border-text",
            error ? "border-danger" : "border-line hover:border-line-strong",
            disabled && "opacity-45",
          )}
        >
          <input
            ref={ref}
            id={inputId}
            type="number"
            inputMode="decimal"
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={messageId}
            className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold text-text outline-none [appearance:textfield] disabled:cursor-not-allowed [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            {...props}
          />
          {unit && <span className="shrink-0 text-sm text-muted">{unit}</span>}
        </div>
        {(error || hint) && (
          <p
            id={messageId}
            className={cn("text-xs", error ? "text-danger" : "text-muted")}
          >
            {error ?? hint}
          </p>
        )}
      </div>
    );
  },
);

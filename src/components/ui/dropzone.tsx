"use client";
// 클릭·키보드·끌어 놓기·붙여넣기로 파일을 받는 공용 업로드 영역

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { renamePastedFiles, shouldHandlePaste } from "@/lib/clipboard";

interface DropzoneProps {
  onFiles: (files: File[]) => void;
  /** <input accept>와 같은 형식. 끌어 놓기·붙여넣기 파일도 이 기준으로 거른다. */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  title?: React.ReactNode;
  hint?: React.ReactNode;
  /** 페이지 어디서든 Ctrl+V로 붙여 넣은 파일을 받는다. 한 화면에 하나만 켠다. */
  acceptPaste?: boolean;
  /** 서랍 아래쪽에 들어가는 작은 형태 */
  compact?: boolean;
  className?: string;
}

export function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept
    .split(",")
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => {
      if (rule.startsWith(".")) return name.endsWith(rule);
      if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
      return type === rule;
    });
}

export function Dropzone({
  onFiles,
  accept,
  multiple = true,
  disabled,
  title = "파일 추가",
  hint,
  acceptPaste = false,
  compact = false,
  className,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // 최신 콜백을 붙여넣기 리스너에서 쓰기 위해 ref에 둔다.
  const onFilesRef = useRef(onFiles);
  useEffect(() => {
    onFilesRef.current = onFiles;
  });

  const deliver = (files: File[]) => {
    const accepted = files.filter((file) => matchesAccept(file, accept));
    if (accepted.length === 0) return;
    onFilesRef.current(multiple ? accepted : accepted.slice(0, 1));
  };

  useEffect(() => {
    if (!acceptPaste || disabled) return;
    const onPaste = (event: ClipboardEvent) => {
      if (!shouldHandlePaste(event)) return;
      const files = Array.from(event.clipboardData?.files ?? []).filter(
        (file) => matchesAccept(file, accept),
      );
      if (files.length === 0) return;
      event.preventDefault();
      const images = files.filter((file) => file.type.startsWith("image/"));
      const others = files.filter((file) => !file.type.startsWith("image/"));
      onFilesRef.current([...renamePastedFiles(images), ...others]);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [acceptPaste, accept, disabled]);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) deliver(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-1 rounded-tile border border-dashed text-center transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45",
          compact ? "px-4 py-4" : "min-h-56 gap-2 px-6 py-10",
          dragging
            ? "border-text bg-surface-2"
            : "border-line-strong hover:border-muted hover:bg-surface",
          className,
        )}
      >
        {!compact && (
          <Upload className="mb-1 size-6 text-muted" aria-hidden="true" />
        )}
        <span
          className={cn(
            "font-semibold text-text",
            compact ? "text-sm" : "text-base",
          )}
        >
          {title}
        </span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        tabIndex={-1}
        onChange={(event) => {
          deliver(Array.from(event.target.files ?? []));
          // 같은 파일을 다시 고를 수 있게 비운다.
          event.target.value = "";
        }}
      />
    </>
  );
}

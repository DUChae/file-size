"use client";
// 여러 도구 화면이 함께 쓰는 훅: 붙여넣기, 경과 시간, blob URL 해제

import { useEffect, useRef, useState } from "react";
import { renamePastedFiles, shouldHandlePaste } from "@/lib/clipboard";
import { useToolActive } from "@/components/ToolActivity";

/**
 * 페이지 어디서든 Ctrl+V로 붙여 넣은 이미지를 받는다.
 * 입력창 안이거나 모달이 열려 있거나 이 도구가 숨겨져 있으면 무시한다.
 */
export function usePasteImages(onFiles: (files: File[]) => void) {
  const active = useToolActive();
  const onFilesRef = useRef(onFiles);
  useEffect(() => {
    onFilesRef.current = onFiles;
  });

  useEffect(() => {
    if (!active) return;
    const onPaste = (event: ClipboardEvent) => {
      if (!shouldHandlePaste(event)) return;
      const images = Array.from(event.clipboardData?.files ?? []).filter(
        (file) => file.type.startsWith("image/"),
      );
      if (images.length === 0) return;
      event.preventDefault();
      onFilesRef.current(renamePastedFiles(images));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [active]);
}

/** 처리 중일 때만 1초마다 갱신되는 현재 시각(경과 시간 표시용) */
export function useNow(running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  return now;
}

/**
 * 지금 화면에 걸린 blob URL 목록을 받아, 목록에서 빠진 URL과
 * 컴포넌트가 사라질 때 남은 URL을 해제한다(삭제·비우기·다시 처리·언마운트).
 */
export function useReleaseBlobUrls(urls: (string | undefined)[]) {
  const liveRef = useRef(new Set<string>());
  const key = urls.filter(Boolean).join("\n");

  useEffect(() => {
    const current = new Set(key ? key.split("\n") : []);
    liveRef.current.forEach((url) => {
      if (!current.has(url)) URL.revokeObjectURL(url);
    });
    liveRef.current = current;
  }, [key]);

  useEffect(() => {
    const live = liveRef;
    return () => live.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);
}

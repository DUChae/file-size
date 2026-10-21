"use client";

// V2 출시와 파일 크기 제한 해제를 첫 방문 시 한 번 알리는 공지 모달

import { useEffect, useRef } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// 공지 내용이 바뀌면 키를 올려 기존 방문자에게도 다시 보여준다.
const NOTICE_KEY = "file-optimizer-notice-v2";

function hasSeenNotice() {
  try {
    return window.localStorage.getItem(NOTICE_KEY) === "seen";
  } catch {
    return false;
  }
}

function markNoticeSeen() {
  try {
    window.localStorage.setItem(NOTICE_KEY, "seen");
  } catch {
    // Storage may be blocked; the notice will simply show again next visit.
  }
}

export default function ReleaseNotice() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || hasSeenNotice()) return;
    dialog.showModal();
  }, []);

  const close = () => dialogRef.current?.close();

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="release-notice-title"
      aria-describedby="release-notice-body"
      onClose={markNoticeSeen}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-white/10 bg-[#0c0d10] p-0 text-slate-50 shadow-2xl shadow-black/60 backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="relative space-y-6 p-6 md:p-8">
        <button
          type="button"
          onClick={close}
          aria-label="공지 닫기"
          className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>

        <span className="inline-flex items-center gap-2 rounded-full border border-teal-300/30 bg-teal-300/10 px-3 py-1 text-xs font-bold text-teal-300">
          <Sparkles className="h-3 w-3" />
          V2 업데이트
        </span>

        <div className="space-y-3">
          <h2
            id="release-notice-title"
            className="text-2xl font-black tracking-tight text-white"
          >
            파일 크기 제한이 없어졌어요
          </h2>
          <p
            id="release-notice-body"
            className="text-base font-medium leading-relaxed text-slate-400"
          >
            새 서버로 옮기면서 이미지 업로드 용량 제한을 없앴습니다. 고해상도
            원본도 줄이지 말고 그대로 올려 압축하세요.
          </p>
        </div>

        <Button
          type="button"
          variant="blue"
          size="xl"
          onClick={close}
          autoFocus
          className="w-full"
        >
          확인
        </Button>
      </div>
    </dialog>
  );
}

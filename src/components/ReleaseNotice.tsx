"use client";

// 한 번에 올릴 수 있는 이미지 수를 20개로 늘린 업데이트를 첫 방문 시 한 번 알리는 공지 모달

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

// 공지 내용이 바뀌면 키를 올려 기존 방문자에게도 다시 보여준다.
const NOTICE_KEY = "file-optimizer-notice-v3";

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
  // 서버에서는 닫힌 채로 그리고, 브라우저에서 처음 그릴 때 본 적 없으면 연다(모달 마크업은 같다).
  const [open, setOpen] = useState(
    () => typeof window !== "undefined" && !hasSeenNotice(),
  );

  const close = () => {
    markNoticeSeen();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="이미지를 한 번에 20개까지 올릴 수 있어요"
      description="업데이트"
      closeLabel="공지 닫기"
      footer={
        <Button
          variant="primary"
          onClick={close}
          className="w-full"
          data-autofocus
        >
          확인
        </Button>
      }
    >
      <p className="text-base text-muted">
        이미지 압축·변환과 배경 제거에서 한 번에 넣을 수 있는 파일 수를 10개에서
        20개로 늘렸습니다. 용량 제한은 여전히 없으니 고해상도 원본도 그대로
        올리세요.
      </p>
    </Dialog>
  );
}

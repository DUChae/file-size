"use client";

// V2 출시와 파일 크기 제한 해제를 첫 방문 시 한 번 알리는 공지 모달

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

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
      title="파일 크기 제한이 없어졌어요"
      description="V2 업데이트"
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
        새 서버로 옮기면서 이미지 업로드 용량 제한을 없앴습니다. 고해상도 원본도
        줄이지 말고 그대로 올려 압축하세요.
      </p>
    </Dialog>
  );
}

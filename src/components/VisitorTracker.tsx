"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const VISITOR_KEY = "optistream-visitor-id";

function createVisitorId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `visitor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// 공통 레이아웃은 다시 마운트되지 않으므로 경로가 바뀔 때마다 기록한다.
export default function VisitorTracker() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VISITOR_KEY);
      const visitorId = stored || createVisitorId();

      if (!stored) {
        window.localStorage.setItem(VISITOR_KEY, visitorId);
      }

      void fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "page_view",
          visitorId,
          // page_view에는 별도 경로 열이 없어 mode 열에 경로를 담는다.
          mode: pathname,
        }),
      });
    } catch {
      // Ignore analytics client failures.
    }
  }, [pathname]);

  return null;
}

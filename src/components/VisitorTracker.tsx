"use client";

import { useEffect } from "react";

const VISITOR_KEY = "optistream-visitor-id";

function createVisitorId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `visitor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function VisitorTracker() {
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
        }),
      });
    } catch {
      // Ignore analytics client failures.
    }
  }, []);

  return null;
}

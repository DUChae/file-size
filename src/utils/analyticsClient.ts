// 브라우저에서 통계 이벤트를 보내는 함수. 실패해도 작업을 막지 않는다.

export async function trackClientEvent(payload: Record<string, unknown>) {
  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Ignore analytics failures in the client.
  }
}

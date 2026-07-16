// 피그마 플러그인 Iframe과 피그마 메인 스레드 간의 이미지 바이너리 데이터 양방향 전송을 담당하는 브릿지 유틸리티입니다.

/**
 * 현재 웹앱이 피그마 플러그인의 Iframe 내부에서 실행 중인지 여부를 판단합니다.
 * @returns Iframe 내부이면 true, 일반 웹 브라우저 단독 실행이면 false를 반환합니다.
 */
export function isInsideFigma(): boolean {
  if (typeof window === "undefined") return false;
  // 피그마 플러그인 환경에서는 window.parent가 피그마 ui.html 영역이 됩니다.
  return window.self !== window.parent;
}

/**
 * 최적화 완료된 이미지 블롭을 피그마 캔버스로 전송합니다.
 * @param blob 전송할 최적화 완료 이미지 블롭
 * @param filename 생성할 피그마 노드의 파일명
 */
export async function sendImageToFigma(blob: Blob, filename: string): Promise<void> {
  if (!isInsideFigma()) return;

  const arrayBuffer = await blob.arrayBuffer();
  
  // 피그마 플러그인 ui.html 중계기로 메시지를 전송합니다.
  window.parent.postMessage(
    {
      pluginMessage: {
        type: "optimized-image",
        arrayBuffer,
        filename,
      },
    },
    "*"
  );
}

"use client";
// 도구 화면이 자기 활성 여부를 읽고 처리 중인 파일 수를 상단 탭에 알리는 컨텍스트

import { createContext, useContext, useEffect } from "react";

interface ToolActivity {
  /** 지금 보이는 화면인가. 숨겨진 화면은 전역 단축키·붙여넣기를 받지 않는다. */
  active: boolean;
  reportBusy: (count: number) => void;
  /** 포맷 변환처럼 하위 모드가 있는 도구의 하위 탭 */
  subnav?: React.ReactNode;
}

// 공통 레이아웃 밖에서 쓰여도 동작하도록 "항상 활성"을 기본값으로 둔다.
const ToolActivityContext = createContext<ToolActivity>({
  active: true,
  reportBusy: () => {},
});

export const ToolActivityProvider = ToolActivityContext.Provider;

export function useToolActive() {
  return useContext(ToolActivityContext).active;
}

export function useToolSubnav() {
  return useContext(ToolActivityContext).subnav;
}

/** 처리 중인 파일 수를 알린다. 다른 도구로 옮겨 가도 상단 탭에 진행 중 표시가 남는다. */
export function useReportBusy(count: number) {
  const { reportBusy } = useContext(ToolActivityContext);
  useEffect(() => {
    reportBusy(count);
  }, [count, reportBusy]);
  useEffect(() => () => reportBusy(0), [reportBusy]);
}

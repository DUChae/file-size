"use client";
// 도구 화면 공통 틀: 왼쪽 설정 서랍, 본문 머리(제목·요약·행동), 결과 영역

import { useToolSubnav } from "@/components/ToolActivity";
import { SettingsDrawer } from "./settings-drawer";

interface ToolLayoutProps {
  title: string;
  /** 제목 아래 한 줄 요약. 예: "5개 파일 · 12.7 MB · 2개 완료" */
  summary?: React.ReactNode;
  /** 본문 머리 오른쪽 버튼들. 주 버튼은 하나만 둔다. */
  actions?: React.ReactNode;
  settingsTitle: string;
  settings: React.ReactNode;
  /** 서랍 맨 아래(작은 파일 추가 영역 등) */
  settingsFooter?: React.ReactNode;
  /** 본문 어디에 놓아도 파일을 받는다 */
  onDropFiles?: (files: File[]) => void;
  children: React.ReactNode;
}

export function ToolLayout({
  title,
  summary,
  actions,
  settingsTitle,
  settings,
  settingsFooter,
  onDropFiles,
  children,
}: ToolLayoutProps) {
  const subnav = useToolSubnav();

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col md:flex-row">
      <SettingsDrawer title={settingsTitle} footer={settingsFooter}>
        {settings}
      </SettingsDrawer>
      <div
        className="@container min-w-0 flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10"
        onDragOver={onDropFiles ? (event) => event.preventDefault() : undefined}
        onDrop={
          onDropFiles
            ? (event) => {
                // 업로드 영역이 이미 처리한 드롭은 다시 받지 않는다.
                if (event.defaultPrevented) return;
                event.preventDefault();
                onDropFiles(Array.from(event.dataTransfer.files));
              }
            : undefined
        }
      >
        {subnav && <div className="mb-5">{subnav}</div>}
        <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <h1 className="text-title font-bold tracking-[-0.02em]">{title}</h1>
            {summary && <p className="mt-1 text-sm text-muted">{summary}</p>}
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

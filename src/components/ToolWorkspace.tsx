"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import ImageOptimizer from "@/components/ImageOptimizer";
import ImageToPdfConverter from "@/components/ImageToPdfConverter";
import PdfToPngConverter from "@/components/PdfToPngConverter";
import UrlCaptureOptimizer from "@/components/UrlCaptureOptimizer";
import ImageBgRemover from "@/components/ImageBgRemover";
import PdfCompressor from "@/components/PdfCompressor";
import { ToolActivityProvider } from "@/components/ToolActivity";
import { AppShell } from "@/components/ui/app-shell";
import { ToolTabs } from "@/components/ui/tool-tabs";
import {
  CONVERT_MODES,
  TOOLS,
  isConvertMode,
  toolIdOf,
  toolKeyFromPath,
  type ConvertMode,
  type ToolId,
  type ToolKey,
} from "@/lib/tools";

type BusyMap = Partial<Record<ToolKey, number>>;

function renderTool(key: ToolKey) {
  switch (key) {
    case "compress":
      return <ImageOptimizer />;
    case "pdf-compress":
      return <PdfCompressor />;
    case "capture":
      return <UrlCaptureOptimizer />;
    case "remove-bg":
      return <ImageBgRemover />;
    case "pdf-to-png":
      return <PdfToPngConverter />;
    case "image-to-pdf":
      return <ImageToPdfConverter />;
    case "webp":
    case "avif":
      return <ImageOptimizer forcedFormat={key} />;
  }
}

// 새 공통 틀(ToolLayout)로 옮긴 도구. 나머지는 옮길 때까지 예전 틀(제목 + 본문)을 쓴다.
const MIGRATED = new Set<ToolKey>(["compress", "webp", "avif"]);

function ToolPanel({
  toolKey,
  active,
  onBusy,
  subnav,
}: {
  toolKey: ToolKey;
  active: boolean;
  onBusy: (key: ToolKey, count: number) => void;
  subnav?: React.ReactNode;
}) {
  const reportBusy = useCallback(
    (count: number) => onBusy(toolKey, count),
    [onBusy, toolKey],
  );
  const activity = useMemo(
    () => ({ active, reportBusy, subnav }),
    [active, reportBusy, subnav],
  );

  return (
    <ToolActivityProvider value={activity}>
      {MIGRATED.has(toolKey) ? (
        <div hidden={!active} className="animate-fade-in">
          {renderTool(toolKey)}
        </div>
      ) : (
        <div
          hidden={!active}
          className="mx-auto w-full max-w-[1440px] animate-fade-in px-4 py-6 md:px-8 md:py-8"
        >
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <h1 className="text-title font-bold tracking-[-0.02em]">
              {TOOLS.find((tool) => tool.id === toolIdOf(toolKey))?.label}
            </h1>
            {subnav}
          </div>
          <div className="relative min-h-[500px]">{renderTool(toolKey)}</div>
        </div>
      )}
    </ToolActivityProvider>
  );
}

/**
 * 도구 화면들의 공통 틀. 한 번 연 도구는 숨긴 채로 계속 마운트해 두어
 * 다른 도구·피드백·대시보드에 갔다 와도 큐와 결과, 진행 중인 요청이 그대로 남는다.
 * 결과 blob URL은 각 도구가 삭제·비우기·언마운트 때 해제하므로, 이 틀이 사라질 때(사이트를 떠날 때) 함께 정리된다.
 */
export default function ToolWorkspace({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeKey = toolKeyFromPath(pathname);

  const [visited, setVisited] = useState<ToolKey[]>(
    activeKey ? [activeKey] : [],
  );
  const [lastConvert, setLastConvert] = useState<ConvertMode>(
    activeKey && isConvertMode(activeKey) ? activeKey : "pdf-to-png",
  );
  // 경로가 바뀐 렌더에서 바로 반영해 새 도구가 한 박자 늦게 뜨지 않게 한다.
  if (activeKey && !visited.includes(activeKey))
    setVisited([...visited, activeKey]);
  if (activeKey && isConvertMode(activeKey) && activeKey !== lastConvert) {
    setLastConvert(activeKey);
  }

  const [busy, setBusy] = useState<BusyMap>({});
  const reportBusy = useCallback((key: ToolKey, count: number) => {
    setBusy((prev) =>
      (prev[key] ?? 0) === count ? prev : { ...prev, [key]: count },
    );
  }, []);

  const toolBusy = useMemo(() => {
    const totals: Partial<Record<ToolId, number>> = {};
    for (const [key, count] of Object.entries(busy) as [ToolKey, number][]) {
      const id = toolIdOf(key);
      totals[id] = (totals[id] ?? 0) + count;
    }
    return totals;
  }, [busy]);

  // 포맷 변환 탭은 마지막으로 쓴 하위 모드로 돌아간다.
  const tools = useMemo(
    () =>
      TOOLS.map((tool) =>
        tool.id === "convert"
          ? { ...tool, href: `/convert/${lastConvert}` }
          : tool,
      ),
    [lastConvert],
  );

  const activeTool = activeKey ? toolIdOf(activeKey) : undefined;
  const convertTabs = useMemo(
    () => (
      <ToolTabs
        items={CONVERT_MODES}
        activeId={
          activeKey && isConvertMode(activeKey) ? activeKey : lastConvert
        }
        busy={busy}
        variant="sub"
        aria-label="변환 종류"
      />
    ),
    [activeKey, lastConvert, busy],
  );
  const section = pathname.startsWith("/feedback")
    ? "feedback"
    : pathname.startsWith("/admin")
      ? "admin"
      : undefined;

  return (
    <AppShell
      tools={tools}
      activeTool={activeTool}
      activeSection={section}
      busy={toolBusy}
    >
      {visited.map((key) => (
        <ToolPanel
          key={key}
          toolKey={key}
          active={key === activeKey}
          onBusy={reportBusy}
          subnav={isConvertMode(key) ? convertTabs : undefined}
        />
      ))}
      {children}
    </AppShell>
  );
}

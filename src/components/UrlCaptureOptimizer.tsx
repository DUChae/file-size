"use client";

import React, { useCallback, useState } from "react";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import { Download, Globe2, RotateCcw, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FocusTile } from "@/components/ui/focus-tile";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ChipGroup } from "@/components/ui/chip-group";
import { NumberField } from "@/components/ui/number-field";
import { ToolLayout } from "@/components/ui/tool-layout";
import {
  EmptyWall,
  TileBoard,
  type BoardGroup,
  type BoardTile,
} from "@/components/TileBoard";
import {
  CaptureCropEditor,
  clampCrop,
  type CropRect,
} from "@/components/CaptureCropEditor";
import { formatChange } from "@/components/ImageResultBoard";
import { useReportBusy } from "@/components/ToolActivity";
import { useNow, useReleaseBlobUrls } from "@/components/toolHooks";
import { formatSize } from "@/lib/format";
import { OutputFormat, UrlCaptureResponse } from "@/types/image";
import { requestCompression } from "@/utils/compression";

type CaptureStatus =
  | "idle"
  | "capturing"
  | "captured"
  | "compressing"
  | "done"
  | "error";

interface CaptureItem {
  id: string;
  url: string;
  displayUrl: string;
  status: CaptureStatus;
  error?: string;
  captureData?: UrlCaptureResponse;
  result?: OptimizedResult;
  targetWidth: number;
  targetHeight: number;
  targetX: number;
  targetY: number;
  startedAt?: number;
  completedAt?: number;
}

interface OptimizedResult {
  filename: string;
  url: string;
  downloadUrl: string;
  originalSize: number;
  optimizedSize: number;
  format: CaptureFormat;
}

type CaptureFormat = Exclude<OutputFormat, "original" | "gif">;

const FORMAT_OPTIONS: { value: CaptureFormat; label: string }[] = [
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
  { value: "webp", label: "WebP" },
  { value: "avif", label: "AVIF" },
];

const GROUPS: BoardGroup[] = [
  { key: "done", title: "처리 완료" },
  { key: "captured", title: "영역 선택" },
  { key: "processing", title: "처리 중" },
  { key: "queued", title: "대기" },
  { key: "error", title: "실패" },
];

function formatLabel(format: CaptureFormat) {
  return (
    FORMAT_OPTIONS.find((option) => option.value === format)?.label ?? format
  );
}

function createCaptureItem(rawUrl: string): CaptureItem | null {
  const normalized = rawUrl.trim().replace(/[)\].,;]+$/g, "");
  const withoutProtocol = normalized.replace(/^https?:\/\//i, "");
  const domain = withoutProtocol.split(/[/?#]/)[0]?.replace(/\.$/, "");

  if (!domain || !domain.includes(".")) {
    return null;
  }

  return {
    id: Math.random().toString(36).substring(2, 9),
    url: `http://${domain}`,
    displayUrl: domain.replace(/^www\./i, ""),
    status: "idle",
    targetWidth: 0,
    targetHeight: 0,
    targetX: 0,
    targetY: 0,
  };
}

async function parseResponseJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("캡처 서버 응답 오류 · 사이트가 캡처를 막았을 수 있습니다");
  }
}

/** 입력 중에는 그대로 두고, 칸을 벗어나거나 Enter를 누를 때 반영하는 픽셀 입력 */
function PixelField({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) onCommit(parsed);
    setDraft(null);
  };
  return (
    <NumberField
      label={label}
      unit="px"
      value={draft ?? String(value)}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}

function CaptureFocus({
  item,
  format,
  onRectChange,
  onCompress,
  onSaveResult,
  onSaveOriginal,
}: {
  item: CaptureItem;
  format: CaptureFormat;
  onRectChange: (rect: CropRect) => void;
  onCompress: () => void;
  onSaveResult: () => void;
  onSaveOriginal: () => void;
}) {
  const data = item.captureData;
  if (!data?.sourceUrl || !data.width || !data.height) return null;
  const pageWidth = data.width;
  const pageHeight = data.height;
  const rect = {
    x: item.targetX,
    y: item.targetY,
    width: item.targetWidth,
    height: item.targetHeight,
  };
  const busy = item.status === "compressing";
  const result = item.result;
  const commit = (patch: Partial<CropRect>) =>
    onRectChange(clampCrop({ ...rect, ...patch }, pageWidth, pageHeight));

  return (
    <FocusTile
      mediaClassName="aspect-auto h-[min(70dvh,34rem)]"
      media={
        <CaptureCropEditor
          src={data.sourceUrl}
          name={item.displayUrl}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          rect={rect}
          onChange={onRectChange}
          disabled={busy}
        />
      }
      badge={
        result
          ? { tone: "success", label: "완료" }
          : { tone: "neutral", label: busy ? "압축 중" : "영역 선택" }
      }
      title={item.displayUrl}
      subtitle={`전체 페이지 ${pageWidth} × ${pageHeight}`}
      metric={
        result
          ? formatChange(result.originalSize, result.optimizedSize)
          : undefined
      }
      sizeLine={
        result
          ? `${formatSize(result.originalSize)} → ${formatSize(result.optimizedSize)}`
          : undefined
      }
      details={
        result
          ? [{ label: "출력 포맷", value: formatLabel(result.format) }]
          : undefined
      }
      extra={
        <div className="space-y-3">
          <p className="text-xs text-muted">
            왼쪽에서 상자를 끌어 옮기고 오른쪽 아래 모서리로 크기를 바꿉니다.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <PixelField
              label="가로"
              value={rect.width}
              disabled={busy}
              onCommit={(width) => commit({ width })}
            />
            <PixelField
              label="세로"
              value={rect.height}
              disabled={busy}
              onCommit={(height) => commit({ height })}
            />
            <PixelField
              label="X"
              value={rect.x}
              disabled={busy}
              onCommit={(x) => commit({ x })}
            />
            <PixelField
              label="Y"
              value={rect.y}
              disabled={busy}
              onCommit={(y) => commit({ y })}
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              onRectChange({ x: 0, y: 0, width: pageWidth, height: pageHeight })
            }
          >
            <RotateCcw aria-hidden="true" />
            전체 페이지로
          </Button>
        </div>
      }
      actions={
        result ? (
          <>
            <Button onClick={onCompress}>다시 압축</Button>
            <Button variant="inverse" onClick={onSaveResult}>
              <Download aria-hidden="true" />
              저장
              <span className="sr-only"> {result.filename}</span>
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onSaveOriginal} disabled={!data.downloadUrl}>
              원본 저장
            </Button>
            <Button variant="inverse" onClick={onCompress} loading={busy}>
              <Scissors aria-hidden="true" />
              {`이 영역 ${formatLabel(format)}로 압축`}
            </Button>
          </>
        )
      }
    />
  );
}

export default function UrlCaptureOptimizer() {
  const [urls, setUrls] = useState<CaptureItem[]>([]);
  const [inputUrl, setInputUrl] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [globalFormat, setGlobalFormat] = useState<CaptureFormat>("png");
  const [manualFocusId, setManualFocusId] = useState<string | null>(null);
  const [zipState, setZipState] = useState<"idle" | "busy" | "error">("idle");
  const [announcement, setAnnouncement] = useState("");

  const processingCount = urls.filter(
    (item) => item.status === "capturing" || item.status === "compressing",
  ).length;
  useReportBusy(processingCount);
  const now = useNow(processingCount > 0);
  useReleaseBlobUrls(urls.map((item) => item.result?.url));

  const updateItem = useCallback(
    (id: string, updates: Partial<CaptureItem>) => {
      setUrls((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
      );
    },
    [],
  );

  const addUrl = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!inputUrl.trim()) return;

    // Robust regex to find URLs in any text
    const urlRegex =
      /(https?:\/\/[^\s,]+|(?:[a-zA-Z0-9가-힣][a-zA-Z0-9가-힣-]*\.)+[a-zA-Z가-힣]{2,}(?:\/[^\s,]*)?)/gi;
    const matches = inputUrl.match(urlRegex) || [];
    const newUrls = matches
      .map(createCaptureItem)
      .filter((item): item is CaptureItem => Boolean(item));

    if (newUrls.length === 0) {
      setInputError("주소를 찾지 못했습니다 · example.com 형식으로 입력하세요");
      return;
    }
    setInputError(null);
    setUrls((prev) => [...prev, ...newUrls]);
    setInputUrl("");
  };

  const removeUrl = (id: string) =>
    setUrls((prev) => prev.filter((item) => item.id !== id));

  const handleCapture = useCallback(
    async (item: CaptureItem) => {
      updateItem(item.id, {
        status: "capturing",
        error: undefined,
        captureData: undefined,
        result: undefined,
        startedAt: Date.now(),
      });

      try {
        const response = await fetch("/api/capture-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: item.url }),
        });
        const data = await parseResponseJson<UrlCaptureResponse>(response);

        if (
          !response.ok ||
          !data.success ||
          !data.sourceUrl ||
          !data.width ||
          !data.height
        ) {
          throw new Error(data.error || "페이지를 캡처하지 못했습니다");
        }

        updateItem(item.id, {
          status: "captured",
          captureData: data,
          targetWidth: data.width || 1440,
          targetHeight: data.height || 900,
          targetX: 0,
          targetY: 0,
          completedAt: Date.now(),
        });
        setAnnouncement(`${item.displayUrl} 캡처 완료`);
      } catch (err) {
        const error =
          err instanceof Error ? err.message : "페이지를 캡처하지 못했습니다";
        updateItem(item.id, {
          status: "error",
          error,
          completedAt: Date.now(),
        });
        setAnnouncement(`${item.displayUrl} 캡처 실패, ${error}`);
      }
    },
    [updateItem],
  );

  const handleCompress = useCallback(
    async (item: CaptureItem) => {
      if (!item.captureData?.filename || !item.captureData.captureId) return;
      const format = globalFormat;

      updateItem(item.id, {
        status: "compressing",
        error: undefined,
        result: undefined,
        startedAt: Date.now(),
      });

      try {
        const res = await requestCompression(
          { captureId: item.captureData.captureId },
          {
            filename: item.captureData.filename,
            mimeType: item.captureData.mimeType || "image/png",
            category: "screenshot",
            targetFormat: format,
            webWidth: item.targetWidth,
            webHeight: item.targetHeight,
            webX: item.targetX,
            webY: item.targetY,
          },
        );

        updateItem(item.id, {
          status: "done",
          completedAt: Date.now(),
          result: {
            filename: `${item.displayUrl}.${format}`,
            url: res.optimizedUrl,
            downloadUrl: res.optimizedDownloadUrl,
            originalSize: res.originalSize,
            optimizedSize: res.optimizedSize,
            format,
          },
        });
        setAnnouncement(
          `${item.displayUrl} 압축 완료, ${formatSize(res.optimizedSize)}`,
        );
      } catch (err) {
        const error =
          err instanceof Error ? err.message : "압축하지 못했습니다";
        updateItem(item.id, {
          status: "error",
          error,
          completedAt: Date.now(),
        });
        setAnnouncement(`${item.displayUrl} 압축 실패, ${error}`);
      }
    },
    [updateItem, globalFormat],
  );

  // 여러 사이트를 한 번에 요청하지 않도록 차례로 처리한다.
  const captureAll = async () => {
    setManualFocusId(null);
    for (const item of urls.filter((u) => u.status === "idle")) {
      await handleCapture(item);
    }
  };
  const compressAll = async () => {
    setManualFocusId(null);
    for (const item of urls.filter(
      (u) =>
        u.status === "captured" ||
        u.status === "done" ||
        (u.status === "error" && u.captureData),
    )) {
      await handleCompress(item);
    }
  };

  const retry = (id: string) => {
    const item = urls.find((entry) => entry.id === id);
    if (!item) return;
    if (item.captureData) void handleCompress(item);
    else void handleCapture(item);
  };

  const downloadZip = async () => {
    const results = urls.flatMap((item) => (item.result ? [item.result] : []));
    if (results.length === 0) return;
    setZipState("busy");
    try {
      const zip = new JSZip();
      const folder = zip.folder("captured-images");
      const used = new Set<string>();
      for (const res of results) {
        const blob = await (await fetch(res.url)).blob();
        let filename = res.filename;
        for (let n = 1; used.has(filename); n++) {
          filename = res.filename.replace(/(\.[^.]+)$/, ` (${n})$1`);
        }
        used.add(filename);
        folder?.file(filename, blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "url-capture.zip");
      setZipState("idle");
    } catch {
      setZipState("error");
    }
  };

  // 영역을 바꾸면 이전 압축 결과는 더 이상 맞지 않으므로 지운다.
  const changeRect = (id: string, rect: CropRect) =>
    updateItem(id, {
      targetX: rect.x,
      targetY: rect.y,
      targetWidth: rect.width,
      targetHeight: rect.height,
      result: undefined,
      status: "captured",
    });

  const idleCount = urls.filter((u) => u.status === "idle").length;
  const capturedCount = urls.filter(
    (u) => u.status === "captured" || (u.status === "error" && u.captureData),
  ).length;
  const doneCount = urls.filter((u) => u.status === "done").length;
  const running = processingCount > 0;

  const isExpandable = (item: CaptureItem) =>
    Boolean(item.captureData?.sourceUrl) &&
    (item.status === "captured" ||
      item.status === "done" ||
      item.status === "compressing");
  const manualItem = urls.find(
    (item) => item.id === manualFocusId && isExpandable(item),
  );
  const latest = urls
    .filter(isExpandable)
    .reduce<
      CaptureItem | undefined
    >((best, item) => (!best || (item.completedAt ?? 0) > (best.completedAt ?? 0) ? item : best), undefined);
  const expandedId = manualItem?.id ?? latest?.id ?? null;

  const tiles: BoardTile[] = urls.map((item) => {
    const seconds = item.startedAt
      ? Math.max(0, Math.floor((now - item.startedAt) / 1000))
      : 0;
    const data = item.captureData;
    const base = {
      id: item.id,
      name: item.displayUrl,
      expandable: isExpandable(item),
      removable: item.status !== "capturing" && item.status !== "compressing",
      sortKey:
        item.status === "done" || item.status === "captured"
          ? item.completedAt
          : undefined,
      thumbnailTop: true,
      thumbnail: data?.sourceUrl ? undefined : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
          <Globe2 className="size-6 text-muted" aria-hidden="true" />
          <span className="max-w-full truncate text-xs text-muted">
            {item.displayUrl}
          </span>
        </span>
      ),
      thumbnailUrl: item.result?.url ?? data?.sourceUrl,
    };
    switch (item.status) {
      case "done":
        return {
          ...base,
          group: "done",
          status: "done",
          thumbnailTop: false,
          meta: `${formatSize(item.result?.originalSize ?? 0)} → ${formatSize(item.result?.optimizedSize ?? 0)} · ${item.result ? formatLabel(item.result.format) : ""}`,
        };
      case "captured":
        return {
          ...base,
          group: "captured",
          status: "done",
          meta: `영역 ${item.targetWidth}×${item.targetHeight} · 전체 ${data?.width}×${data?.height}`,
        };
      case "capturing":
        return {
          ...base,
          group: "processing",
          status: "processing",
          meta: `캡처 중 ${seconds}초`,
        };
      case "compressing":
        return {
          ...base,
          group: "processing",
          status: "processing",
          meta: `압축 중 ${seconds}초`,
        };
      case "error":
        return {
          ...base,
          group: "error",
          status: "error",
          meta: data ? "압축 실패" : "캡처 실패",
          error: item.error,
        };
      default:
        return { ...base, group: "queued", status: "queued", meta: "대기 중" };
    }
  });

  const primary =
    idleCount > 0
      ? { label: `캡처 시작 (${idleCount})`, run: captureAll }
      : capturedCount > 0
        ? { label: `압축 시작 (${capturedCount})`, run: compressAll }
        : doneCount > 0
          ? { label: "다시 압축", run: compressAll }
          : { label: "캡처 시작", run: captureAll };

  const summary =
    urls.length === 0
      ? "주소를 넣고 캡처한 뒤, 저장할 영역을 골라 압축합니다"
      : [
          `${urls.length}개 주소`,
          capturedCount > 0 && `영역 선택 ${capturedCount}개`,
          doneCount > 0 && `${doneCount}개 완료`,
        ]
          .filter(Boolean)
          .join(" · ");

  const renderExpanded = (id: string) => {
    const item = urls.find((entry) => entry.id === id);
    if (!item) return null;
    return (
      <CaptureFocus
        item={item}
        format={globalFormat}
        onRectChange={(rect) => changeRect(item.id, rect)}
        onCompress={() => void handleCompress(item)}
        onSaveResult={() =>
          item.result && saveAs(item.result.downloadUrl, item.result.filename)
        }
        onSaveOriginal={() =>
          item.captureData?.downloadUrl &&
          saveAs(
            item.captureData.downloadUrl,
            item.captureData.filename ?? `${item.displayUrl}.png`,
          )
        }
      />
    );
  };

  return (
    <ToolLayout
      title="웹페이지 캡처"
      summary={summary}
      settingsTitle="캡처 설정"
      settings={
        <div>
          <span
            id="capture-format-label"
            className="mb-2 block text-xs font-semibold text-muted"
          >
            출력 포맷
          </span>
          <ChipGroup
            aria-labelledby="capture-format-label"
            columns={4}
            value={globalFormat}
            onValueChange={setGlobalFormat}
            options={FORMAT_OPTIONS}
          />
          <p className="mt-2 text-xs text-muted">
            선택한 영역을 압축할 때 적용됩니다.
          </p>
        </div>
      }
      primary={
        <Button
          variant="primary"
          onClick={() => void primary.run()}
          disabled={urls.length === 0}
          loading={running}
        >
          {running ? `처리 중 (${processingCount})` : primary.label}
        </Button>
      }
      actions={
        <>
          <Button
            variant="ghost"
            onClick={() => setUrls([])}
            disabled={running || urls.length === 0}
          >
            비우기
          </Button>
          <Button
            onClick={() => void downloadZip()}
            disabled={doneCount === 0 || running}
            loading={zipState === "busy"}
          >
            전체 ZIP 저장
          </Button>
          {idleCount > 0 && capturedCount > 0 && (
            <Button onClick={() => void compressAll()} disabled={running}>
              압축 시작 ({capturedCount})
            </Button>
          )}
        </>
      }
    >
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <form
        onSubmit={addUrl}
        className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start"
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="capture-url" className="sr-only">
            캡처할 웹페이지 주소
          </label>
          <textarea
            id="capture-url"
            value={inputUrl}
            onChange={(event) => {
              setInputUrl(event.target.value);
              if (inputError) setInputError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                addUrl();
              }
            }}
            rows={1}
            placeholder="example.com (여러 개는 줄바꿈·쉼표)"
            aria-invalid={inputError ? true : undefined}
            aria-describedby={inputError ? "capture-url-error" : undefined}
            className="block min-h-10 w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 text-base text-text outline-none transition-colors hover:border-line-strong focus:border-text"
          />
          {inputError && (
            <p id="capture-url-error" className="mt-1.5 text-xs text-danger">
              {inputError}
            </p>
          )}
        </div>
        <Button type="submit">목록에 추가</Button>
      </form>

      <div className="space-y-6">
        {zipState === "error" && (
          <InlineAlert
            tone="danger"
            title="ZIP 파일을 만들지 못했습니다"
            actions={
              <Button size="sm" onClick={() => void downloadZip()}>
                다시 시도
              </Button>
            }
          >
            결과를 하나씩 저장하거나 다시 시도하세요.
          </InlineAlert>
        )}

        {urls.length === 0 ? (
          <EmptyWall
            title="대기"
            first={
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-tile border border-dashed border-line-strong px-6 text-center">
                <Globe2 className="size-6 text-muted" aria-hidden="true" />
                <p className="text-base font-semibold">
                  위에 주소를 넣고 캡처 시작을 누르세요
                </p>
                <p className="text-xs text-muted">
                  페이지 전체를 캡처한 뒤 저장할 영역을 골라 압축합니다.
                  캡처에는 수십 초가 걸릴 수 있습니다.
                </p>
              </div>
            }
          />
        ) : (
          <TileBoard
            tiles={tiles}
            groups={GROUPS}
            expandedId={expandedId}
            onExpand={setManualFocusId}
            renderExpanded={renderExpanded}
            onEnter={(id) => {
              const item = urls.find((entry) => entry.id === id);
              if (item?.status === "idle") void handleCapture(item);
            }}
            onRetry={retry}
            onRemove={removeUrl}
            hint="타일에서 방향키로 이동 · Enter로 캡처하거나 영역 편집 열기 · Delete로 목록에서 제거"
          />
        )}
      </div>
    </ToolLayout>
  );
}

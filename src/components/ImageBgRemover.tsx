"use client";

// 이미지 배경을 서버에서 지우고 고른 포맷으로 바꿔 저장하는 도구. 파일을 넣으면 바로 하나씩 처리한다.

import React, { useState, useCallback, useRef } from "react";
import { Download, Maximize2, Plus } from "lucide-react";
import { QueueItem } from "@/types/image";
import { downloadSingle, downloadAllAsZip } from "@/utils/download";
import {
  removeImageBackground,
  convertBlobFormat,
} from "@/utils/backgroundRemoval";
import ImageCompareDialog from "@/components/ImageCompareDialog";
import { EmptyWall, TileBoard, type BoardGroup } from "@/components/TileBoard";
import { tileStatusOf } from "@/components/ImageResultBoard";
import { useReportBusy } from "@/components/ToolActivity";
import {
  useNow,
  usePasteImages,
  useReleaseBlobUrls,
} from "@/components/toolHooks";
import { Button } from "@/components/ui/button";
import { CompareSlider, type Dimensions } from "@/components/ui/compare-slider";
import { Dropzone } from "@/components/ui/dropzone";
import { FocusTile } from "@/components/ui/focus-tile";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ToolLayout } from "@/components/ui/tool-layout";
import { formatSize } from "@/lib/format";
import { readImageInfo } from "@/lib/thumbnail";

const MAX_FILES = 10;
const CONCURRENCY = 1; // 서버 추론이 무거워 한 번에 하나씩 보낸다.
const ACCEPT = ".png,.jpg,.jpeg,.webp";
const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

type ExportFormat = "png" | "webp" | "jpeg";

const FORMAT_HINT: Record<ExportFormat, string> = {
  png: "투명 배경을 손실 없이 보존합니다.",
  webp: "투명 배경을 유지하면서 PNG보다 작게 저장합니다(손실 압축).",
  jpeg: "JPG는 투명을 지원하지 않아 배경을 흰색으로 채웁니다.",
};

const GROUPS: BoardGroup[] = [
  { key: "done", title: "처리 완료" },
  { key: "processing", title: "처리 중" },
  { key: "queued", title: "대기" },
  { key: "error", title: "실패" },
];

function formatName(format: QueueItem["targetFormat"]) {
  if (format === "jpeg") return "JPG";
  if (format === "webp") return "WebP";
  return "PNG";
}

function sourceFormat(item: QueueItem) {
  const ext = item.originalFile.name.split(".").pop()?.toUpperCase() ?? "";
  return ext === "JPG" ? "JPEG" : ext;
}

function DoneFocus({
  item,
  onCompare,
  onSave,
}: {
  item: QueueItem;
  onCompare: () => void;
  onSave: () => void;
}) {
  const [resultDims, setResultDims] = useState<Dimensions | null>(null);
  const name = item.originalFile.name;
  const optimized = item.optimizedSize ?? 0;

  return (
    <FocusTile
      media={
        item.optimizedUrl ? (
          <CompareSlider
            originalFile={item.originalFile}
            resultUrl={item.optimizedUrl}
            name={name}
            originalLabel="원본"
            resultLabel={`결과 · ${formatName(item.targetFormat)}`}
            checkerboard
            onResultLoad={setResultDims}
            className="absolute inset-0"
          />
        ) : null
      }
      badge={{ tone: "success", label: "배경 제거됨" }}
      title={name}
      subtitle={
        item.width && item.height
          ? `${item.width} × ${item.height} · ${sourceFormat(item)}`
          : sourceFormat(item)
      }
      sizeLine={`${formatSize(item.originalSize)} → ${formatSize(optimized)}`}
      details={[
        { label: "출력 포맷", value: formatName(item.targetFormat) },
        {
          label: "배경",
          value: item.targetFormat === "jpeg" ? "흰색" : "투명",
        },
        ...(resultDims
          ? [
              {
                label: "해상도",
                value: `${resultDims.width} × ${resultDims.height}`,
              },
            ]
          : []),
      ]}
      actions={
        <>
          <Button onClick={onCompare}>
            <Maximize2 aria-hidden="true" />
            크게 비교
          </Button>
          <Button variant="inverse" onClick={onSave}>
            <Download aria-hidden="true" />
            저장
            <span className="sr-only"> {item.optimizedFilename ?? name}</span>
          </Button>
        </>
      }
    />
  );
}

export default function ImageBgRemover() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [manualFocusId, setManualFocusId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [zipState, setZipState] = useState<"idle" | "busy" | "error">("idle");
  const [announcement, setAnnouncement] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(0);
  // 처리 순서를 정할 때 최신 큐가 필요해 모든 변경을 ref와 상태에 함께 반영한다.
  const queueRef = useRef(queue);
  const commit = useCallback((change: (q: QueueItem[]) => QueueItem[]) => {
    queueRef.current = change(queueRef.current);
    setQueue(queueRef.current);
  }, []);

  const processingCount = queue.filter(
    (item) => item.status === "removing-bg" || item.status === "compressing",
  ).length;
  useReportBusy(processingCount);
  const now = useNow(processingCount > 0);
  useReleaseBlobUrls(
    queue.flatMap((item) => [item.optimizedUrl, item.thumbnailUrl]),
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<QueueItem>) =>
      commit((q) => q.map((it) => (it.id === id ? { ...it, ...patch } : it))),
    [commit],
  );

  const runItem = useCallback(
    async (item: QueueItem) => {
      const name = item.originalFile.name;
      try {
        const transparentBlob = await removeImageBackground(
          item.originalFile,
          (progress, stage) =>
            updateItem(item.id, {
              bgRemovalProgress: progress,
              bgRemovalStage: stage,
            }),
        );

        const targetFmt: ExportFormat =
          item.targetFormat === "jpeg" || item.targetFormat === "webp"
            ? item.targetFormat
            : "png";
        const finalBlob = await convertBlobFormat(transparentBlob, targetFmt);

        const extIndex = name.lastIndexOf(".");
        const nameWithoutExt =
          extIndex !== -1 ? name.substring(0, extIndex) : name;
        const ext = targetFmt === "jpeg" ? "jpg" : targetFmt;
        const localUrl = URL.createObjectURL(finalBlob);

        updateItem(item.id, {
          status: "done",
          completedAt: Date.now(),
          targetFormat: targetFmt,
          optimizedFilename: `${nameWithoutExt}.no-bg.${ext}`,
          optimizedUrl: localUrl,
          optimizedDownloadUrl: localUrl,
          optimizedSize: finalBlob.size,
          reductionRate:
            ((item.originalSize - finalBlob.size) / item.originalSize) * 100,
        });
        setAnnouncement(`${name} 배경 제거 완료`);
      } catch (e) {
        const error =
          e instanceof Error ? e.message : "배경을 지우지 못했습니다";
        updateItem(item.id, {
          status: "error",
          error,
          completedAt: Date.now(),
        });
        setAnnouncement(`${name} 실패, ${error}`);
      }
    },
    [updateItem],
  );

  // 대기 중인 파일을 동시 처리 한도까지 꺼내 처리한다. 파일 추가·다시 시도·작업 완료 때 부른다.
  const pump = useCallback(
    function pumpQueue() {
      while (processingRef.current < CONCURRENCY) {
        const next = queueRef.current.find((item) => item.status === "queued");
        if (!next) return;
        processingRef.current += 1;
        updateItem(next.id, {
          status: "removing-bg",
          bgRemovalProgress: 0,
          bgRemovalStage: undefined,
          startedAt: Date.now(),
        });
        void runItem(next).finally(() => {
          processingRef.current -= 1;
          pumpQueue();
        });
      }
    },
    [runItem, updateItem],
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const images = fileArray.filter((file) =>
        ACCEPTED_TYPES.includes(file.type),
      );
      const room = Math.max(0, MAX_FILES - queueRef.current.length);
      const accepted = images.slice(0, room);

      const problems: string[] = [];
      if (images.length < fileArray.length) {
        problems.push(
          `PNG·JPEG·WebP만 지원해 ${fileArray.length - images.length}개를 제외했습니다`,
        );
      }
      if (accepted.length < images.length) {
        problems.push(
          `한 번에 최대 ${MAX_FILES}개까지 넣을 수 있어 ${images.length - accepted.length}개를 추가하지 못했습니다`,
        );
      }
      setNotice(problems.length > 0 ? problems.join(" · ") : null);
      if (accepted.length === 0) return;

      const newItems: QueueItem[] = accepted.map((file) => ({
        id: Math.random().toString(36).substring(2, 9),
        originalFile: file,
        originalSize: file.size,
        status: "queued",
        category: "screenshot",
        // 형식은 넣는 순간의 설정을 따른다.
        targetFormat: exportFormat,
        webWidth: "",
        webHeight: "",
        bgRemovalProgress: 0,
        removalMode: "auto",
      }));
      commit((q) => [...q, ...newItems]);
      pump();

      newItems.forEach(async (item) => {
        const info = await readImageInfo(item.originalFile);
        if (!info) return;
        // 미리보기가 만들어지기 전에 목록에서 빠졌다면 바로 해제한다.
        if (!queueRef.current.some((entry) => entry.id === item.id)) {
          if (info.thumbnailUrl) URL.revokeObjectURL(info.thumbnailUrl);
          return;
        }
        updateItem(item.id, info);
      });
    },
    [exportFormat, commit, pump, updateItem],
  );
  usePasteImages(handleFiles);

  const retry = (id: string) => {
    setManualFocusId(null);
    updateItem(id, {
      status: "queued",
      error: undefined,
      startedAt: undefined,
    });
    pump();
  };
  const removeItem = (id: string) =>
    commit((q) => q.filter((item) => item.id !== id));

  const saveZip = async () => {
    setZipState("busy");
    try {
      await downloadAllAsZip(queue);
      setZipState("idle");
    } catch {
      setZipState("error");
    }
  };

  const doneItems = queue.filter((item) => item.status === "done");
  const compareItem = doneItems.find((item) => item.id === compareId);
  const manualItem = doneItems.find((item) => item.id === manualFocusId);
  const latestDone = doneItems.reduce<QueueItem | undefined>(
    (latest, item) =>
      !latest || (item.completedAt ?? 0) > (latest.completedAt ?? 0)
        ? item
        : latest,
    undefined,
  );
  const expandedId = manualItem?.id ?? latestDone?.id ?? null;

  const tiles = queue.map((item) => {
    const status = tileStatusOf(item);
    const size = formatSize(item.originalSize);
    const seconds = item.startedAt
      ? Math.max(0, Math.floor((now - item.startedAt) / 1000))
      : 0;
    const meta =
      status === "done"
        ? `${size} → ${formatSize(item.optimizedSize ?? 0)} · ${formatName(item.targetFormat)}`
        : status === "processing"
          ? `${size} · ${item.bgRemovalStage ?? "배경 분리 중"} ${seconds}초`
          : status === "error"
            ? `${size} · 실패`
            : `${size} · 대기 중`;
    return {
      id: item.id,
      name: item.originalFile.name,
      group: status,
      status,
      meta,
      thumbnailUrl: status === "done" ? item.optimizedUrl : item.thumbnailUrl,
      error: status === "error" ? item.error : undefined,
      checkerboard: true,
      expandable: status === "done",
      removable: status === "queued" || status === "error",
      sortKey: status === "done" ? item.completedAt : undefined,
    };
  });

  const summary =
    queue.length === 0
      ? "PNG·JPEG·WebP · 최대 10개 · 넣으면 바로 처리합니다"
      : [
          `${queue.length}개 파일`,
          doneItems.length > 0 && `${doneItems.length}개 완료`,
          processingCount > 0 && "처리 중 1개",
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <ToolLayout
      title="배경 제거"
      summary={summary}
      settingsTitle="배경 제거 설정"
      settings={
        <div>
          <span
            id="bg-format-label"
            className="mb-2 block text-xs font-semibold text-muted"
          >
            출력 포맷
          </span>
          <SegmentedControl
            aria-labelledby="bg-format-label"
            value={exportFormat}
            onValueChange={setExportFormat}
            options={[
              { value: "png", label: "PNG" },
              { value: "webp", label: "WebP" },
              { value: "jpeg", label: "JPG" },
            ]}
          />
          <p className="mt-2 text-xs text-muted">{FORMAT_HINT[exportFormat]}</p>
          <p className="mt-1 text-xs text-muted">
            새로 넣는 파일부터 적용됩니다.
          </p>
        </div>
      }
      settingsFooter={
        <Dropzone
          compact
          accept={ACCEPT}
          onFiles={handleFiles}
          title="파일 추가"
          hint="끌어 놓기·클릭·Ctrl+V · 최대 10개"
        />
      }
      onDropFiles={handleFiles}
      primary={
        <Button
          variant="primary"
          onClick={() => void saveZip()}
          disabled={doneItems.length === 0}
          loading={zipState === "busy"}
        >
          전체 ZIP 저장
        </Button>
      }
      actions={
        <>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            aria-keyshortcuts="Control+V"
          >
            <Plus aria-hidden="true" />
            파일 추가 (Ctrl+V)
          </Button>
          <span
            className="mx-1 hidden h-6 w-px bg-line sm:block"
            aria-hidden="true"
          />
          <Button
            variant="ghost"
            onClick={() => commit(() => [])}
            disabled={processingCount > 0 || queue.length === 0}
          >
            비우기
          </Button>
        </>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        tabIndex={-1}
        onChange={(event) => {
          if (event.target.files) handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="space-y-6">
        {notice && (
          <InlineAlert
            tone="warning"
            title={notice}
            onDismiss={() => setNotice(null)}
          />
        )}
        {zipState === "error" && (
          <InlineAlert
            tone="danger"
            title="ZIP 파일을 만들지 못했습니다"
            actions={
              <Button size="sm" onClick={() => void saveZip()}>
                다시 시도
              </Button>
            }
          >
            결과를 하나씩 저장하거나 다시 시도하세요.
          </InlineAlert>
        )}

        {queue.length === 0 ? (
          <EmptyWall
            title="대기"
            first={
              <Dropzone
                accept={ACCEPT}
                onFiles={handleFiles}
                title="파일을 끌어 놓거나 Ctrl+V로 붙여 넣으세요"
                hint="눌러서 파일 선택 · PNG·JPEG·WebP · 최대 10개 · 넣으면 바로 배경을 지웁니다"
                className="h-full min-h-0 py-6"
              />
            }
          />
        ) : (
          <TileBoard
            tiles={tiles}
            groups={GROUPS}
            expandedId={expandedId}
            onExpand={setManualFocusId}
            renderExpanded={(id) => {
              const item = doneItems.find((entry) => entry.id === id);
              return item ? (
                <DoneFocus
                  item={item}
                  onCompare={() => setCompareId(item.id)}
                  onSave={() => downloadSingle(item)}
                />
              ) : null;
            }}
            onEnter={(id) => setCompareId(id)}
            onRetry={retry}
            onRemove={removeItem}
            hint="타일에서 방향키로 이동 · Enter로 크게 비교 · Delete로 목록에서 제거"
          />
        )}
      </div>

      {compareItem && (
        <ImageCompareDialog
          key={compareItem.id}
          item={compareItem}
          onClose={() => setCompareId(null)}
        />
      )}
    </ToolLayout>
  );
}

import React, { useState, useCallback, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { QueueItem, OutputFormat } from "@/types/image";
import { compressImage } from "@/utils/compression";
import { downloadSingle, downloadAllAsZip } from "@/utils/download";
import ImageCompareDialog from "@/components/ImageCompareDialog";
import { ImageResultBoard, formatChange } from "@/components/ImageResultBoard";
import { Button } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { Dropzone } from "@/components/ui/dropzone";
import { InlineAlert } from "@/components/ui/inline-alert";
import { NumberField } from "@/components/ui/number-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToolLayout } from "@/components/ui/tool-layout";
import { formatSize } from "@/lib/format";
import { renamePastedFiles, shouldHandlePaste } from "@/lib/clipboard";
import { readImageInfo } from "@/lib/thumbnail";
import { useReportBusy, useToolActive } from "@/components/ToolActivity";

const MAX_FILES = 10;
const CONCURRENCY = 2;
const DEFAULT_QUALITY = 80;
const DEFAULT_SCALE = 50;
const QUALITY_PRESETS = [60, 75, 90, 100];
const TARGET_PRESETS = [
  { value: "100", unit: "KB" },
  { value: "200", unit: "KB" },
  { value: "500", unit: "KB" },
  { value: "1", unit: "MB" },
] as const;
const ACCEPT = ".png,.jpg,.jpeg,.webp,.avif,.gif";
const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const FORMAT_OPTIONS: { value: OutputFormat; label: string }[] = [
  { value: "original", label: "원본" },
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
  { value: "webp", label: "WebP" },
  { value: "avif", label: "AVIF" },
  { value: "gif", label: "GIF" },
];

type SizeMode = "quality" | "target";
type TargetUnit = "KB" | "MB";

function parseTargetBytes(value: string, unit: TargetUnit) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const bytes = Math.round(amount * (unit === "MB" ? 1024 * 1024 : 1024));
  return bytes >= 1024 ? bytes : null;
}

function isAcceptedImage(file: File) {
  const name = file.name.toLowerCase();
  return ACCEPTED_TYPES.includes(file.type) || name.endsWith(".avif") || name.endsWith(".gif");
}

// 서버·네트워크 오류를 "원인 · 할 일" 형식의 한국어로 바꾼다.
function describeError(item: QueueItem) {
  const raw = item.error ?? "";
  if (raw === "Network error during compression") return "네트워크 연결 끊김";
  if (raw === "Compression failed") return "서버 응답 오류";
  if (raw === "Invalid image metadata") return "이미지를 읽지 못함";
  return "처리하지 못함";
}

interface CompressionJob {
  item: QueueItem;
  scalePercent: number;
}

function createId() {
  return Math.random().toString(36).substring(2, 9);
}

function getQualityHint(format: OutputFormat) {
  switch (format) {
    case "png":
      return "100 = 무손실(트루컬러), 그 미만은 품질에 맞춰 팔레트 양자화합니다.";
    case "webp":
    case "avif":
      return "100 = 무손실 인코딩, 그 미만은 손실 압축입니다.";
    case "gif":
      return "품질에 비례해 색상 수(최대 256색)를 줄입니다.";
    case "jpeg":
      return "JPEG는 무손실을 지원하지 않습니다. 75~85가 일반적인 웹 권장값입니다.";
    default:
      return "원본 포맷 그대로 선택한 품질로 다시 인코딩합니다. PNG·WebP·AVIF는 100에서 무손실입니다.";
  }
}

function SettingLabel({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <span id={id} className="mb-2 block text-xs font-semibold text-muted">
      {children}
    </span>
  );
}

export default function ImageOptimizer({ forcedFormat }: { forcedFormat?: "webp" | "avif" }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [globalFormat, setGlobalFormat] = useState<OutputFormat>("original");
  const activeFormat = forcedFormat || globalFormat;
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [resizeEnabled, setResizeEnabled] = useState(false);
  const [globalScale, setGlobalScale] = useState(DEFAULT_SCALE);
  const [isRunning, setIsRunning] = useState(false);
  const [sizeMode, setSizeMode] = useState<SizeMode>("quality");
  const [targetValue, setTargetValue] = useState("500");
  const [targetUnit, setTargetUnit] = useState<TargetUnit>("KB");
  const [stripMetadata, setStripMetadata] = useState(true);
  const [compareId, setCompareId] = useState<string | null>(null);
  // 사용자가 직접 고른 타일. 없으면 가장 최근 완료 결과가 펼쳐진다.
  const [manualFocusId, setManualFocusId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [zipState, setZipState] = useState<"idle" | "busy" | "error">("idle");
  const [announcement, setAnnouncement] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetBytes = parseTargetBytes(targetValue, targetUnit);
  const targetInvalid = sizeMode === "target" && targetBytes === null;
  const verb = forcedFormat ? "변환" : "압축";

  // Results and thumbnails are blob: URLs; release the ones that leave the queue
  // (re-compression, removal, 비우기) and whatever is left when the component unmounts.
  const liveUrlsRef = useRef(new Set<string>());
  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
    const current = new Set(
      queue.flatMap((item) =>
        [item.optimizedUrl, item.thumbnailUrl].filter((url): url is string => Boolean(url)),
      ),
    );
    liveUrlsRef.current.forEach((url) => {
      if (!current.has(url)) URL.revokeObjectURL(url);
    });
    liveUrlsRef.current = current;
  }, [queue]);
  useEffect(() => {
    const liveUrls = liveUrlsRef;
    return () => liveUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const updateItem = useCallback(
    (id: string, patch: Partial<QueueItem>) =>
      setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...patch } : it))),
    [],
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const images = fileArray.filter(isAcceptedImage);
      const room = Math.max(0, MAX_FILES - queueRef.current.length);
      const accepted = images.slice(0, room);

      const problems: string[] = [];
      if (images.length < fileArray.length) {
        problems.push(`지원하지 않는 형식 ${fileArray.length - images.length}개를 제외했습니다`);
      }
      if (accepted.length < images.length) {
        problems.push(
          `한 번에 최대 ${MAX_FILES}개까지 넣을 수 있어 ${images.length - accepted.length}개를 추가하지 못했습니다`,
        );
      }
      setNotice(problems.length > 0 ? problems.join(" · ") : null);
      if (accepted.length === 0) return;

      const newItems: QueueItem[] = accepted.map((file) => ({
        id: createId(),
        originalFile: file,
        originalSize: file.size,
        status: "queued",
        targetFormat: activeFormat,
        webWidth: "",
        webHeight: "",
      }));
      queueRef.current = [...queueRef.current, ...newItems];
      setQueue((prev) => [...prev, ...newItems]);

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
    [activeFormat, updateItem],
  );

  const active = useToolActive();
  const processingCount = queue.filter(
    (item) => item.status === "compressing" || item.status === "uploading",
  ).length;
  useReportBusy(processingCount);

  useEffect(() => {
    // 숨겨진 도구(다른 탭)는 붙여넣기를 받지 않는다.
    if (!active) return;
    const onPaste = (event: ClipboardEvent) => {
      // Leave pastes into text fields alone, and ignore them while a modal is open.
      if (!shouldHandlePaste(event)) return;

      const images = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith("image/"),
      );
      if (images.length === 0) return;
      event.preventDefault();
      handleFiles(renamePastedFiles(images));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFiles, active]);

  // 처리 중일 때만 1초마다 경과 시간을 갱신한다.
  useEffect(() => {
    if (processingCount === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [processingCount]);

  const runJob = useCallback(
    async ({ item, scalePercent }: CompressionJob) => {
      updateItem(item.id, { status: "compressing", startedAt: Date.now() });
      setNow(Date.now());
      const name = item.originalFile.name;
      try {
        const res = await compressImage(item.originalFile, {
          targetFormat: item.targetFormat,
          quality: item.quality ?? DEFAULT_QUALITY,
          scalePercent,
          targetBytes: item.targetBytes,
          stripMetadata: item.stripMetadata,
        });
        updateItem(item.id, {
          status: "done",
          completedAt: Date.now(),
          optimizedFilename: res.optimizedFilename,
          optimizedUrl: res.optimizedUrl,
          optimizedDownloadUrl: res.optimizedDownloadUrl,
          optimizedSize: res.optimizedSize,
          qualityUsed: res.qualityUsed,
          targetMet: res.targetMet,
          reductionRate: ((res.originalSize - res.optimizedSize) / res.originalSize) * 100,
        });
        setAnnouncement(
          `${name} 완료, ${formatSize(res.originalSize)}에서 ${formatSize(res.optimizedSize)}로 ${formatChange(res.originalSize, res.optimizedSize)}`,
        );
      } catch (e) {
        const error = e instanceof Error ? e.message : "Error";
        updateItem(item.id, { status: "error", error, completedAt: Date.now() });
        setAnnouncement(`${name} 실패, ${describeError({ ...item, error })}`);
      }
    },
    [updateItem],
  );

  // Settings are snapshotted when the user presses start, not when files are dropped.
  const startCompression = async (mode: "queued" | "all" | { only: string }) => {
    if (isRunning || targetInvalid) return;

    const jobs: CompressionJob[] = [];
    const nextQueue = queue.map((item) => {
      const isFinished = item.status === "done" || item.status === "error";
      const selected =
        typeof mode === "object"
          ? item.id === mode.only && isFinished
          : item.status === "queued" || (mode === "all" && isFinished);
      if (!selected) return item;

      const updated: QueueItem = {
        ...item,
        status: "queued",
        targetFormat: activeFormat,
        quality,
        targetBytes: sizeMode === "target" ? (targetBytes ?? undefined) : undefined,
        stripMetadata,
        qualityUsed: undefined,
        targetMet: undefined,
        error: undefined,
        startedAt: undefined,
        completedAt: undefined,
        optimizedFilename: undefined,
        optimizedUrl: undefined,
        optimizedDownloadUrl: undefined,
        optimizedSize: undefined,
        reductionRate: undefined,
      };
      jobs.push({
        item: updated,
        scalePercent: resizeEnabled ? (item.customScale ?? globalScale) : 100,
      });
      return updated;
    });

    if (jobs.length === 0) return;

    setQueue(nextQueue);
    setIsRunning(true);
    setManualFocusId(null);
    setAnnouncement(`${jobs.length}개 파일 ${verb} 시작`);

    let cursor = 0;
    const worker = async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor];
        cursor += 1;
        await runJob(job);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));

    setIsRunning(false);
  };

  const removeItem = (id: string) => setQueue((q) => q.filter((item) => item.id !== id));

  const saveZip = async () => {
    setZipState("busy");
    try {
      await downloadAllAsZip(queue);
      setZipState("idle");
    } catch {
      setZipState("error");
    }
  };

  const queuedCount = queue.filter((i) => i.status === "queued").length;
  const doneItems = queue.filter((i) => i.status === "done");
  const hasFinished = queue.some((i) => i.status === "done" || i.status === "error");
  const compareItem = queue.find((i) => i.id === compareId && i.status === "done");

  const manualItem = queue.find(
    (item) => item.id === manualFocusId && (item.status === "done" || item.status === "queued"),
  );
  const latestDone = doneItems.reduce<QueueItem | undefined>(
    (latest, item) => (!latest || (item.completedAt ?? 0) > (latest.completedAt ?? 0) ? item : latest),
    undefined,
  );
  const expandedId = manualItem?.id ?? latestDone?.id ?? null;

  const totalOriginal = queue.reduce((sum, item) => sum + item.originalSize, 0);
  const saved = doneItems.reduce(
    (sum, item) => sum + (item.originalSize - (item.optimizedSize ?? item.originalSize)),
    0,
  );
  const summary =
    queue.length === 0
      ? "PNG·JPEG·WebP·AVIF·GIF · 최대 10개 · 용량 제한 없음"
      : [
          `${queue.length}개 파일`,
          formatSize(totalOriginal),
          doneItems.length > 0 && `${doneItems.length}개 완료`,
          saved > 0 && `${formatSize(saved)} 절감`,
        ]
          .filter(Boolean)
          .join(" · ");

  const finishedRun = queue.length - queuedCount - processingCount;
  const primaryLabel = isRunning
    ? `${verb} 중 (${finishedRun}/${queue.length})`
    : queuedCount > 0
      ? `${verb} 시작 (${queuedCount})`
      : hasFinished
        ? `다시 ${verb}`
        : `${verb} 시작`;

  const onPrimary = () => void startCompression(queuedCount > 0 ? "queued" : "all");

  const settings = (
    <>
      <div>
        <SettingLabel id="size-mode-label">압축 방식</SettingLabel>
        <SegmentedControl
          aria-labelledby="size-mode-label"
          value={sizeMode}
          onValueChange={setSizeMode}
          disabled={isRunning}
          options={[
            { value: "quality", label: "품질 지정" },
            { value: "target", label: "목표 용량" },
          ]}
        />
      </div>

      {sizeMode === "quality" ? (
        <div>
          <div className="flex items-baseline justify-between">
            <SettingLabel id="quality-label">품질</SettingLabel>
            <span className="text-base font-semibold">{quality}</span>
          </div>
          <Slider
            min={1}
            max={100}
            step={1}
            value={[quality]}
            onValueChange={([value]) => setQuality(value)}
            disabled={isRunning}
            aria-label="품질"
          />
          <div className="mb-2 flex justify-between text-xs text-muted">
            <span>작은 용량</span>
            <span>높은 화질</span>
          </div>
          <ChipGroup
            aria-label="품질 빠른 선택"
            columns={4}
            disabled={isRunning}
            value={QUALITY_PRESETS.includes(quality) ? String(quality) : null}
            onValueChange={(value) => setQuality(Number(value))}
            options={QUALITY_PRESETS.map((preset) => ({ value: String(preset), label: preset }))}
          />
          <p className="mt-2 text-xs text-muted">{getQualityHint(activeFormat)}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <NumberField
            label="목표 용량"
            min={1}
            step="any"
            value={targetValue}
            onChange={(event) => setTargetValue(event.target.value)}
            disabled={isRunning}
            error={targetInvalid ? "1 KB 이상의 용량을 입력하세요." : undefined}
            hint={`파일마다 품질을 자동으로 맞춰 ${targetValue || "?"} ${targetUnit} 이하로 줄입니다. 가장 낮은 품질로도 넘으면 가장 작은 결과를 드립니다.`}
            unit={
              <select
                value={targetUnit}
                onChange={(event) => setTargetUnit(event.target.value as TargetUnit)}
                disabled={isRunning}
                aria-label="용량 단위"
                className="h-8 rounded-md bg-transparent px-1 text-sm text-text outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-accent"
              >
                <option value="KB">KB</option>
                <option value="MB">MB</option>
              </select>
            }
          />
          <ChipGroup
            aria-label="목표 용량 빠른 선택"
            columns={4}
            disabled={isRunning}
            value={
              TARGET_PRESETS.find(
                (preset) => preset.value === targetValue && preset.unit === targetUnit,
              )
                ? `${targetValue}${targetUnit}`
                : null
            }
            onValueChange={(value) => {
              const preset = TARGET_PRESETS.find((p) => `${p.value}${p.unit}` === value);
              if (!preset) return;
              setTargetValue(preset.value);
              setTargetUnit(preset.unit);
            }}
            options={TARGET_PRESETS.map((preset) => ({
              value: `${preset.value}${preset.unit}`,
              label: `${preset.value} ${preset.unit}`,
            }))}
          />
        </div>
      )}

      <div>
        <Switch
          label="크기 조절"
          checked={resizeEnabled}
          onCheckedChange={setResizeEnabled}
          disabled={isRunning}
          hint={
            resizeEnabled
              ? "원본 크기를 기준으로 같은 비율을 적용하고 가로세로 비율은 유지합니다. 대기 중인 파일을 누르면 파일별 비율을 정할 수 있습니다."
              : "원본 해상도를 유지합니다."
          }
        />
        {resizeEnabled && (
          <div className="mt-2">
            <div className="flex items-baseline justify-between">
              <SettingLabel>비율</SettingLabel>
              <span className="text-base font-semibold">{globalScale}%</span>
            </div>
            <Slider
              min={10}
              max={100}
              step={5}
              value={[globalScale]}
              onValueChange={([value]) => setGlobalScale(value)}
              disabled={isRunning}
              aria-label="크기 비율"
            />
          </div>
        )}
      </div>

      <Switch
        label="메타데이터 제거 (EXIF·GPS)"
        checked={stripMetadata}
        onCheckedChange={setStripMetadata}
        disabled={isRunning}
        hint={
          stripMetadata
            ? "촬영 기기·시각·위치 정보를 지웁니다. 사진 방향은 유지됩니다."
            : "원본의 EXIF·XMP·IPTC 정보를 남깁니다. 공유 전에 위치 정보를 확인하세요."
        }
      />

      {forcedFormat ? (
        <div>
          <SettingLabel>출력 포맷</SettingLabel>
          <p className="text-sm font-semibold">{forcedFormat === "webp" ? "WebP" : "AVIF"}</p>
          {forcedFormat === "avif" && (
            <p className="mt-1 text-xs text-muted">
              AVIF는 큰 사진에서 수십 초가 걸릴 수 있습니다.
            </p>
          )}
        </div>
      ) : (
        <div>
          <SettingLabel id="format-label">출력 포맷</SettingLabel>
          <ChipGroup
            aria-labelledby="format-label"
            columns={3}
            disabled={isRunning}
            value={globalFormat}
            onValueChange={setGlobalFormat}
            options={FORMAT_OPTIONS}
          />
        </div>
      )}
    </>
  );

  return (
    <ToolLayout
      title={forcedFormat === "webp" ? "WebP 변환" : forcedFormat === "avif" ? "AVIF 변환" : "이미지 압축"}
      summary={summary}
      settingsTitle={`${verb} 설정`}
      settings={settings}
      settingsFooter={
        <Dropzone
          compact
          accept={ACCEPT}
          onFiles={handleFiles}
          title="파일 추가"
          hint="끌어 놓기·클릭·Ctrl+V · 최대 10개 · 용량 제한 없음"
        />
      }
      onDropFiles={handleFiles}
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
          <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
          <Button variant="ghost" onClick={() => setQueue([])} disabled={isRunning || queue.length === 0}>
            비우기
          </Button>
          <Button
            onClick={() => void saveZip()}
            disabled={doneItems.length === 0 || isRunning}
            loading={zipState === "busy"}
          >
            전체 ZIP 저장
          </Button>
          <Button
            variant="primary"
            onClick={onPrimary}
            disabled={queue.length === 0 || targetInvalid}
            loading={isRunning}
          >
            {primaryLabel}
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
          <InlineAlert tone="warning" title={notice} onDismiss={() => setNotice(null)} />
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
          <Dropzone
            accept={ACCEPT}
            onFiles={handleFiles}
            title="파일을 끌어 놓거나 Ctrl+V로 붙여 넣으세요"
            hint="눌러서 파일 선택 · PNG·JPEG·WebP·AVIF·GIF · 최대 10개 · 용량 제한 없음"
            className="min-h-[min(60dvh,28rem)]"
          />
        ) : (
          <ImageResultBoard
            queue={queue}
            expandedId={expandedId}
            onExpand={setManualFocusId}
            now={now}
            isRunning={isRunning}
            verb={verb}
            resizeEnabled={resizeEnabled}
            globalScale={globalScale}
            onRemove={removeItem}
            onRetry={(id) => void startCompression({ only: id })}
            onCompare={setCompareId}
            onSave={downloadSingle}
            onCustomScale={(id, value) => updateItem(id, { customScale: value })}
            describeError={describeError}
          />
        )}
      </div>

      {compareItem && (
        <ImageCompareDialog key={compareItem.id} item={compareItem} onClose={() => setCompareId(null)} />
      )}
    </ToolLayout>
  );
}

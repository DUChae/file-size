"use client";

// 압축 전후 이미지를 화면 가득 슬라이더로 겹쳐 비교하는 모달

import { useState } from "react";
import { Download } from "lucide-react";
import { QueueItem } from "@/types/image";
import { downloadSingle } from "@/utils/download";
import { Button } from "@/components/ui/button";
import { CompareSlider, type Dimensions } from "@/components/ui/compare-slider";
import { Dialog } from "@/components/ui/dialog";
import { formatSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatChange } from "@/components/ImageResultBoard";

export default function ImageCompareDialog({
  item,
  onClose,
}: {
  item: QueueItem;
  onClose: () => void;
}) {
  const [originalDims, setOriginalDims] = useState<Dimensions | null>(
    item.width && item.height
      ? { width: item.width, height: item.height }
      : null,
  );
  const [resultDims, setResultDims] = useState<Dimensions | null>(null);

  const optimizedSize = item.optimizedSize ?? 0;
  const increased = optimizedSize > item.originalSize;
  const aspect = originalDims
    ? originalDims.width / originalDims.height
    : 4 / 3;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={item.originalFile.name}
      description="경계선을 끌거나 방향키로 원본과 결과를 비교합니다."
      closeLabel="비교 닫기"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-4">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:flex sm:gap-8">
            <div>
              <dt className="text-xs text-muted">원본</dt>
              <dd className="font-semibold">
                {formatSize(item.originalSize)}
                {originalDims &&
                  ` · ${originalDims.width}×${originalDims.height}`}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">결과</dt>
              <dd className="font-semibold">
                {formatSize(optimizedSize)}
                {resultDims && ` · ${resultDims.width}×${resultDims.height}`}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">변화</dt>
              <dd className={cn("font-semibold", increased && "text-warning")}>
                {formatChange(item.originalSize, optimizedSize)}
                {increased && " (용량 증가)"}
              </dd>
            </div>
          </dl>
          <Button variant="inverse" onClick={() => downloadSingle(item)}>
            <Download aria-hidden="true" />
            결과 저장
            {item.optimizedFilename && (
              <span className="sr-only"> {item.optimizedFilename}</span>
            )}
          </Button>
        </div>
      }
    >
      {item.optimizedUrl && (
        <CompareSlider
          originalFile={item.originalFile}
          resultUrl={item.optimizedUrl}
          name={item.originalFile.name}
          checkerboard
          onOriginalLoad={setOriginalDims}
          onResultLoad={setResultDims}
          className="mx-auto rounded-lg border border-line"
          style={{
            aspectRatio: String(aspect),
            width: `min(100%, calc(62dvh * ${aspect}))`,
          }}
        />
      )}
    </Dialog>
  );
}

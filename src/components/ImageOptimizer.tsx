"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { QueueItem, QueueStatus } from "@/types/image";
import { compressImage } from "@/utils/compression";
import { downloadSingle, downloadAllAsZip } from "@/utils/download";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const CONCURRENCY = 2;

export default function ImageOptimizer() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const processingRef = useRef<number>(0);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);

      // 8. Upload Policy: Max 10 files
      if (queue.length + fileArray.length > MAX_FILES) {
        alert(`최대 ${MAX_FILES}개의 파일만 업로드할 수 있습니다.`);
        return;
      }

      const newItems: QueueItem[] = [];

      for (const file of fileArray) {
        // 7. Support Formats
        if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) {
          alert(`${file.name}은(는) 지원하지 않는 형식입니다.`);
          continue;
        }

        // 8. Max File Size: 20MB
        if (file.size > MAX_FILE_SIZE) {
          alert(`${file.name}의 크기가 20MB를 초과합니다.`);
          continue;
        }

        newItems.push({
          id: Math.random().toString(36).substring(2, 9),
          originalFile: file,
          originalSize: file.size,
          status: "queued",
        });
      }

      setQueue((prev) => [...prev, ...newItems]);
    },
    [queue.length]
  );

  const processQueue = useCallback(async () => {
    if (processingRef.current >= CONCURRENCY) return;

    const nextItem = queue.find((item) => item.status === "queued");
    if (!nextItem) return;

    processingRef.current += 1;
    
    // Update status to uploading/compressing
    setQueue((prev) =>
      prev.map((item) =>
        item.id === nextItem.id ? { ...item, status: "compressing" } : item
      )
    );

    try {
      const result = await compressImage(nextItem.originalFile, nextItem.id);
      
      setQueue((prev) =>
        prev.map((item) =>
          item.id === nextItem.id
            ? {
                ...item,
                status: "done",
                optimizedFile: result.optimizedFile,
                optimizedSize: result.optimizedSize,
                reductionRate:
                  ((result.originalSize - result.optimizedSize) /
                    result.originalSize) *
                  100,
              }
            : item
        )
      );
    } catch (error) {
      setQueue((prev) =>
        prev.map((item) =>
          item.id === nextItem.id
            ? {
                ...item,
                status: "error",
                error: error instanceof Error ? error.message : "Error",
              }
            : item
        )
      );
    } finally {
      processingRef.current -= 1;
      // Trigger next processing
      processQueue();
    }
  }, [queue]);

  useEffect(() => {
    processQueue();
  }, [queue, processQueue]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const isAllDone =
    queue.length > 0 && queue.every((item) => item.status === "done" || item.status === "error");

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* 17. Drop Zone UI */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => document.getElementById("fileInput")?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-[#0070f3] bg-blue-50"
            : "border-gray-200 hover:border-[#0070f3] hover:bg-gray-50"
        }`}
      >
        <input
          id="fileInput"
          type="file"
          multiple
          accept=".png,.jpg,.jpeg"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <div className="mb-4">
          <svg
            className="w-12 h-12 mx-auto text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="Target: M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
        </div>
        <p className="text-lg font-medium text-gray-900 mb-2">
          여기에 최적화할 PNG / JPG 파일들을 드래그하거나 클릭하여 선택하세요.
        </p>
        <p className="text-sm text-gray-500">
          캡처본 및 스크린샷 최적화에 특화된 고압축이 실행됩니다. (최대 10개, 단일 20MB)
        </p>
      </div>

      {/* 18. Security Note */}
      <p className="mt-4 text-center text-xs text-gray-400">
        🔒 이미지는 압축 처리 중에만 서버 메모리에 임시 존재하며,
        <br />
        처리 즉시 삭제됩니다. 서버에 저장되거나 기록되지 않습니다.
      </p>

      {/* 19. Queue Table */}
      {queue.length > 0 && (
        <div className="mt-12">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">처리 대기열 ({queue.length})</h2>
            {isAllDone && (
              <button
                onClick={() => downloadAllAsZip(queue)}
                className="bg-[#0070f3] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-600 transition-colors"
              >
                ZIP 일괄 다운로드
              </button>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left font-semibold text-gray-600">파일명</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-600">원본 용량</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-600">최적화 용량</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-600">절감률</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-600">상태</th>
                  <th className="px-6 py-4 text-right font-semibold text-gray-600">다운로드</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {queue.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 truncate max-w-[200px]" title={item.originalFile.name}>
                      {item.originalFile.name}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{formatSize(item.originalSize)}</td>
                    <td className="px-6 py-4 text-gray-500">
                      {item.optimizedSize ? formatSize(item.optimizedSize) : "-"}
                    </td>
                    <td className="px-6 py-4">
                      {/* 20. Reduction Rate Style */}
                      {item.reductionRate !== undefined ? (
                        <span className="text-green-600 font-bold">
                          -{item.reductionRate.toFixed(1)}%
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={item.status} error={item.error} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      {item.status === "done" && (
                        <button
                          onClick={() => downloadSingle(item)}
                          className="text-[#0070f3] hover:underline font-medium"
                        >
                          다운로드
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, error }: { status: QueueStatus; error?: string }) {
  const styles = {
    queued: "bg-gray-100 text-gray-600",
    uploading: "bg-blue-100 text-blue-600 animate-pulse",
    compressing: "bg-yellow-100 text-yellow-600 animate-pulse",
    done: "bg-green-100 text-green-600",
    error: "bg-red-100 text-red-600",
  };

  const labels = {
    queued: "대기 중",
    uploading: "업로드 중",
    compressing: "압축 중",
    done: "완료",
    error: "실패",
  };

  return (
    <div className="flex items-center gap-2">
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
      {status === "error" && (
        <span className="text-xs text-red-500" title={error}>
          (!)
        </span>
      )}
    </div>
  );
}

"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { QueueItem, QueueStatus, ImageCategory, OutputFormat } from "@/types/image";
import { compressImage } from "@/utils/compression";
import { downloadSingle, downloadAllAsZip } from "@/utils/download";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const CONCURRENCY = 2;

export default function ImageOptimizer() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  // Global Settings
  const [globalCategory, setGlobalCategory] = useState<ImageCategory>("screenshot");
  const [globalFormat, setGlobalFormat] = useState<OutputFormat>("original");

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

      if (queue.length + fileArray.length > MAX_FILES) {
        alert(`최대 ${MAX_FILES}개의 파일만 업로드할 수 있습니다.`);
        return;
      }

      const newItems: QueueItem[] = [];

      for (const file of fileArray) {
        if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) {
          alert(`${file.name}은(는) 지원하지 않는 형식입니다.`);
          continue;
        }

        if (file.size > MAX_FILE_SIZE) {
          alert(`${file.name}의 크기가 20MB를 초과합니다.`);
          continue;
        }

        newItems.push({
          id: Math.random().toString(36).substring(2, 9),
          originalFile: file,
          originalSize: file.size,
          status: "queued",
          category: globalCategory,
          targetFormat: globalFormat,
        });
      }

      setQueue((prev) => [...prev, ...newItems]);
    },
    [queue.length, globalCategory, globalFormat]
  );

  const processQueue = useCallback(async () => {
    if (processingRef.current >= CONCURRENCY) return;

    setQueue((prevQueue) => {
      const nextItem = prevQueue.find((item) => item.status === "queued");
      if (!nextItem || processingRef.current >= CONCURRENCY) return prevQueue;

      processingRef.current += 1;

      (async () => {
        try {
          setQueue((q) => q.map((it) => (it.id === nextItem.id ? { ...it, status: "compressing" } : it)));

          const result = await compressImage(
            nextItem.originalFile, 
            nextItem.id, 
            nextItem.category, 
            nextItem.targetFormat
          );

          setQueue((q) =>
            q.map((it) =>
              it.id === nextItem.id
                ? {
                    ...it,
                    status: "done",
                    optimizedFile: result.optimizedFile,
                    optimizedSize: result.optimizedSize,
                    reductionRate: ((result.originalSize - result.optimizedSize) / result.originalSize) * 100,
                  }
                : it
            )
          );
        } catch (error) {
          setQueue((q) =>
            q.map((it) =>
              it.id === nextItem.id
                ? { ...it, status: "error", error: error instanceof Error ? error.message : "Error" }
                : it
            )
          );
        } finally {
          processingRef.current -= 1;
          processQueue();
        }
      })();

      return prevQueue.map((it) => (it.id === nextItem.id ? { ...it, status: "uploading" } : it));
    });
  }, []);

  useEffect(() => {
    const queuedItems = queue.filter((item) => item.status === "queued");
    if (queuedItems.length > 0 && processingRef.current < CONCURRENCY) {
      processQueue();
    }
  }, [queue, processQueue]);

  const updateItemSettings = (id: string, updates: Partial<Pick<QueueItem, "category" | "targetFormat">>) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const isAllDone = queue.length > 0 && queue.every((item) => item.status === "done" || item.status === "error");

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Global Settings UI */}
      <div className="mb-8 bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-wrap gap-8 items-center">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-gray-700">전체 최적화 카테고리</label>
          <select 
            value={globalCategory}
            onChange={(e) => setGlobalCategory(e.target.value as ImageCategory)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-[#0070f3]"
          >
            <option value="screenshot">스크린샷 (가독성 우선)</option>
            <option value="photo">일반 사진 (용량 우선)</option>
            <option value="web">웹 업로드용 (극단적 압축 + 리사이즈)</option>
            <option value="high-quality">고화질 보관 (품질 우선)</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-gray-700">전체 변환 포맷</label>
          <select 
            value={globalFormat}
            onChange={(e) => setGlobalFormat(e.target.value as OutputFormat)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-[#0070f3]"
          >
            <option value="original">원본 포맷 유지</option>
            <option value="png">PNG로 변환</option>
            <option value="jpeg">JPG로 변환</option>
          </select>
        </div>
        <div className="ml-auto text-xs text-gray-400 max-w-[200px]">
          * 설정 변경 후 파일을 업로드하면 해당 설정이 적용됩니다. 대기열 내 개별 수정도 가능합니다.
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => document.getElementById("fileInput")?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
          isDragging ? "border-[#0070f3] bg-blue-50" : "border-gray-200 hover:border-[#0070f3] hover:bg-gray-50"
        }`}
      >
        <input id="fileInput" type="file" multiple accept=".png,.jpg,.jpeg" className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
        <p className="text-lg font-medium text-gray-900 mb-1">파일을 드래그하거나 클릭하여 선택하세요.</p>
        <p className="text-sm text-gray-500">PNG, JPG 지원 (최대 10개, 각 20MB)</p>
      </div>

      <p className="mt-4 text-center text-xs text-gray-400">
        🔒 이미지는 압축 처리 중에만 서버 메모리에 임시 존재하며 즉시 삭제됩니다.
      </p>

      {/* Queue Table */}
      {queue.length > 0 && (
        <div className="mt-12">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">처리 대기열</h2>
            {isAllDone && (
              <button onClick={() => downloadAllAsZip(queue)} className="bg-[#0070f3] text-white px-5 py-2 rounded-md text-sm font-bold hover:bg-blue-600 transition-colors">
                ZIP 일괄 다운로드
              </button>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-md">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left font-bold text-gray-600">파일명 / 설정</th>
                  <th className="px-6 py-4 text-left font-bold text-gray-600">원본</th>
                  <th className="px-6 py-4 text-left font-bold text-gray-600">결과</th>
                  <th className="px-6 py-4 text-left font-bold text-gray-600">절감률</th>
                  <th className="px-6 py-4 text-left font-bold text-gray-600">상태</th>
                  <th className="px-6 py-4 text-right font-bold text-gray-600">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {queue.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900 truncate max-w-[180px]" title={item.originalFile.name}>
                        {item.originalFile.name}
                      </div>
                      {item.status === "queued" && (
                        <div className="flex gap-2 mt-2">
                          <select 
                            value={item.category} 
                            onChange={(e) => updateItemSettings(item.id, { category: e.target.value as ImageCategory })}
                            className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white outline-none"
                          >
                            <option value="screenshot">스크린샷</option>
                            <option value="photo">사진</option>
                            <option value="web">웹용</option>
                            <option value="high-quality">고화질</option>
                          </select>
                          <select 
                            value={item.targetFormat} 
                            onChange={(e) => updateItemSettings(item.id, { targetFormat: e.target.value as OutputFormat })}
                            className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white outline-none"
                          >
                            <option value="original">Original</option>
                            <option value="png">PNG</option>
                            <option value="jpeg">JPG</option>
                          </select>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{formatSize(item.originalSize)}</td>
                    <td className="px-6 py-4 text-gray-900 font-medium whitespace-nowrap">
                      {item.optimizedSize ? formatSize(item.optimizedSize) : "-"}
                    </td>
                    <td className="px-6 py-4">
                      {item.reductionRate !== undefined ? (
                        <span className="text-green-600 font-bold bg-green-50 px-2 py-1 rounded">
                          -{item.reductionRate.toFixed(1)}%
                        </span>
                      ) : "-"}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={item.status} error={item.error} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      {item.status === "done" && (
                        <button onClick={() => downloadSingle(item)} className="text-[#0070f3] hover:underline font-bold">
                          다운로드
                        </button>
                      )}
                      {item.status === "queued" && (
                         <button onClick={() => setQueue(q => q.filter(i => i.id !== item.id))} className="text-gray-400 hover:text-red-500 text-xs">
                           삭제
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
      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${styles[status]}`}>
        {labels[status]}
      </span>
      {status === "error" && <span className="text-[10px] text-red-500" title={error}>(!)</span>}
    </div>
  );
}

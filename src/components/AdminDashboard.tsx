"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardStats } from "@/lib/analytics";
import { FeedbackSubmission } from "@/lib/feedback";

type RangeKey = "7d" | "30d" | "365d";
type AdminTab = "analytics" | "feedback";

function formatTimestamp(value: string) {
  try {
    return new Date(value).toLocaleString("ko-KR");
  } catch {
    return value;
  }
}

function compactDateLabel(value: string) {
  return value.slice(5).replace("-", ".");
}

function formatCount(value: number) {
  return value.toLocaleString("ko-KR");
}

function formatBytes(value: number) {
  if (value <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const size = value / Math.pow(1024, unitIndex);

  return `${size.toLocaleString("ko-KR", {
    maximumFractionDigits: size >= 10 || unitIndex === 0 ? 0 : 1,
  })} ${units[unitIndex]}`;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
        {label}
      </div>
      <div className="mt-3 text-3xl font-black text-white">
        {formatCount(value)}
      </div>
    </div>
  );
}

function SizeStatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
        {label}
      </div>
      <div className="mt-3 text-3xl font-black text-white">
        {formatBytes(value)}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  empty?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
      <div className="mb-6">
        <h2 className="text-xl font-black tracking-tight text-white">
          {title}
        </h2>
        <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
      </div>
      <div className="rounded-[24px] border border-white/10 bg-slate-950/60 p-4">
        <div className="h-[320px] min-h-[320px] w-full">
          {empty ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              선택한 범위에 데이터가 없습니다.
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </section>
  );
}

function DashboardTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ color?: string; name?: string; value?: number | string }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/95 px-4 py-3 shadow-2xl">
      <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </div>
      <div className="mt-3 space-y-2">
        {payload.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between gap-6 text-sm"
          >
            <div className="flex items-center gap-2 text-slate-200">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color ?? "#fff" }}
              />
              <span>{item.name}</span>
            </div>
            <span className="font-bold text-white">
              {formatCount(Number(item.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type BrushRange = {
  startIndex: number;
  endIndex: number;
};

function getTakeCount(range: RangeKey) {
  return range === "7d" ? 7 : range === "30d" ? 30 : 365;
}

function getDefaultWindow(range: RangeKey, length: number) {
  return Math.min(length, range === "7d" ? 7 : range === "30d" ? 14 : 30);
}

function getDefaultBrushRange(
  range: RangeKey,
  length: number,
): BrushRange | null {
  if (length === 0) {
    return null;
  }

  const windowSize = getDefaultWindow(range, length);
  return {
    startIndex: Math.max(0, length - windowSize),
    endIndex: length - 1,
  };
}

export default function AdminDashboard({
  dashboard,
  feedback,
}: {
  dashboard: DashboardStats;
  feedback: FeedbackSubmission[];
}) {
  const [activeTab, setActiveTab] = useState<AdminTab>("analytics");
  const [feedbackItems, setFeedbackItems] =
    useState<FeedbackSubmission[]>(feedback);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("30d");
  const [brushRange, setBrushRange] = useState<BrushRange | null>(() =>
    getDefaultBrushRange(
      "30d",
      Math.min(dashboard.trends.length, getTakeCount("30d")),
    ),
  );

  useEffect(() => {
    if (activeTab !== "feedback") {
      return;
    }

    let cancelled = false;

    async function loadFeedback() {
      setFeedbackLoading(true);
      setFeedbackError(null);

      try {
        const response = await fetch("/api/feedback", {
          method: "GET",
          cache: "no-store",
        });

        const data = (await response.json()) as {
          success: boolean;
          error?: string;
          feedback?: FeedbackSubmission[];
        };

        if (!response.ok || !data.success) {
          throw new Error(data.error || "피드백 목록을 불러오지 못했습니다.");
        }

        if (cancelled) {
          return;
        }

        setFeedbackItems(data.feedback ?? []);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setFeedbackError(
          error instanceof Error
            ? error.message
            : "피드백 목록을 불러오지 못했습니다.",
        );
      } finally {
        if (!cancelled) {
          setFeedbackLoading(false);
        }
      }
    }

    void loadFeedback();

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const baseData = useMemo(() => {
    const take = getTakeCount(range);
    return dashboard.trends.slice(-take).map((item) => ({
      rawDate: item.date,
      date: compactDateLabel(item.date),
      conversions: item.conversionsSucceeded,
      failures: item.conversionsFailed,
      pageViews: item.pageViews,
      imageSuccess: item.imageSuccess,
      pdfSuccess: item.pdfSuccess,
    }));
  }, [dashboard.trends, range]);

  const chartData = useMemo(() => {
    if (!brushRange) {
      return baseData;
    }

    return baseData.slice(brushRange.startIndex, brushRange.endIndex + 1);
  }, [baseData, brushRange]);

  const rangeLabel = useMemo(() => {
    if (chartData.length === 0) {
      return "선택된 기간 없음";
    }

    return `${chartData[0].rawDate} ~ ${chartData[chartData.length - 1].rawDate}`;
  }, [chartData]);

  const failedLogs = useMemo(() => {
    if (chartData.length === 0) {
      return [];
    }

    const startDate = chartData[0].rawDate;
    const endDate = chartData[chartData.length - 1].rawDate;

    return dashboard.recentLogs.filter((log) => {
      if (log.type !== "image_job_error" && log.type !== "pdf_job_error") {
        return false;
      }

      const logDate = log.timestamp.slice(0, 10);
      return logDate >= startDate && logDate <= endDate;
    });
  }, [chartData, dashboard.recentLogs]);

  const handleBrushChange = (nextRange: BrushRange | null | undefined) => {
    if (
      !nextRange ||
      typeof nextRange.startIndex !== "number" ||
      typeof nextRange.endIndex !== "number"
    ) {
      return;
    }

    setBrushRange(nextRange);
  };

  const handleRangeChange = (nextRange: RangeKey) => {
    setRange(nextRange);
    setBrushRange(
      getDefaultBrushRange(
        nextRange,
        Math.min(dashboard.trends.length, getTakeCount(nextRange)),
      ),
    );
  };

  const handleDeleteFeedback = async (id: string) => {
    setDeletingId(id);
    setFeedbackError(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const raw = await response.text();
      const data = (raw ? JSON.parse(raw) : { success: response.ok }) as {
        success: boolean;
        error?: string;
      };
      if (!response.ok || !data.success) {
        throw new Error(data.error || "피드백 삭제에 실패했습니다.");
      }

      setFeedbackItems((items) => items.filter((item) => item.id !== id));
    } catch (error) {
      setFeedbackError(
        error instanceof Error ? error.message : "피드백 삭제에 실패했습니다.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-16 text-slate-50">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight">
              Admin Dashboard
            </h1>
            <p className="mt-3 text-sm text-slate-400">
              Redis 기준으로 방문, 업로드, 변환 로그와 사용자 제보를 확인합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link
              href="/"
              className="inline-flex items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black tracking-[0.18em] text-slate-200 transition-colors hover:bg-white/10"
            >
              메인으로
            </Link>
            <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-1.5">
              {(["analytics", "feedback"] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`rounded-xl px-4 py-2 text-xs font-black tracking-[0.18em] transition-colors ${
                    activeTab === key
                      ? "bg-white text-slate-950"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {key === "analytics" ? "Analytics" : "Feedback"}
                </button>
              ))}
            </div>
            {activeTab === "analytics" && (
              <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-1.5">
                {(["7d", "30d", "365d"] as const).map((key) => (
                  <button
                    key={key}
                    onClick={() => handleRangeChange(key)}
                    className={`rounded-xl px-4 py-2 text-xs font-black tracking-[0.18em] transition-colors ${
                      range === key
                        ? "bg-white text-slate-950"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {!dashboard.enabled && (
          <div className="mb-8 rounded-3xl border border-amber-500/20 bg-amber-500/10 p-6 text-amber-100">
            Redis/KV 환경변수가 없어 집계를 불러오지 못했습니다.
          </div>
        )}

        {activeTab === "analytics" ? (
          <>
            <div className="mb-8 rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                Selected Range
              </div>
              <div className="mt-2 text-lg font-bold text-white">
                {rangeLabel}
              </div>
              <p className="mt-2 text-sm text-slate-400">
                그래프 하단 브러시를 드래그해서 표시 기간을 조절할 수 있습니다.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard label="페이지뷰" value={dashboard.totals.pageViews} />
              <StatCard
                label="방문자 수"
                value={dashboard.totals.uniqueVisitors}
              />
              <StatCard
                label="업로드 파일 수"
                value={dashboard.totals.filesSent}
              />
              <StatCard
                label="변환 성공 수"
                value={dashboard.totals.conversionsSucceeded}
              />
              <StatCard
                label="변환 실패 수"
                value={dashboard.totals.conversionsFailed}
              />
              <StatCard
                label="이미지 변환 성공"
                value={dashboard.totals.imageSuccess}
              />
              <StatCard
                label="PDF 변환 성공"
                value={dashboard.totals.pdfSuccess}
              />
              <SizeStatCard
                label="절감한 총 용량"
                value={dashboard.totals.totalBytesSaved}
              />
            </div>

            <div className="mt-10 grid gap-6 xl:grid-cols-2">
              <ChartCard
                title="Conversion Trend"
                subtitle={`${rangeLabel} 변환 성공 추이`}
                empty={baseData.length === 0}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={baseData}
                    margin={{ top: 10, right: 12, left: -18, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke="rgba(255,255,255,0.08)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      stroke="#94a3b8"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={<DashboardTooltip />}
                      cursor={{ stroke: "rgba(255,255,255,0.15)" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="conversions"
                      name="성공"
                      stroke="#38bdf8"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{
                        r: 6,
                        fill: "#e0f2fe",
                        stroke: "#38bdf8",
                        strokeWidth: 2,
                      }}
                    />
                    <Brush
                      dataKey="date"
                      height={28}
                      stroke="#38bdf8"
                      travellerWidth={14}
                      startIndex={brushRange?.startIndex}
                      endIndex={brushRange?.endIndex}
                      onChange={handleBrushChange}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                title="Success vs Failure"
                subtitle={`${rangeLabel} 성공/실패 비교`}
                empty={chartData.length === 0}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 10, right: 12, left: -18, bottom: 0 }}
                    barGap={10}
                  >
                    <CartesianGrid
                      stroke="rgba(255,255,255,0.08)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      stroke="#94a3b8"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={<DashboardTooltip />}
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    />
                    <Legend />
                    <Bar
                      dataKey="conversions"
                      name="성공"
                      fill="#22c55e"
                      radius={[10, 10, 0, 0]}
                    />
                    <Bar
                      dataKey="failures"
                      name="실패"
                      fill="#f97316"
                      radius={[10, 10, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr]">
              <ChartCard
                title="Traffic Trend"
                subtitle={`${rangeLabel} 방문 추이`}
                empty={chartData.length === 0}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 12, left: -18, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke="rgba(255,255,255,0.08)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      stroke="#94a3b8"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={<DashboardTooltip />}
                      cursor={{ stroke: "rgba(255,255,255,0.15)" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="pageViews"
                      name="페이지뷰"
                      stroke="#a78bfa"
                      strokeWidth={3}
                      dot={{ r: 4, fill: "#a78bfa", strokeWidth: 0 }}
                      activeDot={{
                        r: 6,
                        fill: "#f5f3ff",
                        stroke: "#a78bfa",
                        strokeWidth: 2,
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                title="Tool Mix"
                subtitle={`${rangeLabel} 도구별 성공 수`}
                empty={chartData.length === 0}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 10, right: 12, left: -18, bottom: 0 }}
                    barGap={10}
                  >
                    <CartesianGrid
                      stroke="rgba(255,255,255,0.08)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      stroke="#94a3b8"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={<DashboardTooltip />}
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    />
                    <Legend />
                    <Bar
                      dataKey="imageSuccess"
                      name="Image"
                      fill="#38bdf8"
                      radius={[10, 10, 0, 0]}
                    />
                    <Bar
                      dataKey="pdfSuccess"
                      name="PDF"
                      fill="#f43f5e"
                      radius={[10, 10, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
              <h2 className="mb-4 text-xl font-black tracking-tight">
                실패한 변환 로그
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-slate-400">
                    <tr className="border-b border-white/10">
                      <th className="py-3 pr-4 text-left">시간</th>
                      <th className="py-3 pr-4 text-left">이벤트</th>
                      <th className="py-3 pr-4 text-left">도구</th>
                      <th className="py-3 pr-4 text-left">모드</th>
                      <th className="py-3 pr-4 text-left">파일</th>
                      <th className="py-3 pr-4 text-left">크기</th>
                      <th className="py-3 text-left">에러</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedLogs.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-6 text-slate-500">
                          선택한 범위에 실패 로그가 없습니다.
                        </td>
                      </tr>
                    )}
                    {failedLogs.map((log, index) => (
                      <tr
                        key={`${log.timestamp}-${index}`}
                        className="align-top border-b border-white/5"
                      >
                        <td className="whitespace-nowrap py-3 pr-4 text-slate-300">
                          {formatTimestamp(log.timestamp)}
                        </td>
                        <td className="py-3 pr-4 font-bold text-white">
                          {log.type}
                        </td>
                        <td className="py-3 pr-4 text-slate-300">
                          {log.tool ?? "-"}
                        </td>
                        <td className="py-3 pr-4 text-slate-300">
                          {log.mode ?? "-"}
                        </td>
                        <td className="break-all py-3 pr-4 text-slate-300">
                          {log.filename ?? "-"}
                        </td>
                        <td className="py-3 pr-4 text-slate-300">
                          {typeof log.fileSize === "number"
                            ? formatCount(log.fileSize)
                            : "-"}
                        </td>
                        <td className="py-3 text-slate-300">
                          {log.error ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
            {feedbackError && (
              <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200">
                {feedbackError}
              </div>
            )}
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black tracking-tight text-white">
                  Feedback Submissions
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  사용자가 남긴 버그 제보와 개선 요청을 최신순으로 확인합니다.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-2 text-xs font-black tracking-[0.18em] text-slate-300">
                {feedbackLoading
                  ? "loading..."
                  : `${formatCount(feedbackItems.length)} items`}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-400">
                  <tr className="border-b border-white/10">
                    <th className="py-3 pr-4 text-left">시간</th>
                    <th className="py-3 pr-4 text-left">유형</th>
                    <th className="py-3 pr-4 text-left">제목</th>
                    <th className="py-3 pr-4 text-left">내용</th>
                    <th className="py-3 text-left">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {!feedbackLoading && feedbackItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-slate-500">
                        아직 제출된 제보가 없습니다.
                      </td>
                    </tr>
                  )}
                  {feedbackItems.map((entry) => (
                    <tr
                      key={entry.id}
                      className="align-top border-b border-white/5"
                    >
                      <td className="whitespace-nowrap py-3 pr-4 text-slate-300">
                        {formatTimestamp(entry.createdAt)}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                            entry.type === "bug"
                              ? "bg-rose-500/10 text-rose-300"
                              : "bg-emerald-500/10 text-emerald-300"
                          }`}
                        >
                          {entry.type}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-bold text-white">
                        {entry.title}
                      </td>
                      <td className="max-w-xl whitespace-pre-wrap py-3 pr-4 text-slate-300">
                        {entry.details}
                      </td>
                      <td className="py-3 text-slate-300">
                        <button
                          onClick={() => void handleDeleteFeedback(entry.id)}
                          disabled={deletingId === entry.id}
                          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-black text-rose-200 transition-colors hover:bg-rose-500/20 disabled:cursor-wait disabled:opacity-60"
                        >
                          {deletingId === entry.id ? "삭제 중..." : "삭제"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

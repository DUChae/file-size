"use client";

// 운영자용 통계 대시보드와 피드백 목록

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CheckCircle2, ChevronDown, Trash2, XCircle } from "lucide-react";
import { DashboardLogEntry, DashboardStats } from "@/lib/analytics";
import { FeedbackSubmission } from "@/lib/feedback";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { formatSize } from "@/lib/format";

type RangeKey = "7d" | "30d" | "365d";
type AdminTab = "analytics" | "users" | "feedback";

// 차트 색: 중립 + 노랑 + 상태색(성공·실패). 상태색은 아이콘·라벨과 함께만 쓴다.
const CHART = {
  grid: "#2C2F36",
  axis: "#A1A1AA",
  accent: "#FFD43B",
  neutral: "#A1A1AA",
  success: "#4ADE80",
  danger: "#F87171",
  surface: "#1A1C21",
  bg: "#0E0F12",
};

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "7d", label: "7일" },
  { value: "30d", label: "30일" },
  { value: "365d", label: "1년" },
];
const SPARK_DAYS = 14;
const LONG_TEXT = 140;

function formatTimestamp(value: string) {
  try {
    return new Date(value).toLocaleString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function formatUser(userId?: string, userName?: string) {
  if (!userId) return "알 수 없음";
  return userName ? `${userName} (${userId})` : userId;
}

function toolLabel(tool: DashboardLogEntry["tool"]) {
  if (tool === "pdf") return "PDF";
  if (tool === "url_capture") return "캡처";
  if (tool === "image") return "이미지";
  return "—";
}

function actionLabel(type: DashboardLogEntry["type"]) {
  if (type === "login") return "접속";
  if (type.endsWith("_started")) return "시작";
  if (type.endsWith("_success")) return "완료";
  if (type.endsWith("_error")) return "실패";
  return type;
}

function activityResult(log: DashboardLogEntry) {
  if (log.type.endsWith("_error")) return log.error ?? "원인 기록 없음";
  if (log.fileSize !== undefined && log.optimizedSize !== undefined) {
    return `${formatSize(log.fileSize)} → ${formatSize(log.optimizedSize)}`;
  }
  if (log.pageCount !== undefined) return `${log.pageCount}쪽`;
  return "";
}

function compactDateLabel(value: string) {
  return value.slice(5).replace("-", ".");
}

function formatCount(value: number) {
  return value.toLocaleString("ko-KR");
}

/** 최근 며칠의 막대. 마지막 날만 밝게 그려 오늘의 위치를 보여 준다. */
function Spark({ values, label }: { values: number[]; label: string }) {
  if (values.length === 0) return null;
  const max = Math.max(1, ...values);
  return (
    <svg
      role="img"
      aria-label={`${label} 최근 ${values.length}일: ${values.join(", ")}`}
      viewBox={`0 0 ${values.length * 6} 24`}
      className="h-6 w-full"
      preserveAspectRatio="none"
    >
      {values.map((value, index) => {
        const height = Math.max(1, (value / max) * 24);
        return (
          <rect
            key={index}
            x={index * 6}
            y={24 - height}
            width={4}
            height={height}
            rx={1}
            fill={index === values.length - 1 ? CHART.accent : CHART.grid}
          />
        );
      })}
    </svg>
  );
}

function StatTile({
  label,
  value,
  spark,
  note,
}: {
  label: string;
  value: string;
  spark?: number[];
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-tile border border-line bg-surface p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="font-display text-display tracking-[0.01em]">{value}</p>
      {spark ? (
        <Spark values={spark} label={label} />
      ) : (
        <div className="h-6" aria-hidden />
      )}
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}

function LegendItem({
  color,
  label,
  icon,
}: {
  color: string;
  label: string;
  icon?: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span
        className="size-2.5 rounded-sm"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {icon}
      {label}
    </span>
  );
}

function ChartSection({
  title,
  description,
  legend,
  empty,
  children,
}: {
  title: string;
  description: string;
  legend?: ReactNode;
  empty?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-tile border border-line bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">{title}</h2>
          <p className="text-xs text-muted">{description}</p>
        </div>
        {legend && <div className="flex flex-wrap gap-4">{legend}</div>}
      </div>
      <div className="h-[260px] w-full">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-semibold">이 기간에 데이터가 없습니다</p>
            <p className="text-xs text-muted">위에서 기간을 넓혀 보세요.</p>
          </div>
        ) : (
          children
        )}
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
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-xs">
      <p className="mb-1.5 font-semibold">{label}</p>
      <div className="space-y-1">
        {payload.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between gap-6"
          >
            <span className="flex items-center gap-1.5 text-muted">
              <span
                className="size-2 rounded-sm"
                style={{ backgroundColor: item.color ?? CHART.neutral }}
              />
              {item.name}
            </span>
            <span className="font-semibold text-text">
              {formatCount(Number(item.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const AXIS_PROPS = {
  stroke: CHART.axis,
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

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
  if (length === 0) return null;
  const windowSize = getDefaultWindow(range, length);
  return { startIndex: Math.max(0, length - windowSize), endIndex: length - 1 };
}

/** 피드백 본문. 길면 펼치기 버튼으로 연다(마우스를 올려야 보이는 방식 대신). */
function FeedbackDetails({ id, text }: { id: string; text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > LONG_TEXT || text.split("\n").length > 2;
  const bodyId = `feedback-body-${id}`;
  return (
    <div>
      <p
        id={bodyId}
        className={cn(
          "whitespace-pre-line text-sm text-muted",
          !open && long && "line-clamp-2",
        )}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="mt-1 inline-flex h-8 items-center gap-1 rounded-md text-xs font-semibold text-text hover:underline"
        >
          {open ? "접기" : "펼치기"}
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
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
  const [confirmItem, setConfirmItem] = useState<FeedbackSubmission | null>(
    null,
  );
  const [range, setRange] = useState<RangeKey>("30d");
  const [brushRange, setBrushRange] = useState<BrushRange | null>(() =>
    getDefaultBrushRange(
      "30d",
      Math.min(dashboard.trends.length, getTakeCount("30d")),
    ),
  );

  useEffect(() => {
    if (activeTab !== "feedback") return;

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
        if (cancelled) return;
        setFeedbackItems(data.feedback ?? []);
      } catch (error) {
        if (cancelled) return;
        setFeedbackError(
          error instanceof Error
            ? error.message
            : "피드백 목록을 불러오지 못했습니다.",
        );
      } finally {
        if (!cancelled) setFeedbackLoading(false);
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
    if (!brushRange) return baseData;
    return baseData.slice(brushRange.startIndex, brushRange.endIndex + 1);
  }, [baseData, brushRange]);

  const rangeLabel =
    chartData.length === 0
      ? "선택된 기간 없음"
      : `${chartData[0].rawDate} ~ ${chartData[chartData.length - 1].rawDate}`;

  const failedLogs = useMemo(() => {
    if (chartData.length === 0) return [];
    const startDate = chartData[0].rawDate;
    const endDate = chartData[chartData.length - 1].rawDate;
    return dashboard.recentLogs.filter((log) => {
      if (log.type !== "image_job_error" && log.type !== "pdf_job_error")
        return false;
      const logDate = log.timestamp.slice(0, 10);
      return logDate >= startDate && logDate <= endDate;
    });
  }, [chartData, dashboard.recentLogs]);

  const spark = (key: keyof (typeof dashboard.trends)[number]) =>
    dashboard.trends.slice(-SPARK_DAYS).map((item) => Number(item[key]) || 0);

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
        headers: { "Content-Type": "application/json" },
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
      setConfirmItem(null);
    } catch (error) {
      setFeedbackError(
        error instanceof Error ? error.message : "피드백 삭제에 실패했습니다.",
      );
      setConfirmItem(null);
    } finally {
      setDeletingId(null);
    }
  };

  const totals = dashboard.totals;

  return (
    <div className="mx-auto w-full max-w-[1440px] animate-fade-in px-4 py-6 md:px-8 md:py-8">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as AdminTab)}
      >
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-title font-bold tracking-[-0.02em]">
              대시보드
            </h1>
            <p className="mt-1 text-sm text-muted">
              {activeTab === "analytics"
                ? `사용량과 실패 원인 · ${rangeLabel}`
                : activeTab === "users"
                  ? `최근 30일 사용자 ${dashboard.users.length}명`
                  : `사용자 피드백 ${feedbackItems.length}건`}
            </p>
          </div>
          <TabsList>
            <TabsTrigger value="analytics">통계</TabsTrigger>
            <TabsTrigger value="users">사용자</TabsTrigger>
            <TabsTrigger value="feedback">피드백</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="analytics" className="mt-0 space-y-6">
          {!dashboard.enabled && (
            <InlineAlert
              tone="warning"
              title="통계 DB가 연결되지 않아 데이터를 불러올 수 없습니다"
            >
              서버의 DATABASE_URL 설정을 확인하세요. 아래 숫자는 모두 0으로
              보입니다.
            </InlineAlert>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <span id="range-label" className="text-sm text-muted">
              기간
            </span>
            <SegmentedControl
              aria-labelledby="range-label"
              value={range}
              onValueChange={handleRangeChange}
              options={RANGE_OPTIONS}
              className="w-60"
            />
            <span className="text-xs text-muted">
              첫 차트 아래 막대를 끌면 세부 구간을 고를 수 있습니다.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label="페이지 뷰"
              value={formatCount(totals.pageViews)}
              spark={spark("pageViews")}
            />
            <StatTile
              label="방문자"
              value={formatCount(totals.uniqueVisitors)}
              note="전체 기간 고유 방문자"
            />
            <StatTile
              label="받은 파일"
              value={formatCount(totals.filesSent)}
              spark={spark("filesSent")}
            />
            <StatTile
              label="절감한 용량"
              value={formatSize(totals.totalBytesSaved)}
              note="이미지 압축 성공 기준"
            />
            <StatTile
              label="성공한 작업"
              value={formatCount(totals.conversionsSucceeded)}
              spark={spark("conversionsSucceeded")}
            />
            <StatTile
              label="실패한 작업"
              value={formatCount(totals.conversionsFailed)}
              spark={spark("conversionsFailed")}
            />
            <StatTile
              label="이미지 처리"
              value={formatCount(totals.imageSuccess)}
              spark={spark("imageSuccess")}
            />
            <StatTile
              label="PDF 처리"
              value={formatCount(totals.pdfSuccess)}
              spark={spark("pdfSuccess")}
            />
          </div>
          <p className="text-xs text-muted">
            숫자는 전체 기간 합계, 아래 막대는 최근 {SPARK_DAYS}일이며 노란
            막대가 오늘입니다.
          </p>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartSection
              title="작업 결과"
              description="날마다 성공·실패한 작업 수"
              empty={baseData.length === 0}
              legend={
                <>
                  <LegendItem
                    color={CHART.success}
                    label="성공"
                    icon={
                      <CheckCircle2
                        className="size-3.5 text-success"
                        aria-hidden="true"
                      />
                    }
                  />
                  <LegendItem
                    color={CHART.danger}
                    label="실패"
                    icon={
                      <XCircle
                        className="size-3.5 text-danger"
                        aria-hidden="true"
                      />
                    }
                  />
                </>
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={baseData}
                  margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
                  barGap={2}
                >
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="date" {...AXIS_PROPS} dy={6} />
                  <YAxis {...AXIS_PROPS} allowDecimals={false} />
                  <Tooltip
                    content={<DashboardTooltip />}
                    cursor={{ fill: "rgba(244,244,245,0.04)" }}
                  />
                  <Bar
                    dataKey="conversions"
                    name="성공"
                    fill={CHART.success}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={14}
                  />
                  <Bar
                    dataKey="failures"
                    name="실패"
                    fill={CHART.danger}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={14}
                  />
                  <Brush
                    dataKey="date"
                    height={22}
                    stroke={CHART.axis}
                    fill={CHART.bg}
                    travellerWidth={10}
                    startIndex={brushRange?.startIndex}
                    endIndex={brushRange?.endIndex}
                    onChange={handleBrushChange}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartSection>

            <ChartSection
              title="페이지 뷰"
              description="선택한 구간의 날마다 방문 수"
              empty={chartData.length === 0}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                >
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="date" {...AXIS_PROPS} dy={6} />
                  <YAxis {...AXIS_PROPS} allowDecimals={false} />
                  <Tooltip
                    content={<DashboardTooltip />}
                    cursor={{ stroke: CHART.grid }}
                  />
                  <Line
                    type="monotone"
                    dataKey="pageViews"
                    name="페이지 뷰"
                    stroke={CHART.accent}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{
                      r: 4,
                      fill: CHART.accent,
                      stroke: CHART.surface,
                      strokeWidth: 2,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartSection>

            <ChartSection
              title="도구별 성공"
              description="선택한 구간의 이미지·PDF 처리 성공 수"
              empty={chartData.length === 0}
              legend={
                <>
                  <LegendItem color={CHART.accent} label="이미지" />
                  <LegendItem color={CHART.neutral} label="PDF" />
                </>
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
                >
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="date" {...AXIS_PROPS} dy={6} />
                  <YAxis {...AXIS_PROPS} allowDecimals={false} />
                  <Tooltip
                    content={<DashboardTooltip />}
                    cursor={{ fill: "rgba(244,244,245,0.04)" }}
                  />
                  <Bar
                    dataKey="imageSuccess"
                    name="이미지"
                    fill={CHART.accent}
                    stackId="tool"
                    maxBarSize={18}
                    stroke={CHART.surface}
                    strokeWidth={2}
                  />
                  <Bar
                    dataKey="pdfSuccess"
                    name="PDF"
                    fill={CHART.neutral}
                    stackId="tool"
                    maxBarSize={18}
                    radius={[4, 4, 0, 0]}
                    stroke={CHART.surface}
                    strokeWidth={2}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartSection>

            <section className="rounded-tile border border-line bg-surface p-5">
              <h2 className="text-base font-bold">날짜별 숫자</h2>
              <p className="mb-3 text-xs text-muted">
                선택한 구간을 표로 봅니다.
              </p>
              <div className="max-h-[260px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
                    <tr>
                      <th className="py-2 pr-3 font-semibold">날짜</th>
                      <th className="py-2 pr-3 text-right font-semibold">
                        페이지 뷰
                      </th>
                      <th className="py-2 pr-3 text-right font-semibold">
                        성공
                      </th>
                      <th className="py-2 pr-3 text-right font-semibold">
                        실패
                      </th>
                      <th className="py-2 pr-3 text-right font-semibold">
                        이미지
                      </th>
                      <th className="py-2 text-right font-semibold">PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {chartData.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-muted">
                          이 기간에 데이터가 없습니다
                        </td>
                      </tr>
                    )}
                    {[...chartData].reverse().map((row) => (
                      <tr key={row.rawDate}>
                        <td className="py-2 pr-3">{row.rawDate}</td>
                        <td className="py-2 pr-3 text-right">
                          {formatCount(row.pageViews)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {formatCount(row.conversions)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {formatCount(row.failures)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {formatCount(row.imageSuccess)}
                        </td>
                        <td className="py-2 text-right">
                          {formatCount(row.pdfSuccess)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="rounded-tile border border-line bg-surface p-5">
            <h2 className="flex items-baseline gap-1.5 text-base font-bold">
              최근 실패
              <span className="font-medium text-muted">
                ({failedLogs.length})
              </span>
            </h2>
            <p className="mb-3 text-xs text-muted">
              최근 기록 {dashboard.recentLogs.length}건 가운데 선택한 구간에
              실패한 작업과 오류 내용입니다.
            </p>
            {failedLogs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                이 기간에 실패한 작업이 없습니다
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr className="border-b border-line">
                      <th className="py-2 pr-4 font-semibold">시각</th>
                      <th className="py-2 pr-4 font-semibold">도구</th>
                      <th className="py-2 pr-4 font-semibold">파일</th>
                      <th className="py-2 font-semibold">오류</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {failedLogs.map((log, index) => (
                      <tr
                        key={`${log.timestamp}-${index}`}
                        className="align-top"
                      >
                        <td className="whitespace-nowrap py-3 pr-4 text-muted">
                          {formatTimestamp(log.timestamp)}
                        </td>
                        <td className="py-3 pr-4">
                          {log.tool ? toolLabel(log.tool) : "이미지"}
                        </td>
                        <td className="max-w-[16rem] break-all py-3 pr-4">
                          {log.filename ?? "이름 없음"}
                        </td>
                        <td className="py-3 text-danger">
                          {log.error ?? "원인 기록 없음"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="users" className="mt-0 space-y-6">
          <section className="rounded-tile border border-line bg-surface p-5">
            <h2 className="text-base font-bold">사용자별 합계</h2>
            <p className="mb-3 text-xs text-muted">
              최근 30일 동안 그룹웨어로 접속한 사람과 작업 수입니다.
            </p>
            {dashboard.users.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                아직 그룹웨어로 접속한 기록이 없습니다
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr className="border-b border-line">
                      <th className="py-2 pr-4 font-semibold">사용자</th>
                      <th className="py-2 pr-4 text-right font-semibold">접속</th>
                      <th className="py-2 pr-4 text-right font-semibold">보낸 파일</th>
                      <th className="py-2 pr-4 text-right font-semibold">성공</th>
                      <th className="py-2 pr-4 text-right font-semibold">실패</th>
                      <th className="py-2 font-semibold">마지막 활동</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {dashboard.users.map((user) => (
                      <tr key={user.userId}>
                        <td className="py-2.5 pr-4 font-semibold">
                          {formatUser(user.userId, user.userName)}
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          {formatCount(user.logins)}
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          {formatCount(user.filesSent)}
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          {formatCount(user.conversionsSucceeded)}
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          {formatCount(user.conversionsFailed)}
                        </td>
                        <td className="whitespace-nowrap py-2.5 text-muted">
                          {formatTimestamp(user.lastSeen)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-tile border border-line bg-surface p-5">
            <h2 className="flex items-baseline gap-1.5 text-base font-bold">
              최근 작업 기록
              <span className="font-medium text-muted">
                ({dashboard.activityLogs.length})
              </span>
            </h2>
            <p className="mb-3 text-xs text-muted">
              누가 언제 어떤 파일로 무슨 작업을 했는지 최신순으로 보여 줍니다.
              페이지 이동은 빼고 최근 100건까지 보입니다.
            </p>
            {dashboard.activityLogs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                아직 기록된 작업이 없습니다
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr className="border-b border-line">
                      <th className="py-2 pr-4 font-semibold">시각</th>
                      <th className="py-2 pr-4 font-semibold">사용자</th>
                      <th className="py-2 pr-4 font-semibold">작업</th>
                      <th className="py-2 pr-4 font-semibold">도구</th>
                      <th className="py-2 pr-4 font-semibold">파일</th>
                      <th className="py-2 font-semibold">결과</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {dashboard.activityLogs.map((log, index) => (
                      <tr
                        key={`${log.timestamp}-${index}`}
                        className="align-top"
                      >
                        <td className="whitespace-nowrap py-2.5 pr-4 text-muted">
                          {formatTimestamp(log.timestamp)}
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-4">
                          {formatUser(log.userId, log.userName)}
                        </td>
                        <td
                          className={cn(
                            "whitespace-nowrap py-2.5 pr-4",
                            log.type.endsWith("_error") && "text-danger",
                          )}
                        >
                          {actionLabel(log.type)}
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-4">
                          {toolLabel(log.tool)}
                        </td>
                        <td className="max-w-[16rem] break-all py-2.5 pr-4">
                          {log.filename ?? ""}
                        </td>
                        <td
                          className={cn(
                            "py-2.5",
                            log.type.endsWith("_error")
                              ? "text-danger"
                              : "text-muted",
                          )}
                        >
                          {activityResult(log)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="feedback" className="mt-0 space-y-4">
          {feedbackError && <InlineAlert tone="danger" title={feedbackError} />}

          {feedbackLoading && feedbackItems.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              피드백을 불러오는 중
            </p>
          ) : feedbackItems.length === 0 ? (
            <EmptyState
              title="아직 받은 피드백이 없습니다"
              description="사용자가 피드백 화면에서 제출하면 여기에 쌓입니다."
            />
          ) : (
            <ul className="divide-y divide-line rounded-tile border border-line bg-surface">
              {feedbackItems.map((entry) => (
                <li
                  key={entry.id}
                  className="grid gap-3 p-5 md:grid-cols-[9rem_1fr_auto] md:gap-6"
                >
                  <div className="space-y-1.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-0.5 text-xs font-semibold",
                        entry.type === "bug" ? "text-danger" : "text-text",
                      )}
                    >
                      {entry.type === "bug" ? "버그" : "개선 요청"}
                    </span>
                    <p className="text-xs text-muted">
                      {formatTimestamp(entry.createdAt)}
                    </p>
                    {entry.userId && (
                      <p className="text-xs text-muted">
                        {formatUser(entry.userId, entry.userName)}
                      </p>
                    )}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h3 className="break-words text-base font-semibold">
                      {entry.title}
                    </h3>
                    <FeedbackDetails id={entry.id} text={entry.details} />
                  </div>
                  <div className="md:self-start">
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setConfirmItem(entry)}
                      loading={deletingId === entry.id}
                    >
                      <Trash2 aria-hidden="true" />
                      삭제
                      <span className="sr-only"> {entry.title}</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      {confirmItem && (
        <Dialog
          open
          onClose={() => setConfirmItem(null)}
          title="피드백을 삭제할까요?"
          description="삭제하면 되돌릴 수 없습니다."
          footer={
            <>
              <Button onClick={() => setConfirmItem(null)}>취소</Button>
              <Button
                variant="danger"
                onClick={() => void handleDeleteFeedback(confirmItem.id)}
                loading={deletingId === confirmItem.id}
              >
                삭제
              </Button>
            </>
          }
        >
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-semibold">
            {confirmItem.title}
          </p>
        </Dialog>
      )}
    </div>
  );
}

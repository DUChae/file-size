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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  BarChart3, 
  MessageSquare, 
  ArrowLeft, 
  Calendar, 
  Users, 
  Files, 
  CheckCircle2, 
  AlertCircle, 
  Image as ImageIcon, 
  FileText, 
  Save, 
  Trash2, 
  Loader2,
  Clock,
  ExternalLink,
  Activity,
  MousePointer2
} from "lucide-react";
import { cn } from "@/lib/utils";

type RangeKey = "7d" | "30d" | "365d";
type AdminTab = "analytics" | "feedback";

function formatTimestamp(value: string) {
  try {
    return new Date(value).toLocaleString("ko-KR", {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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

function StatCard({ label, value, icon: Icon, subValue }: { label: string; value: number | string; icon: any; subValue?: string }) {
  return (
    <Card className="glass-card border-white/5 rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
          {label}
        </div>
        <div className="p-2 rounded-lg bg-white/5 text-slate-400">
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-2xl font-black text-white tracking-tighter">
          {typeof value === 'number' ? formatCount(value) : value}
        </div>
        {subValue && <div className="text-[10px] font-bold text-slate-600">{subValue}</div>}
      </div>
    </Card>
  );
}

function ChartCard({
  title,
  subtitle,
  empty,
  children,
  icon: Icon
}: {
  title: string;
  subtitle: string;
  empty?: boolean;
  children: ReactNode;
  icon: any;
}) {
  return (
    <Card className="glass-card border-white/5 rounded-[24px] overflow-hidden">
      <CardHeader className="border-b border-white/5 bg-white/[0.01] p-6">
        <div className="flex items-center gap-3">
           <div className="p-2 rounded-xl bg-blue-600/10 text-blue-500">
             <Icon className="w-4 h-4" />
           </div>
           <div>
             <CardTitle className="text-sm font-black tracking-tight text-white uppercase">{title}</CardTitle>
             <CardDescription className="text-[11px] text-slate-500 font-medium mt-0.5">{subtitle}</CardDescription>
           </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="h-[300px] w-full">
          {empty ? (
            <div className="flex h-full items-center justify-center text-xs font-bold text-slate-700 uppercase tracking-widest">
              No Data Available
            </div>
          ) : (
            children
          )}
        </div>
      </CardContent>
    </Card>
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
    <div className="rounded-xl border border-white/10 bg-black/90 p-3 shadow-2xl backdrop-blur-md">
      <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2 border-b border-white/5 pb-2">
        {label}
      </div>
      <div className="space-y-1.5">
        {payload.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between gap-6 text-[11px]"
          >
            <div className="flex items-center gap-2 text-slate-300">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: item.color ?? "#fff" }}
              />
              <span className="font-bold">{item.name}</span>
            </div>
            <span className="font-black text-white">
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

  const handleRangeChange = (nextRange: string) => {
    const r = nextRange as RangeKey;
    setRange(r);
    setBrushRange(
      getDefaultBrushRange(
        r,
        Math.min(dashboard.trends.length, getTakeCount(r)),
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
    <main className="min-h-screen bg-black px-6 py-20 text-slate-50 animate-fade-in">
      <div className="mx-auto max-w-6xl space-y-16">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 pb-12 border-b border-white/5">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/5 text-slate-500 hover:text-white">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <h1 className="text-3xl font-black tracking-ultra-tight uppercase">Dashboard</h1>
            </div>
            <p className="text-sm text-slate-500 font-medium">실시간 시스템 메트릭 및 사용자 피드백 분석</p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AdminTab)} className="bg-white/[0.03] border border-white/[0.08] p-1 rounded-full h-11">
              <TabsList className="bg-transparent h-full">
                <TabsTrigger value="analytics" className="rounded-full px-5 text-[10px] font-black tracking-widest uppercase data-[state=active]:bg-white data-[state=active]:text-black transition-all">
                  Analytics
                </TabsTrigger>
                <TabsTrigger value="feedback" className="rounded-full px-5 text-[10px] font-black tracking-widest uppercase data-[state=active]:bg-white data-[state=active]:text-black transition-all">
                  Feedback
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {activeTab === "analytics" && (
              <Tabs value={range} onValueChange={handleRangeChange} className="bg-white/[0.03] border border-white/[0.08] p-1 rounded-full h-11">
                <TabsList className="bg-transparent h-full">
                  {(["7d", "30d", "365d"] as const).map((key) => (
                    <TabsTrigger key={key} value={key} className="rounded-full px-4 text-[10px] font-black tracking-widest uppercase data-[state=active]:bg-white data-[state=active]:text-black transition-all">
                      {key}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
          </div>
        </div>

        {!dashboard.enabled && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 flex items-center gap-4">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="text-sm font-bold text-amber-200/80">Redis/KV 환경변수가 설정되지 않아 실시간 데이터를 불러올 수 없습니다.</p>
          </div>
        )}

        <Tabs value={activeTab} className="w-full">
          <TabsContent value="analytics" className="space-y-12 mt-0">
            {/* Range Info */}
            <div className="flex items-center gap-4 text-slate-500 border-l-2 border-blue-600 pl-4 py-1">
              <Calendar className="w-4 h-4" />
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Observation Period</span>
                <span className="text-sm font-black text-white">{rangeLabel}</span>
              </div>
            </div>

            {/* Totals Grid */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              <StatCard label="Total Page Views" value={dashboard.totals.pageViews} icon={MousePointer2} />
              <StatCard label="Unique Visitors" value={dashboard.totals.uniqueVisitors} icon={Users} />
              <StatCard label="Assets Received" value={dashboard.totals.filesSent} icon={Files} />
              <StatCard label="Optimization Saved" value={formatBytes(dashboard.totals.totalBytesSaved)} icon={Save} />
              <StatCard label="Job Succeeded" value={dashboard.totals.conversionsSucceeded} icon={CheckCircle2} />
              <StatCard label="Job Failed" value={dashboard.totals.conversionsFailed} icon={AlertCircle} />
              <StatCard label="Image Processed" value={dashboard.totals.imageSuccess} icon={ImageIcon} />
              <StatCard label="PDF Processed" value={dashboard.totals.pdfSuccess} icon={FileText} />
            </div>

            {/* Charts Section */}
            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="System Performance" subtitle="작업 처리 성공 추이" icon={Activity} empty={baseData.length === 0}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={baseData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
                    <XAxis dataKey="date" stroke="#334155" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#334155" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<DashboardTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)" }} />
                    <Line type="monotone" dataKey="conversions" name="성공" stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={{ r: 4, fill: "#fff", stroke: "#3b82f6", strokeWidth: 2 }} />
                    <Brush dataKey="date" height={20} stroke="#1e293b" travellerWidth={10} startIndex={brushRange?.startIndex} endIndex={brushRange?.endIndex} onChange={handleBrushChange} fill="#09090b" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Success Rate" subtitle="성공 및 실패 비교" icon={BarChart3} empty={chartData.length === 0}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barGap={6}>
                    <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
                    <XAxis dataKey="date" stroke="#334155" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#334155" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<DashboardTooltip />} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
                    <Bar dataKey="conversions" name="성공" fill="#fff" radius={[4, 4, 0, 0]} barSize={12} />
                    <Bar dataKey="failures" name="실패" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={12} opacity={0.6} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Second Row Charts */}
            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Traffic Volume" subtitle="일별 페이지 뷰 현황" icon={Activity} empty={chartData.length === 0}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
                    <XAxis dataKey="date" stroke="#334155" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#334155" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<DashboardTooltip />} />
                    <Line type="stepAfter" dataKey="pageViews" name="PV" stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#fff" }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Tool Distribution" subtitle="도구별 처리 현황" icon={ImageIcon} empty={chartData.length === 0}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
                    <XAxis dataKey="date" stroke="#334155" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#334155" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<DashboardTooltip />} />
                    <Bar dataKey="imageSuccess" name="Image" fill="#3b82f6" stackId="a" barSize={20} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="pdfSuccess" name="PDF" fill="#f43f5e" stackId="a" barSize={20} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Error Logs Table */}
            <Card className="glass-card border-white/5 rounded-[32px] overflow-hidden">
               <CardHeader className="p-8 border-b border-white/5 bg-white/[0.01]">
                 <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-black tracking-tight text-white uppercase">System Errors</CardTitle>
                      <CardDescription className="text-[11px] text-slate-500 font-medium mt-0.5">실패한 작업에 대한 상세 로그 분석</CardDescription>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-[10px] font-black text-red-500 uppercase tracking-widest">
                      Attention Required
                    </div>
                 </div>
               </CardHeader>
               <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead className="bg-white/[0.02]">
                        <tr className="border-b border-white/5">
                          <th className="px-8 py-4 text-left font-black text-slate-500 uppercase tracking-widest">Timestamp</th>
                          <th className="px-4 py-4 text-left font-black text-slate-500 uppercase tracking-widest">Engine</th>
                          <th className="px-4 py-4 text-left font-black text-slate-500 uppercase tracking-widest">Target</th>
                          <th className="px-4 py-4 text-left font-black text-slate-500 uppercase tracking-widest">Error Detail</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {failedLogs.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-8 py-12 text-center text-slate-700 font-bold uppercase tracking-widest">
                              No engine errors reported in this range
                            </td>
                          </tr>
                        )}
                        {failedLogs.map((log, index) => (
                          <tr key={`${log.timestamp}-${index}`} className="hover:bg-white/[0.01] transition-colors group">
                            <td className="px-8 py-4 whitespace-nowrap text-slate-400 font-medium">
                              <div className="flex items-center gap-2">
                                <Clock className="w-3 h-3 opacity-40" />
                                {formatTimestamp(log.timestamp)}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span className="inline-flex items-center px-2 py-0.5 rounded bg-white/5 border border-white/5 text-white font-black uppercase text-[9px]">
                                {log.tool?.toUpperCase() ?? "CORE"}
                              </span>
                            </td>
                            <td className="px-4 py-4 font-bold text-slate-300 max-w-[200px] truncate">
                              {log.filename ?? "Unknown Source"}
                            </td>
                            <td className="px-4 py-4 text-red-400 font-medium italic opacity-80 group-hover:opacity-100 transition-opacity">
                              {log.error ?? "Unhandled exception"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="feedback" className="mt-0 space-y-8">
             {feedbackError && (
              <div className="rounded-xl border border-red-500/10 bg-red-500/5 p-5 flex items-center gap-4">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <p className="text-xs font-bold text-red-200/80">{feedbackError}</p>
              </div>
            )}

            <Card className="glass-card border-white/5 rounded-[32px] overflow-hidden">
               <CardHeader className="p-8 border-b border-white/5 bg-white/[0.01]">
                 <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-black tracking-tight text-white uppercase">User Submissions</CardTitle>
                      <CardDescription className="text-[11px] text-slate-500 font-medium mt-0.5">사용자 제보 및 개선 요청 목록</CardDescription>
                    </div>
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] bg-white/5 px-4 py-2 rounded-full border border-white/5">
                      {feedbackLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : `${feedbackItems.length} Entries`}
                    </div>
                 </div>
               </CardHeader>
               <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead className="bg-white/[0.02]">
                        <tr className="border-b border-white/5 text-slate-500 font-black uppercase tracking-widest text-[10px]">
                          <th className="px-8 py-5 text-left">Time</th>
                          <th className="px-4 py-5 text-left">Type</th>
                          <th className="px-4 py-5 text-left">Subject</th>
                          <th className="px-4 py-5 text-left">Content</th>
                          <th className="px-8 py-5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {!feedbackLoading && feedbackItems.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-8 py-20 text-center text-slate-700 font-bold uppercase tracking-widest text-xs">
                              Queue is currently empty
                            </td>
                          </tr>
                        )}
                        {feedbackItems.map((entry) => (
                          <tr key={entry.id} className="hover:bg-white/[0.01] transition-colors group">
                            <td className="px-8 py-6 whitespace-nowrap text-slate-400 font-medium">
                              {formatTimestamp(entry.createdAt)}
                            </td>
                            <td className="px-4 py-6">
                              <span className={cn(
                                "inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                                entry.type === "bug" ? "bg-red-500/10 text-red-500 border border-red-500/20" : "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                              )}>
                                {entry.type}
                              </span>
                            </td>
                            <td className="px-4 py-6 font-black text-white">
                              {entry.title}
                            </td>
                            <td className="px-4 py-6 max-w-md">
                              <p className="text-slate-400 font-medium leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all cursor-default">
                                {entry.details}
                              </p>
                            </td>
                            <td className="px-8 py-6 text-right">
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => void handleDeleteFeedback(entry.id)}
                                disabled={deletingId === entry.id}
                                className="w-10 h-10 rounded-full text-slate-600 hover:text-red-500 hover:bg-red-500/10"
                              >
                                {deletingId === entry.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

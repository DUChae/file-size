"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
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

type RangeKey = "7d" | "30d";

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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-black text-white">{formatCount(value)}</div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
      <div className="mb-6">
        <h2 className="text-xl font-black tracking-tight text-white">{title}</h2>
        <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
      </div>
      <div className="rounded-[24px] border border-white/10 bg-slate-950/60 p-4">
        <div className="h-[280px] w-full">{children}</div>
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
      <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-3 space-y-2">
        {payload.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-6 text-sm">
            <div className="flex items-center gap-2 text-slate-200">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color ?? "#fff" }}
              />
              <span>{item.name}</span>
            </div>
            <span className="font-bold text-white">{formatCount(Number(item.value ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard({ dashboard }: { dashboard: DashboardStats }) {
  const [range, setRange] = useState<RangeKey>("7d");

  const chartData = useMemo(() => {
    const take = range === "7d" ? 7 : 30;
    return dashboard.trends.slice(-take).map((item) => ({
      date: compactDateLabel(item.date),
      conversions: item.conversionsSucceeded,
      failures: item.conversionsFailed,
      pageViews: item.pageViews,
      imageSuccess: item.imageSuccess,
      pdfSuccess: item.pdfSuccess,
    }));
  }, [dashboard.trends, range]);

  const failedLogs = useMemo(
    () =>
      dashboard.recentLogs.filter(
        (log) => log.type === "image_job_error" || log.type === "pdf_job_error",
      ),
    [dashboard.recentLogs],
  );

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-16 text-slate-50">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight">Admin Dashboard</h1>
            <p className="mt-3 text-sm text-slate-400">
              Redis 기준으로 방문, 업로드, 변환 성공/실패 로그를 한 화면에서 확인합니다.
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
              {(["7d", "30d"] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setRange(key)}
                  className={`rounded-xl px-4 py-2 text-xs font-black tracking-[0.18em] transition-colors ${
                    range === key ? "bg-white text-slate-950" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!dashboard.enabled && (
          <div className="mb-8 rounded-3xl border border-amber-500/20 bg-amber-500/10 p-6 text-amber-100">
            Redis/KV 환경변수가 없어 집계를 불러올 수 없습니다.
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="페이지뷰" value={dashboard.totals.pageViews} />
          <StatCard label="방문자 수" value={dashboard.totals.uniqueVisitors} />
          <StatCard label="업로드 파일 수" value={dashboard.totals.filesSent} />
          <StatCard label="변환 성공 수" value={dashboard.totals.conversionsSucceeded} />
          <StatCard label="변환 실패 수" value={dashboard.totals.conversionsFailed} />
          <StatCard label="이미지 변환 성공" value={dashboard.totals.imageSuccess} />
          <StatCard label="PDF 변환 성공" value={dashboard.totals.pdfSuccess} />
        </div>

        <div className="mt-10 grid gap-6 xl:grid-cols-2">
          <ChartCard
            title="Conversion Trend"
            subtitle={`최근 ${range === "7d" ? "7일" : "30일"} 변환 성공 추이`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<DashboardTooltip />} cursor={{ stroke: "rgba(255,255,255,0.15)" }} />
                <Line
                  type="monotone"
                  dataKey="conversions"
                  name="성공"
                  stroke="#38bdf8"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "#38bdf8", strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: "#e0f2fe", stroke: "#38bdf8", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Success vs Failure"
            subtitle={`최근 ${range === "7d" ? "7일" : "30일"} 성공/실패 비교`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 12, left: -18, bottom: 0 }} barGap={10}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<DashboardTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Legend />
                <Bar dataKey="conversions" name="성공" fill="#22c55e" radius={[10, 10, 0, 0]} />
                <Bar dataKey="failures" name="실패" fill="#f97316" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr]">
          <ChartCard
            title="Traffic Trend"
            subtitle={`최근 ${range === "7d" ? "7일" : "30일"} 방문 추이`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<DashboardTooltip />} cursor={{ stroke: "rgba(255,255,255,0.15)" }} />
                <Line
                  type="monotone"
                  dataKey="pageViews"
                  name="페이지뷰"
                  stroke="#a78bfa"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "#a78bfa", strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: "#f5f3ff", stroke: "#a78bfa", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Tool Mix"
            subtitle={`최근 ${range === "7d" ? "7일" : "30일"} 도구별 성공 수`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 12, left: -18, bottom: 0 }} barGap={10}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<DashboardTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Legend />
                <Bar dataKey="imageSuccess" name="Image" fill="#38bdf8" radius={[10, 10, 0, 0]} />
                <Bar dataKey="pdfSuccess" name="PDF" fill="#f43f5e" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 text-xl font-black tracking-tight">실패한 변환 로그</h2>
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
                      아직 실패한 변환 로그가 없습니다.
                    </td>
                  </tr>
                )}
                {failedLogs.map((log, index) => (
                  <tr key={`${log.timestamp}-${index}`} className="align-top border-b border-white/5">
                    <td className="whitespace-nowrap py-3 pr-4 text-slate-300">
                      {formatTimestamp(log.timestamp)}
                    </td>
                    <td className="py-3 pr-4 font-bold text-white">{log.type}</td>
                    <td className="py-3 pr-4 text-slate-300">{log.tool ?? "-"}</td>
                    <td className="py-3 pr-4 text-slate-300">{log.mode ?? "-"}</td>
                    <td className="break-all py-3 pr-4 text-slate-300">{log.filename ?? "-"}</td>
                    <td className="py-3 pr-4 text-slate-300">
                      {typeof log.fileSize === "number" ? formatCount(log.fileSize) : "-"}
                    </td>
                    <td className="py-3 text-slate-300">{log.error ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

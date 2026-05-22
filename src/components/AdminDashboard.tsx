"use client";

import { useMemo, useState } from "react";
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

function buildLinePath(values: number[], width: number, height: number) {
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;

  return values
    .map((value, index) => {
      const x = index * stepX;
      const y = height - (value / max) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function TrendChart({
  title,
  subtitle,
  labels,
  primary,
  secondary,
  primaryColor,
  secondaryColor,
}: {
  title: string;
  subtitle: string;
  labels: string[];
  primary: number[];
  secondary?: number[];
  primaryColor: string;
  secondaryColor?: string;
}) {
  const width = 640;
  const height = 220;
  const primaryPath = buildLinePath(primary, width, height);
  const secondaryPath = secondary ? buildLinePath(secondary, width, height) : null;
  const maxValue = Math.max(...primary, ...(secondary ?? []), 1);

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
      <div className="flex items-start justify-between gap-6 mb-6">
        <div>
          <h2 className="text-xl font-black tracking-tight text-white">{title}</h2>
          <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Peak</div>
          <div className="mt-2 text-3xl font-black text-white">{maxValue}</div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/50 p-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.14),_transparent_32%)]" />
        <svg viewBox={`0 0 ${width} ${height + 28}`} className="relative w-full h-[260px]">
          {[0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = height - height * ratio;
            return (
              <line
                key={ratio}
                x1="0"
                y1={y}
                x2={width}
                y2={y}
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="6 8"
              />
            );
          })}

          {secondaryPath && secondaryColor && (
            <path
              d={secondaryPath}
              fill="none"
              stroke={secondaryColor}
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          <path
            d={primaryPath}
            fill="none"
            stroke={primaryColor}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {labels.map((label, index) => {
            const x = labels.length > 1 ? (width / (labels.length - 1)) * index : width / 2;
            return (
              <text
                key={label}
                x={x}
                y={height + 22}
                fill="rgba(148,163,184,0.9)"
                fontSize="11"
                textAnchor={index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"}
              >
                {label}
              </text>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-black text-white">{value.toLocaleString("ko-KR")}</div>
    </div>
  );
}

export default function AdminDashboard({ dashboard }: { dashboard: DashboardStats }) {
  const [range, setRange] = useState<RangeKey>("7d");

  const rangeData = useMemo(() => {
    const take = range === "7d" ? 7 : 30;
    const trends = dashboard.trends.slice(-take);
    return {
      trends,
      labels: trends.map((item) => compactDateLabel(item.date)),
      conversions: trends.map((item) => item.conversionsSucceeded),
      failures: trends.map((item) => item.conversionsFailed),
      pageViews: trends.map((item) => item.pageViews),
    };
  }, [dashboard.trends, range]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-16">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight">Admin Dashboard</h1>
            <p className="mt-3 text-sm text-slate-400">
              Redis에 저장된 파일 전송, 변환 성공/실패, 방문자 집계를 보여줍니다.
            </p>
          </div>
          <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-1.5">
            {(["7d", "30d"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setRange(key)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-[0.2em] transition-colors ${
                  range === key ? "bg-white text-slate-950" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        {!dashboard.enabled && (
          <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-6 text-amber-100 mb-8">
            Redis/KV 환경변수가 없어 집계를 읽을 수 없습니다.
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="페이지뷰" value={dashboard.totals.pageViews} />
          <StatCard label="방문자 수" value={dashboard.totals.uniqueVisitors} />
          <StatCard label="전송된 파일 수" value={dashboard.totals.filesSent} />
          <StatCard label="성공한 변환 수" value={dashboard.totals.conversionsSucceeded} />
          <StatCard label="실패 수" value={dashboard.totals.conversionsFailed} />
          <StatCard label="이미지 변환 성공" value={dashboard.totals.imageSuccess} />
          <StatCard label="PDF 변환 성공" value={dashboard.totals.pdfSuccess} />
        </div>

        <div className="mt-10 grid gap-6 xl:grid-cols-2">
          <TrendChart
            title="Conversion Trend"
            subtitle={`최근 ${range === "7d" ? "7일" : "30일"} 변환 성공 추이`}
            labels={rangeData.labels}
            primary={rangeData.conversions}
            primaryColor="#38bdf8"
          />
          <TrendChart
            title="Success vs Failure"
            subtitle={`최근 ${range === "7d" ? "7일" : "30일"} 성공/실패 비교`}
            labels={rangeData.labels}
            primary={rangeData.conversions}
            secondary={rangeData.failures}
            primaryColor="#22c55e"
            secondaryColor="#f97316"
          />
        </div>

        <div className="mt-6">
          <TrendChart
            title="Traffic Trend"
            subtitle={`최근 ${range === "7d" ? "7일" : "30일"} 방문 추이`}
            labels={rangeData.labels}
            primary={rangeData.pageViews}
            primaryColor="#a78bfa"
          />
        </div>

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-black tracking-tight mb-4">최근 로그</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-400">
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 pr-4">시간</th>
                  <th className="text-left py-3 pr-4">이벤트</th>
                  <th className="text-left py-3 pr-4">도구</th>
                  <th className="text-left py-3 pr-4">모드</th>
                  <th className="text-left py-3 pr-4">파일</th>
                  <th className="text-left py-3 pr-4">크기</th>
                  <th className="text-left py-3">메모</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recentLogs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-slate-500">
                      아직 로그가 없습니다.
                    </td>
                  </tr>
                )}
                {dashboard.recentLogs.map((log, index) => (
                  <tr key={`${log.timestamp}-${index}`} className="border-b border-white/5 align-top">
                    <td className="py-3 pr-4 text-slate-300 whitespace-nowrap">{formatTimestamp(log.timestamp)}</td>
                    <td className="py-3 pr-4 font-bold text-white">{log.type}</td>
                    <td className="py-3 pr-4 text-slate-300">{log.tool ?? "-"}</td>
                    <td className="py-3 pr-4 text-slate-300">{log.mode ?? "-"}</td>
                    <td className="py-3 pr-4 text-slate-300 break-all">{log.filename ?? "-"}</td>
                    <td className="py-3 pr-4 text-slate-300">{log.fileSize ?? "-"}</td>
                    <td className="py-3 text-slate-300">
                      {log.error ?? (log.pageCount ? `${log.pageCount} pages` : "-")}
                    </td>
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

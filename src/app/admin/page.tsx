import { getDashboardStats } from "@/lib/analytics";

function formatTimestamp(value: string) {
  try {
    return new Date(value).toLocaleString("ko-KR");
  } catch {
    return value;
  }
}

export default async function AdminPage() {
  const dashboard = await getDashboardStats();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-16">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <h1 className="text-4xl font-black tracking-tight">
            Admin Dashboard
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            파일 전송, 변환 성공/실패, 방문자 집계를 보여줍니다.
          </p>
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
          <StatCard
            label="성공한 변환 수"
            value={dashboard.totals.conversionsSucceeded}
          />
          <StatCard
            label="실패 수"
            value={dashboard.totals.conversionsFailed}
          />
          <StatCard
            label="이미지 변환 성공"
            value={dashboard.totals.imageSuccess}
          />
          <StatCard label="PDF 변환 성공" value={dashboard.totals.pdfSuccess} />
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
                  <tr
                    key={`${log.timestamp}-${index}`}
                    className="border-b border-white/5 align-top"
                  >
                    <td className="py-3 pr-4 text-slate-300 whitespace-nowrap">
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
                    <td className="py-3 pr-4 text-slate-300 break-all">
                      {log.filename ?? "-"}
                    </td>
                    <td className="py-3 pr-4 text-slate-300">
                      {log.fileSize ?? "-"}
                    </td>
                    <td className="py-3 text-slate-300">
                      {log.error ??
                        (log.pageCount ? `${log.pageCount} pages` : "-")}
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
        {label}
      </div>
      <div className="mt-3 text-3xl font-black text-white">
        {value.toLocaleString("ko-KR")}
      </div>
    </div>
  );
}

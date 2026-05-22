import Link from "next/link";
import FeedbackForm from "@/components/FeedbackForm";

export default function FeedbackPage() {
  return (
    <main className="relative min-h-screen text-slate-50 selection:bg-blue-500/30">
      <div className="mesh-gradient" />

      <section className="relative z-10 mx-auto max-w-4xl px-4 py-16 md:py-24">
        <div className="mb-10 flex items-center justify-between gap-4">
          <div>
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.25em] text-blue-400">
              Feedback Center
            </p>
            <h1 className="text-4xl font-black tracking-tighter text-white md:text-6xl">
              Report Bugs. Request Improvements.
            </h1>
          </div>
          <Link
            href="/"
            className="inline-flex shrink-0 items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-slate-200 hover:bg-white/10 transition-colors"
          >
            Back
          </Link>
        </div>

        <p className="mb-10 max-w-2xl text-base font-medium leading-relaxed text-slate-400 md:text-lg">
          버그 재현 내용이나 개선 아이디어를 남길 수 있는 화면입니다. 제목과 상세 설명을 적어서 바로 제출할 수 있습니다.
        </p>

        <FeedbackForm />
      </section>
    </main>
  );
}

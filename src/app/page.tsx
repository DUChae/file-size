import ToolWorkspace from "@/components/ToolWorkspace";
import VisitorTracker from "@/components/VisitorTracker";
import Link from "next/link";

export default function Home() {
  return (
    <main className="relative min-h-screen text-slate-50 selection:bg-blue-500/30">
      <VisitorTracker />
      {/* Background Mesh */}
      <div className="mesh-gradient" />

      <header className="relative pt-20 pb-12 overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <div className="flex justify-end gap-3 mb-6">
            <Link
              href="/feedback"
              className="inline-flex items-center rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-blue-300 hover:bg-blue-500/15 transition-colors"
            >
              Feedback
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-slate-200 hover:bg-white/10 transition-colors"
            >
              Dashboard
            </Link>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold tracking-widest uppercase mb-6 animate-fade-in">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            OptiStream
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-4 bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">
            File Optimizer.
          </h1>
          <p className="max-w-2xl mx-auto text-lg md:text-xl text-slate-400 font-medium leading-relaxed">
            필요한 파일의 압축 프로그램 혹은 변환하고 싶은 파일이 있으면
            Feedback을 남겨주세요.....
          </p>
        </div>
      </header>

      <section className="relative z-10">
        <ToolWorkspace />
      </section>

      <footer className="max-w-5xl mx-auto px-4 py-20 text-center border-t border-white/5 mt-20">
        <div className="text-slate-500 text-sm font-medium tracking-tight">
          &copy; {new Date().getFullYear()} OptiStream Engine. <br />
          <span className="text-slate-600 mt-2 block text-xs">
            Built by DU.
          </span>
        </div>
      </footer>
    </main>
  );
}

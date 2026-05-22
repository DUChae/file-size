import ImageOptimizer from "@/components/ImageOptimizer";
import PdfToPngConverter from "@/components/PdfToPngConverter";

export default function Home() {
  return (
    <main className="relative min-h-screen text-slate-50 selection:bg-blue-500/30">
      {/* Background Mesh */}
      <div className="mesh-gradient" />

      <header className="relative pt-20 pb-12 overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 text-center">
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
            이미지 최적화 엔진. <br />
            화질을 유지하며 용량만 제거
          </p>
        </div>
      </header>

      <section className="relative z-10">
        <ImageOptimizer />
        <PdfToPngConverter />
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

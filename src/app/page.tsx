import ToolWorkspace from "@/components/ToolWorkspace";
import VisitorTracker from "@/components/VisitorTracker";
import BackgroundAnimation from "@/components/BackgroundAnimation";
import Link from "next/link";
import { MessageSquare, BarChart3 } from "lucide-react";

export default function Home() {
  return (
    <main className="relative min-h-screen text-slate-50 selection:bg-blue-500/30 overflow-hidden">
      <VisitorTracker />
      <BackgroundAnimation />

      <nav className="relative z-20 max-w-5xl mx-auto px-6 pt-12 flex justify-end gap-6">
        <Link
          href="/feedback"
          className="flex items-center gap-2 text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-[0.2em] transition-colors group"
        >
          <MessageSquare className="w-3 h-3 transition-transform group-hover:-rotate-12" />
          Feedback
        </Link>
        <Link
          href="/admin"
          className="flex items-center gap-2 text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-[0.2em] transition-colors group"
        >
          <BarChart3 className="w-3 h-3 transition-transform group-hover:scale-110" />
          Dashboard
        </Link>
      </nav>

      <section className="relative z-10">
        <ToolWorkspace />
      </section>

      <footer className="max-w-5xl mx-auto px-4 py-32 text-center border-t border-white/5 mt-20 opacity-20 hover:opacity-50 transition-opacity">
        <div className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">
          &copy; {new Date().getFullYear()} PRO IMAGE LAB. ALL RIGHTS RESERVED.
        </div>
      </footer>
    </main>
  );
}

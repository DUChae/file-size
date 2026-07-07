import ToolWorkspace from "@/components/ToolWorkspace";
import VisitorTracker from "@/components/VisitorTracker";
import BackgroundAnimation from "@/components/BackgroundAnimation";
import Link from "next/link";
import { MessageSquare, BarChart3 } from "lucide-react";

export default function Home() {
  return (
    <main className="relative min-h-[100dvh] text-slate-50 overflow-hidden">
      <VisitorTracker />
      <BackgroundAnimation />

      <nav className="relative z-20 max-w-6xl mx-auto px-5 pt-6 flex justify-end gap-2">
        <Link
          href="/feedback"
          className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 text-[11px] font-bold text-slate-400 backdrop-blur-xl transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white group"
        >
          <MessageSquare className="w-3 h-3 transition-transform group-hover:-rotate-12" />
          Feedback
        </Link>
        <Link
          href="/admin"
          className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 text-[11px] font-bold text-slate-400 backdrop-blur-xl transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white group"
        >
          <BarChart3 className="w-3 h-3 transition-transform group-hover:scale-110" />
          Dashboard
        </Link>
      </nav>

      <section className="relative z-10">
        <ToolWorkspace />
      </section>

      <footer className="max-w-6xl mx-auto px-5 py-20 text-center border-t border-white/8 mt-8 opacity-45 hover:opacity-75 transition-opacity">
        <div className="text-slate-500 text-[11px] font-semibold">
          &copy; {new Date().getFullYear()} PRO IMAGE LAB. ALL RIGHTS RESERVED.
        </div>
      </footer>
    </main>
  );
}

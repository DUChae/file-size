// 모든 화면이 공유하는 상단 바(워드마크·도구 탭·보조 메뉴)와 본문 틀

import Link from "next/link";
import { cn } from "@/lib/utils";
import { TOOLS, type ToolDefinition, type ToolId } from "@/lib/tools";
import { ToolTabs } from "./tool-tabs";

type Section = "feedback" | "admin";

interface AppShellProps {
  /** 링크 주소를 바꿔 끼울 때만 넘긴다(예: 포맷 변환 탭의 마지막 하위 모드). */
  tools?: ToolDefinition<ToolId>[];
  activeTool?: ToolId;
  activeSection?: Section;
  busy?: Partial<Record<ToolId, number>>;
  children: React.ReactNode;
}

const SECONDARY_LINKS: { id: Section; label: string; href: string }[] = [
  { id: "feedback", label: "피드백", href: "/feedback" },
  { id: "admin", label: "대시보드", href: "/admin" },
];

export function AppShell({
  tools = TOOLS,
  activeTool,
  activeSection,
  busy,
  children,
}: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        본문으로 건너뛰기
      </a>
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-6 border-b border-line bg-bg px-4 md:h-14 md:flex-nowrap md:px-6">
        <Link
          href="/"
          className="flex h-14 shrink-0 items-center font-display text-[1.625rem] leading-none tracking-[0.04em] text-text"
        >
          OptiStream
        </Link>
        <ToolTabs
          items={tools}
          activeId={activeTool}
          busy={busy}
          aria-label="도구"
          className="order-last -mx-4 h-12 w-[calc(100%+2rem)] border-t border-line px-2 md:order-none md:mx-0 md:h-full md:w-auto md:min-w-0 md:flex-1 md:border-t-0 md:px-0 lg:ml-4"
        />
        <nav aria-label="보조 메뉴" className="ml-auto shrink-0">
          <ul className="flex">
            {SECONDARY_LINKS.map((link) => {
              const active = link.id === activeSection;
              return (
                <li key={link.id}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-10 items-center whitespace-nowrap rounded-md px-2.5 text-sm transition-colors duration-150 sm:px-3",
                      active
                        ? "bg-surface font-semibold text-text"
                        : "text-muted hover:bg-surface hover:text-text",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex min-w-0 flex-1 flex-col outline-none"
      >
        {children}
      </main>
    </div>
  );
}

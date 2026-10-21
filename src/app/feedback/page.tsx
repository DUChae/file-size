import type { Metadata } from "next";
import FeedbackForm from "@/components/FeedbackForm";
import { AppShell } from "@/components/ui/app-shell";

export const metadata: Metadata = { title: "피드백" };

export default function FeedbackPage() {
  return (
    <AppShell activeSection="feedback">
      <section className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8 md:py-12">
        <h1 className="text-title font-bold tracking-[-0.02em]">버그 제보 · 개선 요청</h1>
        <p className="mb-8 mt-2 max-w-2xl text-base text-muted">
          버그 재현 내용이나 개선 아이디어를 남길 수 있는 화면입니다. 제목과 상세 설명을 적어서
          바로 제출할 수 있습니다.
        </p>

        <FeedbackForm />
      </section>
    </AppShell>
  );
}

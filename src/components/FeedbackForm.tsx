"use client";

import { FormEvent, useState } from "react";

type RequestType = "bug" | "improvement";

interface SubmitState {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
}

const initialState: SubmitState = {
  status: "idle",
  message: "",
};

export default function FeedbackForm() {
  const [requestType, setRequestType] = useState<RequestType>("bug");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>(initialState);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitState({
      status: "submitting",
      message: "제출 중입니다. 잠시만 기다려 주세요.",
    });

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: requestType,
          title,
          details,
        }),
      });

      const data = (await response.json()) as { success: boolean; error?: string };

      if (!response.ok || !data.success) {
        throw new Error(data.error || "제출에 실패했습니다.");
      }

      setTitle("");
      setDetails("");
      setRequestType("bug");
      setSubmitState({
        status: "success",
        message: "제보가 정상적으로 제출되었습니다. 관리자 페이지 Feedback 탭에서 바로 확인해 주세요.",
      });
    } catch (error) {
      setSubmitState({
        status: "error",
        message: error instanceof Error ? error.message : "제출에 실패했습니다.",
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-panel rounded-[32px] p-8 md:p-10">
      <div className="grid gap-8">
        <div>
          <p className="mb-3 text-[11px] font-black uppercase tracking-[0.25em] text-blue-400">
            요청 유형
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setRequestType("bug")}
              className={`rounded-2xl border px-4 py-3 text-sm font-black transition-colors ${
                requestType === "bug"
                  ? "border-blue-400/60 bg-blue-500/15 text-white"
                  : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
              }`}
            >
              버그 제보
            </button>
            <button
              type="button"
              onClick={() => setRequestType("improvement")}
              className={`rounded-2xl border px-4 py-3 text-sm font-black transition-colors ${
                requestType === "improvement"
                  ? "border-blue-400/60 bg-blue-500/15 text-white"
                  : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
              }`}
            >
              개선 요청
            </button>
          </div>
        </div>

        <label className="grid gap-3">
          <span className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-400">
            제목
          </span>
          <input
            required
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="버그나 개선 요청 제목을 입력해 주세요"
            className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
          />
        </label>

        <label className="grid gap-3">
          <span className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-400">
            상세 내용
          </span>
          <textarea
            required
            rows={7}
            maxLength={4000}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="무슨 문제가 있었는지, 기대한 동작은 무엇이었는지, 또는 어떤 개선이 필요한지 자세히 적어 주세요"
            className="resize-none rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
          />
        </label>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <p
            className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
              submitState.status === "error"
                ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                : submitState.status === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-white/10 bg-white/5 text-slate-400"
            }`}
          >
            {submitState.message ||
              "여기에서 버그 제보와 개선 요청을 제출할 수 있습니다. 제출 후 관리자 페이지 Feedback 탭에서 확인됩니다."}
          </p>
          <button
            type="submit"
            disabled={submitState.status === "submitting"}
            className="rounded-2xl bg-white px-6 py-3 text-sm font-black text-slate-950 transition-transform hover:scale-[1.02] disabled:cursor-wait disabled:opacity-70"
          >
            {submitState.status === "submitting" ? "제출 중..." : "제출하기"}
          </button>
        </div>
      </div>
    </form>
  );
}

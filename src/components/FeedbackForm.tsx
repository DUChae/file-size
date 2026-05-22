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
  const [contact, setContact] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>(initialState);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitState({
      status: "submitting",
      message: "Submitting request...",
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
          contact,
        }),
      });

      const data = (await response.json()) as { success: boolean; error?: string };

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to submit request.");
      }

      setTitle("");
      setDetails("");
      setContact("");
      setRequestType("bug");
      setSubmitState({
        status: "success",
        message: "Your request was submitted.",
      });
    } catch (error) {
      setSubmitState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to submit request.",
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-panel rounded-[32px] p-8 md:p-10">
      <div className="grid gap-8">
        <div>
          <p className="mb-3 text-[11px] font-black uppercase tracking-[0.25em] text-blue-400">
            Request Type
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
              Bug Report
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
              Improvement
            </button>
          </div>
        </div>

        <label className="grid gap-3">
          <span className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-400">
            Title
          </span>
          <input
            required
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Summarize the issue or request"
            className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
          />
        </label>

        <label className="grid gap-3">
          <span className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-400">
            Details
          </span>
          <textarea
            required
            rows={7}
            maxLength={4000}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Describe what happened, what you expected, and any ideas for improvement"
            className="resize-none rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
          />
        </label>

        <label className="grid gap-3">
          <span className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-400">
            Contact
          </span>
          <input
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            placeholder="Optional email or handle"
            className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
          />
        </label>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <p
            className={`text-sm font-medium ${
              submitState.status === "error"
                ? "text-rose-400"
                : submitState.status === "success"
                  ? "text-emerald-400"
                  : "text-slate-500"
            }`}
          >
            {submitState.message || "Reports and requests can be submitted here."}
          </p>
          <button
            type="submit"
            disabled={submitState.status === "submitting"}
            className="rounded-2xl bg-white px-6 py-3 text-sm font-black text-slate-950 transition-transform hover:scale-[1.02] disabled:cursor-wait disabled:opacity-70"
          >
            {submitState.status === "submitting" ? "Submitting..." : "Submit"}
          </button>
        </div>
      </div>
    </form>
  );
}

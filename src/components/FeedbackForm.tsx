"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SegmentedControl } from "@/components/ui/segmented-control";

type RequestType = "bug" | "improvement";

interface SubmitState {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
}

const initialState: SubmitState = {
  status: "idle",
  message: "",
};

const TITLE_MAX = 120;
const DETAILS_MAX = 4000;

const FIELD_CLASS =
  "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-base text-text outline-none transition-colors hover:border-line-strong focus:border-text";

export default function FeedbackForm() {
  const [requestType, setRequestType] = useState<RequestType>("bug");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>(initialState);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitState({ status: "submitting", message: "" });

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

      const data = (await response.json()) as {
        success: boolean;
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error || "제출하지 못했습니다");
      }

      setTitle("");
      setDetails("");
      setRequestType("bug");
      setSubmitState({
        status: "success",
        message: "운영자가 대시보드의 피드백 탭에서 바로 확인합니다.",
      });
    } catch (error) {
      setSubmitState({
        status: "error",
        message: error instanceof Error ? error.message : "제출하지 못했습니다",
      });
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-tile border border-line bg-surface p-5 md:p-8"
    >
      <div>
        <span
          id="feedback-type-label"
          className="mb-2 block text-xs font-semibold text-muted"
        >
          요청 유형
        </span>
        <SegmentedControl
          aria-labelledby="feedback-type-label"
          value={requestType}
          onValueChange={setRequestType}
          options={[
            { value: "bug", label: "버그 제보" },
            { value: "improvement", label: "개선 요청" },
          ]}
          className="max-w-sm"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label
            htmlFor="feedback-title"
            className="text-xs font-semibold text-muted"
          >
            제목
          </label>
          <span className="text-xs text-muted">
            {title.length} / {TITLE_MAX}
          </span>
        </div>
        <input
          id="feedback-title"
          required
          maxLength={TITLE_MAX}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="예: AVIF 변환이 1분 넘게 끝나지 않아요"
          className={FIELD_CLASS}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label
            htmlFor="feedback-details"
            className="text-xs font-semibold text-muted"
          >
            상세 내용
          </label>
          <span className="text-xs text-muted">
            {details.length} / {DETAILS_MAX}
          </span>
        </div>
        <textarea
          id="feedback-details"
          required
          rows={7}
          maxLength={DETAILS_MAX}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          placeholder="어떤 파일로 무엇을 했는지, 기대한 결과와 실제 결과를 적어 주세요"
          className={`${FIELD_CLASS} resize-y`}
        />
      </div>

      {submitState.status === "success" && (
        <InlineAlert tone="success" title="제출했습니다">
          {submitState.message}
        </InlineAlert>
      )}
      {submitState.status === "error" && (
        <InlineAlert
          tone="danger"
          title={`제출하지 못했습니다 · ${submitState.message}`}
        >
          입력한 내용은 그대로 남아 있습니다. 잠시 뒤 다시 제출해 주세요.
        </InlineAlert>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          loading={submitState.status === "submitting"}
        >
          {submitState.status === "submitting" ? "제출 중" : "제출하기"}
        </Button>
      </div>
    </form>
  );
}

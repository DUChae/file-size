// 원인과 할 일을 그 자리에 알리는 인라인 알림(모달로 흐름을 막지 않는다)

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger";

interface InlineAlertProps {
  tone?: Tone;
  title: React.ReactNode;
  children?: React.ReactNode;
  /** 다시 시도·계속하기 같은 선택지 */
  actions?: React.ReactNode;
  /** 있으면 오른쪽에 닫기 버튼을 둔다 */
  onDismiss?: () => void;
  className?: string;
}

const TONE = {
  info: { icon: Info, box: "border-line bg-surface", text: "text-text" },
  success: {
    icon: CheckCircle2,
    box: "border-success/30 bg-success/5",
    text: "text-success",
  },
  warning: {
    icon: AlertTriangle,
    box: "border-warning/35 bg-warning/5",
    text: "text-warning",
  },
  danger: {
    icon: XCircle,
    box: "border-danger/35 bg-danger/5",
    text: "text-danger",
  },
} satisfies Record<Tone, { icon: typeof Info; box: string; text: string }>;

export function InlineAlert({
  tone = "info",
  title,
  children,
  actions,
  onDismiss,
  className,
}: InlineAlertProps) {
  const { icon: Icon, box, text } = TONE[tone];
  const urgent = tone === "danger" || tone === "warning";

  return (
    <div
      role={urgent ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border px-4 py-3", box, className)}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", text)} aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn("text-sm font-semibold", text)}>{title}</p>
        {children && <div className="text-sm text-muted">{children}</div>}
        {actions && <div className="flex flex-wrap gap-2 pt-2">{actions}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="알림 닫기"
          className="-my-1.5 -mr-2 flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

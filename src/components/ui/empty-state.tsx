// 파일·데이터가 아직 없을 때 다음 행동을 안내하는 빈 상태

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-tile border border-dashed border-line-strong px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && <Icon className="size-6 text-muted" aria-hidden />}
      <p className="text-base font-semibold text-text">{title}</p>
      {description && (
        <p className="max-w-md text-sm text-muted">{description}</p>
      )}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

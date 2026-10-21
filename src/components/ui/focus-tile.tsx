// 초점 받은 결과 하나를 비교 미리보기와 정보 패널로 크게 보여 주는 타일

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FocusTileProps {
  /** 비교 슬라이더·캡처 크롭·PDF 미리보기 등 왼쪽 미디어 영역 */
  media: React.ReactNode;
  /** 목표 달성 여부 같은 짧은 판정. 색만으로 구분하지 않게 아이콘이 붙는다. */
  badge?: { tone: "success" | "warning" | "neutral"; label: React.ReactNode };
  title: string;
  /** 해상도·포맷 등 */
  subtitle?: React.ReactNode;
  /** 감소율 같은 큰 숫자. 예: "−84%" */
  metric?: React.ReactNode;
  metricTone?: "default" | "warning";
  /** 예: "3.1 MB → 498 KB" */
  sizeLine?: React.ReactNode;
  details?: { label: React.ReactNode; value: React.ReactNode }[];
  /** 정보 패널 안의 추가 컨트롤(개별 크기 조절 등) */
  extra?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

const BADGE = {
  success: { icon: CheckCircle2, className: "text-success" },
  warning: { icon: AlertTriangle, className: "text-warning" },
  neutral: { icon: null, className: "text-text" },
};

export function FocusTile({
  media,
  badge,
  title,
  subtitle,
  metric,
  metricTone = "default",
  sizeLine,
  details,
  extra,
  actions,
  className,
}: FocusTileProps) {
  const badgeStyle = badge ? BADGE[badge.tone] : null;
  const BadgeIcon = badgeStyle?.icon;

  return (
    <article
      className={cn(
        // 부모 컨테이너가 충분히 넓을 때만 미디어와 정보 패널을 나란히 놓는다(부모에 @container 필요).
        "flex flex-col overflow-hidden rounded-tile border-2 border-accent bg-surface @min-[54rem]:flex-row",
        className,
      )}
    >
      <div className="relative aspect-[16/10] w-full shrink-0 bg-bg @min-[54rem]:w-[544px]">
        {media}
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-5 @min-[54rem]:w-[292px] @min-[54rem]:flex-none">
        {badge && badgeStyle && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 self-start rounded-md bg-surface-2 px-2 py-0.5 text-xs font-semibold",
              badgeStyle.className,
            )}
          >
            {BadgeIcon && <BadgeIcon className="size-3.5" aria-hidden="true" />}
            {badge.label}
          </span>
        )}
        <h3 className="mt-2.5 break-all text-xl font-bold tracking-[-0.02em]">
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        {metric && (
          <p
            className={cn(
              "mt-4 font-display text-metric tracking-[0.01em]",
              metricTone === "warning" && "text-warning",
            )}
          >
            {metric}
          </p>
        )}
        {sizeLine && <p className="mt-1 text-base font-semibold">{sizeLine}</p>}
        {details && details.length > 0 && (
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 border-t border-line pt-3 text-xs">
            {details.map((detail, index) => (
              <div key={index} className="contents">
                <dt className="text-muted">{detail.label}</dt>
                <dd className="text-right">{detail.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {extra && <div className="mt-4 border-t border-line pt-3">{extra}</div>}
        {actions && (
          <div className="mt-auto flex gap-2 pt-5 [&>*]:flex-1">{actions}</div>
        )}
      </div>
    </article>
  );
}

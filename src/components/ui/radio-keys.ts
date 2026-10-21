// 라디오 그룹(세그먼트·칩)에서 방향키로 선택을 옮기는 공용 키 처리

import type { KeyboardEvent, ReactNode } from "react";

export interface RadioOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

const NEXT_KEYS = ["ArrowRight", "ArrowDown"];
const PREV_KEYS = ["ArrowLeft", "ArrowUp"];

/** WAI-ARIA 라디오 그룹 규칙: 방향키는 이동과 동시에 선택하고, 비활성 항목은 건너뛴다. */
export function handleRadioKeyDown<T extends string>(
  event: KeyboardEvent<HTMLElement>,
  options: RadioOption<T>[],
  current: T,
  select: (value: T) => void,
) {
  const enabled = options.filter((option) => !option.disabled);
  if (enabled.length === 0) return;
  const index = enabled.findIndex((option) => option.value === current);

  let next: RadioOption<T> | undefined;
  if (NEXT_KEYS.includes(event.key))
    next = enabled[(index + 1) % enabled.length];
  else if (PREV_KEYS.includes(event.key))
    next = enabled[(index - 1 + enabled.length) % enabled.length];
  else if (event.key === "Home") next = enabled[0];
  else if (event.key === "End") next = enabled[enabled.length - 1];
  if (!next) return;

  event.preventDefault();
  select(next.value);
  const group = event.currentTarget;
  requestAnimationFrame(() => {
    group
      .querySelector<HTMLElement>(`[data-value="${CSS.escape(next.value)}"]`)
      ?.focus();
  });
}

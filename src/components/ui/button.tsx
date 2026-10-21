import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45 aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // 화면마다 하나만 둔다. 노란색은 주 버튼과 초점 테두리에만 쓴다.
        primary:
          "border-accent bg-accent text-accent-ink hover:border-accent-hover hover:bg-accent-hover",
        secondary:
          "border-line bg-surface text-text hover:border-line-strong hover:bg-surface-2",
        ghost:
          "border-transparent bg-transparent text-muted hover:bg-surface hover:text-text",
        // 초점 타일의 "저장"처럼 주 버튼 다음으로 강한 행동. 노란색은 쓰지 않는다.
        inverse:
          "border-text bg-text text-bg hover:border-muted hover:bg-muted",
        danger:
          "border-line bg-surface text-danger hover:border-danger/50 hover:bg-danger/10",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
      },
      iconOnly: {
        true: "px-0",
        false: "",
      },
    },
    compoundVariants: [
      { size: "sm", iconOnly: true, className: "w-8" },
      { size: "md", iconOnly: true, className: "w-10" },
    ],
    defaultVariants: {
      variant: "secondary",
      size: "md",
      iconOnly: false,
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** 처리 중 표시. 누를 수 없게 하고 회전 아이콘을 앞에 붙인다. */
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      iconOnly,
      asChild = false,
      loading = false,
      disabled,
      children,
      type,
      ...props
    },
    ref
  ) => {
    const classes = cn(buttonVariants({ variant, size, iconOnly, className }))

    if (asChild) {
      return (
        <Slot className={classes} ref={ref} {...props}>
          {children}
        </Slot>
      )
    }

    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={classes}
        // 처리 중에는 흐리게 만들지 않고 누르는 것만 막는다(진행 상태가 잘 보이도록).
        disabled={disabled}
        aria-disabled={loading || undefined}
        aria-busy={loading || undefined}
        {...props}
        onClick={loading ? undefined : props.onClick}
      >
        {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
        {loading && iconOnly ? null : children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, "aria-label": ariaLabel, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-full touch-none select-none items-center data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-line-strong">
      <SliderPrimitive.Range className="absolute h-full bg-text" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      aria-label={ariaLabel}
      className="block size-4 cursor-grab rounded-full border-2 border-bg bg-text shadow-[0_0_0_1px_var(--color-line-strong)] transition-transform duration-150 hover:scale-110 active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none"
    />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }

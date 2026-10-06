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
      "relative flex w-full touch-none select-none items-center py-2 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-white/10">
      <SliderPrimitive.Range className="absolute h-full bg-teal-300" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb aria-label={ariaLabel} className="block h-5 w-5 cursor-grab rounded-full border-2 border-teal-300 bg-white shadow-lg transition-transform hover:scale-110 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-300/30 disabled:pointer-events-none" />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }

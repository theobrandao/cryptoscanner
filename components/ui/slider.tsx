"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

/**
 * Controle deslizante de um valor. `thumbLabel` dá nome ao botão arrastável (é ele que recebe o foco) e
 * `valueText` é o valor já formatado lido pelo leitor de tela (ex.: "1,50%" em vez de "1.5").
 */
export function Slider({ className, thumbLabel, valueText, ...props }: React.ComponentProps<typeof SliderPrimitive.Root> & { thumbLabel?: string; valueText?: string }) {
  return (
    <SliderPrimitive.Root className={cn("relative flex w-full touch-none select-none items-center", className)} {...props}>
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb aria-label={thumbLabel} aria-valuetext={valueText} className="block h-6 w-6 rounded-full border-2 border-primary bg-background shadow-sm transition-colors duration-150 hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-grab active:cursor-grabbing motion-reduce:transition-none" />
    </SliderPrimitive.Root>
  );
}

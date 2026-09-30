"use client";

import * as React from "react";
import Image from "next/image";
import { Expand } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { MediaImage } from "@/lib/content/tutorial-media";
import { cn } from "@/lib/utils";

/**
 * Imagem que amplia ao clicar: abre um diálogo acessível (Esc fecha, foco preso no diálogo e devolvido ao botão).
 * A miniatura carrega sob demanda; a versão ampliada só é pedida quando o diálogo abre.
 */
export function ZoomableImage({ image, alt, caption, sizes, className, imgClassName }: { image: MediaImage; alt: string; caption?: string; sizes: string; className?: string; imgClassName?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border border-border bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
        aria-label={`Ampliar imagem: ${alt}`}
      >
        <Image src={image.src} width={image.width} height={image.height} alt={alt} sizes={sizes} className={cn("h-auto w-full", imgClassName)} />
        <span aria-hidden className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md bg-background/85 text-foreground opacity-80 transition-opacity duration-150 group-hover:opacity-100 motion-reduce:transition-none">
          <Expand className="h-3.5 w-3.5" />
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100%-1rem)] max-w-[min(96vw,1400px)] gap-2 p-2 sm:p-3">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          {open ? <Image src={image.src} width={image.width} height={image.height} alt={alt} sizes="96vw" className="mx-auto h-auto max-h-[80vh] w-auto max-w-full rounded-md object-contain" /> : null}
          {caption ? <DialogDescription className="px-1 pb-1 pr-10">{caption}</DialogDescription> : <DialogDescription className="sr-only">Imagem ampliada</DialogDescription>}
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import * as React from "react";
import { Monitor, PlayCircle, Smartphone } from "lucide-react";
import type { MediaImage } from "@/lib/content/tutorial-media";
import { cn } from "@/lib/utils";
import { ZoomableImage } from "./zoomable-image";

type View = "video" | "computador" | "celular";

const LABEL: Record<View, string> = { video: "Vídeo", computador: "Computador", celular: "Celular" };
const ICON: Record<View, React.ComponentType<{ className?: string }>> = { video: PlayCircle, computador: Monitor, celular: Smartphone };

/**
 * Mídia principal do tutorial: vídeo (sem tocar sozinho, só carrega ao dar play), tela do computador e tela do celular.
 * Só aparecem as opções que existem; nunca renderiza um vídeo vazio. Quem monta garante que há pelo menos uma.
 */
export function MediaViewer({ title, video, poster, cover, mobile }: { title: string; video: { src: string; type: string } | null; poster: MediaImage | null; cover: MediaImage | null; mobile: MediaImage | null }) {
  const views = (["video", "computador", "celular"] as const).filter((v) => (v === "video" ? !!video : v === "computador" ? !!cover : !!mobile));
  const [view, setView] = React.useState<View>(views[0] ?? "computador");
  const posterImg = poster ?? cover;
  return (
    <div className="flex flex-col gap-3">
      {views.length > 1 ? (
        <div className="flex w-fit gap-1 rounded-md border border-border bg-card p-0.5" role="group" aria-label="Ver como">
          {views.map((v) => {
            const I = ICON[v];
            return (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded px-3 text-[13px] transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", view === v ? "bg-primary/15 font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <I className="h-4 w-4" aria-hidden /> {LABEL[v]}
              </button>
            );
          })}
        </div>
      ) : null}
      {view === "video" && video ? (
        <video
          key={video.src}
          controls
          playsInline
          preload="none"
          poster={posterImg?.src}
          width={posterImg?.width}
          height={posterImg?.height}
          className="aspect-video h-auto w-full rounded-lg border border-border bg-[#070b14] object-contain"
          aria-label={`Vídeo: ${title}`}
        >
          <source src={video.src} type={video.type} />
          Seu navegador não reproduz este vídeo. Siga o passo a passo abaixo.
        </video>
      ) : null}
      {view === "computador" && cover ? <ZoomableImage image={cover} alt={`Tela do computador: ${title}`} sizes="(min-width: 1024px) 640px, 100vw" /> : null}
      {view === "celular" && mobile ? (
        <div className="flex justify-center rounded-lg border border-border bg-muted/30 p-3">
          <ZoomableImage image={mobile} alt={`Tela do celular: ${title}`} sizes="280px" className="w-auto max-w-[260px] border-0 bg-transparent" imgClassName="max-h-[520px] w-auto" />
        </div>
      ) : null}
    </div>
  );
}

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ListOrdered } from "lucide-react";
import type { MediaImage } from "@/lib/content/tutorial-media";
import type { TutorialCategory, TutorialIcon, TutorialPlan } from "@/lib/content/tutorials";
import { cn } from "@/lib/utils";
import { MediaPlaceholder } from "./media-placeholder";
import { TutorialPlanTag } from "./plan-tag";

/** Resumo de um tutorial para os cartões (o texto completo fica só na página do tutorial). */
export interface TutorialCardData {
  slug: string;
  title: string;
  summary: string;
  category: TutorialCategory;
  icon: TutorialIcon;
  plan: TutorialPlan;
  hint: string;
  cover: MediaImage | null;
}

const SIZES = "(min-width: 1280px) 400px, (min-width: 640px) 50vw, 100vw";

/** Cartão de tutorial: capa (ou espaço reservado com o ícone), selo do acesso, título, resumo e "N passos · vídeo". */
export function TutorialCard({ t, headingLevel = 3, highlight }: { t: TutorialCardData; headingLevel?: 2 | 3; highlight?: boolean }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <Link href={`/ajuda/${t.slug}`} className="group block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <article className={cn("flex h-full flex-col overflow-hidden rounded-lg border bg-card shadow-(--card-shadow) transition-[transform,border-color] duration-200 group-hover:-translate-y-px group-hover:border-primary/50 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0", highlight ? "border-primary/35" : "border-border")}>
        <div className="aspect-[16/9] overflow-hidden border-b border-border">
          {t.cover ? <Image src={t.cover.src} width={t.cover.width} height={t.cover.height} alt="" sizes={SIZES} className="h-full w-full object-cover object-top" /> : <MediaPlaceholder icon={t.icon} compact className="h-full w-full" />}
        </div>
        <div className="flex flex-1 flex-col p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{t.category}</span>
            <TutorialPlanTag plan={t.plan} />
          </div>
          <H className="mt-2 font-semibold leading-snug">{t.title}</H>
          <p className="mt-1 flex-1 text-sm text-muted-foreground">{t.summary}</p>
          <div className="mt-3 flex items-center justify-between gap-2 text-xs">
            <span className="tabular inline-flex items-center gap-1 text-muted-foreground">
              <ListOrdered className="h-3.5 w-3.5" aria-hidden /> {t.hint}
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-primary-text">
              Ver tutorial <ArrowRight className="h-3 w-3 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

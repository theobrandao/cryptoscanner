import { durationHint, getTutorialMedia } from "@/lib/content/tutorial-media";
import type { Tutorial } from "@/lib/content/tutorials";
import type { TutorialCardData } from "./tutorial-card";

/** Dados do cartão de um tutorial (capa e "N passos · vídeo" vêm do arquivo de mídia). Uso no servidor. */
export function tutorialCardData(t: Tutorial): TutorialCardData {
  const media = getTutorialMedia(t.slug);
  return { slug: t.slug, title: t.title, summary: t.summary, category: t.category, icon: t.icon, plan: t.plan, hint: durationHint(t.steps.length, media), cover: media?.cover ?? media?.poster ?? null };
}

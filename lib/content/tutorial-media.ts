import raw from "./tutorial-media.json";
import type { TutorialStep } from "./tutorials";

/**
 * Imagens e vídeos dos tutoriais, lidos de lib/content/tutorial-media.json (gerado por tools/capture-tutorials.mjs).
 * O arquivo pode estar incompleto ou sem um tutorial: tudo aqui é tolerante e devolve `null`/listas vazias,
 * e a página mostra um espaço reservado com o ícone da ferramenta no lugar da imagem.
 *
 * Formato aceito por tutorial: { cover, coverWidth, coverHeight, mobile, mobileWidth, mobileHeight, video, poster,
 * posterWidth, posterHeight, steps: [{ src, caption, width, height, step? }], capturedAt, videoSeconds? }.
 * `step` (1 = primeiro passo de "Como usar") amarra a imagem a um passo; sem ele, a legenda é comparada com o texto dos passos.
 */

export interface MediaImage {
  src: string;
  width: number;
  height: number;
}

export interface MediaStep extends MediaImage {
  caption: string;
  /** índice (0-based) do passo de "Como usar", quando informado no arquivo */
  step: number | null;
}

export interface TutorialMedia {
  cover: MediaImage | null;
  mobile: MediaImage | null;
  video: { src: string; type: string; seconds: number | null } | null;
  poster: MediaImage | null;
  steps: MediaStep[];
  capturedAt: string | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/** Caminho servido de /public (só caminhos locais; nada externo). */
function localSrc(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || /^[a-z]+:/i.test(s) || s.startsWith("//")) return null;
  return s.startsWith("/") ? s : `/${s}`;
}

function image(v: unknown, w: unknown, h: unknown, fallback: [number, number]): MediaImage | null {
  const nested = isObj(v) ? v : null;
  const src = localSrc(nested ? nested.src : v);
  if (!src) return null;
  return { src, width: num(nested?.width) ?? num(w) ?? fallback[0], height: num(nested?.height) ?? num(h) ?? fallback[1] };
}

const DESKTOP: [number, number] = [1600, 900];
const PHONE: [number, number] = [780, 1688];

function videoType(src: string): string {
  return /\.webm$/i.test(src) ? "video/webm" : "video/mp4";
}

function normalize(entry: unknown): TutorialMedia | null {
  if (!isObj(entry)) return null;
  const videoSrc = localSrc(isObj(entry.video) ? entry.video.src : entry.video);
  const seconds = num(entry.videoSeconds) ?? num(entry.videoDuration) ?? num(entry.durationSec) ?? num(entry.duration) ?? (isObj(entry.video) ? num(entry.video.seconds) ?? num(entry.video.duration) : null);
  const steps: MediaStep[] = Array.isArray(entry.steps)
    ? entry.steps.flatMap((s): MediaStep[] => {
        if (!isObj(s)) return [];
        const img = image(s.src, s.width, s.height, DESKTOP);
        if (!img) return [];
        const idx = num(s.step);
        return [{ ...img, caption: typeof s.caption === "string" ? s.caption.trim() : "", step: idx ? Math.round(idx) - 1 : null }];
      })
    : [];
  const media: TutorialMedia = {
    cover: image(entry.cover, entry.coverWidth, entry.coverHeight, DESKTOP),
    mobile: image(entry.mobile, entry.mobileWidth, entry.mobileHeight, PHONE),
    video: videoSrc ? { src: videoSrc, type: videoType(videoSrc), seconds: seconds ? Math.round(seconds) : null } : null,
    poster: image(entry.poster, entry.posterWidth, entry.posterHeight, DESKTOP),
    steps,
    capturedAt: typeof entry.capturedAt === "string" && !Number.isNaN(Date.parse(entry.capturedAt)) ? entry.capturedAt : null,
  };
  return media.cover || media.mobile || media.video || media.steps.length ? media : null;
}

const ALL: Record<string, unknown> = isObj(raw as unknown) ? (raw as unknown as Obj) : {};

export function getTutorialMedia(slug: string): TutorialMedia | null {
  return normalize(ALL[slug]);
}

/** Palavras significativas (sem acento, 4+ letras) para comparar legenda e passo. */
function words(s: string): Set<string> {
  return new Set(
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4),
  );
}

/**
 * Liga cada imagem de passo ao passo de "Como usar" correspondente: primeiro pelo `step` do arquivo; depois pela legenda
 * com mais palavras em comum com o título e o texto do passo. Imagens sem correspondência vão para `extra` (galeria).
 */
export function pairStepMedia(steps: TutorialStep[], media: MediaStep[]): { byStep: Array<MediaStep | null>; extra: MediaStep[] } {
  const byStep: Array<MediaStep | null> = steps.map(() => null);
  const extra: MediaStep[] = [];
  const stepWords = steps.map((s) => words(`${s.title} ${s.text}`));
  const pending: MediaStep[] = [];
  for (const m of media) {
    if (m.step !== null && m.step >= 0 && m.step < steps.length && !byStep[m.step]) byStep[m.step] = m;
    else pending.push(m);
  }
  for (const m of pending) {
    const cw = words(m.caption);
    let best = -1;
    let bestScore = 0;
    stepWords.forEach((sw, i) => {
      if (byStep[i]) return;
      let score = 0;
      for (const w of cw) if (sw.has(w)) score++;
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    });
    if (best >= 0) byStep[best] = m;
    else extra.push(m);
  }
  return { byStep, extra };
}

/** "7 passos · vídeo 20 s" (ou "· vídeo" sem duração conhecida). */
export function durationHint(stepCount: number, media: TutorialMedia | null): string {
  const parts = [`${stepCount} passos`];
  if (media?.video) parts.push(media.video.seconds ? `vídeo ${media.video.seconds} s` : "vídeo");
  return parts.join(" · ");
}

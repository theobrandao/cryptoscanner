import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { durationHint, getTutorialMedia, pairStepMedia } from "@/lib/content/tutorial-media";
import { tutorialForPath, TUTORIAL_PATH_SLUGS } from "@/lib/content/tutorial-paths";
import { CATEGORY_ANCHOR, STARTER_SLUGS, TUTORIAL_CATEGORIES, TUTORIALS } from "@/lib/content/tutorials";
import { isOpenRoute } from "@/lib/site";

const APP = path.resolve(__dirname, "../../app");
const REQUIRED_SLUGS = [
  "primeiros-passos",
  "instalar-app",
  "notificacoes-push",
  "conectar-telegram",
  "inicio",
  "scanner",
  "scanner-setups",
  "analise-completa",
  "graficos",
  "fibonacci",
  "panorama",
  "bolhas",
  "analista-ia",
  "agentes-ia",
  "sentinela",
  "monitores-alertas",
  "carteira",
  "simulador",
  "backtest",
  "construtor-estrategias",
  "jornada",
  "planos-e-conta",
];

/** A rota existe em app/ (page.tsx no caminho exato, sem query). */
function routeExists(route: string): boolean {
  const clean = route.split(/[?#]/)[0] ?? "/";
  const rel = clean === "/" ? "" : clean.replace(/^\//, "");
  return fs.existsSync(path.join(APP, rel, "page.tsx"));
}

describe("tutoriais (/ajuda)", () => {
  it("cobre todos os slugs pedidos, sem repetição", () => {
    const slugs = TUTORIALS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect([...slugs].sort()).toEqual([...REQUIRED_SLUGS].sort());
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it.each(TUTORIALS.map((t) => [t.slug, t] as const))("%s tem título, resumo, conteúdo e passos completos", (_slug, t) => {
    expect(t.title.trim().length).toBeGreaterThan(3);
    expect(t.summary.trim().length).toBeGreaterThan(20);
    expect(t.summary.length).toBeLessThanOrEqual(140);
    expect(TUTORIAL_CATEGORIES).toContain(t.category);
    expect(t.purpose.trim().length).toBeGreaterThan(40);
    expect(t.before.length).toBeGreaterThan(0);
    expect(t.steps.length).toBeGreaterThanOrEqual(5);
    expect(t.steps.length).toBeLessThanOrEqual(8);
    for (const s of t.steps) {
      expect(s.title.trim()).not.toBe("");
      expect(s.text.trim().length).toBeGreaterThan(15);
    }
    expect(new Set(t.steps.map((s) => s.title)).size).toBe(t.steps.length);
    expect(t.tips.length).toBeGreaterThanOrEqual(2);
    expect(t.tips.length).toBeLessThanOrEqual(4);
    expect(t.faq.length).toBeGreaterThanOrEqual(2);
    expect(t.faq.length).toBeLessThanOrEqual(3);
    if (t.install) for (const g of t.install.groups) expect(g.steps.length).toBeGreaterThan(0);
  });

  it("rotas das ferramentas existem em app/", () => {
    for (const t of TUTORIALS) expect(routeExists(t.route), `${t.slug} → ${t.route}`).toBe(true);
  });

  it("relacionados apontam para tutoriais existentes (e não para o próprio)", () => {
    const slugs = new Set(TUTORIALS.map((t) => t.slug));
    for (const t of TUTORIALS) {
      expect(t.related.length).toBeGreaterThan(0);
      for (const r of t.related) {
        expect(slugs.has(r), `${t.slug} → ${r}`).toBe(true);
        expect(r).not.toBe(t.slug);
      }
    }
  });

  it("faixa Comece aqui e âncoras de categoria são válidas", () => {
    const slugs = new Set(TUTORIALS.map((t) => t.slug));
    for (const s of STARTER_SLUGS) expect(slugs.has(s)).toBe(true);
    const anchors = Object.values(CATEGORY_ANCHOR);
    expect(new Set(anchors).size).toBe(TUTORIAL_CATEGORIES.length);
  });

  it("texto sem emojis e sem a chave interna do plano", () => {
    const all = JSON.stringify(TUTORIALS);
    expect(all).not.toMatch(/PLATINUM/);
    expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("/ajuda é aberta (sem bloqueio de plano)", () => {
    expect(isOpenRoute("/ajuda")).toBe(true);
    expect(isOpenRoute("/ajuda/scanner")).toBe(true);
  });

  it("link 'Como usar' das telas de bloqueio aponta para o tutorial certo", () => {
    const slugs = new Set(TUTORIALS.map((t) => t.slug));
    for (const s of TUTORIAL_PATH_SLUGS) expect(slugs.has(s), s).toBe(true);
    for (const t of TUTORIALS.filter((x) => TUTORIAL_PATH_SLUGS.includes(x.slug))) expect(tutorialForPath(t.route)?.slug, t.route).toBe(t.slug);
    expect(tutorialForPath("/scanner")?.slug).toBe("scanner-setups");
    expect(tutorialForPath("/scanner/padroes")?.slug).toBe("scanner");
    expect(tutorialForPath("/charts/BTC?tf=4h")?.slug).toBe("analise-completa");
    expect(tutorialForPath("/ajuda")).toBeNull();
  });
});

describe("mídia dos tutoriais", () => {
  it("tutorial sem mídia devolve null (a página mostra o espaço reservado)", () => {
    expect(getTutorialMedia("slug-que-nao-existe")).toBeNull();
  });

  it("toda mídia declarada usa caminho local com dimensões válidas", () => {
    for (const t of TUTORIALS) {
      const m = getTutorialMedia(t.slug);
      if (!m) continue;
      for (const img of [m.cover, m.mobile, m.poster, ...m.steps]) {
        if (!img) continue;
        expect(img.src.startsWith("/")).toBe(true);
        expect(img.width).toBeGreaterThan(0);
        expect(img.height).toBeGreaterThan(0);
      }
      if (m.video) expect(m.video.src.startsWith("/")).toBe(true);
    }
  });

  it("liga imagem ao passo pelo índice informado ou pela legenda", () => {
    const steps = [
      { title: "Escolha o timeframe", text: "Toque em 4H, 1D ou 1W." },
      { title: "Toque em Escanear Agora", text: "O scanner analisa os ativos." },
      { title: "Veja os resultados", text: "Na aba Padrões Técnicos ficam os padrões encontrados." },
    ];
    const img = (src: string, caption: string, step: number | null = null) => ({ src, caption, width: 10, height: 10, step });
    const { byStep, extra } = pairStepMedia(steps, [img("/a.webp", "Clique em Escanear agora"), img("/b.webp", "Abra a aba Padrões técnicos"), img("/c.webp", "Outra tela sem relação"), img("/d.webp", "", 0)]);
    expect(byStep.map((m) => m?.src ?? null)).toEqual(["/d.webp", "/a.webp", "/b.webp"]);
    expect(extra.map((m) => m.src)).toEqual(["/c.webp"]);
  });

  it("resumo de duração", () => {
    expect(durationHint(3, null)).toBe("3 passos");
    expect(durationHint(3, { cover: null, mobile: null, poster: null, steps: [], capturedAt: null, video: { src: "/v.mp4", type: "video/mp4", seconds: 20 } })).toBe("3 passos · vídeo 20 s");
  });
});

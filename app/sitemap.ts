import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Só páginas públicas (vendas, planos e documentos legais). As ferramentas exigem conta. */
const PAGES: Array<{ path: string; freq: "daily" | "weekly" | "monthly" | "yearly"; priority: number }> = [
  { path: "/", freq: "daily", priority: 1 },
  { path: "/vendas", freq: "weekly", priority: 0.9 },
  { path: "/planos", freq: "weekly", priority: 0.8 },
  { path: "/registro", freq: "monthly", priority: 0.6 },
  { path: "/login", freq: "monthly", priority: 0.4 },
  { path: "/status", freq: "daily", priority: 0.3 },
  { path: "/termos", freq: "yearly", priority: 0.2 },
  { path: "/privacidade", freq: "yearly", priority: 0.2 },
  { path: "/reembolso", freq: "yearly", priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((p) => ({ url: `${SITE_URL}${p.path === "/" ? "" : p.path}`, changeFrequency: p.freq, priority: p.priority }));
}

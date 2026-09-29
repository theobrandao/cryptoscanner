import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CryptoScanner — Padrões & Agentes IA",
    short_name: "CryptoScanner",
    description: "Scanner de padrões gráficos, agentes de IA, panorama e simulador de aportes para Bitcoin e altcoins.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f0b1f",
    theme_color: "#7c5cff",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}

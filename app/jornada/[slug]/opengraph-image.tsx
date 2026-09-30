import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getLesson, LESSONS, LEVEL_LABEL } from "@/lib/content/lessons";

export const alt = "Aula da Jornada Trader — CryptoScanner";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Uma imagem por aula, gerada no build (mesmas 12 aulas de generateStaticParams da página). */
export function generateStaticParams() {
  return LESSONS.map((l) => ({ slug: l.slug }));
}

/** Imagem de compartilhamento da aula: logo, número, nível e título. Só texto da aula, sem números de desempenho. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const lesson = getLesson((await params).slug);
  const logo = `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public/brand/logo.png"))).toString("base64")}`;
  const title = lesson?.title ?? "Jornada Trader";
  const meta = lesson ? `Aula ${lesson.order} de ${LESSONS.length} · ${LEVEL_LABEL[lesson.level]} · ${lesson.minutes} min` : `${LESSONS.length} aulas grátis`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#07101a", color: "#e6edf5" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <img src={logo} width={80} height={80} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 40, fontWeight: 700 }}>CryptoScanner</div>
            <div style={{ fontSize: 26, color: "#94a3b8" }}>Jornada Trader · curso grátis</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 28, color: "#60a5fa" }}>{meta}</div>
          <div style={{ fontSize: title.length > 44 ? 56 : 64, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 24, color: "#94a3b8" }}>
          <div style={{ color: "#60a5fa" }}>cryptoscanner.com.br/jornada</div>
          <div>Conteúdo educativo</div>
        </div>
      </div>
    ),
    { ...size },
  );
}

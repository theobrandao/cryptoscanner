import { ImageResponse } from "next/og";

export const alt = "CryptoScanner — padrões gráficos, sinais testados e alertas de cripto";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Imagem de compartilhamento (WhatsApp, Telegram, redes). Só texto do produto, sem números de desempenho. */
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#07101a", color: "#e6edf5" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "#2f6bff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: "#fff" }}>CS</div>
          <div style={{ fontSize: 44, fontWeight: 700 }}>CryptoScanner</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>Padrões gráficos, sinais testados e alertas de cripto</div>
          <div style={{ fontSize: 30, color: "#94a3b8" }}>30 criptomoedas · alertas por push e Telegram · analista IA</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26 }}>
          <div style={{ color: "#60a5fa" }}>cryptoscanner.com.br</div>
          <div style={{ color: "#94a3b8" }}>3 dias grátis no PRO</div>
        </div>
      </div>
    ),
    { ...size },
  );
}

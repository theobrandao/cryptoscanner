import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { themeInitScript } from "@/components/providers/theme-provider";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

export const metadata: Metadata = {
  title: { default: "CryptoScanner — Scanner de Padrões com Agentes IA", template: "%s — CryptoScanner" },
  description: "Scanner de padrões gráficos em Bitcoin e altcoins com sistema multiagente, dados públicos de mercado e análise técnica programática.",
  applicationName: "CryptoScanner",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0d0a1c" },
    { media: "(prefers-color-scheme: light)", color: "#f6f5fb" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="dark h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <AppProviders>
          <Header />
          <div className="flex-1">{children}</div>
          <Footer />
        </AppProviders>
      </body>
    </html>
  );
}

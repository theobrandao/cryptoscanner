import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";

import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { PwaRegister } from "@/components/providers/pwa-register";
import { themeInitScript } from "@/components/providers/theme-provider";
import { AppShell } from "@/components/layout/app-shell";
import { SITE_URL } from "@/lib/site";
import { siteVerification } from "@/lib/env";

/**
 * Inter variável servida pelo próprio site (um arquivo por subconjunto cobre todos os pesos; pré-carrega só o latino).
 * "optional" evita troca de fonte depois da pintura, que empurrava o layout. Símbolos de moeda fora do latino
 * usam a fonte do sistema (GLYPH_FONT_CLASS em lib/assets.ts), para não baixar os arquivos latin-ext e grego.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "optional",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "CryptoScanner — scanner cripto com sinais testados e alertas",
    template: "%s — CryptoScanner",
  },
  description:
    "Padrões gráficos, sinais de rompimento testados fora da amostra, agentes com alertas por push e Telegram e análise técnica de 30 criptomoedas.",
  applicationName: "CryptoScanner",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "CryptoScanner",
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
  // GOOGLE_SITE_VERIFICATION / BING_SITE_VERIFICATION (opcionais): meta tags de verificação do Search Console e do Bing Webmaster
  verification: siteVerification(),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070B14" },
    { media: "(prefers-color-scheme: light)", color: "#F5F7FB" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`dark h-full ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Script
          strategy="afterInteractive"
          src="https://www.googletagmanager.com/gtag/js?id=AW-18485599082"
        />
        <Script
          id="google-ads-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'AW-18485599082');
            `,
          }}
        />
        <PwaRegister />
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@/components/layout/page-shell";
import { HomeMarket } from "@/components/market/home-market";
import { TopVolume } from "@/components/market/top-volume";
import { Card, CardContent } from "@/components/ui/card";
import { DISCLAIMER_TEXT } from "@/components/layout/nav-config";

export const metadata: Metadata = { title: "CryptoScanner — Scanner de padrões e agentes de IA para cripto" };

const FEATURES = [
  { icon: "📊", title: "Scanner de Padrões Gráficos", text: "17 padrões detectados por pivôs fractais e ATR em 20 ativos, com alvo, stop e confiança.", href: "/scanner" },
  { icon: "🤖", title: "Agentes de IA Autônomos", text: "Agentes configuráveis que verificam estratégias a cada 5 minutos e alertam no painel ou no Telegram.", href: "/agentes" },
  { icon: "🔔", title: "Alertas Inteligentes", text: "Volume anômalo (≥100% sobre a média), preço, RSI e padrões — com cooldown e histórico.", href: "/scanner" },
  { icon: "📈", title: "Gráficos com indicadores", text: "Candles com EMA 8/25/100/200, Bollinger, StochRSI, MACD, suportes/resistências e Fibonacci.", href: "/graficos" },
  { icon: "🧠", title: "Análise consolidada", text: "Orquestrador que cruza técnica, tendência, risco e sentimento, aponta conflitos e dados ausentes.", href: "/graficos" },
  { icon: "💼", title: "Carteira e watchlist", text: "Favoritos, posições simuladas com P&L e análises de gráfico salvas.", href: "/carteira" },
  { icon: "🛰️", title: "Agente Sentinela", text: "Um vigia por moeda, 24/7 no servidor: 17 padrões ao mesmo tempo, plano de trade e confluência técnica.", href: "/sentinela" },
  { icon: "📜", title: "Simulador de aportes", text: "Backtest de DCA e aporte único com preços diários reais, em BRL ou USD, com queda máxima e mês a mês.", href: "/simulador" },
  { icon: "🌐", title: "Panorama diário", text: "Resumo executivo por regras: BTC, ciclo, Medo & Ganância, derivativos (funding, OI, long/short) e manchetes.", href: "/panorama" },
];

export default function HomePage() {
  return (
    <PageShell>
      <section className="grid items-center gap-8 py-6 lg:grid-cols-2 lg:py-10">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-success live-dot" /> Dados públicos em tempo real · Binance / Kraken
          </span>
          <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight sm:text-5xl">
            Analise Bitcoin & Crypto com <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">agentes de IA</span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            Scanner de padrões gráficos, indicadores calculados programaticamente e um sistema multiagente que consolida análise técnica, tendência, risco e sentimento — sem promessas de resultado.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/scanner" className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              📊 Abrir o Scanner
            </Link>
            <Link href="/agentes" className="inline-flex h-11 items-center rounded-md border border-border bg-card px-6 text-sm font-semibold hover:bg-muted">
              🤖 Criar um agente
            </Link>
          </div>
        </div>
        <HomeMarket />
      </section>

      <section className="py-6">
        <h2 className="text-xl font-bold">Tudo que você precisa para analisar melhor</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Link key={f.title} href={f.href}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="p-4">
                  <div className="text-2xl">{f.icon}</div>
                  <div className="mt-2 font-semibold">{f.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="py-6">
        <TopVolume />
      </section>

      <section className="py-6">
        <Card>
          <CardContent className="p-4 text-xs text-muted-foreground">{DISCLAIMER_TEXT}</CardContent>
        </Card>
      </section>
    </PageShell>
  );
}

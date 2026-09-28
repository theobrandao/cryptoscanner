import Link from "next/link";
import { DISCLAIMER_TEXT, FOOTER_LINKS } from "@/components/layout/nav-config";

export function Footer() {
  return (
    <footer className="mt-10 border-t border-border">
      <div className="mx-auto max-w-[1400px] px-4 py-6 text-sm text-muted-foreground">
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Rodapé">
          {FOOTER_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="mt-4 max-w-4xl text-xs leading-relaxed">{DISCLAIMER_TEXT}</p>
        <p className="mt-2 text-xs">
          Dados de mercado: Binance e Kraken (públicos). Câmbio e capitalização: CoinGecko. Sentimento: alternative.me e feeds RSS públicos. Implementação independente (clean-room).
        </p>
      </div>
    </footer>
  );
}

import { Activity, Bell, Bot, Shield, Star, Workflow, type LucideIcon } from "lucide-react";

export interface SavedCounts {
  monitors: number;
  strategies: number;
  favorites: number;
  agents: number;
  sentinels: number;
  alerts: number;
}

const ITEMS: Array<{ key: keyof SavedCounts; icon: LucideIcon; one: string; many: string }> = [
  { key: "agents", icon: Bot, one: "agente", many: "agentes" },
  { key: "sentinels", icon: Shield, one: "Sentinela", many: "Sentinelas" },
  { key: "monitors", icon: Activity, one: "monitor", many: "monitores" },
  { key: "strategies", icon: Workflow, one: "estratégia", many: "estratégias" },
  { key: "favorites", icon: Star, one: "ativo favorito", many: "ativos favoritos" },
  { key: "alerts", icon: Bell, one: "alerta de preço", many: "alertas de preço" },
];

/** O que ficou salvo na conta, com as contagens reais (GET /api/billing/subscription?saved=1). Só lista o que existe. */
export function SavedSummary({ saved }: { saved: SavedCounts | null | undefined }) {
  const items = saved ? ITEMS.filter((i) => saved[i.key] > 0) : [];
  return (
    <div className="mt-3 w-full border-t border-border pt-3">
      <div className="text-sm font-semibold">O que continua salvo na sua conta</div>
      {items.length ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          {items.map(({ key, icon: Icon, one, many }) => (
            <li key={key} className="inline-flex items-center gap-1.5">
              <Icon className="h-4 w-4 text-primary" aria-hidden />
              <span className="tabular font-semibold">{saved![key]}</span> {saved![key] === 1 ? one : many}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Sua conta e suas preferências continuam salvas.</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Tudo fica na mesma conta para quando você assinar.</p>
    </div>
  );
}

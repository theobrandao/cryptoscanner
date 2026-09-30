import * as React from "react";
import { BellRing, CircleCheck, CreditCard, Download, EllipsisVertical, Monitor, Rocket, Search, Send, Settings, Share, Smartphone, SquarePlus, Star, UserRound } from "lucide-react";
import { toolIconComponent } from "@/components/layout/tool-icon";
import type { TutorialIcon } from "@/lib/content/tutorials";
import type { ToolIcon } from "@/lib/tools";

type IconComponent = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

/** Ícones próprios da ajuda; os demais vêm do mapa das ferramentas (components/layout/tool-icon.tsx). */
const EXTRA: Partial<Record<TutorialIcon, IconComponent>> = {
  rocket: Rocket,
  download: Download,
  bell: BellRing,
  send: Send,
  user: UserRound,
  settings: Settings,
  monitor: Monitor,
  smartphone: Smartphone,
  share: Share,
  plus: SquarePlus,
  menu: EllipsisVertical,
  check: CircleCheck,
  search: Search,
  star: Star,
  creditcard: CreditCard,
};

/** Todas as chaves de ToolIcon (o Record obriga a listar um ícone novo de lib/tools.ts aqui). */
const TOOL_ICON_KEYS: Record<ToolIcon, true> = { home: true, book: true, globe: true, bubbles: true, radar: true, bot: true, shield: true, candles: true, ruler: true, wallet: true, calculator: true, signal: true, workflow: true, activity: true, flask: true, gauge: true, target: true, chart: true, percent: true, sparkles: true };
const TOOL_ICONS = Object.keys(TOOL_ICON_KEYS) as ToolIcon[];

/** Mapa completo, montado uma vez no carregamento do módulo. */
const MAP = { ...Object.fromEntries(TOOL_ICONS.map((k) => [k, toolIconComponent(k) as IconComponent])), ...EXTRA } as Record<TutorialIcon, IconComponent>;

export function TutorialIconView({ icon, className }: { icon: TutorialIcon; className?: string }) {
  const I = MAP[icon];
  return <I className={className} aria-hidden />;
}

import type * as React from "react";
import { Activity, Bell, Briefcase, CandlestickChart, GraduationCap, HelpCircle, Settings } from "lucide-react";
import { toolIconComponent } from "@/components/layout/tool-icon";
import { ADVANCED_TOOLS, MAIN_TOOLS, type Tool } from "@/lib/tools";

/** Links do menu do produto (lib/tools.ts), compartilhados pela barra lateral e pela busca global. */
export type NavLink = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; match?: string[]; exact?: boolean; badge?: string; category?: string };

const fromTool = (t: Tool): NavLink => ({ href: t.href, label: t.name, icon: toolIconComponent(t.icon), match: t.match, exact: t.exact, badge: t.badge, category: t.category });

/** Menu principal: uma ferramenta por finalidade (lib/tools.ts). */
export const PRIMARY_NAV: NavLink[] = MAIN_TOOLS.map(fromTool);

/** Grupo recolhido "Avançado": análise profunda. */
export const ADVANCED_NAV: NavLink[] = ADVANCED_TOOLS.map(fromTool);

export const FOOT_NAV: NavLink[] = [
  { href: "/planos", label: "Planos", icon: Briefcase },
  { href: "/ajuda", label: "Tutoriais", icon: GraduationCap },
  { href: "/suporte", label: "Suporte", icon: HelpCircle },
  { href: "/preferencias", label: "Preferências", icon: Settings },
];

/** Páginas fora do menu, acessíveis pela busca global. */
export const EXTRA_PAGES: NavLink[] = [
  { href: "/terminal", label: "Terminal", icon: CandlestickChart },
  { href: "/carteira?tab=alerts", label: "Alertas de preço", icon: Bell },
  { href: "/status", label: "Estado do sistema", icon: Activity },
];

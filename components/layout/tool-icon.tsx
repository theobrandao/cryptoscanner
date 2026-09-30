import * as React from "react";
import {
  Activity,
  BookOpen,
  Bot,
  Briefcase,
  Calculator,
  CandlestickChart,
  ChartNoAxesCombined,
  CircleDot,
  FlaskConical,
  Gauge,
  Globe2,
  Home,
  Percent,
  Radar,
  Ruler,
  ShieldCheck,
  Signal,
  Sparkles,
  Target,
  Workflow,
} from "lucide-react";
import type { ToolIcon } from "@/lib/tools";

const MAP: Record<ToolIcon, React.ComponentType<{ className?: string }>> = {
  home: Home,
  book: BookOpen,
  globe: Globe2,
  bubbles: CircleDot,
  radar: Radar,
  bot: Bot,
  shield: ShieldCheck,
  candles: CandlestickChart,
  ruler: Ruler,
  wallet: Briefcase,
  calculator: Calculator,
  signal: Signal,
  workflow: Workflow,
  activity: Activity,
  flask: FlaskConical,
  gauge: Gauge,
  target: Target,
  chart: ChartNoAxesCombined,
  percent: Percent,
  sparkles: Sparkles,
};

export function ToolIconView({ icon, className }: { icon: ToolIcon; className?: string }) {
  const I = MAP[icon];
  return <I className={className} />;
}

export const toolIconComponent = (icon: ToolIcon) => MAP[icon];

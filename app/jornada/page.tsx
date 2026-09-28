import type { Metadata } from "next";
import { JourneyView } from "@/components/learning/journey-view";

export const metadata: Metadata = { title: "Jornada Trader", description: "12 aulas autorais: do Bitcoin à automação com agentes, com teste e prática no app." };

export default function JourneyPage() {
  return <JourneyView />;
}

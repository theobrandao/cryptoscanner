import type { Metadata } from "next";
import { JourneyView } from "@/components/learning/journey-view";

export const metadata: Metadata = { title: "Jornada Trader", description: "Curso gratuito de cripto sem cadastro: 12 aulas ilustradas do Bitcoin à gestão de risco, com exercícios interativos e teste rápido.", alternates: { canonical: "/jornada" } };

export default function JourneyPage() {
  return <JourneyView />;
}

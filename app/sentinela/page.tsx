import type { Metadata } from "next";
import { SentinelView } from "@/components/agents/sentinel-view";

export const metadata: Metadata = { title: "Agente Sentinela", description: "Vigia multipadrão por moeda, 24/7 no servidor, com plano de trade e confluência técnica." };

export default function SentinelPage() {
  return <SentinelView />;
}

import type { Metadata } from "next";
import { MentorView } from "@/components/learning/mentor-view";

export const metadata: Metadata = { title: "Mentor", description: "Assistente com dados reais do mercado, glossário de padrões e protocolos de mindset." };

export default function MentorPage() {
  return <MentorView />;
}

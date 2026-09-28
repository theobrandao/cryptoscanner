import type { Metadata } from "next";
import { PlansView } from "@/components/account/plans-view";

export const metadata: Metadata = { title: "Planos" };
export default function Page() {
  return <PlansView />;
}

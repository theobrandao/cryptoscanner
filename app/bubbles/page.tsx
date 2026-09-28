import type { Metadata } from "next";
import { BubblesView } from "@/components/market/bubbles-view";

export const metadata: Metadata = { title: "Bubbles" };
export default function Page() {
  return <BubblesView />;
}

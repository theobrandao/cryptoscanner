import type { Metadata } from "next";
import { PanoramaView } from "@/components/market/panorama-view";

export const metadata: Metadata = { title: "Panorama Diário" };
export default function Page() {
  return <PanoramaView />;
}

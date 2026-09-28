import type { Metadata } from "next";
import { PreferencesView } from "@/components/account/preferences-view";

export const metadata: Metadata = { title: "Preferências" };
export default function Page() {
  return <PreferencesView />;
}

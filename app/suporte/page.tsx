import type { Metadata } from "next";
import { SupportForm } from "@/components/account/support-form";

export const metadata: Metadata = { title: "Suporte" };
export default function Page() {
  return <SupportForm />;
}

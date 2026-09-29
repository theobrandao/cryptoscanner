import type { Metadata } from "next";
import { Suspense } from "react";
import { MonitorView } from "@/components/monitor/monitor-view";

export const metadata: Metadata = { title: "Market Monitor — CryptoScanner", description: "Monitores de setup e estratégia avaliados no servidor, com notificação in-app, push e Telegram." };

export default function MonitorPage() {
  return (
    <Suspense>
      <MonitorView />
    </Suspense>
  );
}

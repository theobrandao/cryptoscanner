"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Landing, type LandingData } from "@/components/marketing/landing";
import { useSession } from "@/hooks/use-session";

/**
 * Início do visitante (página estática servida em "/" pelo proxy quando não há cookie de sessão).
 * Se a sessão aparecer aqui (ex.: login feito e a versão de visitante ainda guardada pelo roteador),
 * pede a "/" de novo ao servidor, que agora entrega a Início do usuário.
 */
export function VisitorHome({ landing }: { landing: LandingData }) {
  const { user } = useSession();
  const router = useRouter();
  const refreshed = React.useRef(false);
  React.useEffect(() => {
    if (!user || refreshed.current) return;
    refreshed.current = true;
    router.refresh();
  }, [user, router]);
  return <Landing content={landing} />;
}

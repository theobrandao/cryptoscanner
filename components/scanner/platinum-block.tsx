"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Gem, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAccess } from "@/components/account/access-gate";
import { ELITE_DIFFERENTIALS, formatBRL } from "@/lib/plans-copy";
import { ELITE_BORDER, ELITE_CTA, ELITE_TEXT, EliteBadge } from "@/components/account/plan-tier";
import { cn } from "@/lib/utils";

/** Preço do ELITE da conta (PRICE_ELITE_BRL via /api/billing/subscription); espaço reservado enquanto carrega. */
function ElitePrice({ className }: { className?: string }) {
  const { access } = useAccess();
  const price = access?.billing.prices.ELITE;
  return (
    <p className={className ?? "min-h-5 text-sm font-semibold tabular"}>
      {price != null ? `${formatBRL(price)}/mês, sem teste grátis. Cancele quando quiser.` : ""}
    </p>
  );
}

/** Bloco "Recursos do plano ELITE" (chave interna PLATINUM) + modal de upgrade. Benefícios: só o que o ELITE tem a mais que o PRO (lib/plans-copy). */
export function PlatinumBlock({ currentPlan }: { currentPlan: string }) {
  const router = useRouter();
  if (currentPlan === "PLATINUM") return null;
  return (
    <Card className={ELITE_BORDER}>
      <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold">
            <Gem className={cn("h-4 w-4", ELITE_TEXT)} aria-hidden /> Recursos do
            plano <EliteBadge />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <Lock className="mr-1 inline h-3 w-3" aria-hidden /> Os timeframes
            1H, 30M e 15M são do plano ELITE.
          </p>
          <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            {ELITE_DIFFERENTIALS.map((b) => (
              <li key={b} className="flex items-center gap-1.5">
                <Check
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />{" "}
                {b}
              </li>
            ))}
          </ul>
          <ElitePrice className="mt-3 min-h-5 text-sm font-semibold tabular" />
        </div>
        <Button
          size="lg"
          variant="elite"
          className="shrink-0"
          onClick={() => router.push("/planos")}
        >
          <Gem className="h-4 w-4" aria-hidden /> Ver plano ELITE{" "}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </CardContent>
    </Card>
  );
}

export function UpgradeDialog({
  open,
  onOpenChange,
  feature,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  feature: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gem className={cn("h-4 w-4", ELITE_TEXT)} aria-hidden /> Recurso do plano
            ELITE
          </DialogTitle>
          <DialogDescription>{feature}</DialogDescription>
        </DialogHeader>
        <p className="text-sm font-medium">O que o ELITE tem a mais que o PRO:</p>
        <ul className="grid gap-1 text-sm">
          {ELITE_DIFFERENTIALS.map((b) => (
            <li key={b} className="flex items-center gap-1.5">
              <Check
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />{" "}
              {b}
            </li>
          ))}
        </ul>
        <ElitePrice />
        <DialogFooter className="flex-wrap">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Continuar com meu plano atual
          </Button>
          <Link
            href="/planos"
            className={cn("inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium", ELITE_CTA)}
          >
            <Gem className="h-4 w-4" aria-hidden /> Ver plano ELITE{" "}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

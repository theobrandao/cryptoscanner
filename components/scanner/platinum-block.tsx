"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gem, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PLANS } from "@/lib/plans";

/** Bloco "Recursos Plano PLATINUM" + modal de upgrade (comportamento observado na referência). */
export function PlatinumBlock({ currentPlan }: { currentPlan: string }) {
  const router = useRouter();
  if (currentPlan === "PLATINUM") return null;
  return (
    <Card className="border-accent/40 bg-gradient-to-br from-accent/10 via-card to-primary/10">
      <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold">
            <Gem className="h-4 w-4 text-accent" /> Recursos Plano PLATINUM
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <Lock className="mr-1 inline h-3 w-3" /> Os timeframes 1H, 30M e 15M são exclusivos do plano PLATINUM.
          </p>
          <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            {PLANS.PLATINUM.benefits.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
        <Button size="lg" className="shrink-0" onClick={() => router.push("/planos")}>
          💎 Ver Plano PLATINUM →
        </Button>
      </CardContent>
    </Card>
  );
}

export function UpgradeDialog({ open, onOpenChange, feature }: { open: boolean; onOpenChange: (o: boolean) => void; feature: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>💎 Recurso do plano PLATINUM</DialogTitle>
          <DialogDescription>{feature}</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1 text-sm">
          {PLANS.PLATINUM.benefits.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Continuar com meu plano atual
          </Button>
          <Link href="/planos" className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            💎 Ver Plano PLATINUM →
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

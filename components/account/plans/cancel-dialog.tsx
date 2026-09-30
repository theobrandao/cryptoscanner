"use client";

import * as React from "react";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/providers/toast-provider";
import { trackClient } from "@/lib/analytics-client";
import { ApiClientError, postJson } from "@/lib/client-api";
import { CANCEL_REASON_LABELS, SUPPORT_PATHS } from "@/lib/plans-copy";

type ReasonKey = (typeof CANCEL_REASON_LABELS)[number]["key"];

const dateBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

/**
 * Confirmação do cancelamento da renovação: diz o que a pessoa mantém e até quando, pergunta o motivo (opcional,
 * evento cancel_reason). Assinatura da Kiwify: o cancelamento é pedido ao suporte com o assunto preenchido.
 */
export function CancelDialog({ plan, provider, currentPeriodEnd, onCancelled }: { plan: string; provider: string | null; currentPeriodEnd: string | null; onCancelled: () => void | Promise<unknown> }) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<ReasonKey | null>(null);
  const [busy, setBusy] = React.useState(false);
  const kiwify = provider === "kiwify";
  const until = currentPeriodEnd ? dateBR(currentPeriodEnd) : null;

  const sendReason = () => {
    if (reason) trackClient("cancel_reason", { reason, plan, provider: provider ?? "desconhecido" });
  };
  const confirm = async () => {
    setBusy(true);
    try {
      await postJson("/api/billing/cancel", {});
      sendReason();
      await onCancelled();
      setOpen(false);
      toast({ title: until ? `Renovação cancelada. Seu acesso continua até ${until}.` : "Renovação cancelada. O acesso continua até o fim do período pago.", variant: "success" });
    } catch (err) {
      toast({ title: "Não foi possível cancelar agora", description: err instanceof ApiClientError ? err.message : "Tente novamente em instantes.", variant: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="cursor-pointer h-9 rounded-md border border-border px-3 text-xs hover:bg-muted sm:ml-auto">
        Cancelar renovação
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar a renovação do {plan}?</DialogTitle>
            <DialogDescription>{until ? `Você mantém o acesso ao ${plan} até ${until}. Não há nova cobrança depois disso.` : `Você mantém o acesso ao ${plan} até o fim do período pago. Não há nova cobrança depois disso.`}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Depois dessa data as ferramentas ficam pausadas. Sua conta, favoritos, estratégias, monitores e agentes continuam salvos para quando você voltar.</p>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-sm font-semibold">
              Por que você quer cancelar? <span className="font-normal text-muted-foreground">(opcional)</span>
            </legend>
            {CANCEL_REASON_LABELS.map((r) => (
              <label key={r.key} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5">
                <input type="radio" name="cancel-reason" value={r.key} checked={reason === r.key} onChange={() => setReason(r.key)} className="accent-primary" />
                {r.label}
              </label>
            ))}
          </fieldset>
          {kiwify ? <p className="text-xs text-muted-foreground">Assinaturas compradas na Kiwify são canceladas pelo suporte. O assunto do chamado já vai preenchido.</p> : null}
          <DialogFooter className="flex-wrap">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Manter assinatura
            </Button>
            {kiwify ? (
              <Link href={SUPPORT_PATHS.cancel} onClick={sendReason} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted">
                <LifeBuoy className="h-4 w-4" aria-hidden /> Pedir cancelamento ao suporte
              </Link>
            ) : (
              <Button variant="outline" onClick={() => void confirm()} disabled={busy}>
                {busy ? "Cancelando…" : "Cancelar renovação"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

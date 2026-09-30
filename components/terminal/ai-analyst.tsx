"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bot, Maximize2 } from "lucide-react";
import { AnalystChat } from "@/components/analyst/analyst-chat";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { trackClient } from "@/lib/analytics-client";

/** Botão da barra superior que abre o Analista IA em painel lateral (a página /analista tem a versão ampla). */
export function AiAnalystButton({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          trackClient("analyst_open");
        }}
        className={cn("inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:border-primary/50 hover:bg-muted", className)}
        aria-label="Analista IA"
      >
        <Bot className="h-4 w-4 text-primary" />
        <span className="hidden md:inline">Analista IA</span>
      </button>
      <AiAnalystPanel open={open} onOpenChange={setOpen} />
    </>
  );
}

export function AiAnalystPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-auto right-0 top-0 flex h-full max-h-screen w-full max-w-[460px] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-l p-0 sm:rounded-none">
        <DialogHeader className="border-b border-border px-4 py-3 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" /> Analista IA
            <button
              onClick={() => {
                onOpenChange(false);
                router.push("/analista");
              }}
              className="ml-auto mr-6 inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Abrir em tela cheia"
            >
              <Maximize2 className="h-3.5 w-3.5" /> Tela cheia
            </button>
          </DialogTitle>
          <DialogDescription className="text-xs">Consulta as ferramentas do app e responde só com os números delas.</DialogDescription>
        </DialogHeader>
        <AnalystChat compact onNavigate={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

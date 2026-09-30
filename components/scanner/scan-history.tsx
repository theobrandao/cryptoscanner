"use client";

import * as React from "react";
import useSWR from "swr";
import { ClipboardList, Trash2 } from "lucide-react";
import { DirectionBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSession } from "@/hooks/use-session";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { apiFetch } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import { ConfidenceBar } from "@/components/scanner/confidence-bar";

export interface HistoryEntry {
  id: string;
  symbol: string;
  timeframe: string;
  kind: string;
  title: string;
  direction: string;
  confidence: number | null;
  createdAt: string | number;
}

const LOCAL_KEY = "cs-scan-history";
const LOCAL_MAX = 100;

/** Persiste localmente para visitantes; usuários logados leem do banco (gravado pelo endpoint de scan). */
export function useLocalHistory() {
  const [items, setItems] = useLocalStorage<HistoryEntry[]>(LOCAL_KEY, []);
  const push = React.useCallback(
    (entries: Omit<HistoryEntry, "id" | "createdAt">[]) => {
      if (entries.length === 0) return;
      const now = Date.now();
      setItems((prev) =>
        [
          ...entries.map((e, i) => ({
            ...e,
            id: `${now}-${i}`,
            createdAt: now,
          })),
          ...prev,
        ].slice(0, LOCAL_MAX),
      );
    },
    [setItems],
  );
  const clear = React.useCallback(() => setItems([]), [setItems]);
  return { items, push, clear };
}

export function ScanHistory({
  localItems,
  onClearLocal,
  refreshKey,
}: {
  localItems: HistoryEntry[];
  onClearLocal: () => void;
  refreshKey: number;
}) {
  const { user } = useSession();
  const { data, isLoading, mutate } = useSWR<{ items: HistoryEntry[] }>(
    user ? `/api/scanner/history?limit=100&k=${refreshKey}` : null,
  );
  const items = user ? (data?.items ?? []) : localItems;

  const clear = async () => {
    if (user) {
      await apiFetch("/api/scanner/history", { method: "DELETE" });
      await mutate();
    } else onClearLocal();
  };

  if (user && isLoading && !data) return <Skeleton className="h-32 w-full" />;
  if (items.length === 0)
    return (
      <EmptyState
        icon={
          <ClipboardList
            className="h-8 w-8 text-muted-foreground"
            aria-hidden
          />
        }
        title="Escaneie para detectar padrões"
        description={
          user
            ? "Os padrões e alertas de volume de cada scan ficam registrados aqui na sua conta."
            : "Sem login, o histórico fica salvo apenas neste navegador."
        }
      />
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {items.length} registro(s) ·{" "}
          {user ? "sincronizado com a conta" : "somente neste navegador"}
        </span>
        <Button size="sm" variant="ghost" onClick={() => void clear()}>
          <Trash2 className="h-3.5 w-3.5" /> Limpar
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quando</TableHead>
            <TableHead>Ativo</TableHead>
            <TableHead>TF</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Evento</TableHead>
            <TableHead>Direção</TableHead>
            <TableHead className="text-right">Confiança</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((h) => (
            <TableRow key={h.id} className="h-11">
              <TableCell className="text-xs text-muted-foreground">
                {formatDateTime(h.createdAt)}
              </TableCell>
              <TableCell className="font-semibold">{h.symbol}</TableCell>
              <TableCell>
                <Badge variant="muted">
                  {h.timeframe.toUpperCase().replace("1W", "7D")}
                </Badge>
              </TableCell>
              <TableCell className="text-xs">
                {h.kind === "pattern"
                  ? "Padrão"
                  : h.kind === "volume"
                    ? "Volume"
                    : "Alerta"}
              </TableCell>
              <TableCell className="whitespace-normal text-sm">
                {h.title}
              </TableCell>
              <TableCell>
                <DirectionBadge direction={h.direction} />
              </TableCell>
              <TableCell className="text-right">
                {h.confidence != null ? <ConfidenceBar value={h.confidence} /> : <span className="text-xs text-muted-foreground">—</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

"use client";

import * as React from "react";
import useSWR from "swr";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { describeAudit } from "@/components/admin/admin-users";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState, Skeleton } from "@/components/ui/misc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACTION_LABEL } from "@/lib/admin-users";
import { formatDateTime } from "@/lib/format";

interface AuditResponse {
  rows: Array<{ id: string; adminEmail: string; targetEmail: string; targetUserId: string | null; action: string; details: Record<string, unknown> | null; createdAt: string }>;
  total: number;
  page: number;
  pages: number;
}

/** Registro de ações do administrador (quem fez o quê, em qual conta e quando). */
export function AdminAuditTab() {
  const [page, setPage] = React.useState(1);
  const { data, error, isLoading } = useSWR<AuditResponse>(`/api/admin/audit?page=${page}`, { keepPreviousData: true });
  if (error) return <Alert variant="danger">{(error as Error).message}</Alert>;
  if (!data && isLoading)
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  if (!data || data.total === 0) return <EmptyState title="Nenhuma ação registrada ainda" description="Cada acesso liberado, bloqueio ou exclusão feito no Painel de controle aparece aqui." />;
  return (
    <div className="flex flex-col gap-3">
      <div className="hidden rounded-lg border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data e hora</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-[12.5px] text-muted-foreground">{formatDateTime(r.createdAt)}</TableCell>
                <TableCell className="text-[12.5px]">{r.adminEmail}</TableCell>
                <TableCell className="text-[12.5px] font-medium">{ACTION_LABEL[r.action] ?? r.action}</TableCell>
                <TableCell className="text-[12.5px]">{r.targetEmail}</TableCell>
                <TableCell className="max-w-[360px] truncate whitespace-normal text-[12px] text-muted-foreground">{describeAudit(r) || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {data.rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-border bg-card p-3 text-[12.5px]">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{ACTION_LABEL[r.action] ?? r.action}</span>
              <span className="shrink-0 text-muted-foreground">{formatDateTime(r.createdAt)}</span>
            </div>
            <div className="truncate">{r.targetEmail}</div>
            <div className="text-[11.5px] text-muted-foreground">
              por {r.adminEmail}
              {describeAudit(r) ? ` · ${describeAudit(r)}` : ""}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
        <span>
          {data.total} {data.total === 1 ? "ação" : "ações"} · página {data.page} de {data.pages}
        </span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} aria-label="Página anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)} aria-label="Próxima página">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

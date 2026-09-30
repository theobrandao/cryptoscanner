"use client";

import useSWR from "swr";
import { Activity } from "lucide-react";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/format";
import type { QualityReport } from "@/services/data-quality-service";
import type { SystemStatus } from "@/services/status-service";

const JOB_LABEL: Record<string, string> = {
  cycle: "Ciclo (scan, agentes, alertas, sinais)",
  whales: "Baleias on-chain",
  backtest: "Backtest diário dos padrões",
};
const STATE: Record<
  string,
  { label: string; variant: "success" | "warning" | "danger" | "muted" }
> = {
  ok: { label: "OK", variant: "success" },
  late: { label: "Atrasado", variant: "warning" },
  failing: { label: "Falhando", variant: "danger" },
  never: { label: "Sem execução", variant: "muted" },
};

function ago(ts: number | null): string {
  if (!ts) return "—";
  const m = Math.round((Date.now() - ts) / 60_000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
}

export function StatusView() {
  const { data, error } = useSWR<SystemStatus>("/api/status", {
    refreshInterval: 60_000,
  });
  return (
    <PageShell>
      <PageTitle
        icon={<Activity className="h-5 w-5" />}
        title="Status do sistema"
        description="Atualiza a cada 60 s. Falhas repetidas em uma rotina alertam a equipe automaticamente."
      />
      {error ? (
        <Alert variant="danger">Falha ao consultar o status.</Alert>
      ) : null}
      {!data ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="flex flex-col gap-4">
          <Alert
            variant={
              data.overall === "ok"
                ? "success"
                : data.overall === "degraded"
                  ? "warning"
                  : "danger"
            }
            title={
              data.overall === "ok"
                ? "Todos os sistemas operando"
                : data.overall === "degraded"
                  ? "Operação degradada"
                  : "Fora do ar"
            }
          >
            Verificado em {formatDateTime(data.checkedAt)}.
          </Alert>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rotinas automáticas</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.jobs.map((j) => (
                <div
                  key={j.job}
                  className="rounded-md border border-border p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {JOB_LABEL[j.job] ?? j.job}
                    </span>
                    <Badge variant={STATE[j.state]?.variant ?? "muted"}>
                      {STATE[j.state]?.label ?? j.state}
                    </Badge>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                    <dt>Última execução</dt>
                    <dd className="text-right text-foreground">
                      {ago(j.lastRunAt)}
                    </dd>
                    <dt>Último sucesso</dt>
                    <dd className="text-right text-foreground">
                      {ago(j.lastOkAt)}
                    </dd>
                    <dt>Duração</dt>
                    <dd className="text-right tabular text-foreground">
                      {j.lastDurationMs != null
                        ? `${(j.lastDurationMs / 1000).toFixed(1)} s`
                        : "—"}
                    </dd>
                    <dt>Sucesso 24 h</dt>
                    <dd className="text-right tabular text-foreground">
                      {j.okRate24h != null
                        ? `${Math.round(j.okRate24h * 100)}% de ${j.runs24h}`
                        : "—"}
                    </dd>
                    <dt>Esperado</dt>
                    <dd className="text-right text-foreground">
                      {j.expectedEveryMin >= 60
                        ? `a cada ${j.expectedEveryMin / 60} h`
                        : `a cada ${j.expectedEveryMin} min`}
                    </dd>
                  </dl>
                </div>
              ))}
            </CardContent>
          </Card>
          <DataQualityCard />
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Fontes de dados de mercado
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {data.providers.map((p) => (
                  <div
                    key={p.provider}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="capitalize">{p.provider}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {p.latencyMs != null ? `${p.latencyMs} ms` : ""}
                      <Badge variant={p.ok ? "success" : "danger"}>
                        {p.ok ? "OK" : (p.error ?? "erro").slice(0, 40)}
                      </Badge>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Serviços</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <Row label="Banco de dados" ok={data.database.ok} />
                <Row
                  label="Cache de dados"
                  ok={data.cache !== "memory"}
                  okText="OK"
                  failText="limitado"
                />
                <Row
                  label="Notificações push"
                  ok={data.integrations.push}
                  okText="disponível"
                  failText="indisponível"
                />
                <Row
                  label="Telegram"
                  ok={data.integrations.telegram}
                  okText="disponível"
                  failText="indisponível"
                />
                <Row
                  label="Análise por IA"
                  ok={data.integrations.llm}
                  okText="disponível"
                  failText="somente dados de mercado"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </PageShell>
  );
}

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "danger" | "muted"
> = {
  LIVE: "success",
  FALLBACK: "muted",
  DEGRADED: "warning",
  DELAYED: "warning",
  OFFLINE: "danger",
};

function DataQualityCard() {
  const { data } = useSWR<QualityReport>("/api/market/quality?timeframe=4h", {
    refreshInterval: 120_000,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Qualidade dos dados (4H, 30 ativos)
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {!data ? (
          <Skeleton className="h-16" />
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {(
                Object.keys(data.counts) as Array<keyof QualityReport["counts"]>
              ).map((k) => (
                <Badge key={k} variant={STATUS_VARIANT[k] ?? "muted"}>
                  {k} {data.counts[k]}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Divergência Binance × Kraken:{" "}
              {data.divergence
                ? `${data.divergence.rows.length} ativos comparados · máx. ${data.divergence.maxAbsPct?.toFixed(2) ?? "—"}% · ${data.divergence.discrepancies} acima de ${data.divergence.thresholdPct}%`
                : "indisponível"}
              . Sinais usam apenas candles fechados.
            </p>
            {data.assets.filter((a) => a.quality?.status !== "LIVE").length ? (
              <ul className="flex flex-col gap-1 text-xs">
                {data.assets
                  .filter((a) => a.quality?.status !== "LIVE")
                  .map((a) => (
                    <li
                      key={a.symbol}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span className="font-semibold">{a.symbol}</span>
                      <Badge
                        variant={
                          STATUS_VARIANT[a.quality?.status ?? "OFFLINE"] ??
                          "muted"
                        }
                      >
                        {a.quality?.status ?? "OFFLINE"}
                      </Badge>
                      <span className="text-muted-foreground">
                        {a.error ?? a.quality?.issues.join(" · ")}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  ok,
  okText = "OK",
  failText = "falha",
}: {
  label: string;
  ok: boolean;
  okText?: string;
  failText?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <Badge variant={ok ? "success" : "warning"}>
        {ok ? okText : failText}
      </Badge>
    </div>
  );
}

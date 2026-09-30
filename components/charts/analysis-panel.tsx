"use client";

import * as React from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import type { OrchestratorResult } from "@/agents/orchestrator";
import { Badge, DirectionBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/misc";
import { Hint } from "@/components/ui/tooltip";
import { ApiClientError, apiFetch } from "@/lib/client-api";
import { RISK_LABEL, formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConfidenceBar } from "@/components/scanner/confidence-bar";
import type { Timeframe } from "@/types/market";

type Result = OrchestratorResult & { cached: boolean };

const STEP_LABEL: Record<string, string> = {
  market: "Mercado",
  "technical-analysis": "Técnica",
  trend: "Tendência",
  risk: "Risco",
  sentiment: "Sentimento",
  scanner: "Varredura",
};
const STATUS_LABEL: Record<string, string> = {
  ok: "ok",
  fallback: "parcial",
  error: "falhou",
  skipped: "não executado",
};

/** Painel "Análise consolidada": executa o orquestrador e apresenta evidências, conflitos e dados ausentes. */
export function AnalysisPanel({
  symbol,
  timeframe,
}: {
  symbol: string;
  timeframe: Timeframe;
}) {
  const [result, setResult] = React.useState<Result | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(
    async (refresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch<Result>(
          `/api/analysis?symbol=${symbol}&timeframe=${timeframe}&refresh=${refresh ? 1 : 0}`,
        );
        setResult(res);
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : "Falha ao executar a análise.",
        );
      } finally {
        setLoading(false);
      }
    },
    [symbol, timeframe],
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden /> Análise consolidada
            (agentes)
          </CardTitle>
          <CardDescription>
            Evidências de tendência, técnica, risco e sentimento, com conflitos
            e dados ausentes indicados.
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => void run(Boolean(result))}
          loading={loading}
        >
          {result ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
          )}{" "}
          {result ? "Reexecutar" : "Analisar"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? <Alert variant="danger">{error}</Alert> : null}
        {loading && !result ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}
        {!loading && !result && !error ? (
          <p className="text-sm text-muted-foreground">
            Clique em “Analisar” para executar o pipeline multiagente para{" "}
            {symbol} em {timeframe.toUpperCase()}.
          </p>
        ) : null}
        {result ? <ResultView r={result} /> : null}
      </CardContent>
    </Card>
  );
}

function ResultView({ r }: { r: Result }) {
  const verdictTone =
    r.verdict === "bullish"
      ? "text-success"
      : r.verdict === "bearish"
        ? "text-danger"
        : "text-muted-foreground";
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-4">
        <Box label="Veredito">
          <span className={cn("text-lg font-bold", verdictTone)}>
            {r.verdict === "bullish"
              ? "▲ Alta"
              : r.verdict === "bearish"
                ? "▼ Baixa"
                : "↔ Neutro"}
          </span>
        </Box>
        <Box label="Score / ajustado ao risco">
          <span className="text-lg font-bold tabular">{r.score}</span>{" "}
          <span className="text-sm text-muted-foreground tabular">
            / {r.riskAdjustedScore}
          </span>
        </Box>
        <Box label="Confiança">
          <ConfidenceBar
            value={r.confidence}
            className="mt-1 flex w-full"
            barClassName="w-auto flex-1"
          />
        </Box>
        <Box label="Risco">
          <Badge
            variant={
              r.riskLevel === "low"
                ? "info"
                : r.riskLevel === "unknown"
                  ? "muted"
                  : "warning"
            }
            className="text-xs"
          >
            {RISK_LABEL[r.riskLevel]}
          </Badge>
          {r.outputs.risk ? (
            <div className="mt-1 text-xs text-muted-foreground">
              ATR {formatNumber(r.outputs.risk.atrPct, 2)}% · stop{" "}
              {formatNumber(r.outputs.risk.suggestedStopPct, 2)}% · liquidez{" "}
              {r.outputs.risk.liquidity.tier}
            </div>
          ) : null}
        </Box>
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Evidências
        </div>
        <ul className="flex flex-col gap-1">
          {r.evidence.map((e, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm"
            >
              <DirectionBadge direction={e.direction} />
              <span className="flex-1 min-w-0">
                <span className="font-medium">
                  {e.agent.replace("-agent", "")}
                </span>{" "}
                <span className="text-muted-foreground">· {e.key}</span>
                <span className="block text-xs text-muted-foreground">
                  {e.detail}
                </span>
              </span>
              <Hint text="peso × confiança">
                <span className="text-xs text-muted-foreground tabular">
                  {e.weight} · {e.confidence}
                </span>
              </Hint>
            </li>
          ))}
        </ul>
      </div>

      {r.conflicts.length ? (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Conflitos detectados
          </div>
          <ul className="flex flex-col gap-1">
            {r.conflicts.map((c) => (
              <li key={c.code} className="flex items-start gap-2 text-sm">
                <Badge
                  variant={
                    c.severity === "high"
                      ? "warning"
                      : c.severity === "medium"
                        ? "outline"
                        : "muted"
                  }
                >
                  {c.severity === "high"
                    ? "alta"
                    : c.severity === "medium"
                      ? "média"
                      : "baixa"}
                </Badge>
                <span>{c.description}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {r.missingData.length ? (
        <Alert variant="warning" title="Dados ausentes ou degradados">
          <ul className="list-disc pl-4">
            {r.missingData.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {r.outputs.sentiment ? (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sentimento (fontes públicas)
          </div>
          <div className="text-sm">
            {r.outputs.sentiment.fearGreed ? (
              <span>
                Medo & Ganância{" "}
                <strong>{r.outputs.sentiment.fearGreed.value}</strong> (
                {r.outputs.sentiment.fearGreed.classificationPt}) ·{" "}
                {r.outputs.sentiment.fearGreed.source} ·{" "}
                {formatDateTime(r.outputs.sentiment.fearGreed.timestamp)}
              </span>
            ) : (
              <span className="text-muted-foreground">
                Índice indisponível.
              </span>
            )}
          </div>
          {r.outputs.sentiment.news.length ? (
            <ul className="mt-1 flex flex-col gap-0.5 text-xs">
              {r.outputs.sentiment.news.slice(0, 5).map((n) => (
                <li key={n.link} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "w-8 text-right tabular",
                      n.score === null
                        ? "text-muted-foreground"
                        : n.score > 0
                          ? "text-success"
                          : n.score < 0
                            ? "text-danger"
                            : "",
                    )}
                  >
                    {n.score === null ? "—" : `${n.score > 0 ? "+" : ""}${n.score.toFixed(1)}`}
                  </span>
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate hover:underline"
                  >
                    {n.title}
                  </a>
                  <span className="shrink-0 text-muted-foreground">
                    {n.source} · {formatDateTime(n.publishedAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Leitura
        </div>
        <p className="text-sm leading-relaxed">
          {r.llmNarrative ?? r.narrative}
        </p>
        {r.llmNarrative ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Narrativa gerada por IA a partir dos números acima (não altera os
            cálculos).
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        {Object.entries(r.agents).map(([name, a]) => (
          <span
            key={name}
            className={cn(
              "rounded border px-1.5 py-0.5",
              a.status === "ok"
                ? "border-info/40"
                : a.status === "fallback"
                  ? "border-warning/40"
                  : "border-danger/40",
            )}
          >
            {STEP_LABEL[name.replace("-agent", "")] ??
              name.replace("-agent", "")}{" "}
            · {STATUS_LABEL[a.status] ?? a.status} · {a.durationMs} ms
          </span>
        ))}
        <span>
          execução {formatDateTime(r.executedAt)}
          {r.cached ? " (cache)" : ""}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">{r.disclaimer}</p>
    </div>
  );
}

function Box({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

"use client";

import { ASSETS } from "@/lib/assets";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Bot, Brain, ImagePlus, Save, Upload, X } from "lucide-react";
import type { ChartImageAnalysis } from "@/services/chart-image-service";
import { Badge, DirectionBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Alert, Progress } from "@/components/ui/misc";
import { useSession } from "@/hooks/use-session";
import { useToast } from "@/components/providers/toast-provider";
import { ApiClientError, apiFetch } from "@/lib/client-api";
import { formatNumber, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

interface HealthInfo {
  llm: { configured: boolean; provider: string };
}

/**
 * Análise de Gráfico por IA (upload). Comportamento observado: JPG/PNG/WebP ≤ 5 MB via arrastar, colar
 * ou selecionar; disponível apenas para usuários autenticados; saída com confiança, pontos operacionais,
 * risco/retorno e insights; botão "Salvar Análise".
 */
export function ChartAnalysis() {
  const { user, plan } = useSession();
  const router = useRouter();
  const { data: health } = useSWR<HealthInfo>("/api/health");
  const { toast } = useToast();
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [symbol, setSymbol] = React.useState("");
  const [timeframe, setTimeframe] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ChartImageAnalysis | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const accept = (f: File | undefined | null) => {
    if (!f) return;
    if (!TYPES.includes(f.type))
      return setError("Formato inválido. Use JPG, PNG ou WebP.");
    if (f.size > MAX) return setError("Imagem acima de 5 MB.");
    setError(null);
    setResult(null);
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return url;
    });
  };

  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith("image/"),
      );
      if (item) accept(item.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const analyze = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (symbol) form.append("symbol", symbol.toUpperCase());
      if (timeframe) form.append("timeframe", timeframe.toLowerCase());
      const res = await apiFetch<ChartImageAnalysis>(
        "/api/analysis/chart-image",
        { method: "POST", body: form },
      );
      setResult(res);
      toast({
        title: "Análise concluída",
        description: res.id
          ? "Salva automaticamente na sua conta."
          : "Banco indisponível: análise não persistida.",
        variant: "success",
      });
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Falha ao analisar a imagem.",
      );
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  };

  return (
    <Card id="analise-ia">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" /> Análise de Gráfico por IA
        </CardTitle>
        <CardDescription>
          Envie a captura de um gráfico e receba uma leitura técnica
          estruturada: padrões, tendência, pontos operacionais e relação
          risco/retorno. Potencial, risco e relação são recalculados
          programaticamente a partir dos níveis lidos; a IA não promete
          resultado.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!user ? (
          <Alert
            variant="info"
            title="A análise de gráficos por Inteligência Artificial está disponível apenas para usuários autenticados"
            action={
              <Button
                size="sm"
                onClick={() => router.push("/login?next=/scanner")}
              >
                Faça login para usar a IA
              </Button>
            }
          >
            Crie uma conta gratuita para analisar até {3} gráficos por dia.
          </Alert>
        ) : null}
        {user && health && !health.llm.configured ? (
          <Alert variant="info" title="Leitura técnica com dados reais">
            A leitura é feita sobre os dados reais do ativo e do timeframe
            informados (preço, padrões, tendência e níveis). A imagem enviada
            fica salva junto com a análise.
          </Alert>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                accept(e.dataTransfer.files[0]);
              }}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
              className={cn(
                "relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-4 text-center transition-colors hover:border-primary/60",
                dragging && "border-primary bg-primary/5",
              )}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="Pré-visualização do gráfico enviado"
                  className="max-h-[320px] w-auto rounded-md object-contain"
                />
              ) : (
                <>
                  <ImagePlus className="h-8 w-8 text-muted-foreground" />
                  <div className="text-sm font-medium">
                    Arraste e solte, cole (Ctrl+V) ou clique para selecionar
                  </div>
                  <div className="text-xs text-muted-foreground">
                    JPG, PNG ou WebP · máximo 5 MB
                  </div>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept={TYPES.join(",")}
                className="hidden"
                onChange={(e) => accept(e.target.files?.[0])}
              />
              {file ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clear();
                  }}
                  className="absolute right-2 top-2 rounded-full bg-background/80 p-1 hover:bg-background cursor-pointer"
                  aria-label="Remover imagem"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <Label>
                  Ativo{" "}
                  {health && !health.llm.configured
                    ? "(obrigatório)"
                    : "(opcional)"}
                </Label>
                <Input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="BTC"
                  maxLength={8}
                  list="chart-assets"
                />
                <datalist id="chart-assets">
                  {ASSETS.map((a) => (
                    <option key={a.symbol} value={a.symbol}>
                      {a.name}
                    </option>
                  ))}
                </datalist>
              </div>
              <div className="flex flex-col gap-1">
                <Label>Timeframe (opcional)</Label>
                <Input
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  placeholder="4h"
                  maxLength={4}
                  list="chart-tfs"
                />
                <datalist id="chart-tfs">
                  {["15m", "30m", "1h", "4h", "1d", "1w"].map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
            </div>
            {error ? <Alert variant="danger">{error}</Alert> : null}
            <div className="flex items-center gap-2">
              <Button
                onClick={() => void analyze()}
                disabled={
                  !file ||
                  !user ||
                  (health ? !health.llm.configured && !symbol : false)
                }
                loading={loading}
              >
                <Upload className="h-4 w-4" />{" "}
                {health && !health.llm.configured
                  ? "Analisar (dados reais)"
                  : "Analisar com IA"}
              </Button>
              {plan ? (
                <span className="text-xs text-muted-foreground">
                  Plano {plan.name}:{" "}
                  {Number.isFinite(plan.imageAnalysesPerDay)
                    ? `${plan.imageAnalysesPerDay} análises/dia`
                    : "análises ilimitadas"}
                </span>
              ) : null}
            </div>
          </div>

          <div>
            {result ? (
              <AnalysisResult result={result} />
            ) : (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-lg border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                <Brain className="h-8 w-8" aria-hidden />
                <div className="mt-2">
                  O resultado aparece aqui: Confiança, Pontos Operacionais
                  (Entrada, Alvo, Stop Loss), Risco/Retorno (Potencial, Risco,
                  Relação) e Insights da IA.
                </div>
              </div>
            )}
          </div>
        </div>
        {user ? (
          <div className="text-xs text-muted-foreground">
            Análises salvas ficam em{" "}
            <Link
              href="/carteira?tab=analises"
              className="text-primary hover:underline"
            >
              Carteira → Análises
            </Link>
            .
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Rótulo de origem da leitura para o usuário (sem nomes internos de provedor/modelo). */
export function analysisSourceLabel(provider: string): string {
  return provider === "deterministic"
    ? "Leitura por dados de mercado"
    : "Leitura por IA com dados de mercado";
}

export function AnalysisResult({ result }: { result: ChartImageAnalysis }) {
  const { points, riskReward } = result;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold">
            {result.asset ?? "Ativo não identificado"}
          </span>
          {result.timeframe ? (
            <Badge variant="muted">{result.timeframe}</Badge>
          ) : null}
          <DirectionBadge direction={result.trend} />
        </div>
        <Badge
          variant={
            result.readability === "good"
              ? "success"
              : result.readability === "partial"
                ? "warning"
                : "danger"
          }
        >
          legibilidade{" "}
          {result.readability === "good"
            ? "boa"
            : result.readability === "partial"
              ? "parcial"
              : "ruim"}
        </Badge>
      </div>
      <div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Confiança</span>
          <span className="font-semibold text-foreground">
            {result.confidence}% confiança
          </span>
        </div>
        <Progress
          value={result.confidence}
          className="mt-1"
          tone={result.confidence >= 70 ? "success" : "warning"}
        />
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Pontos Operacionais
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <Cell
            label="Entrada"
            value={points.entry !== null ? formatNumber(points.entry, 4) : "—"}
          />
          <Cell
            label="Alvo"
            value={
              points.target !== null ? formatNumber(points.target, 4) : "—"
            }
            tone="up"
          />
          <Cell
            label="Stop Loss"
            value={
              points.stopLoss !== null ? formatNumber(points.stopLoss, 4) : "—"
            }
            tone="down"
          />
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Risco/Retorno
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <Cell
            label="Potencial"
            value={formatPct(riskReward.potentialPct)}
            tone="up"
          />
          <Cell
            label="Risco"
            value={
              riskReward.riskPct !== null
                ? formatPct(-Math.abs(riskReward.riskPct))
                : "—"
            }
            tone="down"
          />
          <Cell
            label="Relação"
            value={riskReward.ratio !== null ? `1 : ${riskReward.ratio}` : "—"}
          />
        </div>
      </div>
      {result.patterns.length ? (
        <div className="flex flex-wrap gap-1">
          {result.patterns.map((p) => (
            <Badge key={p} variant="outline">
              {p}
            </Badge>
          ))}
        </div>
      ) : null}
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Insights da IA
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {result.insights.map((i, idx) => (
            <li key={idx}>{i}</li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{analysisSourceLabel(result.provider)}</span>
        <span className="inline-flex items-center gap-1">
          <Save className="h-3 w-3" />{" "}
          {result.id ? "Análise salva" : "Não salva"}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">{result.disclaimer}</p>
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-md bg-muted/50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "font-semibold tabular",
          tone === "up" && "text-success",
          tone === "down" && "text-danger",
        )}
      >
        {value}
      </div>
    </div>
  );
}

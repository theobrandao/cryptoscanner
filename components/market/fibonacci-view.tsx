"use client";

import * as React from "react";
import { Ruler } from "lucide-react";
import useSWR from "swr";
import type { FibResult } from "@/lib/fibonacci";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Alert, Skeleton } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ASSETS } from "@/lib/assets";
import { fibonacciLevels } from "@/lib/fibonacci";
import { formatNumber, formatPct } from "@/lib/format";
import { TIMEFRAME_LABEL } from "@/lib/timeframes";
import { cn } from "@/lib/utils";

interface AutoPayload {
  mode: "auto";
  symbol: string;
  timeframe: string;
  source: string;
  stale: boolean;
  price: number | null;
  result: FibResult | null;
}

export function FibonacciView() {
  const [symbol, setSymbol] = React.useState("BTC");
  const [timeframe, setTimeframe] = React.useState("1d");
  const [lookback, setLookback] = React.useState("60");
  const { data, isLoading, error } = useSWR<AutoPayload>(
    `/api/fibonacci?symbol=${symbol}&timeframe=${timeframe}&lookback=${lookback}`,
  );
  const [high, setHigh] = React.useState("100000");
  const [low, setLow] = React.useState("60000");
  const [direction, setDirection] = React.useState<"up" | "down">("up");
  const manual = React.useMemo(() => {
    const h = Number(high);
    const l = Number(low);
    if (!(h > l) || !(l > 0)) return null;
    return fibonacciLevels(h, l, direction);
  }, [high, low, direction]);

  return (
    <PageShell>
      <PageTitle
        icon={<Ruler className="h-5 w-5" />}
        title="Fibonacci"
        description="Retrações (23,6 % a 78,6 %) e extensões (127,2 % a 261,8 %) calculadas automaticamente a partir do último swing do ativo, ou manualmente a partir de máxima e mínima."
      />
      <Tabs defaultValue="auto">
        <TabsList>
          <TabsTrigger value="auto">Automático (swing do ativo)</TabsTrigger>
          <TabsTrigger value="manual">Calculadora manual</TabsTrigger>
        </TabsList>
        <TabsContent value="auto">
          <Card>
            <CardHeader>
              <CardTitle>Níveis automáticos</CardTitle>
              <CardDescription>
                Máxima e mínima das últimas N barras definem o swing; a direção
                é dada pela ordem em que ocorreram.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <Label>Ativo</Label>
                  <Select value={symbol} onValueChange={setSymbol}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSETS.map((a) => (
                        <SelectItem key={a.symbol} value={a.symbol}>
                          {a.glyph} {a.symbol}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Timeframe</Label>
                  <Select value={timeframe} onValueChange={setTimeframe}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["1h", "4h", "1d", "1w"] as const).map((t) => (
                        <SelectItem key={t} value={t}>
                          {TIMEFRAME_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Barras (lookback)</Label>
                  <Select value={lookback} onValueChange={setLookback}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["30", "60", "90", "120", "200"].map((n) => (
                        <SelectItem key={n} value={n}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {error ? (
                <Alert variant="danger">
                  Erro ao carregar dados. Tente novamente em instantes.
                </Alert>
              ) : isLoading && !data ? (
                <Skeleton className="h-64" />
              ) : data?.result ? (
                <FibTable
                  result={data.result}
                  price={data.price}
                  meta={`${data.symbol} ${TIMEFRAME_LABEL[data.timeframe as keyof typeof TIMEFRAME_LABEL] ?? data.timeframe} · fonte ${data.source}${data.stale ? " (defasado)" : ""}`}
                />
              ) : (
                <Alert variant="warning">
                  Não foi possível determinar um swing válido.
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="manual">
          <Card>
            <CardHeader>
              <CardTitle>Calculadora</CardTitle>
              <CardDescription>
                Informe a máxima, a mínima e a direção do movimento.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <Label>Máxima</Label>
                  <Input
                    inputMode="decimal"
                    value={high}
                    onChange={(e) => setHigh(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Mínima</Label>
                  <Input
                    inputMode="decimal"
                    value={low}
                    onChange={(e) => setLow(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Direção do movimento</Label>
                  <div className="flex gap-1">
                    <Button
                      variant={direction === "up" ? "default" : "outline"}
                      onClick={() => setDirection("up")}
                    >
                      ▲ Alta (mín → máx)
                    </Button>
                    <Button
                      variant={direction === "down" ? "default" : "outline"}
                      onClick={() => setDirection("down")}
                    >
                      ▼ Baixa (máx → mín)
                    </Button>
                  </div>
                </div>
              </div>
              {manual ? (
                <FibTable result={manual} price={null} meta="cálculo manual" />
              ) : (
                <Alert variant="warning">
                  A máxima deve ser maior que a mínima e ambas positivas.
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function FibTable({
  result,
  price,
  meta,
}: {
  result: FibResult;
  price: number | null;
  meta: string;
}) {
  const nearest = price
    ? result.levels.reduce(
        (best, l) =>
          Math.abs(l.price - price) < Math.abs(best.price - price) ? l : best,
        result.levels[0]!,
      )
    : null;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant={result.direction === "up" ? "success" : "danger"}>
          {result.direction === "up" ? "▲ swing de alta" : "▼ swing de baixa"}
        </Badge>
        <span>
          máx {formatNumber(result.high, 4)} · mín {formatNumber(result.low, 4)}{" "}
          · amplitude{" "}
          {formatPct(((result.high - result.low) / result.low) * 100)}
        </span>
        {price ? <span>· preço atual {formatNumber(price, 4)}</span> : null}
        <span>· {meta}</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Nível</TableHead>
            <TableHead className="text-right">Preço</TableHead>
            <TableHead className="text-right">Distância do preço</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.levels.map((l) => {
            const dist = price ? ((l.price - price) / price) * 100 : null;
            const isNear =
              nearest && nearest.ratio === l.ratio && nearest.kind === l.kind;
            return (
              <TableRow
                key={`${l.kind}-${l.ratio}`}
                className={cn(isNear && "bg-primary/10")}
              >
                <TableCell className="text-xs text-muted-foreground">
                  {l.kind === "retracement" ? "Retração" : "Extensão"}
                </TableCell>
                <TableCell
                  className={cn(
                    "font-semibold",
                    [0.382, 0.5, 0.618].includes(l.ratio) && "text-primary",
                  )}
                >
                  {(l.ratio * 100).toFixed(1)}%
                  {isNear ? (
                    <Badge variant="default" className="ml-2">
                      mais próximo
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular">
                  {formatNumber(l.price, 4)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular",
                    dist !== null && dist > 0 && "text-success",
                    dist !== null && dist < 0 && "text-danger",
                  )}
                >
                  {dist !== null ? formatPct(dist) : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

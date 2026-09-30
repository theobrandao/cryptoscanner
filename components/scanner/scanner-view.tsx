"use client";

import * as React from "react";
import {
  ChartColumn,
  ChartLine,
  ClipboardList,
  Puzzle,
  Volume2,
} from "lucide-react";
import useSWR from "swr";
import type { ScannerRow } from "@/agents/scanner-agent";
import type { VolumeAnomaly } from "@/lib/scanner/volume";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { ChartAnalysis } from "@/components/scanner/chart-analysis";
import { PatternLegend } from "@/components/scanner/pattern-legend";
import {
  PatternResults,
  VolumeAlerts,
} from "@/components/scanner/pattern-results";
import {
  PlatinumBlock,
  UpgradeDialog,
} from "@/components/scanner/platinum-block";
import { ProviderBanner } from "@/components/scanner/provider-banner";
import {
  ScanHistory,
  useLocalHistory,
} from "@/components/scanner/scan-history";
import {
  ScannerFilters,
  type ScannerFilterState,
} from "@/components/scanner/scanner-filters";
import { ScannerTable } from "@/components/scanner/scanner-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/hooks/use-session";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useToast } from "@/components/providers/toast-provider";
import { ASSETS } from "@/lib/assets";
import { ApiClientError, postJson } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import { PLANS } from "@/lib/plans";
import { volumeTimeframesFor } from "@/lib/scanner/volume";
import { TIMEFRAME_LABEL } from "@/lib/timeframes";
import type { Timeframe } from "@/types/market";

interface ScanPayload {
  runId: string;
  rows: ScannerRow[];
  volumeAlerts: VolumeAnomaly[];
  scannedAt: number;
  sources: string[];
  staleCount: number;
  errors: Array<{ symbol: string; error: string }>;
  assetsAnalyzed: number;
  cached: boolean;
}

interface VolumePayload {
  alerts: VolumeAnomaly[];
  checkedAt: number;
  stale: boolean;
  sources: string[];
  assets: number;
}

interface FxPayload {
  rate: number;
  stale: boolean;
}

export function ScannerView() {
  const { user, tier } = useSession();
  const plan = PLANS[user?.plan ?? "FREE"];
  const { toast } = useToast();
  const [filters, setFilters] = useLocalStorage<ScannerFilterState>(
    "cs-scanner-filters",
    { timeframe: "4h", direction: "all", symbol: "ALL", minConfidence: 60 },
  );
  const [currency, setCurrency] = useLocalStorage<"USD" | "BRL">(
    "cs-currency",
    "USD",
  );
  const volumeTfs = React.useMemo(() => (tier ? volumeTimeframesFor(tier) : []), [tier]);
  const { data: fx } = useSWR<FxPayload>("/api/market/fx", {
    refreshInterval: 300_000,
  });
  const {
    data: volume,
    isLoading: volumeLoading,
    mutate: refreshVolume,
  } = useSWR<VolumePayload>(
    // só pede os timeframes do plano (30M/1H no ELITE; 4H no teste e no PRO)
    tier ? `/api/scanner/volume?timeframes=${volumeTfs.join(",")}` : null,
    { refreshInterval: 60_000 },
  );

  const [scan, setScan] = React.useState<ScanPayload | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [scanError, setScanError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState("tabela");
  const [upgrade, setUpgrade] = React.useState<{
    open: boolean;
    feature: string;
  }>({ open: false, feature: "" });
  const [tableInfo, setTableInfo] = React.useState<{
    sources: string[];
    stale: boolean;
    scannedAt: number;
  } | null>(null);
  const [historyKey, setHistoryKey] = React.useState(0);
  const local = useLocalHistory();

  // Garante que o timeframe salvo é permitido pelo plano atual.
  React.useEffect(() => {
    if (!plan.timeframes.includes(filters.timeframe))
      setFilters((f) => ({ ...f, timeframe: "4h" }));
  }, [plan, filters.timeframe, setFilters]);

  const runScan = async () => {
    setScanning(true);
    setScanError(null);
    try {
      const res = await postJson<ScanPayload>("/api/scanner/run", {
        timeframe: filters.timeframe,
        direction: filters.direction,
        symbols: filters.symbol === "ALL" ? undefined : [filters.symbol],
        minConfidence: filters.minConfidence ?? 60,
        includeVolume: true,
        refresh: true,
      });
      setScan(res);
      setTab("padroes");
      const found = res.rows.reduce((s, r) => s + r.patterns.length, 0);
      if (!user) {
        local.push([
          ...res.rows.flatMap((r) =>
            r.patterns.map((p) => ({
              symbol: r.symbol,
              timeframe: filters.timeframe,
              kind: "pattern",
              title: `${p.label} em ${r.symbol}`,
              direction: p.direction,
              confidence: p.confidence,
            })),
          ),
          ...res.volumeAlerts.map((v) => ({
            symbol: v.symbol,
            timeframe: v.timeframe,
            kind: "volume",
            title: `Volume +${v.increasePct}% em ${v.symbol} (${TIMEFRAME_LABEL[v.timeframe]})`,
            direction:
              v.direction === "up"
                ? "bullish"
                : v.direction === "down"
                  ? "bearish"
                  : "neutral",
            confidence: null,
          })),
        ]);
      }
      setHistoryKey((k) => k + 1);
      void refreshVolume();
      toast({
        title: `${res.assetsAnalyzed} ativos analisados`,
        description: `${found} padrão(ões) e ${res.volumeAlerts.length} alerta(s) de volume em ${TIMEFRAME_LABEL[filters.timeframe]}.`,
        variant: found ? "success" : "default",
      });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "plan_required")
        setUpgrade({ open: true, feature: err.message });
      setScanError(
        err instanceof ApiClientError
          ? err.message
          : "Falha ao executar o scan. Tente novamente em instantes.",
      );
    } finally {
      setScanning(false);
    }
  };

  const onLocked = (tf: Timeframe) =>
    setUpgrade({
      open: true,
      feature: `O timeframe ${TIMEFRAME_LABEL[tf]} é do plano ELITE. Faça upgrade para analisar padrões em alta frequência.`,
    });
  const assetsCount = filters.symbol === "ALL" ? ASSETS.length : 1;
  const sources = scan?.sources ?? tableInfo?.sources;
  const stale = (scan?.staleCount ?? 0) > 0 || Boolean(tableInfo?.stale);
  const patternsFound =
    scan?.rows.reduce((s, r) => s + r.patterns.length, 0) ?? 0;

  return (
    <PageShell>
      <PageTitle
        icon={<ChartColumn className="h-5 w-5" />}
        title="Scanner de Padrões Gráficos"
        description="O scanner identifica padrões técnicos em formação em tempo real nos 30 ativos monitorados. A detecção é algorítmica (pivôs fractais, ATR, suportes e resistências) — combine-a com a sua própria estratégia e gestão de risco."
        actions={
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
            {(["USD", "BRL"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`rounded px-2 py-1 font-semibold cursor-pointer ${currency === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                aria-pressed={currency === c}
              >
                {c}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex flex-col gap-4">
        <ProviderBanner
          sources={sources}
          stale={stale}
          onRetry={() => void runScan()}
          loading={scanning}
        />

        <ScannerFilters
          value={filters}
          onChange={setFilters}
          allowedTimeframes={plan.timeframes}
          onScan={() => void runScan()}
          scanning={scanning}
          onLockedClick={onLocked}
        />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {scanning ? (
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary live-dot" />{" "}
              Detectando padrões em{" "}
              <strong className="text-foreground">{assetsCount}</strong> ativos…
            </span>
          ) : (
            <span>
              <strong className="text-foreground">
                {scan?.assetsAnalyzed ?? assetsCount}
              </strong>{" "}
              ativos analisados
            </span>
          )}
          <span>
            Último scan:{" "}
            <strong className="text-foreground">
              {scan ? formatDateTime(scan.scannedAt) : "—"}
            </strong>
          </span>
          <span>
            Tempo Gráfico:{" "}
            <strong className="text-foreground">
              {TIMEFRAME_LABEL[filters.timeframe]}
            </strong>
          </span>
          {scan ? (
            <span>
              Fonte:{" "}
              <strong className="text-foreground">
                {scan.sources.join(", ")}
              </strong>
              {scan.cached ? " (cache)" : ""}
            </span>
          ) : null}
          {currency === "BRL" && fx ? (
            <span>
              USD/BRL {fx.rate.toFixed(3)}
              {fx.stale ? " (defasado)" : ""}
            </span>
          ) : null}
        </div>

        {scanError ? (
          <Alert variant="danger" title="Não foi possível escanear">
            {scanError}
          </Alert>
        ) : null}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="tabela">
              <ChartLine className="h-4 w-4" aria-hidden /> Tabela em tempo real
            </TabsTrigger>
            <TabsTrigger value="padroes">
              <Puzzle className="h-4 w-4" aria-hidden /> Padrões Técnicos{" "}
              {scan ? (
                <Badge
                  variant={patternsFound ? "success" : "muted"}
                  className="ml-1 px-1.5 py-0 text-[10px]"
                >
                  {patternsFound}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="volume">
              <Volume2 className="h-4 w-4" aria-hidden /> Alertas de Volume{" "}
              {volume ? (
                <Badge
                  variant={volume.alerts.length ? "warning" : "muted"}
                  className="ml-1 px-1.5 py-0 text-[10px]"
                >
                  {volume.alerts.length}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="historico">
              <ClipboardList className="h-4 w-4" aria-hidden /> Histórico de
              Alertas
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tabela">
            <Card>
              <CardContent className="p-3 sm:p-4">
                <ScannerTable
                  timeframe={filters.timeframe}
                  currency={currency}
                  usdBrl={fx?.rate ?? null}
                  onSourcesChange={setTableInfo}
                />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="padroes">
            <PatternResults
              rows={scan?.rows ?? null}
              timeframe={filters.timeframe}
              scanned={Boolean(scan)}
              currency={currency}
              usdBrl={fx?.rate ?? null}
            />
          </TabsContent>
          <TabsContent value="volume">
            <VolumeAlerts
              alerts={
                scan?.volumeAlerts?.length
                  ? scan.volumeAlerts
                  : (volume?.alerts ?? null)
              }
              assets={volume?.assets ?? ASSETS.length}
              checkedAt={volume?.checkedAt}
              loading={volumeLoading}
              timeframes={volumeTfs}
            />
          </TabsContent>
          <TabsContent value="historico">
            <ScanHistory
              localItems={local.items}
              onClearLocal={local.clear}
              refreshKey={historyKey}
            />
          </TabsContent>
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle>Padrões suportados (17)</CardTitle>
          </CardHeader>
          <CardContent>
            <PatternLegend />
          </CardContent>
        </Card>

        <ChartAnalysis />

        <PlatinumBlock currentPlan={user?.plan ?? "FREE"} />
      </div>

      <UpgradeDialog
        open={upgrade.open}
        onOpenChange={(o) => setUpgrade((u) => ({ ...u, open: o }))}
        feature={upgrade.feature}
      />
    </PageShell>
  );
}

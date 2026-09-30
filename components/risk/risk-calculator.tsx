"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { formatNumber, formatPrice } from "@/lib/format";
import { averagePrice, DEFAULT_STRESS_MOVES, liquidationView, positionSize, smartStops, stressTest, type MarginMode, type Side } from "@/lib/engines/risk";
import { cn } from "@/lib/utils";

export interface RiskPrefill {
  side?: Side;
  entry?: number;
  stop?: number;
  target?: number;
  atr?: number;
  /** swing externo que invalida a estrutura (base do stop estrutural) */
  invalidation?: number;
  /** swing interno (base do stop curto) */
  micro?: number | null;
}

const RISK_PRESETS = [0.25, 0.5, 1, 2];
const num = (s: string) => {
  const v = Number(String(s).replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
};
const fmt = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : formatNumber(v, d));
const px = (v: number | null | undefined) => (v == null || !Number.isFinite(v) || v <= 0 ? "—" : formatPrice(v));

function Field({ id, label, value, onChange, suffix }: { id: string; label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id}>
        {label}
        {suffix ? <span className="ml-1 text-muted-foreground">({suffix})</span> : null}
      </Label>
      <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/**
 * Calculadora de risco: tamanho de posição pelo risco, liquidação (isolated/cross), stops sugeridos,
 * preço médio e stress test. Cálculo 100% local (lib/engines/risk), sem envio de dados.
 */
export function RiskCalculator({ prefill }: { prefill?: RiskPrefill }) {
  const [account, setAccount] = useLocalStorage("cs-risk-account", "10000");
  const [riskPct, setRiskPct] = useLocalStorage("cs-risk-pct", "0.5");
  const [leverage, setLeverage] = useLocalStorage("cs-risk-lev", "5");
  const [mmr, setMmr] = useLocalStorage("cs-risk-mmr", "0.5");
  const [feePct, setFeePct] = useLocalStorage("cs-risk-fee", "0.05");
  const [mode, setMode] = React.useState<MarginMode>("isolated");
  const [wallet, setWallet] = React.useState("");
  const [entry, setEntry] = React.useState(prefill?.entry ? String(prefill.entry) : "");
  const [stop, setStop] = React.useState(prefill?.stop ? String(prefill.stop) : "");
  const [target, setTarget] = React.useState(prefill?.target ? String(prefill.target) : "");
  const [addQty, setAddQty] = React.useState("");
  const [addPrice, setAddPrice] = React.useState("");

  const E = num(entry);
  const S = num(stop);
  const T = num(target);
  const L = num(leverage);
  const MMR = num(mmr) / 100;

  let sizing: ReturnType<typeof positionSize> | null = null;
  let sizingError: string | null = null;
  try {
    sizing = positionSize({ account: num(account), riskPct: num(riskPct), entry: E, stop: S, target: Number.isFinite(T) && T > 0 ? T : undefined, leverage: L, feePct: num(feePct) });
  } catch (err) {
    sizingError = (err as Error).message;
  }
  const side: Side = sizing?.side ?? prefill?.side ?? "long";
  const liq = sizing
    ? liquidationView({ side, entry: E, qty: sizing.qty, leverage: L, mmr: MMR, marginMode: mode, walletBalance: num(wallet), atr: prefill?.atr, stop: S })
    : null;
  const stops = prefill?.atr && prefill.invalidation && Number.isFinite(E) ? smartStops({ side: prefill.side ?? side, entry: E, atr: prefill.atr, invalidation: prefill.invalidation, micro: prefill.micro }) : [];
  const avg =
    sizing && Number.isFinite(num(addQty)) && num(addQty) > 0 && Number.isFinite(num(addPrice)) && num(addPrice) > 0
      ? averagePrice({ side, qty: sizing.qty, entry: E, leverage: L, addQty: num(addQty), addPrice: num(addPrice), stop: S, mmr: MMR, marginMode: mode, walletBalance: num(wallet) })
      : null;
  const stress = sizing ? stressTest({ side, qty: sizing.qty, entry: E, leverage: L, mmr: MMR, marginMode: mode, walletBalance: num(wallet), equity: num(account) }, DEFAULT_STRESS_MOVES) : [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Posição pelo risco</CardTitle>
          <CardDescription>Quantidade = (conta × risco%) ÷ (distância até o stop + taxas). Contratos lineares USDT. Nada é enviado ao servidor.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field id="acc" label="Conta" suffix="USDT" value={account} onChange={setAccount} />
            <Field id="risk" label="Risco por operação" suffix="%" value={riskPct} onChange={setRiskPct} />
            <Field id="lev" label="Alavancagem" suffix="×" value={leverage} onChange={setLeverage} />
            <Field id="fee" label="Taxa por lado" suffix="%" value={feePct} onChange={setFeePct} />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Risco predefinido">
            {RISK_PRESETS.map((r) => (
              <button
                key={r}
                onClick={() => setRiskPct(String(r))}
                className={cn("cursor-pointer min-h-9 rounded-md border px-3 text-sm", num(riskPct) === r ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}
              >
                {r}%
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field id="entry" label="Entrada" value={entry} onChange={setEntry} />
            <Field id="stop" label="Stop" value={stop} onChange={setStop} />
            <Field id="target" label="Alvo (opcional)" value={target} onChange={setTarget} />
          </div>
          {sizingError && (entry || stop) ? <Alert variant="warning">{sizingError}</Alert> : null}
          {sizing ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                <Out label="Lado" value={sizing.side === "long" ? "Compra (long)" : "Venda (short)"} tone={sizing.side === "long" ? "up" : "down"} />
                <Out label="Quantidade" value={fmt(sizing.qty, 6)} />
                <Out label="Notional" value={`$ ${fmt(sizing.notional)}`} />
                <Out label="Margem" value={`$ ${fmt(sizing.margin)}`} />
                <Out label="Capital em risco" value={`$ ${fmt(sizing.capitalAtRisk)}`} tone="down" />
                <Out label="Distância do stop" value={`${fmt(sizing.stopDistancePct)}%`} />
                <Out label="R:R" value={sizing.rewardRisk != null ? `${fmt(sizing.rewardRisk)} R` : "—"} tone={sizing.rewardRisk != null ? (sizing.rewardRisk >= 2 ? "up" : sizing.rewardRisk < 1 ? "down" : undefined) : undefined} />
                <Out label="Taxas (ida e volta)" value={`$ ${fmt(sizing.feesRoundTrip)}`} />
              </div>
              {sizing.warnings.map((w) => (
                <Alert key={w} variant="warning">
                  {w}
                </Alert>
              ))}
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alavancagem e liquidação</CardTitle>
          <CardDescription>Fórmula da Binance para uma posição (faixa de manutenção com cum = 0). Use o MMR da sua faixa para valor exato.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label>Modo de margem</Label>
              <div className="inline-flex rounded-md border border-border p-0.5">
                {(["isolated", "cross"] as const).map((m) => (
                  <button key={m} onClick={() => setMode(m)} className={cn("cursor-pointer min-h-9 flex-1 rounded px-3 text-sm", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                    {m === "isolated" ? "Isolada" : "Cruzada"}
                  </button>
                ))}
              </div>
            </div>
            <Field id="mmr" label="Margem de manutenção" suffix="%" value={mmr} onChange={setMmr} />
            {mode === "cross" ? <Field id="wallet" label="Saldo da carteira de margem" suffix="USDT" value={wallet} onChange={setWallet} /> : null}
          </div>
          {liq ? (
            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              <Out label="Liquidação estimada" value={px(liq.price)} tone="down" />
              <Out label="Distância" value={`${fmt(liq.distancePct)}%`} />
              <Out label="Distância em ATR" value={liq.distanceAtr != null ? `${fmt(liq.distanceAtr, 1)} ATR` : "—"} />
              <Out
                label="Stop antes da liquidação"
                value={liq.stopBeforeLiquidation == null ? "—" : liq.stopBeforeLiquidation ? "Sim" : "Não — reduza a alavancagem"}
                tone={liq.stopBeforeLiquidation === false ? "down" : liq.stopBeforeLiquidation ? "up" : undefined}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Preencha entrada e stop para calcular.</p>
          )}
        </CardContent>
      </Card>

      {stops.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stops pela estrutura</CardTitle>
            <CardDescription>Derivados do swing de invalidação e do ATR — sem valor fixo arbitrário. Toque para usar.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-3">
            {stops.map((s) => (
              <button key={s.kind} onClick={() => setStop(String(Number(s.price.toPrecision(8))))} className="cursor-pointer rounded-md border border-border p-3 text-left text-sm hover:bg-muted/40">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{s.kind === "structural" ? "Estrutural" : s.kind === "volatility" ? "Volatilidade" : "Curto"}</span>
                  <span className="tabular">{px(s.price)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {fmt(s.distancePct)}% · {fmt(s.distanceAtr, 1)} ATR
                </div>
                <div className="mt-1 text-xs">{s.rationale}</div>
                <div className="text-xs text-muted-foreground">{s.tradeoff}</div>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preço médio</CardTitle>
          <CardDescription>Efeito de uma nova ordem sobre preço médio, margem, alavancagem efetiva, liquidação e risco até o stop.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field id="addq" label="Quantidade nova" value={addQty} onChange={setAddQty} />
            <Field id="addp" label="Preço da nova ordem" value={addPrice} onChange={setAddPrice} />
          </div>
          {avg ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                <Out label="Novo preço médio" value={px(avg.newEntry)} />
                <Out label="Nova quantidade" value={fmt(avg.newQty, 6)} />
                <Out label="Novo notional / margem" value={`$ ${fmt(avg.newNotional)} / $ ${fmt(avg.newMargin)}`} />
                <Out label="Alavancagem efetiva" value={`${fmt(avg.effectiveLeverage, 2)}×`} />
                <Out label="Liquidação antes → depois" value={`${px(avg.liquidationBefore)} → ${px(avg.liquidationAfter)}`} />
                <Out label="Risco até o stop" value={avg.riskBefore != null ? `$ ${fmt(avg.riskBefore)} → $ ${fmt(avg.riskAfter)}` : "—"} tone={avg.riskIncreasePct != null && avg.riskIncreasePct > 0 ? "down" : undefined} />
                <Out label="Variação do risco" value={avg.riskIncreasePct != null ? `${avg.riskIncreasePct >= 0 ? "+" : ""}${fmt(avg.riskIncreasePct, 0)}%` : "—"} />
              </div>
              {avg.warnings.map((w) => (
                <Alert key={w} variant="warning">
                  {w}
                </Alert>
              ))}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Usa a posição calculada acima como posição atual.</p>
          )}
        </CardContent>
      </Card>

      {stress.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Teste de estresse</CardTitle>
            <CardDescription>P&L, razão de margem e distância da liquidação para variações do preço a partir da entrada.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0 sm:p-0">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Variação</th>
                  <th className="px-3 py-2 text-right">Preço</th>
                  <th className="px-3 py-2 text-right">P&L</th>
                  <th className="px-3 py-2 text-right">% da margem</th>
                  <th className="px-3 py-2 text-right">% da conta</th>
                  <th className="px-3 py-2 text-right">Razão de margem</th>
                  <th className="px-3 py-2 text-right">Até liquidação</th>
                </tr>
              </thead>
              <tbody>
                {stress.map((r) => (
                  <tr key={r.movePct} className={cn("border-b border-border/50", r.liquidated && "bg-danger/10")}>
                    <td className="px-3 py-2 tabular">{r.movePct > 0 ? `+${r.movePct}` : r.movePct}%</td>
                    <td className="px-3 py-2 text-right tabular">{px(r.price)}</td>
                    <td className={cn("px-3 py-2 text-right tabular", r.pnl >= 0 ? "text-success" : "text-danger")}>
                      <span aria-hidden>{r.pnl > 0 ? "▲ " : r.pnl < 0 ? "▼ " : ""}</span>
                      {r.pnl > 0 ? "+" : ""}
                      {fmt(r.pnl)}
                    </td>
                    <td className="px-3 py-2 text-right tabular">{fmt(r.pnlPctOfMargin, 1)}%</td>
                    <td className="px-3 py-2 text-right tabular">{r.equityImpactPct != null ? `${fmt(r.equityImpactPct, 2)}%` : "—"}</td>
                    <td className="px-3 py-2 text-right tabular">{Number.isFinite(r.marginRatioPct) ? `${fmt(r.marginRatioPct, 1)}%` : "∞"}</td>
                    <td className="px-3 py-2 text-right tabular">{r.liquidated ? <Badge variant="danger">liquidada</Badge> : `${fmt(r.distanceToLiqPct, 1)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Out({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="min-w-0 rounded-md border border-border/60 p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("break-words font-semibold tabular", tone === "up" && "text-success", tone === "down" && "text-danger")}>{value}</div>
    </div>
  );
}

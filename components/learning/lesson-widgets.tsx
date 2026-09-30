"use client";

import * as React from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/** Exercícios interativos embutidos em algumas aulas. Tudo calculado no navegador, sem dados de mercado. */
export const WIDGETS: Record<
  string,
  { title: string; hint: string; Component: () => React.ReactElement }
> = {
  "candles-e-timeframes": {
    title: "Monte um candle",
    hint: "Arraste abertura e fechamento e veja como corpo e pavios mudam a leitura.",
    Component: CandleBuilder,
  },
  "rsi-stochrsi-macd": {
    title: "Leia o RSI",
    hint: "Mova o RSI e veja em que zona o indicador está.",
    Component: RsiZones,
  },
  fibonacci: {
    title: "Calcule as retrações",
    hint: "Informe fundo e topo do movimento; os níveis são calculados na hora.",
    Component: FibCalc,
  },
  "gestao-de-risco": {
    title: "Calcule o tamanho da posição",
    hint: "Defina capital, risco por operação, entrada, stop e alvo.",
    Component: RiskCalc,
  },
  "simulacao-e-dca": {
    title: "Preço médio no DCA",
    hint: "Compare o preço médio de aportes fixos com preços que sobem e caem.",
    Component: DcaDemo,
  },
};

const brl = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
const num = (n: number, d = 2) =>
  n.toLocaleString("pt-BR", {
    maximumFractionDigits: d,
    minimumFractionDigits: d,
  });

function Field({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  fmt,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  fmt?: (v: number) => string;
}) {
  const shown = fmt ? fmt(value) : num(value, 0);
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <span className="flex justify-between text-muted-foreground">
        <span>{label}</span>
        <span className="tabular font-semibold text-foreground" aria-hidden>
          {shown}
        </span>
      </span>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? value)}
        thumbLabel={label}
        valueText={shown}
      />
    </div>
  );
}

function CandleBuilder() {
  const [o, setO] = React.useState(40);
  const [c, setC] = React.useState(70);
  const [hi, setHi] = React.useState(85);
  const [lo, setLo] = React.useState(30);
  const high = Math.max(hi, o, c);
  const low = Math.min(lo, o, c);
  const up = c >= o;
  const body = Math.abs(c - o);
  const range = Math.max(1, high - low);
  const upper = high - Math.max(o, c);
  const lower = Math.min(o, c) - low;
  const y = (v: number) => 150 - v * 1.3;
  let read =
    "Indecisão: corpo pequeno, compradores e vendedores empatados (doji).";
  if (body / range >= 0.6)
    read = up
      ? "Convicção compradora: corpo grande e pavios curtos."
      : "Convicção vendedora: corpo grande e pavios curtos.";
  else if (upper / range >= 0.5)
    read =
      "Rejeição no topo: o preço subiu e foi devolvido (pavio superior longo).";
  else if (lower / range >= 0.5)
    read =
      "Rejeição no fundo: o preço caiu e foi recomprado (pavio inferior longo).";
  else if (body / range >= 0.25)
    read = up
      ? "Alta moderada: corpo médio, alguma disputa nos pavios."
      : "Baixa moderada: corpo médio, alguma disputa nos pavios.";
  const col = up ? "var(--success)" : "var(--danger)";
  return (
    <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
      <svg
        viewBox="0 0 140 160"
        className="mx-auto h-40 w-32"
        role="img"
        aria-label="Candle montado"
      >
        <line
          x1={70}
          x2={70}
          y1={y(high)}
          y2={y(low)}
          stroke={col}
          strokeWidth={3}
        />
        <rect
          x={45}
          y={y(Math.max(o, c))}
          width={50}
          height={Math.max(2, body * 1.3)}
          rx={3}
          fill={col}
        />
      </svg>
      <div className="flex flex-col gap-3">
        <Field label="Abertura" value={o} onChange={setO} min={0} max={100} />
        <Field label="Fechamento" value={c} onChange={setC} min={0} max={100} />
        <Field label="Máxima" value={high} onChange={setHi} min={0} max={100} />
        <Field label="Mínima" value={low} onChange={setLo} min={0} max={100} />
        <p
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            up
              ? "border-success/40 bg-success/10"
              : "border-danger/40 bg-danger/10",
          )}
          aria-live="polite"
        >
          {read}
        </p>
      </div>
    </div>
  );
}

function RsiZones() {
  const [v, setV] = React.useState(55);
  const zone =
    v >= 70
      ? {
          t: "Sobrecomprado (≥ 70): o movimento está esticado. Em tendência forte de alta o RSI pode ficar aqui por semanas; não é sinal de venda sozinho.",
          c: "border-danger/40 bg-danger/10",
        }
      : v <= 30
        ? {
            t: "Sobrevendido (≤ 30): queda esticada. Em tendência de baixa pode continuar; espere confirmação de preço.",
            c: "border-success/40 bg-success/10",
          }
        : v >= 50
          ? {
              t: "Zona neutra com viés comprador (50–70): momento favorece compradores.",
              c: "border-primary/40 bg-primary/10",
            }
          : {
              t: "Zona neutra com viés vendedor (30–50): momento favorece vendedores.",
              c: "border-warning/40 bg-warning/10",
            };
  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative h-8 overflow-hidden rounded-md border border-border"
        aria-hidden
      >
        <div className="absolute inset-y-0 left-0 w-[30%] bg-success/20" />
        <div className="absolute inset-y-0 right-0 w-[30%] bg-danger/20" />
        <div
          className="absolute inset-y-0 w-1 bg-foreground transition-[left] motion-reduce:transition-none"
          style={{ left: `calc(${v}% - 2px)` }}
        />
        <span className="absolute left-2 top-1.5 text-[11px] text-muted-foreground">
          30
        </span>
        <span className="absolute right-2 top-1.5 text-[11px] text-muted-foreground">
          70
        </span>
      </div>
      <Field label="RSI(14)" value={v} onChange={setV} min={0} max={100} />
      <p
        className={cn("rounded-md border px-3 py-2 text-sm", zone.c)}
        aria-live="polite"
      >
        {zone.t}
      </p>
    </div>
  );
}

/** Campo numérico: guarda o texto digitado (dá para apagar e redigitar) e entrega ao cálculo o número, ou NaN se vazio. */
function NumInput({
  label,
  name,
  initial,
  onChange,
  invalid,
  errorId,
}: {
  label: string;
  name: string;
  initial: number;
  onChange: (v: number) => void;
  invalid?: boolean;
  errorId?: string;
}) {
  const [text, setText] = React.useState(String(initial));
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input
        type="number"
        inputMode="decimal"
        name={name}
        min={0}
        step="any"
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.trim() === "" ? NaN : Number(e.target.value));
        }}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground tabular focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-danger"
      />
    </label>
  );
}

function FibCalc() {
  const [low, setLow] = React.useState(58000);
  const [high, setHigh] = React.useState(72000);
  const errorId = React.useId();
  const lowOk = low > 0;
  const valid = high > low && lowOk;
  const levels = [0.236, 0.382, 0.5, 0.618, 0.786];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <NumInput
          label="Fundo do movimento (US$)"
          name="fundo"
          initial={58000}
          onChange={setLow}
          invalid={!lowOk}
          errorId={errorId}
        />
        <NumInput
          label="Topo do movimento (US$)"
          name="topo"
          initial={72000}
          onChange={setHigh}
          invalid={lowOk && !valid}
          errorId={errorId}
        />
      </div>
      {valid ? (
        <div className="grid gap-1.5" aria-live="polite">
          {levels.map((l) => {
            const price = high - (high - low) * l;
            return (
              <div
                key={l}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-1.5 text-sm",
                  l === 0.618 || l === 0.5
                    ? "border-warning/50 bg-warning/10"
                    : "border-border",
                )}
              >
                <span className="text-muted-foreground">
                  {num(l * 100, 1)}%
                </span>
                <span className="tabular font-semibold">
                  US$ {num(price, 0)}
                </span>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            Destaque: zona entre 50% e 61,8%, onde correções em tendência
            costumam encontrar compradores. É região de observação, não ordem
            automática.
          </p>
        </div>
      ) : (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {lowOk
            ? "O topo precisa ser maior que o fundo."
            : "Informe um fundo maior que zero."}
        </p>
      )}
    </div>
  );
}

function RiskCalc() {
  const [capital, setCapital] = React.useState(10000);
  const [riskPct, setRiskPct] = React.useState(1);
  const [entry, setEntry] = React.useState(100);
  const [stop, setStop] = React.useState(95);
  const [target, setTarget] = React.useState(112);
  const errorId = React.useId();
  const perUnit = entry - stop;
  const capitalOk = capital > 0;
  const entryOk = entry > 0;
  const stopOk = entryOk && perUnit > 0;
  const targetOk = entryOk && target > entry;
  const valid = capitalOk && entryOk && stopOk && targetOk;
  const error = !capitalOk
    ? "Informe um capital maior que zero."
    : !entryOk
      ? "Informe um preço de entrada maior que zero."
      : "Para compra: stop abaixo da entrada e alvo acima dela.";
  const riskMoney = (capital * riskPct) / 100;
  const qty = valid ? riskMoney / perUnit : 0;
  const position = qty * entry;
  const rr = valid ? (target - entry) / perUnit : 0;
  const levered = position > capital;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumInput
          label="Capital (R$)"
          name="capital"
          initial={10000}
          onChange={setCapital}
          invalid={!capitalOk}
          errorId={errorId}
        />
        <NumInput
          label="Entrada"
          name="entrada"
          initial={100}
          onChange={setEntry}
          invalid={!entryOk}
          errorId={errorId}
        />
        <NumInput
          label="Stop"
          name="stop"
          initial={95}
          onChange={setStop}
          invalid={entryOk && !stopOk}
          errorId={errorId}
        />
        <NumInput
          label="Alvo"
          name="alvo"
          initial={112}
          onChange={setTarget}
          invalid={entryOk && !targetOk}
          errorId={errorId}
        />
      </div>
      <Field
        label="Risco por operação"
        value={riskPct}
        onChange={setRiskPct}
        min={0.25}
        max={5}
        step={0.25}
        fmt={(v) => `${num(v, 2)}%`}
      />
      {valid ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-live="polite">
          {[
            ["Perda máxima", brl(riskMoney), "text-danger"],
            ["Quantidade", num(qty, 4), ""],
            [
              "Tamanho da posição",
              brl(position),
              levered ? "text-warning" : "",
            ],
            [
              "Risco : retorno",
              `1 : ${num(rr, 2)}`,
              rr >= 2 ? "text-success" : rr >= 1 ? "" : "text-danger",
            ],
          ].map(([k, v, cls]) => (
            <div key={k} className="rounded-md border border-border p-2">
              <div className="text-[11px] text-muted-foreground">{k}</div>
              <div className={cn("tabular text-sm font-semibold", cls)}>
                {v}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {valid && levered ? (
        <p className="text-xs text-warning">
          A posição passa do capital: exigiria alavancagem. Afaste o stop só se
          a estrutura do gráfico justificar, ou reduza o risco.
        </p>
      ) : null}
      {valid && rr < 1.5 ? (
        <p className="text-xs text-muted-foreground">
          Com R:R abaixo de 1,5 a taxa de acerto precisa ser alta para a conta
          fechar positiva.
        </p>
      ) : null}
    </div>
  );
}

function DcaDemo() {
  const [monthly, setMonthly] = React.useState(500);
  const prices = [100, 80, 60, 70, 90, 110];
  const units = prices.reduce((s, p) => s + monthly / p, 0);
  const invested = monthly * prices.length;
  const avg = invested / units;
  const simple = prices.reduce((s, p) => s + p, 0) / prices.length;
  const max = Math.max(...prices);
  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Aporte mensal"
        value={monthly}
        onChange={setMonthly}
        min={100}
        max={2000}
        step={100}
        fmt={brl}
      />
      <div className="flex h-28 items-end gap-2">
        {prices.map((p, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <span className="tabular text-[11px] text-muted-foreground">
              {num(monthly / p, 1)} un.
            </span>
            <div
              className="w-full rounded-t bg-primary/60"
              style={{ height: `${(p / max) * 70}px` }}
            />
            <span className="tabular text-[11px]">R$ {p}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm" aria-live="polite">
        <div className="rounded-md border border-border p-2">
          <div className="text-[11px] text-muted-foreground">Investido</div>
          <div className="tabular font-semibold">{brl(invested)}</div>
        </div>
        <div className="rounded-md border border-border p-2">
          <div className="text-[11px] text-muted-foreground">
            Preço médio pago
          </div>
          <div className="tabular font-semibold text-success">{brl(avg)}</div>
        </div>
        <div className="rounded-md border border-border p-2">
          <div className="text-[11px] text-muted-foreground">
            Média simples dos preços
          </div>
          <div className="tabular font-semibold">{brl(simple)}</div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Com valor fixo, você compra mais unidades quando o preço cai; por isso o
        preço médio pago fica abaixo da média simples. Preços ilustrativos. O
        aporte mensal não altera o preço médio, só a quantidade.
      </p>
    </div>
  );
}

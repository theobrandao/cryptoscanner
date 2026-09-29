# CryptoScanner V2 — Arquitetura

Princípio: **todo número é calculado no backend a partir de dados reais**. A cadeia é determinística até o fim; o LLM (opcional) só redige a explicação a partir do JSON produzido pelos engines e passa por validação numérica.

```
MARKET DATA ─► QUALITY ─► REGIME ─► STRUCTURE ─► LIQUIDITY ─► VOLUME ─► MOMENTUM ─► DERIVATIVES
      ─► SETUP DETECTION ─► HISTORICAL EDGE ─► RISK ─► SCENARIOS ─► EXPLANATION
```

## 1. Diagrama

```
                 ┌──────────────────────────── Frontend (Next.js App Router) ─────────────────────────────┐
                 │ Terminal (ativo×TF): Overview · Chart · Structure · Liquidity · Risk · Backtest …        │
                 │ Scanner · Taxa de acerto · Sentinela · Carteira · Risco · Status                       │
                 └───────────────▲──────────────────────────────▲──────────────────────────────────────────┘
                                 │ REST (zod, withApi)          │ SSE tickers
┌────────────────────────────────┴──────────────────────────────┴──────────────────────────────────────────┐
│ API (app/api/*)                                                                                            │
│  /api/engine/[symbol]  /api/risk/*  /api/patterns/stats  /api/scanner/*  /api/market/*  /api/status  …    │
└───────────────▲───────────────────────────────────────────────────────────────────────────────────────────┘
                │
┌───────────────┴────────────────────── Engines (lib/engines, puros e testados) ────────────────────────────┐
│ quality.ts     validação OHLC, lacunas, candle fechado, status LIVE/DELAYED/DEGRADED/OFFLINE/FALLBACK     │
│ structure.ts   swings confirmados (ATR), HH/HL/LH/LL, BOS, CHoCH, estrutura interna × externa, tendência  │
│ liquidity.ts   EQH/EQL, PDH/PDL, PWH/PWL, swing liquidity, BSL/SSL, sweeps (capturada × disponível)       │
│ mtf.ts         matriz 1W/1D/4H/1H/30m/15m, HTF alignment score                                            │
│ risk.ts        tamanho de posição, R, margem, liquidação (isolated/cross), preço médio, stress, smart stop │
│ (P1) regime.ts · vwap.ts · volume-profile.ts · confluence.ts · scenarios.ts                                │
│ lib/patterns/detect.ts (padrões) · lib/patterns/backtest.ts (walk-forward com R-múltiplos)                 │
└───────────────▲───────────────────────────────────────────────────────────────────────────────────────────┘
                │
┌───────────────┴──────────── Data Engine (services/market) ───────────┐    ┌──────── Jobs ────────────────┐
│ market-service: cache por tipo, fallback com circuit breaker,        │    │ cron/cycle 5 min: scan,      │
│ closed-candle policy, qualidade + divergência entre fontes           │    │ agentes, alertas, sinais     │
│ providers: Binance → data-api.binance.vision → Kraken; Futures;      │    │ cron/backtest diário         │
│ CoinGecko; alternative.me; RSS; blockchain.info                      │    │ cron/whales 10 min           │
└───────────────▲──────────────────────────────────────────────────────┘    │ heartbeat CronRun → /status  │
                │                                                           └──────────────────────────────┘
        Redis (cache, rate limit)        Postgres (usuários, agentes, sinais, backtests, heartbeat)
```

## 2. Contratos

### Metadados de dado (Data Quality)

```ts
interface DataMeta {
  source: "binance" | "kraken" | …;
  fetchedAt: number;      // ms epoch da coleta
  lastCandleClose: number;// fechamento do último candle FECHADO
  ageMs: number;          // agora − fetchedAt
  status: "LIVE" | "DELAYED" | "DEGRADED" | "OFFLINE" | "FALLBACK";
  issues: string[];       // "gap: 2 candles", "ohlc inválido em …", "divergência 0,8% vs kraken"
}
```

Regras: `LIVE` coleta dentro do TTL do timeframe e fonte primária; `FALLBACK` fonte secundária; `DELAYED` dado de cache além do TTL; `DEGRADED` problemas de integridade (lacunas, OHLC corrigido/descartado, divergência); `OFFLINE` nenhuma fonte e sem cache.

**Política de candle fechado**: engines de sinal recebem apenas candles com `closeTime < agora`. O candle em formação é exposto separadamente (`forming`) para exibição de preço.

### Estrutura

Swing confirmado = pivô fractal (força `k` barras de cada lado) cuja amplitude desde o swing oposto anterior é ≥ `minAtr × ATR`. Swings alternam alto/baixo (dois altos seguidos → mantém o mais extremo). Classificação: HH/LH para altos, HL/LL para baixos. **BOS**: fechamento além do último swing na direção da tendência vigente. **CHoCH**: fechamento além do último swing contra a tendência (primeira quebra). Estrutura externa (k maior, ex. 5 e 1,5×ATR) e interna (k menor, ex. 2 e 0,5×ATR).

### Liquidez

EQH/EQL: ≥2 swings com diferença ≤ `0,1×ATR`. PDH/PDL/PWH/PWL em UTC (dia/semana ISO, segunda 00:00 UTC). Pool = nível + lado (BSL acima / SSL abaixo) + estado `available` | `swept` (pavio ultrapassou e fechamento voltou = sweep; fechamento além = rompido). Mapa ordenado pela distância em ATR.

### MTF

Para cada TF: tendência estrutural, último evento (BOS/CHoCH), posição no range (premium/discount), volatilidade (ATR%). HTF alignment score ∈ [−100, 100] com pesos 1W 0,30 · 1D 0,30 · 4H 0,20 · 1H 0,12 · 15m/30m 0,08.

### Risco

Tamanho = (conta × risco%) / |entrada − stop|. Liquidação (isolated, linear USDT-M): long `P_liq = E × (1 − 1/L + mmr)`; short `P_liq = E × (1 + 1/L − mmr)`; `mmr` configurável (padrão 0,5%). Preço médio ponderado por quantidade; stress test sobre o preço de marcação.

## 3. Banco (adições V2)

`PatternStat` (agregado por padrão×TF), `PatternSignal` (sinais ao vivo), `PushSubscription`, `CronRun`, `AppSetting`; próximos: `Setup` (estados DISCOVERED→…→EXPIRED com fingerprint), `BacktestRun`/`BacktestStat` (ativo×TF×regime×setup), `JournalEntry`, `PaperTrade`, `EconomicEvent`.

## 4. Jobs

| Job | Frequência | Conteúdo | Limite |
|---|---|---|---|
| cycle | 5 min | scan 4H/1D, snapshot, agentes, alertas, sinais ao vivo | 60 s |
| backtest | diário | walk-forward 30 ativos × 4H/1D | 60 s (orçamento 25 s/TF) |
| whales | 10 min | bloco BTC mais recente | 60 s |

Cálculo pesado nunca roda no caminho de uma requisição anônima sem cache.

## 5. Decisões

1. **Engines puros em `lib/engines`**: sem I/O, testáveis com casos conhecidos, reutilizados por API, agentes, backtest e UI.
2. **Candle fechado por padrão**: elimina repaint; custo é 1 candle de atraso, explícito na UI.
3. **Estatística antes de ML**: pesos e limiares calibrados por backtest transparente (amostra + IC de Wilson).
4. **LLM no fim**: recebe JSON; resposta com número inexistente no JSON é rejeitada.

# Trading Engine — fórmulas e regras

Todos os módulos estão em `lib/engines/` (puros, sem I/O) e usam **somente candles fechados** (`getCandles` descarta o candle em formação por padrão; `includeForming: true` só para exibição e volume do candle atual).

## Data Quality (`quality.ts`)
- Candle válido: OHLC finitos e > 0, `high ≥ max(open, close, low)`, `low ≤ min(open, close, high)`, volume ≥ 0, `closeTime > openTime`.
- Série: ordena por `openTime`, remove duplicados (fica o último), descarta inválidos, conta lacunas (`Δ openTime > 1,5 período`), sinaliza outliers (amplitude > 12× mediana).
- Status: `OFFLINE` (sem coleta) > `DELAYED` (cache por falha da fonte ou último fechado > 2 períodos atrás) > `DEGRADED` (lacuna, inválido, divergência > 0,5%) > `FALLBACK` (fonte secundária) > `LIVE`.
- Divergência: ticker Binance (USDT) × último preço Kraken (USD), 1 chamada, cache 60 s.

## Market Structure (`structure.ts`)
- Pivô de força *k*: máxima estritamente maior que as *k* barras à esquerda e ≥ às *k* à direita (topos iguais: vale o primeiro). Confirmado em `index + k`.
- Swing: pivôs alternados com amplitude ≥ `minAtr × ATR(14)` (aquecimento: média do TR antes da 14ª barra). Externo `k=5, 1,5 ATR`; interno `k=2, 0,5 ATR`.
- Rótulos HH/LH/HL/LL contra o swing anterior do mesmo tipo.
- Eventos por **fechamento** além do swing ativo: BOS (a favor da tendência vigente ou primeira quebra), CHoCH (contra), MSS (CHoCH com corpo ≥ 1 ATR). Pavio além e fechamento de volta = falha de rompimento/perda (uma por swing).
- Faixa = último swing baixo → último swing alto; premium > 55%, desconto < 45%.

## Liquidity (`liquidity.ts`)
- EQH/EQL: swings do mesmo tipo a ≤ 0,1 ATR; PDH/PDL e PWH/PWL: último dia/semana UTC fechado; swings externos isolados (3 mais recentes por lado).
- Estado por candles posteriores: `swept` (pavio além, fechamento de volta), `broken` (fechamento além), `available`.

## Multi-Timeframe (`mtf.ts`)
- Por TF (1W, 1D, 4H, 1H, 30m, 15m): estrutura externa, EMA trend score (preço/EMA21/EMA50/EMA200 + inclinação da EMA50, −100..100), RSI, posição na faixa, ATR%, fase (tendência, pullback, reversão com CHoCH/MSS ≤ 12 barras, lateral).
- HTF alignment = Σ peso × direção / Σ pesos × 100; pesos 1W .30 · 1D .30 · 4H .20 · 1H .12 · 30m .04 · 15m .04. ≥ 60 alinhado em alta, ≤ −60 em baixa.

## Backtest (`lib/patterns/backtest.ts`)
- Walk-forward: em cada 2ª barra a detecção vê só o passado (160 barras); entrada no fechamento; alvo/stop do padrão; horizonte 40 barras; mesmo padrão com intervalo mínimo de 12 barras; alvo e stop no mesmo candle = stop.
- Por operação: R = resultado ÷ |entrada − stop|; MFE/MAE em R; 1R/2R/3R alcançados antes do stop; regime na entrada (EMA50/EMA200, só passado).
- Por recorte (todos, ativo, regime, ativo×regime): acerto (Wilson 95%), 1R/2R/3R, expectativa em R, ganho/perda médios, profit factor, máx. drawdown em R (ordem cronológica), MFE/MAE médios, Sharpe por operação.
- Historical edge: recorte mais específico com n ≥ 30; abaixo disso, marcado como amostra pequena.

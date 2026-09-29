# Validação fora da amostra — setups do CryptoScanner (29/09/2026)

Regra de publicação: filtros e saídas são escolhidos em um período (IS) e medidos em outro, nunca visto (OOS).
Só é publicado como "validado" o que tem expectativa líquida positiva no OOS.

## Dados e custos

| Item | Valor |
|---|---|
| Universo | 30 criptos listadas hoje na Binance spot (viés de sobrevivência: ativos deslistados não entram) |
| 4H | 2.999 candles/ativo, 17/05/2025 → 29/09/2026 |
| 1D | 1.099 candles/ativo, 26/09/2023 → 28/09/2026 |
| Corte IS/OOS | 60% iniciais do tempo / 40% finais |
| Custos | 15 bps por lado (taxa 10 + slippage 5); stop e alvo no mesmo candle = stop; gap além do stop sai na abertura |
| Posição | uma por ativo por vez |

Contexto de mercado (buy & hold mediano por ativo): 4H IS −37% (3/30 positivos), 4H OOS +24% (24/30);
1D OOS −49% (4/30 positivos).

## 1. Setup atual (pullback após BOS/CHoCH, 4H) — NÃO validado

`tools/research/gen-candidates.ts` + `calibrate.ts`: 3.278 gatilhos TRIGGERED, corte 29/03/2026,
14 filtros (simples e pares) × 20 saídas, seleção só no IS (n ≥ 150, maior limite inferior do IC 90% por bootstrap).

| Configuração | IS | OOS |
|---|---|---|
| Linha de base (stop estrutural, alvo TP1) | n=707 E=−0,024R | n=473 E=−0,105R |
| Escolhida pelo IS (BOS + EMA a favor, stop estrutural, alvo 3R) | n=490 E=+0,170R PF 1,45 | n=325 E=−0,037R PF 0,91 |
| 20 melhores do IS | — | 0/20 positivos · mediana −0,070R |

Conclusão: a vantagem do IS era ajuste ao ruído. O setup continua no produto como leitura de contexto,
com as estatísticas históricas do próprio ativo exibidas sem ajuste; não é anunciado como estratégia validada.

## 2. Rompimento Donchian + EMA 200 (hipótese alternativa) — validado, com ressalvas

`tools/research/breakout.ts` (grade de 32 configs), `breakout-robust.ts` (estresse), `breakout-portfolio.ts`
(carteira) e `validate-template.ts` (motor do produto: `strategySignals` + `runSignals`).

Grade: 32/32 configurações com OOS > 0 em 1D e em 4H. Spearman IS×OOS: 0,78 (1D) e 0,17 (4H).

### Modelo 4H — N55, stop inicial 2 ATR, trailing 20 candles, fechamento > EMA 200, long

| Medida | IS (jun/2025–mar/2026) | OOS (mar–set/2026) |
|---|---|---|
| Trades · E líquida | 290 · +0,37R | 312 · +0,30R |
| PF · acerto | 1,58 · 30% | 1,44 · 30% |
| Ativos com soma R > 0 | — | 21/30; sem os 3 melhores: +40,5R |
| Entrada na abertura seguinte | +0,37R | +0,32R |
| Custo 30 bps/lado | +0,29R | +0,23R |
| Nulo: entradas aleatórias acima da EMA 200, mesma saída | — | mediana +0,10R · p ≈ 0,04 |
| Carteira, todos os sinais, 0,5%/trade | +65% · DD 18% | +55% · DD 38% |
| Carteira, máx. 5 posições, 0,5%/trade | +17% · DD 14% | +19% · DD 18% |

### Modelo 1D — N55, stop inicial 3 ATR, trailing 20 candles, fechamento > EMA 200, long

| Medida | IS (abr/2024–jul/2025) | OOS (jul/2025–set/2026) |
|---|---|---|
| Trades · E líquida | 86 · +0,92R | 64 · +0,95R |
| PF · acerto | 3,16 · 43% | 3,16 · 38% |
| Ativos com soma R > 0 | — | 14/29; **sem os 3 melhores: −0,3R** (ZEC = 50R de 61R) |
| Nulo: entradas aleatórias acima da EMA 200 | — | p ≈ 0,02 |
| Carteira, todos os sinais, 0,5%/trade | +47% · DD 7% | +33% · DD 4% |
| Carteira, máx. 5 posições, 0,5%/trade | +6% · DD 5% | +2% · DD 4% |

Drawdown de carteira medido nas saídas (sem marcação a mercado): o real é maior.

### Ressalvas que acompanham os modelos no app

1. Acerto de 30–40%: sequências longas de perdas são o funcionamento normal.
2. 4H: perdas correlacionadas entre ativos; todos os sinais a 0,5% por trade levaram a 38% de drawdown no OOS.
3. 1D: resultado OOS depende de um ativo (ZEC); limitado a 5 posições, o retorno some.
4. Viés de sobrevivência (só ativos listados hoje) favorece long-only.
5. Janelas curtas (16 meses no 4H, 3 anos no 1D). Resultado passado não garante resultado futuro.

## Reproduzir

```bash
npx tsx tools/research/fetch-history.ts <saida>/history.json
npx tsx tools/research/gen-candidates.ts <saida>/history.json <saida>/cand-4h.json
npx tsx tools/research/calibrate.ts <saida>/cand-4h.json 15
npx tsx tools/research/breakout.ts <saida>/history.json 4h 15
npx tsx tools/research/breakout-robust.ts <saida>/history.json 4h 15 200
npx tsx tools/research/breakout-portfolio.ts <saida>/history.json 4h 55,20,2 15
npx tsx tools/research/validate-template.ts <saida>/history.json "Rompimento Donchian 55 + EMA 200 (4H)"
```

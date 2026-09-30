# Sistema multiagente — `/agents`

Arquitetura própria (nenhum prompt, fluxo ou código da referência foi usado). Todos os números vêm de código determinístico; o LLM é opcional e restrito a interpretação textual e leitura de imagem.

```
dados de mercado (Binance → Kraken fallback, cache)
        ↓
  scanner-agent  (N ativos em paralelo controlado: métricas, padrões, volume anômalo)
        ↓                       ┌ technical-analysis-agent
  market-agent (1 ativo) ──────►├ trend-agent            (em paralelo)
                                ├ risk-agent
                                └ sentiment-agent
        ↓
  orchestrator  → conflitos · evidências ponderadas · dados ausentes · métricas derivadas
        ↓
  resultado consolidado (JSON) → API /api/analysis → dashboard (/graficos)
```

## Contrato de um agente (`agents/types.ts`)

| Campo | Descrição |
|---|---|
| `name`, `purpose` | Identificação e propósito |
| `inputs`, `outputs` | Documentação dos campos (exposta em `GET /api/agents/definitions`) |
| `inputSchema`, `outputSchema` | Schemas **zod**; entrada e saída são validadas pelo runtime |
| `allowedTools` | Únicas ferramentas que o agente pode obter via `ctx.tools.use(name)`; qualquer outra lança `ToolNotAllowedError` |
| `rules` | Regras de negócio documentadas |
| `timeoutMs` | Limite de execução (Promise.race + AbortSignal) |
| `run(input, ctx)` | Implementação |
| `fallback(input, ctx, err)` | Resultado degradado quando `run` falha/estoura (opcional) |

O runtime (`agents/runtime.ts`) nunca lança: devolve `{ status: ok | fallback | error, output, error, logs, durationMs }`. Cada `ctx.log(...)` vira uma entrada estruturada persistida em `AgentResult.logs` quando há banco.

## Ferramentas (`agents/tools.ts`)

| Nome | Origem | Usada por |
|---|---|---|
| `market` | `services/market/market-service` (cache + fallback) | market, scanner, trend |
| `indicators` | `lib/indicators/snapshot` | scanner, technical, trend, risk |
| `patterns` | `lib/patterns/detect` | scanner, technical |
| `volume` | `lib/scanner/volume` | scanner |
| `sentiment` | `services/sentiment/*` (F&G + RSS) | sentiment |
| `llm` | `services/llm` (Anthropic, opcional) | sentiment, orchestrator, análise de imagem |

## Agentes

### market-agent
Entrada `{symbol, timeframe, limit}` → `{candles, ticker, provenance{source, asOf, stale}, quality{candles, gaps, lastCandleAgeMs, lastCandleOpen, sufficientForIndicators}}`. Timeout 15 s. Nunca preenche lacunas.

### scanner-agent
Entrada `{symbols[], timeframe, includePatterns, minPatternConfidence, patternDirection, includeVolume, volumeTimeframes, concurrency}` → linhas com preço, variação, volume, volume relativo, volatilidade (ATR% e σ), tendência (+força), EMA 8/25/100/200, RSI, MACD, Bollinger %B, StochRSI, momentum, suporte, resistência, rompimento, sinal agregado, padrões; `volumeAlerts[]`, `errors[]`, `sources[]`, `staleCount`. Timeout 90 s. Falha em um ativo não interrompe o scan.

### technical-analysis-agent
Entrada `{symbol, timeframe, candles, minPatternConfidence}` → JSON:

```json
{
  "asset": "BTC", "timeframe": "4h",
  "trend": "bullish | bearish | neutral",
  "momentum": "strong_up | up | flat | down | strong_down",
  "support": [..], "resistance": [..],
  "signals": [{ "code": "ema_cross", "label": "...", "direction": "bullish", "weight": 2, "detail": "..." }],
  "patterns": [..], "indicators": {..},
  "confidence": 0, "bias": "bullish", "explanation": "..."
}
```
`confidence` mede coerência entre sinais ponderados (nunca probabilidade de retorno). Timeout 10 s.

### trend-agent
Classifica tendência no timeframe e no superior (5m/15m→1h, 30m/1h→4h, 4h→1d, 1d→1w), estrutura das EMAs, inclinação por regressão; `alignment: aligned | partial | conflicting | unknown`. Fallback: apenas o primário. Timeout 15 s.

### risk-agent
Volatilidade (ATR%, σ dos retornos), liquidez (escala log do volume 24h em USD; relativa ao provedor), distância a S/R, stop sugerido (1,5×ATR), relação recompensa/risco long/short, `riskLevel: low | medium | high | extreme`, `riskScore 0..100`, `notes[]`. Timeout 8 s.

### sentiment-agent
Índice Medo & Ganância (alternative.me) + manchetes RSS (Cointelegraph, CoinDesk) pontuadas por léxico auditável (termos casados são devolvidos); opcionalmente o LLM reclassifica as manchetes já coletadas. Toda saída traz `sources[{name, asOf, stale}]`. Fallback: neutro com confiança 0. Timeout 20 s.

### orchestrator (`agents/orchestrator.ts`)
1. Executa market-agent; sem dados, devolve resultado neutro com `missingData`.
2. Executa técnica, tendência, risco e sentimento em paralelo.
3. **Evidências ponderadas**: técnica 0,45 (+0,15 padrão principal), tendência 0,30, sentimento 0,15; a confiança de cada evidência modula seu peso.
4. **Conflitos**: técnica × tendência (alto), timeframes opostos (médio), padrões opostos (médio), sinais divididos (baixo), sentimento × técnica (baixo), risco alto com confiança alta (médio).
5. **Dados ausentes**: candles obsoletos, ticker ausente, série curta, lacunas, timeframe superior, F&G, manchetes, agentes com erro.
6. **Métricas derivadas**: `score` (−1..1), `riskAdjustedScore = score × (1 − riskScore/200)`, `confidence` (média ponderada − penalidades por conflito e ausência).
7. `narrative` determinística; `llmNarrative` opcional (nunca altera números). `disclaimer` sempre presente.

## Agentes do usuário (página /agentes)

`Agent` (Prisma) = nome, ícone, ativos, tipo de operação, timeframe, estratégias, confiança mínima, notificação, status. O worker (`worker/scheduler.ts`) executa todos os agentes ativos a cada `WORKER_CYCLE_SECONDS` (padrão 300 s); `services/user-agent-service.ts` avalia as estratégias (`agents/strategies`), grava `AgentLog`, respeita o cooldown (`AGENT_ALERT_COOLDOWN_MINUTES`, padrão 30) e envia Telegram quando configurado. `POST /api/agents/:id/run` executa imediatamente.

Estratégias (determinísticas, cada sinal traz `reason`): técnica (EMAs, RSI, MACD, Bollinger squeeze, StochRSI 90/50/10, EMA100+StochRSI, padrão confirmado, pico de volume), sentimento (extremos F&G, momentum de manchetes), ciclos (SMA 20 semanas, reversão à média), híbridas (Day Trade 1D·4H·1H, Swing 1W·1D·4H, confluência).

## Regras gerais de segurança e honestidade

- Indicadores, padrões, alvos e stops são calculados por código; o LLM não gera números.
- Toda fonte externa é anotada com origem e data; dado obsoleto é sinalizado (`stale`).
- Confiança nunca é apresentada como promessa de resultado financeiro; o `disclaimer` acompanha toda análise.
- Sem provedor de IA configurado, a análise de imagem informa indisponibilidade em vez de simular um resultado.

# CryptoScanner — Audit Report (V1 → V2)

Data: 2026-09-29 · Base: commit `29abb68` · Método: leitura integral dos módulos de cálculo, dados, API, jobs e UI; execução local (Postgres 16 + Redis) com 115 testes de API, 30 passos E2E, 97 testes unitários e auditoria de responsividade (76 combinações página × largura). Referências `arquivo:linha` apontam para esse commit.

Classificação: **P0** crítico (resultado errado ou risco de decisão com dado ruim) · **P1** alto · **P2** médio · **P3** desejável.

---

## 1. Arquitetura atual

```
Browser (Next.js 16 App Router, React 19, SWR, lightweight-charts v5)
   │  REST /api/* (withApi: zod + erro mascarado)      SSE /api/stream/tickers
   ▼
Route handlers ──► services/* ──► agents/* (runtime + orchestrator) ──► lib/indicators, lib/patterns
   │                    │
   │                    ├─► services/market/market-service (cache + fallback)
   │                    │        └─ providers: Binance spot (api → data-api.binance.vision), Kraken,
   │                    │           Binance Futures, CoinGecko, alternative.me, RSS, blockchain.info
   │                    └─► Prisma (Postgres/Neon)   lib/cache (Redis/Upstash | memória)
   ▼
Jobs: /api/cron/cycle (5 min, QStash) · /api/cron/whales (10 min) · /api/cron/backtest (diário)
      worker/ (processo longo opcional: WebSocket Binance + scheduler) — não usado na Vercel
```

- 220 arquivos TS/TSX, ~21,9 mil linhas. 21 modelos Prisma. 30 ativos.
- Autenticação: JWT HS256 em cookie httpOnly (`lib/auth.ts:47-77`), bcrypt 10. Sem middleware; cada rota valida.
- LLM: opcional (Anthropic); sem chave, análise determinística.

## 2. Funcionalidades que funcionam (verificadas)

| Módulo | Evidência |
|---|---|
| Scanner (tabela, padrões, volume anômalo, histórico) | smoke 115/115, E2E passos 2–5 |
| Gráficos (candles, EMA/BB/MACD/StochRSI, S/R, LTA/LTB) | E2E 6 |
| Agentes (15 estratégias) e Sentinela | E2E 18–19 |
| Panorama (global, F&G, derivativos, notícias) | E2E 7 |
| Bubbles, Fibonacci, Simulador DCA, Jornada, Mentor | E2E 8–12 |
| Carteira, alertas, preferências, push, suporte, LGPD | E2E 21–29 |
| Taxa de acerto (backtest walk-forward sem lookahead) | smoke 41–42, E2E 25 |
| /status com heartbeat dos jobs | smoke 43, E2E 26 |
| Indicadores RSI/EMA/MACD/ATR/BB/StochRSI | fórmulas conferidas com a definição do TradingView (`lib/indicators/core.ts`) |

## 3. Funcionalidades com defeito

| # | Pri | Defeito | Local |
|---|---|---|---|
| B1 | P0 | Candle em formação entra em todos os sinais (cruzamentos, rompimentos, traps, LTA rompida) → sinais que aparecem e somem ("repaint") | `services/market/market-service.ts:86-111`; `lib/indicators/snapshot.ts:81-87`; `lib/patterns/detect.ts:548-637`; `agents/strategies/index.ts:104-127` |
| B2 | P0 | 14 de 15 estratégias emitem COMPRA/VENDA sem stop nem alvo e isso vai para Telegram/push | `agents/strategies/index.ts:61-67` |
| B3 | P1 | Coletor reescreve `fetchedAt=now()` mesmo sem mensagens do WebSocket → dado parado aparece como ao vivo | `worker/collector.ts:107-111, 117` |
| B4 | P1 | Retorno mensal, CAGR e drawdown do simulador incorretos com aportes (CAGR sem XIRR; drawdown sobre valor total) | `services/simulation-service.ts:117-145` |
| B5 | P1 | `vercel.json` agenda o ciclo 1×/dia; o app espera 5 min (depende do QStash externo) | `vercel.json:7`; `services/status-service.ts` |
| B6 | P1 | Ciclo cron sequencial pode passar de 60 s com mais agentes | `app/api/cron/cycle/route.ts:13` |
| B7 | P2 | Rastreio ao vivo entra no preço do candle em formação; backtest entra no fechamento → taxas não comparáveis | `services/pattern-stats-service.ts:219-229` vs `lib/patterns/backtest.ts:93` |
| B8 | P2 | `/api/market/tickers` em BRL retorna `NaN` se o câmbio falhar | `app/api/market/tickers/route.ts:21` |
| B9 | P3 | `autoFibonacci` lança erro com high ≤ low vindo do modo manual | `lib/fibonacci.ts:25` |

## 4. Problemas de lógica de trading

| # | Pri | Problema | Local |
|---|---|---|---|
| T1 | P0 | Não existe estrutura de mercado: sem sequência de swings, BOS, CHoCH, estrutura interna/externa. O único HH/HL compara os dois últimos topos e fundos de forma independente | `lib/patterns/detect.ts:504-544` |
| T2 | P0 | Não existe motor de liquidez (EQH/EQL, PDH/PDL, PWH/PWL, sweeps) | — |
| T3 | P0 | Não existe análise multi-timeframe hierárquica; o trend-agent só olha 1 TF acima | `agents/trend-agent.ts:86-106` |
| T4 | P0 | Não existe risco de posição (tamanho, R, alavancagem, liquidação, preço médio) | `agents/risk-agent.ts` só calcula ATR%, HV% e score |
| T5 | P0 | Backtest só mede alvo/stop do padrão: sem 1R/2R/3R, expectancy, profit factor, MAE/MFE, drawdown, recorte por regime | `lib/patterns/backtest.ts` |
| T6 | P1 | "Confiança %" é aderência geométrica com bases arbitrárias por detector/estratégia (50+…, 55+…, 60+…, fixo 65/66), exibida como porcentagem ao lado de COMPRA/VENDA → lida como probabilidade | `detect.ts:164,239,405,515,558`; `strategies/index.ts:86-380`; `user-agent-service.ts:66,90` |
| T7 | P1 | Orquestrador conta o padrão duas vezes e soma EMAs correlacionadas como votos independentes; confiança entra no numerador do score e de novo na confiança | `agents/orchestrator.ts:231, 285-299`; `technical-analysis-agent.ts:141-143` |
| T8 | P1 | EMA100/EMA200 com 300 (ou 200) candles divergem do TradingView (peso residual da semente ≈ 37%) | `orchestrator.ts:111`; `trend-agent.ts:86` |
| T9 | P1 | Fibonacci usa máxima/mínima absolutas de 60 candles (inclui o candle aberto), sem swing estrutural nem OTE | `lib/fibonacci.ts:40-58` |
| T10 | P1 | Veredito do orquestrador sem nível de invalidação; stop/alvo vêm do padrão mesmo quando aponta na direção oposta | `orchestrator.ts:301-309` |
| T11 | P1 | Score de risco calibrado para 4H aplicado a todos os TFs (5m sempre "baixo", 1w quase sempre "extremo") | `agents/risk-agent.ts:79-92` |
| T12 | P2 | S/R: tolerância fixa 0,6% (não ATR), topos e fundos misturados, força com toques limitados a 3, sem zona, sem volume, sem reação; pivôs iguais se anulam | `lib/indicators/levels.ts:25-26, 50-81` |
| T13 | P2 | Regime = voto de EMAs + inclinação fixa ±0,05%/barra; momentum com limiares fixos para todos os TFs | `snapshot.ts:125-161` |
| T14 | P2 | Regressão de cunha/triângulo usa o índice do pivô (0,1,2) e não o índice da barra | `detect.ts:305,335,430,469` |
| T15 | P2 | Ausentes: VWAP, ADX, volume profile, divergências, sessões, Z-score de volume, calendário econômico | — |
| T16 | P3 | Viés do Medo & Ganância não monotônico; funding com limiares fixos | `services/panorama-service.ts:149,175` |

## 5. Problemas de dados

| # | Pri | Problema | Local |
|---|---|---|---|
| D1 | P0 | Nenhuma validação de candle (OHLC coerente, NaN, openTime duplicado/fora de ordem, lacunas) | `providers/binance.ts:24-35`; `providers/kraken.ts:44-61` |
| D2 | P0 | Sem status de qualidade por dado (LIVE/DELAYED/…); só `stale` booleano | `lib/cache.ts:258`; `market-service.ts` |
| D3 | P1 | Troca silenciosa Binance (USDT) → Kraken (USD) sem checar divergência de preço | `market-service.ts:57-78` |
| D4 | P1 | Janela de dado velho de 6 h igual para 5m e 1D | `market-service.ts:48` |
| D5 | P2 | Kraken inventa `updatedAt=Date.now()` | `providers/kraken.ts:123` |
| D6 | P2 | Snapshots velhos persistidos como `collectedAt=now()` | `worker/persist.ts:120-127` |
| D7 | P2 | Fallback Kraken faz ~31 chamadas por atualização de tickers | `providers/kraken.ts:93-105` |

## 6. Problemas de UX

| # | Pri | Problema |
|---|---|---|
| U1 | P1 | 17 itens de menu em módulos isolados; não há tela única por ativo (terminal) com contexto → estrutura → níveis → risco |
| U2 | P1 | "Confiança 72%" ao lado de COMPRA/VENDA sem explicar a origem ("why this signal?") |
| U3 | P1 | Sinais sem invalidação, sem zona de entrada, sem TP1/TP2/TP3, sem R |
| U4 | P2 | Nenhum resultado "NO TRADE" explícito; toda análise termina em alta/baixa/neutro |
| U5 | P2 | Semântica de cor não padronizada entre módulos (ex.: taxa baixa em vermelho com retorno positivo em verde no mesmo cartão) |
| U6 | P3 | Timezone fixo do servidor em textos do Mentor (`mentor-service.ts:128`); sem escolha do usuário |

Responsividade: 76/76 combinações sem rolagem horizontal após as correções de 29/09.

## 7. Problemas de segurança

| # | Pri | Problema | Local |
|---|---|---|---|
| S1 | P1 | `ALLOW_SELF_PLAN_CHANGE` padrão `true`: qualquer conta vira PLATINUM (análises de imagem ilimitadas → custo de LLM) | `lib/env.ts:45-48`; `app/api/plans/change/route.ts:17` |
| S2 | P1 | `/api/analysis?llm=1&refresh=1` e `/api/mentor` chamam LLM para anônimos no balde "public" (120/min) | `app/api/analysis/route.ts:13-14`; `services/mentor-service.ts:179` |
| S3 | P1 | Rate limit confia no 1º IP de `X-Forwarded-For` (falsificável fora da Vercel) | `lib/rate-limit.ts:28-30` |
| S4 | P1 | Credenciais expostas durante a montagem (tokens GitHub, Neon, Upstash, CRON_SECRET em URL) — rotação pendente | infra |
| S5 | P2 | Papel/plano confiados no JWT por 7 dias; logout não revoga | `lib/api.ts:73` |
| S6 | P2 | Rotas autenticadas e públicas sem rate limit (agents, alerts, watchlist, stream, telegram/test) | vários |
| S7 | P2 | `/api/health` e SSE devolvem mensagem de erro bruta | `database/client.ts:48`; `app/api/stream/tickers/route.ts:29` |
| S8 | P3 | Open redirect `next=//dominio` no login | `components/auth/auth-form.tsx:48` |
| S9 | P3 | Sem CSP/HSTS; MIME de upload não verificado por magic bytes | `next.config.ts`; `app/api/analysis/chart-image/route.ts:18` |

Sem achados: injeção SQL (só `Prisma.sql` parametrizado), XSS (único `dangerouslySetInnerHTML` é script estático), segredo no frontend (só `NEXT_PUBLIC_APP_*`).

## 8. Problemas de performance

| # | Pri | Problema | Local |
|---|---|---|---|
| F1 | P2 | Cada componente com `useTickers` abre um EventSource e mantém polling SWR de 10 s em paralelo | `hooks/use-tickers.ts:19-41` |
| F2 | P2 | SSE consulta tickers a cada 3 s por conexão e prende função serverless 50 s | `app/api/stream/tickers/route.ts:35` |
| F3 | P2 | N+1: logs de agente, sinais de padrão, alertas por candle, push sequencial | `user-agent-service.ts:283`; `pattern-stats-service.ts:216-262`; `alert-service.ts:29` |
| F4 | P2 | Tabelas sem retenção: AgentLog, ScannerResult, ScanHistoryEntry, AgentExecution/Result, PatternSignal | `schema.prisma` |
| F5 | P2 | Índices ausentes: `Agent(status)`, `Alert(active)`, `CronRun(startedAt)` | `schema.prisma` |
| F6 | P3 | Scan completo de 30 ativos no request anônimo com `refresh` | `app/api/scanner/run` |

## 9. Débito técnico

- Código morto: `SCANNER_TIMEFRAMES`, `listAssets`, `getHitRateMap`, `TOOL_NAMES`, `SchemaOf`, `HIGH_FREQUENCY_TIMEFRAMES`, `getSession`, `logger` exportado, `components/ui/switch.tsx`.
- Logs sem request id, rota ou latência (`lib/logger.ts`).
- Valores monetários em `Float`; enums como `String` livre.
- Arquivos grandes: `detect.ts` (662), `agents-view.tsx` (649), `strategies/index.ts` (461).

## 10. Funcionalidades ausentes (vs. especificação V2)

Data Engine com metadados por dado · Data Quality · Market Structure · MTF matrix · Liquidity map · Sessions · S/R por zonas com força · Fibonacci estrutural + OTE · VWAP (diário/semanal/mensal/ancorado) · Volume Profile (POC/VAH/VAL) · Z-score de volume · Divergências · ADX/regime · Compressão (squeeze/NR4/NR7/inside bar) · Liquidações · Setup engine com estados · Confluence engine com evidência negativa · NO TRADE · Cenários condicionais · Risk engine (tamanho, alavancagem, liquidação, preço médio, stress) · Smart stops · Entry zone · TP1–TP3 · EV em R · Calendário econômico · Correlação · Risco de carteira · Journal · Paper trading · Terminal unificado · Guardrails de LLM com validação numérica.

## 11. Matriz de prioridade

| Pri | Item | Esforço | Dependências |
|---|---|---|---|
| **P0** | Data Quality (candle fechado, validação, status, divergência) | M | — |
| **P0** | Market Structure (swings confirmados, HH/HL/LH/LL, BOS, CHoCH, interna/externa) | M | Data Quality |
| **P0** | Liquidity (EQH/EQL, PDH/PDL, PWH/PWL, BSL/SSL, sweeps) | M | Structure |
| **P0** | Multi-Timeframe (matriz 1W→15m, HTF alignment score) | M | Structure |
| **P0** | Risk Engine (tamanho, R, alavancagem/liquidação, preço médio, stress, smart stops) | M | — |
| **P0** | Backtest (1R/2R/3R, expectancy, PF, MAE/MFE, DD, por regime) | M | Regime simples |
| **P1** | Segurança S1–S3; regime (ADX/ATR pct/BBW); derivativos com OI Δ; VWAP; volume profile; confluence + NO TRADE; cenários; Sentinela 2.0 | G | P0 |
| **P2** | Terminal unificado; alertas "why now" com dedup; carteira/risco agregado; journal; analytics pessoal; retenção e índices; logging com request id | G | P1 |
| **P3** | ML, otimização, novas exchanges, CSP/HSTS | — | — |

Ordem de execução adotada: P0 na ordem acima, cada item com teste unitário de casos conhecidos, integração via API, teste de regressão (unit + smoke + E2E) antes do próximo.

# CryptoScanner

Scanner de padrões gráficos em Bitcoin e altcoins com sistema multiagente, dados públicos de mercado em tempo real e análise técnica programática. Implementação **clean-room**, independente: nenhum código, prompt, asset, banco ou API privada de terceiros foi usado. O inventário do produto de referência (só o que é público) está em [`docs/SPEC.md`](docs/SPEC.md); a arquitetura de agentes em [`docs/AGENTS.md`](docs/AGENTS.md).

## Funcionalidades

- **Scanner** (`/scanner`): 17 padrões gráficos (fundo/topo duplo, C&O, triângulos, bandeiras, cunhas de alta e de baixa, pivôs HH+HL/LH+LL, toques em S/R, bear/bull trap, consolidação) sobre 30 ativos; filtros de timeframe (4H/1D/7D livres; 1H/30M/15M no plano PLATINUM), direção, moeda e confiança mínima; tabela em tempo real (preço, 24h, volume, volume relativo, volatilidade, tendência, RSI, momentum, sinal, padrão) com ordenação, busca, paginação, favoritos, filtros e auto-atualização; alertas de volume (≥100 % sobre a média, candles 30M e 1H); histórico de alertas; análise de gráfico por IA (upload JPG/PNG/WebP ≤ 5 MB, requer login e provedor LLM); bloco/modal PLATINUM.
- **Gráficos** (`/graficos`): candles (TradingView Lightweight Charts) com EMA 8/25/100/200, Bollinger, volume, StochRSI, MACD, suportes/resistências, Fibonacci automático, desenho de padrões detectados e painel de **análise consolidada** pelo orquestrador.
- **Agentes de IA** (`/agentes`): wizard de 5 passos, 15 estratégias determinísticas em 4 categorias, verificação server-side a cada 5 min, cooldown de 30 min, log ao vivo, Telegram, presets "Scanner de IA", excluir todos.
- **Carteira** (`/carteira`): watchlist com posições simuladas e P&L, alertas (preço, RSI, padrão, volume), análises salvas.
- **Panorama** (`/panorama`): resumo executivo por regras, ciclo, Medo & Ganância, derivativos (Binance Futures público), manchetes e grandes transações on-chain (≥ 50 BTC, coletadas pelo cron).
- **Bubbles** (`/bubbles`): 100 maiores por volume com 1h/24h/7d/30d. **Sentinela** (`/sentinela`): vigia multipadrão por moeda com plano de trade e confluência. **Simulador** (`/simulador`): backtest DCA/aporte único com preços diários reais (BRL via USDTBRL).
- **Jornada Trader** (`/jornada`): 12 aulas autorais com teste e progresso na conta. **Mentor** (`/mentor`): assistente por regras com dados reais do orquestrador e protocolos de mindset (LLM opcional).
- **Análise de gráfico**: com provedor de visão interpreta a imagem; sem ele, faz a leitura determinística sobre os dados reais do ativo informado (nunca simula).
- **Fibonacci** (`/fibonacci`), **Planos** (`/planos`, sem cobrança), **Suporte** (`/suporte`: FAQ, chamados, exclusão LGPD), login/registro, preferências, tema claro/escuro, USD/BRL, PWA instalável, responsivo.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict · Tailwind CSS 4 · componentes próprios estilo shadcn/Radix · Prisma 6 + PostgreSQL · Redis (ioredis, com fallback em memória) · Lightweight Charts · zod · Vitest · worker Node (`tsx`) com WebSocket Binance.

## 1. Instalação

```bash
git clone <seu-repositorio> cryptoscanner && cd cryptoscanner
npm install            # gera o Prisma Client no postinstall
cp .env.example .env.local
cp .env.example .env   # Prisma CLI, worker e Docker leem .env
```

Requisitos: Node ≥ 20.9 (testado com 22), PostgreSQL 14+ (opcional para navegar; obrigatório para login/agentes/carteira), Redis 6+ (opcional).

## 2. Configuração

Edite `.env.local`/`.env` (ver `.env.example`, todos comentados). Principais:

| Variável | Uso |
|---|---|
| `AUTH_SECRET` | Segredo do JWT de sessão (≥ 32 caracteres; obrigatório em produção) |
| `DATABASE_URL` | PostgreSQL. Sem ela o site funciona só com recursos públicos (scanner, gráficos, panorama) e as rotas de conta respondem 503 |
| `REDIS_URL` | Cache compartilhado web/worker. Sem ela, cache em memória por processo |
| `MARKET_PROVIDERS` | Ordem de fallback: `binance,kraken`. A Binance tenta `BINANCE_REST_URL` e depois `BINANCE_REST_FALLBACK_URLS` (`data-api.binance.vision`, sem bloqueio regional); a Kraken só entra se ambas falharem |
| `COINGECKO_API_KEY` | Opcional; câmbio BRL, market cap e dados globais |
| `LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `LLM_MODEL` | `none` (padrão, 100 % determinístico) ou `anthropic` para narrativa, reclassificação de manchetes e análise de imagem |
| `TELEGRAM_BOT_TOKEN` | Bot próprio para alertas dos agentes (o usuário informa o Chat ID) |
| `WORKER_CYCLE_SECONDS`, `AGENT_ALERT_COOLDOWN_MINUTES` | Ciclo do worker (300) e cooldown (30) |
| `ALLOW_SELF_PLAN_CHANGE` | `true` permite ao usuário trocar o próprio plano em `/planos` (ambiente de teste; não há cobrança) |
| `RATE_LIMIT_*` | Limites por minuto (público, autenticação, LLM) |

## 3. APIs externas necessárias

Todas públicas e sem chave por padrão:

| Fonte | Uso | Endpoint |
|---|---|---|
| Binance Spot | candles/tickers (primária) + WebSocket no worker | `api.binance.com/api/v3/klines`, `/ticker/24hr`, `stream.binance.com`; em regiões com HTTP 451 cai automaticamente para a base oficial só de dados `data-api.binance.vision` / `data-stream.binance.vision` |
| Kraken | candles/tickers (fallback) | `api.kraken.com/0/public/OHLC`, `/Ticker` |
| CoinGecko | USD→BRL, market cap, dados globais | `/simple/price`, `/coins/markets`, `/global` |
| alternative.me | Índice Medo & Ganância | `/fng/` |
| Cointelegraph / CoinDesk | manchetes RSS | feeds públicos |
| Anthropic (opcional) | LLM/visão | via SDK |
| Telegram Bot API (opcional) | alertas | `api.telegram.org` |

## 4. Execução local

```bash
# banco (se for usar recursos de conta)
npm run db:migrate        # aplica database/prisma/migrations
npm run db:seed           # 30 ativos + usuário demo (demo@cryptoscanner.local / Demo12345!)

npm run dev               # http://localhost:3000
```

Verificação: `GET /api/health` mostra banco, cache, provedores (com latência/erro), IA e Telegram.

## 5. Execução dos workers

O worker coleta tickers (WebSocket Binance ou polling REST com fallback), aquece o cache do scanner (4H/1D), persiste snapshots/candles/indicadores, executa os agentes ativos e avalia alertas a cada ciclo.

```bash
npm run worker            # produção (tsx)
npm run worker:dev        # com reload
```

Sem worker, a aplicação continua funcional: as rotas calculam sob demanda com cache curto; apenas a verificação periódica dos agentes/alertas e a persistência histórica dependem dele.

## 6. Banco de dados

Schema em `database/prisma/schema.prisma`; migration inicial em `database/prisma/migrations/20260928000000_init/`. Entidades: `User`, `UserPreference`, `Asset`, `MarketSnapshot`, `Candle`, `Indicator`, `ScannerResult`, `ScanHistoryEntry`, `Watchlist`, `WatchlistItem`, `Agent`, `AgentExecution`, `AgentResult`, `AgentLog`, `Alert`, `ChartAnalysis`, `SupportTicket`.

```bash
npm run db:migrate:dev    # cria nova migration a partir de mudanças no schema
npm run db:studio         # Prisma Studio
```

## 7. Sistema de agentes

Ver [`docs/AGENTS.md`](docs/AGENTS.md). Resumo: `market-agent → (technical-analysis, trend, risk, sentiment) → orchestrator`, mais o `scanner-agent` multi-ativo. Cada agente declara propósito, inputs, outputs, ferramentas permitidas, regras, timeout, fallback e schemas zod. Documentação viva: `GET /api/agents/definitions`. Execução: `GET /api/analysis?symbol=BTC&timeframe=4h`.

## 8. Testes e qualidade

```bash
npm run lint        # ESLint (flat config, regras React Compiler)
npm run typecheck   # next typegen + tsc --noEmit (strict, noUncheckedIndexedAccess)
npm test            # Vitest: indicadores, padrões, volume, fibonacci, cache, rate limit,
                    # provedores e fallback, sentimento, runtime/agentes/orquestrador/estratégias, rotas da API
```

Teste de integração contra um ambiente real (todas as rotas, fluxos positivos/negativos, gating de plano, rate limit; cria e limpa um usuário descartável):

```bash
BASE_URL=https://seu-app.vercel.app CRON_SECRET=<segredo> npm run smoke      # SKIP_RATE_LIMIT=1 para não bloquear o login por 60 s
```

E2E de interface (Playwright): `BASE_URL=https://seu-app.vercel.app CHROMIUM_PATH=<chromium> node tools/e2e-ui.mjs` (23 passos, screenshots em `e2e-out/`).

Validação visual: `CHROMIUM_PATH=<chromium> node tools/screenshot.mjs http://localhost:3000/scanner out.png` (Playwright; `tools/screenshot-auth.mjs` faz login antes, `tools/screenshot-light.mjs` usa o tema claro).

## 9. Deploy

### Docker Compose (Postgres + Redis + migrate + web + worker)

```bash
cp .env.example .env   # ajuste AUTH_SECRET etc.
docker compose up --build
```

`web` usa a saída `standalone` do Next.js (imagem enxuta, usuário não-root); `migrate` aplica as migrations antes de `web`/`worker` subirem.

### Vercel + Neon + Upstash (serverless, sem worker de longa duração)

1. **Neon**: crie o projeto Postgres; copie a *pooled connection string* para `DATABASE_URL` (acrescente `&pgbouncer=true`) e a *direct connection string* para `DIRECT_URL`.
2. **Upstash Redis**: crie o banco; copie a URL `rediss://…` para `REDIS_URL`.
3. **Vercel**: importe o repositório do GitHub. `vercel.json` já define a região `gru1` (São Paulo — a Binance responde nessa região) e o build `prisma generate && prisma migrate deploy && next build` (as migrations rodam no build). Variáveis: `AUTH_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, opcionais `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`/`LLM_PROVIDER`, `COINGECKO_API_KEY`.
4. **Ciclo dos agentes/alertas**: sem processo de longa duração, o ciclo roda por HTTP em `GET|POST /api/cron/cycle` (cabeçalho `Authorization: Bearer <CRON_SECRET>`). Agende a cada 5 min no **Upstash QStash** (Schedules → cron `*/5 * * * *`) ou no cron-job.org; e `GET|POST /api/cron/whales` a cada 10 min (`*/10 * * * *`) para as grandes transações on-chain. O cron diário do `vercel.json` é apenas um reforço (plano Hobby limita a 1×/dia).
5. Seed (opcional): `DATABASE_URL=<direct> npm run db:seed` a partir da sua máquina.

Limitações nesse modo: sem WebSocket da Binance (preços por REST a cada 3 s via SSE, que reconecta a cada 50 s); funções limitadas a 60 s por invocação.

### Manual

```bash
npm ci && npm run build && npm run db:migrate
PORT=3000 node .next/standalone/server.js   # copie public/ e .next/static conforme o Dockerfile
npm run worker
```

Recomendações: HTTPS atrás de proxy reverso (o SSE em `/api/stream/*` já envia `X-Accel-Buffering: no`), `AUTH_SECRET` forte, `ALLOW_SELF_PLAN_CHANGE=false` em produção, chave CoinGecko se o tráfego for alto.

## Segurança

Segredos apenas no servidor (`.env.local` ignorado pelo git; `.env.example` versionado). Validação de entrada com zod em todas as rotas; rate limiting por IP/usuário; senhas com bcrypt; sessão JWT HS256 em cookie `httpOnly`/`sameSite=lax`; erros sem stack no cliente; cabeçalhos `nosniff`, `X-Frame-Options`, `Referrer-Policy`; uploads limitados a 5 MB e MIME de imagem.

## Limitações declaradas (REIMPLEMENTAÇÃO NECESSÁRIA)

- Cobrança de planos não integrada (troca manual em ambiente de teste).
- Análise de imagem depende de um provedor de IA com visão configurado.
- Bot do Telegram é próprio (token do operador); o usuário informa o Chat ID.
- "Jornada Trader", "Sentinela" e "Simulações" da referência não foram reproduzidos (conteúdo/serviço proprietário sem detalhe público).

## Aviso

Conteúdo informativo e educacional gerado por algoritmos a partir de dados públicos. Não constitui recomendação de investimento; criptoativos envolvem risco elevado, inclusive de perda total do capital.

# Auditoria de banco, cron, cache e arquitetura

Nada foi editado. Os dois subagentes (`database-architect` e `architect-review`) leram o código com as regras da skill `supabase-postgres-best-practices`. Eu reabri os trechos dos itens 1, 3, 4, 5, 8 e 9 e confirmei. Os demais vêm dos relatórios dos subagentes com arquivo:linha, mas não os conferi linha a linha.

Limites desta auditoria:
- **Volume e lentidão:** não medi nada. Antes de criar índice, rode `EXPLAIN (ANALYZE, BUFFERS)` numa branch do Neon, não em produção.
- **Site:** não naveguei no www.cryptoscanner.com.br. Tudo vem do código.

## Alto impacto

**1. Tabelas que só crescem, e uma que nunca é lida (alto, M)**
- **Onde:** `services/scanner-service.ts:103` grava `scannerResult.createMany` a cada ciclo. O grep em todo o repositório não acha nenhuma leitura de `scannerResult`. Os 2 índices dela (`schema.prisma:180-181`) só encarecem a escrita.
- **Sem limpeza:** `AgentLog`, `AgentExecution`, `AgentResult`, `AnalyticsEvent`, `MonitorEvent`, `ScanHistoryEntry` e `PasswordReset` vencido.
- **Com limpeza:** `AccessLog` (190 dias), `MarketSnapshot` (7 dias) e `CronRun` (14 dias).
- **Mudança:** criar `purgeOldRows()` dentro de `runLifecycle`, apagando em lotes de 5.000. Adicionar `@@index([createdAt])` nas tabelas limpas por data. Em `ScannerResult`, parar de gravar ou apagar o que tem mais de 2 dias.
- **Decisão sua:** o prazo de `MonitorEvent`, `ScanHistoryEntry` e `BillingEvent`, porque aparecem ao usuário ou servem de auditoria.

**2. Regra de timeframe do PRO diz duas coisas (alto, M)**
- **Onde:** `lib/plans.ts:40-44` dá ao PRO só 4h, 1d e 1w. `lib/entitlements.ts:22,28` dá ao PRO do `1m` ao `1w`.
- **Efeito:** as rotas do Scanner e dos Agentes usam `PLANS` e bloqueiam 1h. As rotas de Monitor e Analista usam `entitlements` e liberam. O mesmo usuário PRO recebe respostas diferentes.
- **Qual regra vale:** `.agents/product-marketing.md` e o `CLAUDE.md` dizem que o 1H, 30M e 15M são do ELITE. Então `PRO_TF` parece ser o erro. Corrigir tira acesso que hoje vaza para o PRO, por isso precisa da sua confirmação.
- **Mudança:** um módulo único `lib/access-policy.ts`, derivado só do `Tier`, com teste de tabela (tier × recurso × timeframe), seguindo o TDD do projeto. A conversão ELITE→`PLATINUM` hoje está repetida em 5 lugares: `billing/webhook/route.ts:61`, `billing/kiwify.ts:247`, `admin-users-service.ts:206`, `plans/change/route.ts:24` e `entitlements.ts:66`.

**3. Ciclo do cron sem orçamento de tempo (alto, M)**
- **Onde:** `app/api/cron/cycle/route.ts:13,42-72` tem `maxDuration=120` e 7 etapas em série. `runAllActiveAgents` (`user-agent-service.ts:120-134`) roda um agente por vez, sem `take` e sem limite de tempo. `evaluateAlerts` também não tem limite.
- **Efeito:** se estourar, a Vercel encerra a função. `lifecycle` (onde ficaria a limpeza) e `pattern-signals` deixam de rodar, e `recordCronRun` (linha 77) não grava. O /status fica com um buraco sem aviso. `scanner-service.ts:72` usa `void persistPatterns(...)`, que pode ser perdido em função serverless.
- **Mudança:** um objeto `Deadline` compartilhado, lotes com `take` e `orderBy lastRunAt`, e concorrência limitada de 4 a 6. Gravar `recordCronRun` num `finally`. Trocar o `void` por `await` ou por `after()` (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`).
- **Monitores avaliados duas vezes:** `cycle/route.ts:59-62` e `cron/monitors/route.ts:16-18` rodam `evaluateMonitors`. O comentário diz que é uso do tempo que sobra, então é parcialmente intencional. A fingerprint única evita aviso duplicado, mas não o custo. Vale reduzir o orçamento do ciclo.

**4. Proteções dependem do Redis e falham em silêncio (alto, M)**
- **Onde:** `lib/cache.ts:179-190` cai para memória do processo quando o Redis falha. Isso afeta `lib/rate-limit.ts:18`, a trava do cron em `lib/cron.ts:36-41` (devolve `true` em erro) e a cota diária da IA em `app/api/analyst/chat/route.ts:42` e `app/api/markets/[symbol]/analyst/route.ts:38`.
- **Efeito:** na Vercel cada instância tem memória própria. O limite vira "por instância" e a cota da IA, que custa dinheiro, fica sem controle real. Só há um `log.warn`.
- **Mudança:** separar cache de leitura (pode usar memória) de contadores de controle. Sem Redis, o bucket de login responde 503, a cota da IA vai para o Postgres (`AiUsage(userId, day)` com `upsert increment`) e a trava do cron usa `pg_try_advisory_lock`. Alertar o admin quando o cache estiver em `memory` em produção.

**5. Painel de controle carrega todos os usuários para mostrar 25 (alto hoje baixo, cresce com a base; M)**
- **Onde:** `services/admin-users-service.ts:94` faz `findMany` sem `take`, e `lastAccessMap` monta um `IN` com todos os ids. O filtro, a ordenação e a página (`:113-115`) são feitos em memória. Cada linha traz 4 contagens (`_count`, linha 54). `services/admin-service.ts:19` lê todas as assinaturas.
- **Mudança:** buscar só ids e campos de classificação, e calcular contagens e último acesso apenas para a página. Para o filtro padrão, usar `skip/take` no banco com `@@index([createdAt])` em `User`. Totais por `groupBy`. Uma coluna `lastAccessAt` atualizada no login. Busca `contains` com índice `pg_trgm` (medir antes).
- **MRR:** `admin-service.ts:30` calcula com `priceFor` do módulo do Mercado Pago, mas a venda é na Kiwify. Conferir se o valor exibido está certo.

## Médio impacto

**6. Logs dos agentes: a tela lê o histórico inteiro (médio/alto, M)**
- **Onde:** `app/api/agents/logs/route.ts:12-17` filtra por `agent: { userId }`, mas o único índice é `(agentId, createdAt)` (`schema.prisma:321`). `agents/route.ts:26` e `sentinels/route.ts:21` fazem `_count: { logs }` a cada abertura de tela. `user-agent-service.ts:61-70` grava uma linha por sinal, inclusive os abaixo da confiança mínima.
- **Mudança:** limpeza do item 1. Contar só os últimos 7 dias. Opcional: `userId` no log com `@@index([userId, createdAt(sort: Desc)])`.

**7. Cache sem proteção contra cálculo em paralelo e cron que aquece a chave errada (médio/alto, M)**
- **Onde:** `lib/cache.ts:258-275` faz get → loader → set, sem single-flight. O cron aquece o 4h com `includeVolume: true` (`cycle/route.ts:45`, chave `:v:`), mas a tabela lê com `includeVolume: false` (`scanner-service.ts:107-108`, chave `:nv:`). O TTL do scan é de 30 a 60 s, dentro de um intervalo de 5 min.
- **Efeito:** quando a chave expira, cada requisição simultânea refaz o scan dos 30 ativos. Fonte fora do ar não deixa cache de erro, então cada requisição chama a API externa de novo.
- **Mudança:** single-flight no processo mais `SET key:lock NX PX 15000`. Devolver o valor antigo (`:stale`) e atualizar com `after()`. Cache de erro de 5 a 10 s. O cron grava a mesma chave que a tabela lê, com TTL maior que 5 min.

**8. Um bucket de limite de taxa `auth` para vários fluxos (médio/alto, P)**
- **Onde:** `lib/api.ts:100-107`. Login, cadastro, esqueci a senha, reset, Google e suporte usam todos `ratelimit:auth:<ip>`. `lib/rate-limit.ts:23` devolve `resetAt: Date.now()+60_000` fixo, sem o TTL real.
- **Efeito:** atrás de CGNAT de operadora, usuários legítimos se bloqueiam. Não há limite por e-mail. O cliente não recebe `Retry-After`.
- **Mudança:** um bucket por fluxo. Chave IP + hash do e-mail em login e esqueci a senha. `rateLimit` devolve o TTL real, com `Retry-After` e `X-RateLimit-*` emitidos pelo `handleError`.

**9. Rotas sem limite de taxa (médio, P/M)**
- **Onde:** `telegram/test/route.ts:17` (envia mensagem externa), `auth/google/callback`, POST de `agents/route.ts` e `alerts/route.ts`, `stream/tickers`, `admin/users/export`. O `refresh=1` de `scanner/table/route.ts:27` e `scanner/run/route.ts:52` refaz o scan dentro do bucket `public` de 120/min, enquanto `analysis/route.ts:25` usa o bucket `llm`.
- **Mudança:** `withApi({ rateLimit: {...} })` com valor padrão obrigatório e desligamento explícito só para webhooks assinados. Mover `refresh` para um bucket caro por usuário.

**10. Verificação de acesso faz 2 leituras e até 3 escritas por requisição (médio, M)**
- **Onde:** `lib/api.ts:82` (`requireUser`) e `services/subscription-service.ts:39-50` (`getAccess`) leem o usuário de novo, e podem criar o teste, atualizar o status e atualizar `user.plan`. `requireCoreUser` chama os dois.
- **Mudança:** uma consulta única user + subscription. Calcular `effectiveStatus` sem gravar e deixar a gravação no `runLifecycle`. A regra do teste não muda, só o lugar.

**11. Índices com coluna na ordem errada (médio, P)**
- `PatternSignal`: `pattern-stats-service.ts:226` filtra por `timeframe`, mas o índice começa por `patternKey` (`schema.prisma:450`). Em `:303`, `status='open'` ordenado por `detectedAt` só tem `@@index([status])`. Trocar por `@@index([timeframe, patternKey, status])` e `@@index([status, detectedAt])`. Nas linhas `:290-297` e `:335` há um `findFirst` e um `create` por padrão, que podem virar um `findMany` mais `createMany`.
- `MarketSnapshot`: `worker/persist.ts:177` apaga por `collectedAt`, mas o índice é `(assetId, collectedAt)` (`:124`). `CronRun`: `lib/cron.ts:81` apaga por `startedAt` a cada execução, com índice `(job, startedAt)` (`:479`). Adicionar `@@index([collectedAt])` e `@@index([startedAt])`, e mover as duas limpezas para o `runLifecycle`.
- Tabelas pequenas hoje, então o ganho cresce com os dados.

**12. Chaves estrangeiras sem índice e exclusão de conta frágil (médio, P)**
- **Onde:** `MonitorEvent.monitorId` (`:614`), `AgentExecution.userId` (`:276`), `Monitor.strategyId` (`:588`), `SupportTicket.userId` (`:397`), `Alert.assetId` (`:331`), `WatchlistItem.assetId` (`:222`). `deleteUser` roda em `$transaction` com o prazo padrão de 5 s do Prisma (`admin-users-service.ts:298-301`).
- **Mudança:** um `@@index` em cada coluna e `{ timeout: 30_000 }` na transação.

## Baixo impacto

**13. Ciclo de vida reprocessa as mesmas linhas (médio, P)**
- **Onde:** `services/lifecycle-service.ts:26-30` usa `take: 500` sem `orderBy`. Assinaturas pagas vencidas, CANCELLED e PAST_DUE nunca recebem `lastNoticeKind = "trial_ended"` (`:39`). Voltam a cada rodada e disparam um `monitor.updateMany` por linha (`:43`). Passando de 500, podem empurrar para fora os TRIALING que precisam de aviso.
- **Mudança:** separar em duas consultas (avisos do teste com `orderBy trialEndsAt asc`, e uma única `monitor.updateMany` com filtro por status da assinatura), ou marcar a linha já tratada. A trava desse job (`lifecycle-service.ts:21-22`, `get` depois `set`) não é atômica e difere da de `lib/cron.ts`. Trocar por `withCronLock`.

**14. Cliente de cache (baixo/médio, P)**
- **Onde:** `lib/cache.ts:150-156` sem `commandTimeout`. `:184-187` descarta o cliente sem `disconnect()`. `:200-207` grava sempre também na memória, sem teto de itens. `:266-267` grava o valor duas vezes (fresco e `:stale`), com candles de 600 barras (`market-service.ts:108-114`). `services/market/venues.ts:140` inclui o `limit` na chave, então 400 e 300 barras viram chamadas separadas à exchange.
- **Dado de negócio só no Redis:** `services/onchain/whales.ts:62-100` guarda o histórico de 24 h das baleias só no cache. Some se o Redis reiniciar. `pattern-stats-service.ts:166-188` já usa o padrão certo (banco como fonte, cache como aceleração).
- **Mudança:** timeout curto, `disconnect()` no `catch`, LRU na memória, uma chave com envelope `{v, freshUntil}`, e janela fixa de candles como `getCandles` já faz.

**15. Cota da IA, testes e configuração (médio, P/M)**
- **Cota da IA:** é debitada antes de a IA responder, sem estorno (`analyst/route.ts:35-39`, `analyst/chat/route.ts:40-43`). Com `llm:false` também consome. O dia é UTC, então vira às 21h de Brasília. A regra está duplicada nas duas rotas. Mudança: `consumeAiQuota` único, débito só quando a IA é chamada, estorno em falha, dia em `America/Sao_Paulo`. O limite por plano não muda.
- **Testes ausentes:** nada cobre `rateLimit`, `planAllowsTimeframe` contra `entitlements.timeframes`, `requireEntitlement` nem a cota da IA. `tierFor` e `effectiveStatus` têm 5 asserts dentro de `tests/unit/confluence-setup.test.ts:135-139`. `cron-lock.test.ts` só testa o backend em memória.
- **`process.env` fora de `lib/env.ts`:** `lib/rate-limit.ts:35-36`, `services/google-auth-service.ts:30`, `services/analyst-chat-service.ts:301`, `lib/site.ts:2`, `lib/logger.ts:11`. `analyst/chat/route.ts` não usa `withApi`, então o formato de erro difere.

## Verificado e sem problema
- **Autenticação dos crons:** `lib/cron.ts:21-29` compara em tempo constante e devolve 503 sem segredo configurado.
- **Webhooks:** os da Kiwify e do Mercado Pago validam assinatura e são idempotentes.
- **`PrismaClient`:** é singleton (`database/client.ts:18-24`) e há `directUrl` (`schema.prisma:12`).
- **Pool:** o tamanho não está definido. Confira na Vercel, você mesmo e sem colar a URL, se `DATABASE_URL` usa o host `-pooler` com `pgbouncer=true&connection_limit=5`.
- **Plano da Vercel:** os crons a cada 5 min e `maxDuration` 120/300 pressupõem plano Pro. Não conferi o plano da conta.

## Ordem sugerida
1. Itens 1, 11 e 12, que são migration com índices e limpeza.
2. Itens 3 e 4, sobre a confiabilidade do cron e do Redis.
3. Item 2, depois da sua decisão sobre a regra do PRO. Não mexi em preço, planos nem regra do teste.

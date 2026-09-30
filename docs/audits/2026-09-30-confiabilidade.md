# Auditoria de confiabilidade (somente leitura)

**O que foi verificado.** O subagente `test-automator` leu `lib/api.ts`, as rotas de `app/api/**`, as telas de erro do Next, os componentes SWR, `tests/` e `tools/*.mjs`. Reli eu mesmo os itens 3, 4, 5 e 6: `app/error.tsx`, `lib/api.ts`, `access-gate.tsx` e a lista de arquivos de erro do `app/`. Os demais vêm da leitura do subagente e eu não os reli.

**O que não foi verificado.**
- **Testes:** `vitest` e `tsc` não rodaram, porque o sandbox pediu aprovação. O estado atual dos testes é desconhecido.
- **Site:** o `curl` para www.cryptoscanner.com.br também não foi aprovado. O 404 real, `/jornada` e o formato de erro de GET sem login em produção não foram conferidos. Tudo abaixo vem do código.

O que já está bom:
- 93 das 96 rotas usam `withApi`.
- Erro desconhecido vira "Erro interno" em produção (`lib/api.ts:49`).
- O webhook Kiwify valida a assinatura e é idempotente por hash do corpo.

## Melhorias, por impacto

**1. Tela de erro mostra `error.message` cru e usa emoji** — impacto alto, esforço P
- **Onde:** `app/error.tsx:9` (emoji), `app/error.tsx:12-13` (mensagem e digest), `app/not-found.tsx:7` (emoji).
- **Problema:** a mensagem técnica do erro vai direto para a tela. O CLAUDE.md proíbe emoji na interface e texto técnico. O link do 404 leva a `/scanner`, que exige conta com acesso.
- **Mudança:** usar texto fixo em português, com o digest só no log ou em texto pequeno de suporte. Trocar os emojis por ícone lucide. No 404, oferecer "Voltar ao início".

**2. Portão de acesso fica em carregamento eterno se a API falhar** — impacto alto, esforço P
- **Onde:** `components/account/access-gate.tsx:18` (`useAccess` descarta `error`) e `:42` (`!access` mostra skeleton). Também `components/monitor/monitor-view.tsx:53` e `:244`, e `components/providers/app-providers.tsx:12` (`shouldRetryOnError: false`).
- **Problema:** se `/api/billing/subscription` falhar, `access` fica nulo e o skeleton nunca sai. Todas as ferramentas protegidas travam. O monitor nem lê `error`.
- **Mudança:** expor `error` em `useAccess` e mostrar um alerta com "Tentar novamente" (`mutate`). Tratar `error` no monitor. O padrão já existe em `scanner-table.tsx:129-144`.

**3. Webhook Kiwify não protege contra evento fora de ordem** — impacto alto, esforço M
- **Onde:** `services/billing/kiwify.ts:153-167` (`grantStateFor`) e `:261-273` (`recordKiwifyGrant`).
- **Problema:** a idempotência usa só o hash do corpo e nenhum código compara a data do evento. Um `approved` ou `renewed` antigo reenviado depois de um `refunded` poderia reativar o acesso. Que a Kiwify reordene eventos é hipótese não verificada, mas o código não impede.
- **Mudança:** guardar a data do evento e ignorar eventos mais antigos que o último aplicado na mesma assinatura.

**4. Sem teste automatizado do webhook nem da concessão de acesso** — impacto alto, esforço M
- **Onde:** `tests/unit/kiwify.test.ts` cobre só funções puras. `tools/api-smoke.mjs:820-827` só confere 401/503 sem assinatura. `kiwify-flow.mjs` é manual.
- **Problema:** não há teste de `recordKiwifyGrant`, `applyPendingGrants` nem do `POST /api/billing/kiwify`. Faltam cenários de assinatura válida, reentrega duplicada, produto desconhecido, e-mail sem conta e a sequência aprovado → atrasado → cancelado → reembolsado.
- **Mudança:** teste do handler com Prisma mockado cobrindo esses casos, junto com o item 3. A regra é de cobrança, então vale `test-driven-development`.

**5. Não existem `global-error.tsx` nem `error.tsx` por segmento** — impacto médio/alto, esforço P/M
- **Onde:** só há `app/error.tsx`, `app/not-found.tsx` e `app/loading.tsx`.
- **Problema:** um erro no layout ou nos providers não tem tela própria. Uma falha em `/admin` ou `/scanner` derruba a página inteira pelo erro raiz.
- **Mudança:** criar `global-error.tsx` com `<html lang="pt-BR">` e `<body>`, como exige a doc do Next 16 (`10-error-handling.md`). Criar `error.tsx` em `admin`, `scanner`, `terminal` e `agentes`, mantendo o menu visível.

**6. Nome de variável de ambiente chega ao usuário** — impacto médio/alto, esforço P
- **Onde:** `lib/api.ts:46` repassa `err.message` de `DatabaseUnavailableError`, cujo texto está em `database/client.ts:29` ("Banco de dados não configurado (DATABASE_URL)…"). Também `lib/cron.ts:24` e `app/api/analysis/chart-image/route.ts:28-29`.
- **Problema:** o texto aparece no alerta de login e cadastro (`auth-form.tsx:93`) em caso de falha do banco. O CLAUDE.md proíbe nome de variável de ambiente na tela.
- **Mudança:** responder "Serviço temporariamente indisponível. Tente em instantes." e mandar a causa só para o log.

**7. Validação do Zod provavelmente aparece em inglês, com nome de campo cru** — impacto médio, esforço P
- **Onde:** `lib/api.ts:38-45` e `components/auth/auth-form.tsx:92-93`. Só `passwordPolicy` (`lib/auth.ts:100-104`) tem texto em português, e não achei configuração de locale do Zod.
- **Problema:** o usuário pode ver "Parâmetros inválidos — email: …" com a mensagem padrão em inglês. Essa parte é inferência sobre o Zod e não foi testada ao vivo.
- **Mudança:** configurar o locale pt do Zod ou escrever mensagens explícitas nos schemas de auth. No cliente, trocar o nome do campo por rótulo ("E-mail", "Senha").

**8. Login só tem limite por IP** — impacto médio, esforço P/M
- **Onde:** `app/api/auth/login/route.ts:16`, `lib/api.ts:100-107`, `lib/rate-limit.ts:16-27`.
- **Problema:** a chave do limite é o IP, sem o e-mail. Quem troca de IP tenta senhas numa conta sem trava. O 429 não envia o cabeçalho `Retry-After`. Não verifiquei se `REDIS_URL` está configurada em produção.
- **Mudança:** somar um contador por e-mail normalizado com mensagem genérica e enviar `Retry-After`.

**9. `/api/health` público expõe erro do banco e estado interno** — impacto médio, esforço P
- **Onde:** `app/api/health/route.ts:16-27` e `database/client.ts:40-51`.
- **Problema:** devolve a mensagem do Prisma, a versão, o commit, a saúde dos provedores e se LLM e Telegram estão configurados, sem autenticação.
- **Mudança:** a versão pública devolve só `status` e `database.ok`. O detalhe fica atrás de `requireAdmin` ou de um segredo de monitoramento.

**10. Erros de provedor vazam em SSE e listagens** — impacto médio, esforço P
- **Onde:** `app/api/stream/tickers/route.ts:29`, `app/api/scanner/volume/route.ts:40`, `app/api/market/derivatives/route.ts:37`. Consumidores: `components/terminal/workspace.tsx:434` e `components/market/panorama-view.tsx:470`.
- **Problema:** essas rotas contornam o mascaramento do `handleError` e mandam `err.message` do provedor, em geral em inglês, que é exibido em "DADOS INDISPONÍVEIS — …".
- **Mudança:** enviar um código estável (`provider_unavailable`) com texto fixo em português e logar a causa no servidor.

**11. Falhas de rede e 5xx viram "Erro HTTP 502" ou "Failed to fetch"** — impacto médio, esforço P
- **Onde:** `lib/client-api.ts:32-35`, `components/market/portfolio-view.tsx:291`, `components/account/plans-view.tsx:56,68`, `components/analyst/analyst-chat.tsx:172-190`.
- **Problema:** quando a resposta não é JSON ou o `fetch` é rejeitado, a mensagem aparece em inglês ou genérica por causa do `String(err)`.
- **Mudança:** em `apiFetch`, mapear rede, 5xx e 429 para frases em português ("Sem conexão. Verifique a internet e tente de novo."). Usar um helper único `errorMessage(err)`.

**12. Regras de acesso, login e admin sem teste de rota** — impacto médio, esforço M
- **Onde:** `tests/api/routes.test.ts:103-121` cobre só o scanner (401, 402 e liberado). `tools/api-smoke.mjs:817` admite "sem conta ADMIN no smoke". `tools/e2e-ui.mjs:402` pula a troca de plano para quem não é admin.
- **Problema:** não há teste de `requireCoreUser` e `requireEntitlement` com o teste de 3 dias expirado, `PAST_DUE` com carência ou `account_blocked`. Também faltam login com senha errada, bloqueio e 429, e as rotas `/api/admin/*` com ADMIN real.
- **Mudança:** testes com `getPrisma` mockado para esses casos. Incluir no smoke uma conta ADMIN fictícia `@example.com`.

**13. Formato de erro e status inconsistentes na API** — impacto baixo/médio, esforço M
- **Onde:** `app/api/analyst/chat/route.ts:30-92` (erro SSE `{type:"error", message}` sem `code`), `app/api/admin/overview/route.ts:8-9` (checa `role` à mão em vez de `requireAdmin`, `lib/api.ts:94`), `lib/api.ts:32-34`.
- **Problema:** o envelope JSON é `{ok, data|error}`, mas o SSE usa outro formato, sem `code`. O analista usa 402 para timeframe fora do plano e 429 para a cota diária. A paginação varia entre `page` (audit) e `limit` (monitors/events). Só três rotas definem `Cache-Control`, e não verifiquei o padrão da plataforma.
- **Mudança:** incluir `code` nos erros SSE, usar `requireAdmin` em `admin/overview`, padronizar `no-store` em respostas com dado do usuário e documentar os códigos estáveis (`unauthorized`, `subscription_required`, `rate_limited`).

**14. Caminho legado do Mercado Pago ativo, com texto fora do produto** — impacto baixo, esforço P
- **Onde:** `app/api/billing/checkout/route.ts:25,35`, `app/api/billing/webhook/route.ts:14-16,36`, `components/account/plans-view.tsx:41`.
- **Problema:** o produto é vendido só pela Kiwify, mas uma falha no checkout cita "Mercado Pago" ao usuário. No webhook do Mercado Pago, sem `x-request-id`, a chave de idempotência usa `Date.now()` e nunca deduplica.
- **Mudança:** usar texto neutro ("Não foi possível iniciar o pagamento. Tente novamente.") e decidir com o dono se esse caminho sai do código.

**15. Um único `loading.tsx` genérico para todas as telas** — impacto baixo, esforço P/M
- **Onde:** `app/loading.tsx`, sem `loading.tsx` nos segmentos.
- **Problema:** `/scanner`, `/terminal` e `/admin` mostram o mesmo esqueleto de 3 blocos, e o conteúdo final tem forma bem diferente. Isso é percepção de carregamento, não confiabilidade.
- **Mudança:** `loading.tsx` específico em `admin` e `terminal`.

**Sugestão de ordem:** 1, 2 e 6 são rápidos e resolvem o que o usuário vê. Depois 3 e 4 juntos, porque envolvem cobrança. Se você autorizar, posso rodar `vitest`/`tsc` e conferir o site em produção para validar os itens marcados como não verificados.

# Componentes de terceiros do Claude Code neste projeto

Instalados no escopo do projeto (`.claude/skills/`, `.claude/agents/`, `.mcp.json`) em 2026-09-30, com Claude Code 2.1.285.
Cópia fiel da origem, exceto os ajustes listados. Para atualizar: clonar a origem, copiar a pasta de novo e repetir os ajustes.

## Skills (`.claude/skills/<nome>/SKILL.md`)

| Skill | Origem (commit) | Licença | Ajuste |
|---|---|---|---|
| frontend-design | anthropics/skills `skills/frontend-design` (8a1541c) | Apache-2.0 (LICENSE.txt na pasta) | — |
| webapp-testing | anthropics/skills `skills/webapp-testing` (8a1541c) | Apache-2.0 (LICENSE.txt na pasta) | — |
| vercel-react-best-practices | vercel-labs/agent-skills `skills/react-best-practices` (063bee9) | MIT | pasta renomeada para o `name` do SKILL.md |
| vercel-composition-patterns | vercel-labs/agent-skills `skills/composition-patterns` (063bee9) | MIT | pasta renomeada para o `name` do SKILL.md |
| web-design-guidelines | vercel-labs/agent-skills `skills/web-design-guidelines` (063bee9) | MIT | — (busca as regras atuais em raw.githubusercontent.com a cada uso) |
| supabase-postgres-best-practices | supabase/agent-skills `skills/supabase-postgres-best-practices` (544bfc5) | MIT | — (o banco é PostgreSQL/Neon; nada foi migrado) |
| api-design-principles | wshobson/agents `plugins/backend-development/skills` (156b7a5) | MIT | — |
| auth-implementation-patterns, error-handling-patterns, e2e-testing-patterns, code-review-excellence | wshobson/agents `plugins/developer-essentials/skills` (156b7a5) | MIT | — |
| prompt-engineering-patterns, llm-evaluation | wshobson/agents `plugins/llm-application-dev/skills` (156b7a5) | MIT | — (usadas no Analista IA) |
| writing-plans, systematic-debugging, verification-before-completion, requesting-code-review, test-driven-development | obra/superpowers `skills/` (8ca22db) | MIT | removidos de systematic-debugging os arquivos de teste da própria skill (`test-*.md`, `CREATION-LOG.md`) |
| product-marketing, copywriting, signup, onboarding, pricing, paywalls, analytics, ab-testing, churn-prevention, launch, seo-audit | coreyhaines31/marketingskills `skills/` (5b2c000) | MIT | pastas `evals/` não copiadas; contexto do produto em `.agents/product-marketing.md` |

## Agentes (`.claude/agents/<nome>.md`) — wshobson/agents (156b7a5), MIT

O repositório repete o mesmo agente em vários plugins. Foi usada a versão completa do plugin indicado e o campo `name` foi trocado do formato `plugin-agente` para o nome curto pedido.

| Agente | Plugin de origem | Modelo (upstream) |
|---|---|---|
| architect-review | comprehensive-review | opus |
| code-reviewer | comprehensive-review | opus |
| security-auditor | comprehensive-review | opus |
| backend-architect | backend-development | inherit |
| performance-engineer | application-performance | inherit |
| frontend-developer | frontend-mobile-development | inherit |
| ui-ux-designer | multi-platform-apps | sonnet |
| design-system-architect | ui-design | inherit |
| accessibility-expert | ui-design | inherit |
| ui-visual-validator | accessibility-compliance | sonnet |
| database-architect | database-design | opus |
| test-automator | unit-testing | sonnet |
| deployment-engineer | deployment-strategies | haiku |

**Substituição de nome:** `architect-reviewer` não existe no repositório; o equivalente verificado é `architect-review` (mesma função, plugins comprehensive-review e framework-migration).

## MCP

| Servidor | Origem | Configuração |
|---|---|---|
| playwright | microsoft/playwright-mcp (f183dad), pacote `@playwright/mcp@0.0.83`, Apache-2.0 | `.mcp.json`: `--headless --isolated --output-dir .playwright-mcp` (perfil só em memória, sem sessões pessoais; saídas fora do git) |

Em ambiente que roda como root (contêiner), o Chromium exige `--no-sandbox`; use só localmente, não no arquivo versionado. Para apontar um Chromium já instalado: variável `PLAYWRIGHT_MCP_EXECUTABLE_PATH`.

## Avaliados e não instalados

| Componente | Motivo |
|---|---|
| obra/superpowers `subagent-driven-development` | Orquestrador que exige worktree isolado, branch fora da main e `finishing-a-development-branch`; conflita com o fluxo aprovado (commits direto na main, sem worktrees). Planos são executados na sessão principal. |
| obra/superpowers `executing-plans`, `using-git-worktrees`, `finishing-a-development-branch`, `using-superpowers`, `brainstorming` | Referenciados por outras skills, mas criam um segundo orquestrador ou reabrem levantamento de produto já aprovado. |
| wshobson/agents `rag-implementation` | Sem necessidade concreta de recuperação vetorial: o Analista IA responde com dados das ferramentas do app e a base do Mentor é própria. |
| supabase/agent-skills `supabase` | O projeto não usa Supabase. |
| vercel-labs/agent-skills `deploy-to-vercel`, `vercel-cli-with-tokens` | Deploy é feito por push na main (integração Git da Vercel); não fazia parte do pedido. |
| Plugins completos via marketplace (`/plugin install`) | Trariam dezenas de agentes e comandos duplicados; a cópia seletiva mantém só o necessário e fica versionada no projeto. |

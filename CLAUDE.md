@AGENTS.md

# CryptoScanner — instruções do projeto para o Claude Code

App web de análise técnica de criptomoedas (www.cryptoscanner.com.br), vendido por assinatura (PRO R$ 97, ELITE R$ 197, teste de 3 dias no PRO) pela Kiwify. Dono: Théo Brandão. Contexto de produto e marketing aprovado: `.agents/product-marketing.md`. Origem e licença das skills/agentes: `.claude/THIRD_PARTY.md`.

## Stack e comandos

- Next.js 16 (App Router, ver AGENTS.md), React 19, TypeScript, Tailwind v4, SWR, Prisma 6 + PostgreSQL (Neon; schema em `database/prisma/schema.prisma`), Redis, zod, Vitest, Playwright. Hospedagem Vercel (região gru1); migrations rodam no build (`prisma migrate deploy`).
- Verificação obrigatória antes de dizer que terminou: `npx tsc --noEmit -p .`, `npx eslint components hooks lib app services tools tests`, `npx vitest run`, `npx next build`.
- Ponta a ponta com o app rodando: `node tools/e2e-ui.mjs` (interface) e `node tools/api-smoke.mjs` (API), com `BASE_URL` e `INVITE_CODE`; esperar ~60 s entre os dois por causa do limite de login.
- Estilo: linhas longas como no código existente; não rodar prettier em arquivos que você não criou.

## Regras de produto (aprovadas)

- **Design system oficial (obrigatório):** `docs/design-system/cryptoscanner_design_system.json` — dark premium institucional, navy quase preto, marca ciano/azul/violeta, verde/vermelho só com significado financeiro, dourado só para ELITE, Inter + Lucide, grid de 4 px, radius 8/12/16, microinterações 150–300 ms. Logo oficial em `public/brand/` (não esticar, não recolorir, sem glow obrigatório). Consulte as seções `anti_patterns` e `implementation_rules_for_agents` antes de qualquer interface.

- Interface em português do Brasil, linguagem simples, sem jargão técnico (nada de nomes de variáveis de ambiente, "fallback", "orquestrador" etc. na tela).
- Ícones lucide; sem emojis na interface (exceto o ícone que o usuário escolhe para um agente).
- Nunca inventar números, depoimentos, contagem de usuários ou taxa de acerto. Todo material público leva o aviso de que não é recomendação de investimento.
- Planos vendidos: PRO e ELITE. A chave interna `PLATINUM` (lib/plans.ts) nunca aparece para o usuário.
- `/jornada` é aberta sem login; as ferramentas exigem conta com acesso (AccessGate + `requireCoreUser`).
- Contas de dono (`OWNER_EMAILS`) viram ADMIN no login; o Painel de controle fica em `/admin`.

## Fluxo de trabalho

- Commits direto na `main` (decisão aprovada; sem worktrees nem branches de feature). Autor: Theo Brandão <theofilho@brandao.ind.br>. Push na main dispara o deploy na Vercel.
- Não fazer push, deploy, alteração de variáveis na Vercel, envio de mensagens/e-mails, publicação de campanhas ou contratação de serviços sem pedido explícito do dono.
- Nunca digitar ou repetir tokens, senhas e chaves; o dono cola segredos ele mesmo.
- Testes de navegador só com contas e dados fictícios (`@example.com`). O Playwright MCP (`.mcp.json`) roda isolado, sem perfil pessoal.

## Como usar as skills e agentes instalados

- **Planejar tarefa grande:** `writing-plans` — salvar em `docs/plans/AAAA-MM-DD-<tema>.md` (preferência do projeto) e executar o plano na sessão principal. Ignore as referências dessa skill a `subagent-driven-development`, `executing-plans`, `using-git-worktrees` e `finishing-a-development-branch`: não estão instaladas de propósito (ver THIRD_PARTY.md).
- **Bug ou teste falhando:** `systematic-debugging` antes de propor correção.
- **Regra de negócio (acesso/planos, cobrança, auth, cálculos de indicadores):** `test-driven-development`.
- **Antes de afirmar que está pronto:** `verification-before-completion` + comandos da seção Stack.
- **Revisão:** `requesting-code-review` / `code-review-excellence`, agentes `code-reviewer`, `security-auditor` (auth, cobrança, admin) e `architect-review` (mudança estrutural).
- **Interface:** `frontend-design`, `web-design-guidelines`, `vercel-react-best-practices`, `vercel-composition-patterns`; agentes `frontend-developer`, `ui-ux-designer`, `design-system-architect`, `accessibility-expert`, `ui-visual-validator`.
- **Testes de navegador:** `webapp-testing`, `e2e-testing-patterns`, agente `test-automator`, Playwright MCP.
- **Banco e API:** `supabase-postgres-best-practices` (regras de PostgreSQL; o projeto não usa Supabase), `api-design-principles`, `auth-implementation-patterns`, `error-handling-patterns`; agentes `database-architect`, `backend-architect`.
- **Desempenho e deploy:** agentes `performance-engineer` (Lighthouse, Core Web Vitals) e `deployment-engineer` (só análise; não faz deploy sozinho).
- **Analista IA / LLM:** `prompt-engineering-patterns`, `llm-evaluation`.
- **Marketing e crescimento** (página de vendas, cadastro, ativação, paywall, preço, lançamento, SEO): `product-marketing` (mantém `.agents/product-marketing.md`), `copywriting`, `signup`, `onboarding`, `paywalls`, `pricing`, `analytics`, `ab-testing`, `churn-prevention`, `launch`, `seo-audit`. Mudança de preço/plano/teste precisa de aprovação do dono.

# Melhorias gerais do CryptoScanner — plano de implementação

> Execução na sessão principal com frentes paralelas em arquivos separados (ver CLAUDE.md). Auditorias de origem em `docs/audits/2026-09-30-*.md` (conversão, desempenho/SEO, banco/arquitetura, confiabilidade), feitas com os agentes e skills do projeto.

**Objetivo:** aumentar conversão (visitante → teste → assinatura), velocidade e SEO, confiabilidade e segurança operacional, sem mudar preço, planos ou regra do teste.

**Decisões tomadas neste plano**
- 1H/30M/15M são do ELITE (como diz a página de planos e o CLAUDE.md). A regra passa a ser uma só para scanner, agentes, monitores e analista; o PRO deixa de receber esses tempos pelas rotas que hoje vazam.
- Retenção de dados: logs e execuções de agentes 90 dias; eventos de monitor e histórico de scans 180 dias; eventos de análise 365 dias; pedidos de senha vencidos 7 dias; `ScannerResult` deixa de ser gravado (nunca é lido). `BillingEvent` e `AdminAuditLog` não são apagados.
- Nenhum e-mail novo de marketing é criado (envio precisa de autorização); só correção dos textos existentes e do momento dos avisos do teste.
- `/vendas` continua indexada (é a URL da Kiwify e dos anúncios); ganha título e descrição próprios mais curtos. Decisão sobre `noindex` fica com o dono.
- Caminho do Mercado Pago continua no código, com textos neutros.

## Frente 1 — Monetização (planos, bloqueio, upgrade, cobrança)
- [ ] /planos renderizado no servidor (título, cartões, preços) e sem salto de layout.
- [ ] Estado "teste terminou": selo, título e resumo do que ficou salvo (contagens reais).
- [ ] PAST_DUE: faixa "atualize o pagamento", sem botão de comprar de novo; cartão lateral "Resolver pagamento".
- [ ] Cancelar: confirmação com o que a pessoa mantém e até quando, motivo opcional (evento), "Reativar" enquanto houver período; Kiwify → suporte com assunto preenchido.
- [ ] Telas de bloqueio com benefício por ferramenta, preço, "cancele quando quiser", saída pela Jornada grátis; ELITE sem teste explícito.
- [ ] Bloco/modal ELITE com benefícios vindos de `lib/plans-copy.ts` (fonte única) e preço.
- [ ] Eventos de conversão: `cta_click`, `signup_view`, `gate_view`, `trial_card_click`, `onboarding_step`, `cancel_reason`.
- [ ] Kiwify: ignorar evento mais antigo que o último aplicado; testes do webhook e da concessão.

## Frente 2 — Ativação e cadastro
- [ ] Cadastro/login: erros em português junto ao campo, mostrar senha, aviso do aceite, espaço reservado para Google/convite, descrição sem jargão.
- [ ] Landing: "Testar grátis" nos cartões, CTA final padronizado, CTA fixo no celular, FAQ inteiro no HTML.
- [ ] /vendas: aviso "use no checkout o mesmo e-mail do cadastro" junto ao botão de compra; FAQ no HTML.
- [ ] Primeiros passos: ordem por valor ("Ver os sinais do modelo" primeiro), "Conta criada" marcada, acima do painel enquanto pendente, dispensa salva na conta; remover o cartão de onboarding morto.
- [ ] Avisos do teste: primeiro aviso na véspera, textos diferentes, arrependimento de 7 dias no último; corrigir filtro que ignora contas sem aviso anterior; textos dos e-mails em português do app.

## Frente 3 — Navegação, SEO e desempenho
- [ ] Aulas com URL própria `/jornada/[slug]` estáticas, no sitemap, com metadados; `?aula=` redireciona.
- [ ] Home de visitante estática (rota separada para quem não tem sessão).
- [ ] Busca global e Analista carregados sob demanda; sem prefetch de rotas fechadas para visitante; stream de preços só depois de interação/ocioso nas páginas públicas.
- [ ] Canonical/og:url e descrições próprias; JSON-LD (Organization/WebSite, SoftwareApplication com preços aprovados, Course grátis); rotas de ferramenta `noindex`; sitemap sem login/registro/status e com `lastModified`.
- [ ] Fontes: Inter variável sem lista de pesos; símbolos cripto sem puxar subsets extras.
- [ ] Telas de erro: `global-error.tsx`, `error.tsx` por área, texto sem mensagem técnica e sem emoji; 404 leva ao Início; `loading.tsx` próprio em admin e terminal.
- [ ] Cartão do teste com ênfase correta para 3 dias e faixa de dias no celular; rótulo da busca.

## Frente 4 — Banco, cron e cache
- [ ] Migração de índices (PatternSignal, MarketSnapshot, CronRun, FKs sem índice, createdAt nas tabelas limpas, User.createdAt).
- [ ] Rotina de retenção em lotes no ciclo; parar de gravar ScannerResult.
- [ ] Ciclo do cron com orçamento de tempo, lotes e concorrência limitada; `recordCronRun` em `finally`; sem `void` perdido (usar `after()`/await).
- [ ] Cache com single-flight e chave aquecida pelo cron igual à lida pela tabela; timeout do Redis; memória com teto.
- [ ] Painel de controle paginado no banco; transação de exclusão com prazo maior.

## Frente 5 — API, limites e acesso
- [ ] Regra única de acesso por tier (`lib/access-policy.ts`) com teste de tabela; timeframes intraday só ELITE em todas as rotas.
- [ ] Cota da IA única, debitada só quando a IA responde, com estorno em falha, dia em America/Sao_Paulo, contador no Postgres quando não houver Redis.
- [ ] Limites de taxa por fluxo (login por IP+e-mail, cadastro, senha, suporte), `Retry-After`, limites nas rotas que faltam, `refresh` do scanner em bucket caro.
- [ ] Erros sem texto técnico (banco, provedores, SSE), `apiFetch` com mensagens em português para rede/5xx/429; `/api/health` público mínimo; `requireAdmin` no overview.

## Verificação (obrigatória)
`tsc`, `eslint`, `vitest`, `next build`, E2E de interface, smoke de API, Lighthouse das páginas públicas antes/depois, conferência em produção após o deploy.

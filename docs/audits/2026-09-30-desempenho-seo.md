Abaixo está o relatório do subagente `performance-engineer`, com a skill `seo-audit` aplicada. Não editei nenhum arquivo do projeto. Não conferi por conta própria os itens abaixo. Eles saíram do relatório do subagente e dos JSON em `/tmp/lh-{home,vendas,jornada,planos}.json`.

## Números medidos (Lighthouse 12, mobile, uma execução por página)

| Página | Perf. | Acess. | Boas prát. | SEO | LCP | FCP | TBT | CLS | Speed Index | Resposta do servidor |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` | 89 | 100 | 100 | 100 | 1,3 s | 1,3 s | 420 ms | 0 | 2,8 s | 580 ms |
| `/vendas` | 74 | 100 | 100 | 100 | 4,0 s | 1,2 s | 500 ms | 0 | 2,7 s | 65 ms |
| `/jornada` | 75 | 98 | 100 | 100 | 4,8 s | 1,5 s | 240 ms | 0 | 4,4 s | 67 ms |
| `/planos` | 94 | 100 | 100 | 100 | 1,1 s | 1,1 s | 200 ms | **0,109** | 2,0 s | 344 ms |

- **Cuidado ao ler o LCP:** o Lighthouse reportou 44 a 51 requisições fora do HTTP/2, provavelmente por causa do proxy do sandbox. Isso deve inflar o LCP simulado de `/vendas` e `/jornada`. No trace, o LCP real foi ≈1,33 s em `/vendas` e ≈2,35 s em `/jornada`.
- **Peso da página:** o JS transferido fica entre 341 e 384 KiB por página, com 81 a 83 KiB sem uso. O HTML da home tem 397 KB, sendo 90 KB de CSS inline e 205 KB de dados do servidor (RSC).
- **Sem redirecionamento:** nenhuma das 4 URLs redirecionou.

## Melhorias (15, por prioridade)

**1. Dar a cada aula da Jornada uma URL própria e indexável** · impacto **alto** · esforço **G**
- **Onde:** `components/learning/journey-view.tsx:64` e `:71-84`, `app/jornada/page.tsx:4`, `app/sitemap.ts`, `lib/content/lessons.ts`.
- **Problema:** `/jornada?aula=fibonacci` devolve o mesmo HTML da lista, com canonical `/jornada`. O texto das aulas não está no HTML. As 12 aulas somam cerca de 1.500 palavras de corpo.
- **Mudança:** criar `/jornada/[slug]` com `generateStaticParams`. Renderizar partes, pontos-chave e teste no servidor, com título, description e canonical próprios, e incluir no sitemap. Só os widgets interativos ficam no cliente. `?aula=` passa a redirecionar para a nova URL.

**2. Tirar a home do render dinâmico** · impacto **alto** · esforço **M**
- **Onde:** `app/page.tsx:18-33`, que usa `searchParams` e `cookies()`.
- **Problema:** a home responde com `no-store` e sem cache na Vercel, e o servidor leva 580 ms. `/vendas`, `/jornada` e `/planos` são estáticas e levam 65 ms. O `no-store` também reprovou o bfcache.
- **Mudança:** usar `proxy.ts` (Next 16). Sem o cookie `cs_session`, fazer rewrite de `/` para uma rota estática. Quem tem sessão segue na rota dinâmica.

**3. Renderizar `/planos` no servidor** · impacto **alto** · esforço **M**
- **Onde:** `app/planos/page.tsx:7-11`, `components/account/plans-view.tsx:35`, `:96-105` e `:117`.
- **Problema:** o HTML bruto tem 89 palavras, sem h1 e sem "PRO", "ELITE" ou "R$", por causa do `useSearchParams` dentro de um Suspense sem fallback. O CLS é 0,109 e o LCP é o texto do rodapé.
- **Mudança:** isolar o `useSearchParams` num componente pequeno. Renderizar título, cards e preços no servidor, com os valores que já existem no código. Só muda onde o preço é renderizado, não o valor. Reservar altura para os avisos tardios.

**4. Canonical e og:url nas páginas públicas** · impacto **médio a alto** · esforço **P**
- **Onde:** `app/page.tsx:9-12`, `app/layout.tsx:13-21`, `/login`, `/registro`, `/termos`, `/privacidade`, `/reembolso`, `/status`.
- **Problema:** `/` e `/?utm_source=x` dão 200 sem `rel=canonical`, então o tráfego de anúncio gera URLs duplicadas. Só `/vendas` tem `og:url`. `/termos`, `/login` e `/registro` repetem a description genérica do layout.
- **Mudança:** `alternates: { canonical }` e `openGraph.url` em cada página, com description própria.

**5. Reduzir o JS das páginas públicas** · impacto **alto** · esforço **G**
- **Onde:** `components/layout/app-shell.tsx:592` e `:445`, `components/terminal/ai-analyst.tsx`, `components/home/my-panel.tsx:12`.
- **Problema:** a busca global e o painel do Analista vão em todas as páginas, inclusive `/vendas`. O TBT é 500 ms em `/vendas` e 420 ms na home. Um chunk de 58 KiB tem 99,9% de bytes sem uso, e 14 KiB são polyfills legados. Só a home baixa um chunk extra (19 KiB) com o texto das aulas. Essa origem é hipótese, só a correlação foi medida.
- **Mudança:** criar um layout leve para as páginas públicas. Carregar busca, Analista e menu móvel com `next/dynamic` só na primeira interação. Importar `HomeEntry` dinamicamente. Declarar `browserslist` moderno.

**6. Atraso de renderização em `/jornada` e `/vendas`** · impacto **médio a alto** · esforço **M**
- **Onde:** `components/learning/journey-view.tsx:71-84`, `next.config.ts:10` (`inlineCss`).
- **Problema:** em `/jornada` o atraso do LCP é de 2203 ms, e em `/vendas` de 1191 ms. A hipótese é que o `Suspense fallback` troque o DOM na hidratação. O CSS também aparece duplicado no HTML (inline mais payload RSC).
- **Mudança:** o item 1 já remove a dependência de `useSearchParams` na lista. Depois, medir com trace no DevTools antes de decidir sobre o `inlineCss`.

**7. Menos prefetch e conexões para visitante anônimo** · impacto **médio** · esforço **P a M**
- **Onde:** links em `components/layout/app-shell.tsx`, `components/ui/showcase.tsx:126` e `:159`, `hooks/use-tickers.ts:28-33`.
- **Problema:** a home faz 20 requisições Fetch (56 KiB) e 10 a 12 prefetches de rotas protegidas. As 4 páginas abrem `/api/stream/tickers` (SSE), que na home é a cadeia mais longa de dependências (3134 ms). Em `/jornada` e `/planos` o `TickerStrip` fica montado mesmo escondido.
- **Mudança:** `prefetch={false}` para rotas protegidas quando não há login. Não abrir o stream nas páginas públicas, ou abrir só depois de idle ou interação. Não medi o custo do SSE na Vercel.

**8. Fontes: símbolos cripto puxam 103 KiB extras de Inter** · impacto **médio** · esforço **P**
- **Onde:** `lib/assets.ts:11-12`, `app/layout.tsx:11`.
- **Problema:** home, vendas e jornada baixam 151 KiB de fonte, contra 48 KiB em `/planos`. O ₿ cai no subset latin-ext (84 KiB) e o Ξ no grego (19 KiB). O CSS declara 35 `@font-face`, sendo 5 pesos × 7 subsets para fontes variáveis.
- **Mudança:** desenhar os símbolos com `system-ui` ou SVG. Remover a lista `weight` do `Inter`, o que reduz para 7 regras.

**9. FAQ e preços no HTML bruto** · impacto **médio** · esforço **P**
- **Onde:** `components/marketing/landing.tsx:159` e `:332-339`, `components/marketing/sales-page.tsx:251-263`, `components/account/plans-view.tsx:117`.
- **Problema:** só a 1ª resposta do FAQ está no DOM. "R$ 97" e "R$ 197" não aparecem no HTML de home, vendas e planos. Em `/vendas`, o texto de cancelamento depende de `provider === "kiwify"`, que chega pelo SWR. O HTML do servidor traz a versão sem Kiwify.
- **Mudança:** renderizar todas as respostas (`<details>` ou `hidden`). Passar preços e provedor do servidor como props, sem alterar valores.

**10. Dados estruturados (JSON-LD) ausentes** · impacto **médio** · esforço **P a M**
- **Onde:** `app/page.tsx`, `app/vendas/page.tsx`, `app/jornada/page.tsx` e a futura `/jornada/[slug]`.
- **Problema:** nenhuma das 4 páginas tem `application/ld+json`. O grep por `ld+json` e `schema.org` no código não retornou nada, então não é caso de schema injetado por JS.
- **Mudança:** seguir `02-guides/json-ld.md`, escapando `<`. Usar `Organization` e `WebSite` na home, `SoftwareApplication` em `/vendas` (com os preços aprovados lidos de `lib/env`) e `Course` com `isAccessibleForFree` na Jornada. Sem `aggregateRating`, contagem de usuários ou depoimentos.

**11. Home e `/vendas` competem como a mesma página** · impacto **médio** · esforço **P**
- **Onde:** `app/vendas/page.tsx:8`, `app/sitemap.ts:6-7`.
- **Problema:** as duas são landings do mesmo produto e da mesma oferta (1.343 e 1.450 palavras visíveis), ambas no sitemap. A description de `/vendas` tem 193 caracteres e corta nos resultados.
- **Mudança (decisão sua):** (a) `noindex,follow` em `/vendas` e remover do sitemap, já que ela é a URL dos anúncios e da Kiwify. Ou (b) diferenciar a intenção de cada página e encurtar a description.

**12. Rotas protegidas indexáveis e sitemap** · impacto **médio** · esforço **P**
- **Onde:** `app/robots.ts:7`, `app/sitemap.ts:5-16`, `components/account/access-gate.tsx`.
- **Problema:** `/scanner`, `/panorama`, `/graficos` e `/charts/BTC` dão 200 (320 a 324 KB de HTML), sem canonical, noindex ou h1 para quem não tem login. O sitemap inclui `/login`, `/registro` e `/status` e não tem `lastModified`. O robots usa `Host:`, diretiva não padrão.
- **Mudança:** `robots: { index: false }` nas rotas de ferramenta. Tirar as três páginas de baixo valor do sitemap e adicionar `lastModified`. Remover `host`.

**13. Estrutura de títulos** · impacto **baixo a médio** · esforço **P**
- **Onde:** `components/learning/journey-view.tsx:324`, `components/marketing/landing.tsx:254` e `:262`, `components/marketing/sales-page.tsx`.
- **Problema:** em `/jornada` há um h3 logo após o h1, sem h2, o que reprova `heading-order` e explica a acessibilidade 98. Na home, cada seção tem um h2 visível mais um `sr-only` com texto diferente (15 h2 no total).
- **Mudança:** cards da Jornada com h2, ou um h2 "Aulas" acima. Um único h2 por seção.

**14. Rótulo do botão de busca** · impacto **baixo** · esforço **P**
- **Onde:** `components/layout/app-shell.tsx:610`.
- **Problema:** `aria-label="Buscar (Ctrl+K)"` não contém o texto visível "Buscar ativo, ferramenta ou indicador…". O Lighthouse marca `label-content-name-mismatch` em home, jornada e planos.
- **Mudança:** `aria-label="Buscar ativo, ferramenta ou indicador (Ctrl+K)"`.

**15. Textos e títulos** · impacto **médio** · esforço **P**
- **Onde:** `lib/content/lessons.ts:48`, `app/page.tsx:10`, `app/jornada/page.tsx:4`, `app/planos/page.tsx:5`.
- **Problema:**
  - A aula 1 usa "fallback para a Kraken", termo que a regra do projeto proíbe na tela.
  - O título da home diz "sinais validados", enquanto o restante do site diz "testados fora da amostra".
  - O título de `/jornada` tem 30 caracteres e não traz o tema. A description de `/planos` tem 88.
  - A lista da Jornada não tem h2 nem texto de abertura.
- **Mudança:** trocar "fallback" por "se estiver fora do ar, usa a Kraken". Padronizar "testados". Reescrever título, description e abertura da Jornada. Manter o aviso de que não é recomendação de investimento e sem números ou depoimentos novos.

## O que está certo

- `robots.txt` e `sitemap.xml` respondem 200, e o robots aponta para o sitemap.
- http→https e sem-www→www respondem 308, e `/vendas/` redireciona para `/vendas`.
- Um 404 real devolve status 404 com `noindex`.
- Nenhuma página pública tem `noindex` ou `X-Robots-Tag` indevido.
- `og:image` (1200×630, com alt) e `twitter:card` existem.
- Cada página pública tem um h1 único.
- Os assets em `_next/static` têm `immutable` por 1 ano.
- Não há scripts de terceiros.
- As 4 páginas têm SEO 100 e Boas práticas 100.

## Não verificado

- **HTTP/2 real da Vercel:** o curl direto exigiu aprovação e não foi executado. Por isso o LCP simulado de `/vendas` e `/jornada` provavelmente está inflado.
- **Causa exata do atraso de renderização** (itens 5 e 6): não foi isolada por trace.
- **Origem do chunk de 58 KiB sem uso:** não foi inspecionada.
- **Custo do SSE dos anônimos na Vercel.**
- **TTFB de 344 ms em `/planos`:** pode ser edge frio numa única medição.
- **Páginas logadas, `/privacidade`, `/reembolso` e `/suporte`:** não foram conferidas.

Nenhum preço, plano ou regra do teste de 3 dias foi alterado nas propostas. O item 3 só muda onde o preço é renderizado, e o item 11 depende de uma decisão sua.

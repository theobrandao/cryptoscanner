Auditei a jornada só pelo código e pelos textos dos e-mails e avisos, sem editar nada. Não olhei o site no ar: o `curl` para cryptoscanner.com.br pediu aprovação e não foi executado. Então nenhum item tem medição de conversão, e o texto que o visitante vê hoje pode diferir do que está no repositório. Os 15 itens seguem do maior impacto para o menor.

### 1. O cartão do teste nunca escala a ênfase
- **Onde:** `components/layout/app-shell.tsx:123-124,141`
- **Problema:** `level` usa limites de teste de 7 dias (`day >= 6` alto, `day >= 4` médio). Com `TRIAL_DAYS = 3`, `day` só vai de 1 a 3. O cartão fica sempre em "low": botão "Ver planos" cinza e barra sem aviso, inclusive no último dia. O comentário do código descreve o desenho antigo de 7 dias.
- **Mudança:** derivar do tempo restante: no último dia, botão primário e cor de aviso, com as horas restantes ("termina hoje às 14h"). Adicionar uma linha de valor, como "Você usou X agentes / Y alertas". Usar só contagens reais da conta.
- **Impacto:** alto. **Esforço:** P.

### 2. O teste acabado ainda anuncia "3 dias grátis" e o botão não muda
- **Onde:** `components/account/plans-view.tsx:73,114,144-150`
- **Problema:** para quem já usou o teste, o título da página e o selo do PRO continuam dizendo "3 dias grátis, sem cartão". O botão é "Assinar PRO". Isso contradiz a FAQ ("ao final, o acesso é pausado"). Também não há nenhum resumo do que a pessoa deixou salvo.
- **Mudança:** quando `status` for EXPIRED ou PAST_DUE, ou a conta já tiver teste iniciado, trocar o selo por "Seu teste terminou" e o título por "Escolha o plano para voltar de onde parou". Listar o que ficou salvo com as contagens reais (monitores, estratégias, favoritos) e destacar o PRO como o plano do teste.
- **Impacto:** alto. **Esforço:** P.

### 3. Pagamento pendente: o botão leva para comprar de novo
- **Onde:** `plans-view.tsx:108,141-150`; `app-shell.tsx:112-119`; `services/email-service.ts:74`
- **Problema:** `current` só vale para ACTIVE ou CANCELLED. Quem está PAST_DUE vê "Assinar PRO/ELITE", que abre um checkout novo. No rodapé lateral aparece "Pagamento pendente" com o botão "Escolher plano". O e-mail `payment_failed` manda para `/planos`, onde não existe ação de atualizar pagamento.
- **Mudança:** banner no topo de `/planos` para PAST_DUE com "Atualize o pagamento na Kiwify" e o link de atualização (ou o caminho do suporte). Esconder "Assinar" no plano atual. No cartão lateral, botão "Resolver pagamento". Incluir o mesmo link no e-mail.
- **Impacto:** alto. **Esforço:** M.

### 4. Cancelar não tem confirmação, motivo nem desfazer, e para Kiwify não tem saída
- **Onde:** `plans-view.tsx:58-69,85-92,141-143`
- **Problema:**
  - **Fora da Kiwify:** "Cancelar renovação" cancela na hora, sem confirmar e sem perguntar o motivo.
  - **Na Kiwify (o caso real):** só aparece um texto ("pelo e-mail da compra ou pelo suporte"), sem link e sem e-mail.
  - **Depois de cancelar:** o status CANCELLED mostra só "Plano atual", sem "Reativar renovação".
- **Mudança:**
  - Etapa única de "ajude a melhorar" com 5 a 6 motivos, gravando um evento de análise.
  - Confirmação que diga o que a pessoa mantém e até quando.
  - Para Kiwify, botão que abre `/suporte` com o assunto já preenchido.
  - Botão "Reativar" enquanto houver período pago.
  - Como oferta de retenção, só o que já existe: ELITE para PRO ou o contrário. Sem desconto nem pausa, que mexeriam em preço e regra.
- **Impacto:** alto. **Esforço:** M.

### 5. Telas de bloqueio genéricas, sem prévia nem preço
- **Onde:** `components/account/access-gate.tsx:33,45,53,62-70`
- **Problema:** as três telas dizem só o nome da ferramenta e uma frase fixa. Não explicam o que a ferramenta faz nem mostram preço. O gate do ELITE não avisa que o ELITE não tem teste. O preço já chega pelo `AccessPayload.billing.prices` (linha 12) e não é usado. Os botões usam `flex` sem quebra de linha, o que aperta no celular.
- **Mudança:**
  - Mapa `feature` para uma linha de benefício ("Agentes avisam no celular quando o padrão aparece").
  - Preço e "cancele quando quiser" perto do botão.
  - Visitante: adicionar "Ver a Jornada grátis" como saída que não exige cadastro.
  - Gate ELITE: "A partir de R$ X/mês, sem teste. Seu PRO continua igual."
  - `flex-wrap` nos botões.
- **Impacto:** alto. **Esforço:** M.

### 6. O bloco do ELITE contradiz a página de planos
- **Onde:** `lib/plans.ts:63-68` (usado em `platinum-block.tsx:36,80`) contra `lib/plans-copy.ts:25-33`
- **Problema:** o bloco e o modal do ELITE vêm da camada legada e listam "Alertas no Telegram" e "Análise de gráfico sem limite diário". Em `/planos`, o Telegram já é do PRO e o ELITE tem "500 consultas/dia". Isso viola "nunca inventar números" e prejudica a confiança.
- **Mudança:** gerar os benefícios do bloco e do modal a partir de `PLAN_FEATURES.ELITE`, que tem a fonte única. Mostrar só os diferenciais reais sobre o PRO (15M/30M/1H, agentes, Sentinelas, backtest multi-timeframe, histórico maior). Incluir o preço.
- **Impacto:** alto (confiança). **Esforço:** P.

### 7. Duas listas de "primeiros passos", uma delas morta e com termos em inglês
- **Onde:** `components/terminal/onboarding-card.tsx`; `app/api/onboarding/route.ts:21-28`; `components/terminal/workspace.tsx:523`
- **Problema:** `OnboardingCard` só aparece com `mode="dashboard"`. O único uso de `TerminalWorkspace` é `mode="charts"` (`app/charts/[symbol]/page.tsx:19`), então o cartão nunca é exibido. As etiquetas da API dizem "Dashboard", "watchlist", "AI Analyst", "botão Monitor no cabeçalho". Isso conflita com a regra de português simples.
- **Mudança:** remover o cartão e a rota, ou reaproveitar a rota como única fonte da lista ativa. O evento `onboarding_step`, declarado em `analytics-service.ts:30`, nunca é disparado.
- **Impacto:** médio. **Esforço:** P.

### 8. A lista de primeiros passos não leva ao momento de valor
- **Onde:** `components/home/my-panel.tsx:364-409,435-451`; `components/home/home-view.tsx:203-211`
- **Problema:**
  - O primeiro item é "Criar um agente", o mais trabalhoso, e "Conectar o Telegram" depende do token do bot.
  - O que o e-mail de boas-vindas sugere (ver os sinais ativos) não está na lista.
  - O checklist fica abaixo dos cinco cartões e começa em 0 de 5.
  - Dispensar grava em `localStorage` (linha 365): reaparece em outro aparelho.
- **Mudança:**
  - Ordenar por valor e esforço: "Ver os sinais do modelo", "Favoritar um ativo", "Criar um agente", "Ligar avisos", "1 aula".
  - Abrir com "Conta criada" já marcada.
  - Mostrar o checklist acima do painel enquanto houver itens pendentes.
  - Gravar a dispensa no servidor, em `onboardedAt`, que já existe.
- **Impacto:** alto. **Esforço:** M.

### 9. Nenhum evento mede a jornada de conversão
- **Onde:** `services/analytics-service.ts:10-31`; `lib/analytics-client.ts:4`
- **Problema:** só existem `signup`, `trial_started`, `plans_view`, `checkout_started` e similares. Não há visualização da landing ou de `/vendas`, clique em CTA com origem, abertura de `/registro`, exibição de bloqueio por ferramenta nem clique no cartão do teste. Sem isso não dá para ver onde o visitante desiste. O suporte a `anonId` já existe no `track`.
- **Mudança:** adicionar `cta_click` (com `origem`: hero, cartão de ferramenta, rodapé, fixo), `signup_view`, `gate_view` (com `feature`) e `trial_card_click`. Disparar `onboarding_step` de verdade.
- **Impacto:** alto (habilita decisão). **Esforço:** M.

### 10. Avisos do fim do teste: o primeiro sai cedo demais e o texto é genérico
- **Onde:** `services/lifecycle-service.ts:37-38,47-49`; `email-service.ts:71-73`
- **Problema:**
  - Com teste de 3 dias, "termina em 2 dias" sai entre 48h e 24h restantes, ou seja, no dia 1, junto com o e-mail de boas-vindas.
  - O corpo do push é idêntico nos três avisos ("Escolha PRO ou ELITE para manter o acesso").
  - Nenhum aviso cita o que a pessoa criou nem pede feedback.
- **Mudança:**
  - Empurrar o primeiro aviso para a véspera. O conceito de "2 dias" passa a ser "amanhã termina".
  - Personalizar com contagens reais (monitores, favoritos, aulas).
  - Variar o texto de cada aviso.
  - No último dia, incluir "arrependimento de 7 dias com reembolso" e a pergunta "o que faltou?".
- **Impacto:** médio. **Esforço:** P a M.

### 11. Depois do "teste terminou" não há mais contato, e não há e-mail de ativação
- **Onde:** `email-service.ts:58`; `lifecycle-service.ts:27,39-41`
- **Problema:**
  - `TemplateKind` não tem e-mail de ativação (por exemplo, 24h sem agente ou favorito) nem de reconquista após o fim do teste. Depois de `trial_ended` a pessoa não recebe mais nada.
  - Risco a confirmar com teste: `lastNoticeKind: { not: "trial_ended" }` no Prisma costuma excluir linhas com `NULL`. Uma conta EXPIRED que nunca recebeu aviso anterior pode nunca ser pega por essa rotina, nem ter monitores pausados.
- **Mudança:**
  - Dois e-mails novos, cada um com uma ideia só e sem urgência artificial: ativação no dia 1 e retorno uns dias após o fim.
  - Ajustar o filtro para `OR: [{ lastNoticeKind: null }, { not: ... }]`.
  - Respeitar a regra de não enviar mensagens sem o dono pedir: só implementar, sem disparar.
- **Impacto:** médio. **Esforço:** M.

### 12. E-mails com termos em inglês e inconsistentes com o app
- **Onde:** `services/email-service.ts:69,75`
- **Problema:** "Abrir o Dashboard" (o app chama de "Início") e "cancelar a renovação em Plans & Billing" (a tela se chama "Planos"). Fere a regra de português simples e confunde.
- **Mudança:** "Abrir o Início" e "em Planos".
- **Impacto:** médio. **Esforço:** P.

### 13. Cartões de ferramenta na landing prometem "Abrir" e levam ao cadastro
- **Onde:** `components/marketing/landing.tsx:256` (contra `sales-page.tsx:174`)
- **Problema:** `ctaFor` gera "Abrir Scanner", "Abrir Agentes" etc., mas o link é `/registro?next=…`. A `/vendas` usa "Testar grátis". O final da landing diz só "Criar conta" (linha 356) e a landing não tem o CTA fixo no celular que `/vendas` tem (`sales-page.tsx:289-293`).
- **Mudança:** usar "Testar grátis" nos cartões. Padronizar o CTA final como "Testar o PRO grátis por 3 dias". Reaproveitar o CTA fixo do celular da `/vendas`.
- **Impacto:** médio. **Esforço:** P.

### 14. Formulário de cadastro: pontos de atrito e erros técnicos
- **Onde:** `components/auth/auth-form.tsx:45-55,92-93,107,153-162,192`
- **Problema:**
  - **Erro bruto:** o erro mostra `path: message` (linha 92), ou seja, nome de campo técnico e possivelmente texto do zod em inglês.
  - **Senha:** não tem botão de mostrar senha. A regra "letras e números" só aparece em texto fixo, sem indicar o que falta.
  - **Botão desabilitado:** fica desabilitado até o aceite sem explicar (só o botão do Google tem dica).
  - **Campos que aparecem depois:** o botão do Google e o código de convite entram após `fetch` assíncrono, deslocando o layout.
  - **Descrição do login:** "workspace… watchlists" (linha 107) é jargão.
- **Mudança:**
  - Traduzir os erros por campo e mostrá-los junto ao campo.
  - Adicionar o olho de mostrar senha.
  - Mostrar "Marque o aceite para continuar" perto do botão.
  - Reservar espaço para o Google e o convite.
  - Trocar a descrição por "Acesse seus agentes, alertas e favoritos."
- **Impacto:** médio. **Esforço:** P a M.

### 15. O teste grátis em celular fica escondido, e a compra direta pede o mesmo e-mail só em letra miúda
- **Onde:** `app-shell.tsx:232,675`; `landing.tsx:178-180,324`; `sales-page.tsx:243-245`
- **Problema:**
  - **Teste no celular:** `TrialCard` vive dentro de `SidebarContent`. No celular, esse conteúdo só aparece no menu do hambúrguer (linha 675). Só a Início mostra o teste, pelo `AccessCard`.
  - **E-mail da compra:** o botão "Assinar ELITE agora" leva direto à Kiwify antes da conta existir. A instrução de usar o mesmo e-mail está só no rodapé pequeno (`billingNote`), sem aviso junto ao botão.
- **Mudança:**
  - Mostrar uma faixa discreta de dias restantes no topo do celular (`lg:hidden`).
  - Colocar a frase "Use no checkout o mesmo e-mail do cadastro" logo abaixo do botão de compra, para quem ainda não tem conta.
- **Impacto:** médio. **Esforço:** P.

### Observações
- **Não entrou na lista:** preço, planos e regra do teste (conforme pedido), e depoimentos ou números de usuários. O que a landing e `/vendas` já mostram de resultado do modelo vem do código de validação e já traz as ressalvas.
- **Risco de redação, fora dos 15:** `.agents/product-marketing.md:59` diz que a Kiwify recusou a primeira descrição e manda evitar "sinais" em textos de loja. A `/vendas` (a URL usada na Kiwify, segundo o comentário do arquivo) tem "sinais testados" no título da página (`sales-page.tsx:85,87`). O título de `app/page.tsx:10` diz "sinais validados", mais forte que o "testados" do hero. Vale o dono confirmar se a Kiwify lê essa página antes de mexer.

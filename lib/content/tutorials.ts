import type { ToolIcon } from "@/lib/tools";

/**
 * Tutoriais da Central de ajuda (/ajuda): fonte única do texto (pt-BR, linguagem simples).
 * Cada passo foi conferido com os rótulos reais da interface (botões, abas e rotas); ao mudar um rótulo no app,
 * atualize o passo aqui. Regras do projeto: sem números inventados, sem promessa de resultado, sem depoimentos.
 * Imagens e vídeos vêm de lib/content/tutorial-media.json (gerado pela captura), lidos em lib/content/tutorial-media.ts.
 */

export const TUTORIAL_CATEGORIES = ["Comece aqui", "Instalar e avisos", "Mercado", "Análise", "Automação", "Planejamento", "Aprender", "Conta"] as const;
export type TutorialCategory = (typeof TUTORIAL_CATEGORIES)[number];

/** Âncora da categoria na lista (/ajuda#cat-…). */
export const CATEGORY_ANCHOR: Record<TutorialCategory, string> = {
  "Comece aqui": "comece-aqui",
  "Instalar e avisos": "instalar-e-avisos",
  Mercado: "mercado",
  Análise: "analise",
  Automação: "automacao",
  Planejamento: "planejamento",
  Aprender: "aprender",
  Conta: "conta",
};

/**
 * Acesso exigido: `livre` = aberto sem conta; `conta` = precisa entrar (qualquer conta);
 * `pro` = teste grátis, PRO ou ELITE (regra `core` de lib/access-policy.ts).
 * Nenhuma ferramenta inteira é só do ELITE: o que é exclusivo dele vai em `eliteNote` (ex.: tempos abaixo de 4H).
 */
export type TutorialPlan = "livre" | "conta" | "pro";

/** Ícones lucide usados nos tutoriais: os das ferramentas (lib/tools.ts) e alguns próprios da ajuda. */
export type TutorialIcon = ToolIcon | "rocket" | "download" | "bell" | "send" | "user" | "settings" | "monitor" | "smartphone" | "share" | "plus" | "menu" | "check" | "search" | "star" | "creditcard";

export interface TutorialStep {
  title: string;
  text: string;
}

export interface InstallStep {
  icon: TutorialIcon;
  text: string;
}

export interface InstallGroup {
  label: string;
  icon: TutorialIcon;
  steps: InstallStep[];
}

export interface Tutorial {
  slug: string;
  title: string;
  /** até 140 caracteres (cartão, descrição da página e busca) */
  summary: string;
  category: TutorialCategory;
  icon: TutorialIcon;
  /** rota do app aberta pelo botão principal (precisa existir em app/) */
  route: string;
  /** texto do botão principal; padrão "Abrir a ferramenta" */
  cta?: string;
  plan: TutorialPlan;
  /** o que muda no ELITE, quando há algo exclusivo */
  eliteNote?: string;
  /** observação curta sobre o acesso */
  planNote?: string;
  purpose: string;
  before: string[];
  /** "Como instalar/ativar", quando se aplica */
  install?: { title: string; groups: InstallGroup[] };
  steps: TutorialStep[];
  tips: string[];
  faq: Array<{ q: string; a: string }>;
  related: string[];
}

const INTRADAY_ELITE = "Tempos gráficos abaixo de 4H (1H, 30M, 15M e menores) são exclusivos do plano ELITE. No teste grátis e no PRO ficam 4H, 1D e 1W.";

export const TUTORIALS: Tutorial[] = [
  // ------------------------------------------------------------------ Comece aqui
  {
    slug: "primeiros-passos",
    title: "Primeiros passos no CryptoScanner",
    summary: "Crie a conta, conheça a tela Início, encontre as ferramentas no menu e ative os avisos.",
    category: "Comece aqui",
    icon: "rocket",
    route: "/registro",
    cta: "Criar conta",
    plan: "livre",
    planNote: "O cadastro é grátis. As ferramentas abrem no teste grátis de 3 dias do PRO, sem cartão.",
    purpose: "Este tutorial mostra o caminho do cadastro até o primeiro alerta. Em poucos minutos você sabe onde fica cada ferramenta e como receber os avisos no celular ou no computador.",
    before: ["Um e-mail que você usa: o acesso do plano fica ligado a ele.", "Um navegador atualizado: Chrome, Edge, Firefox ou Safari."],
    steps: [
      { title: "Crie sua conta", text: "Abra Criar conta, preencha Nome, E-mail e Senha, marque o aceite dos Termos e toque em Criar conta. Se aparecer o botão Continuar com Google, você também pode usá-lo." },
      { title: "Conheça a tela Início", text: "Depois de entrar, a Início mostra Seu painel (plano, agentes, alertas e favoritos), a lista Primeiros passos e os Sinais ativos do modelo de rompimento." },
      { title: "Siga a lista Primeiros passos", text: "A lista marca sozinha o que você já fez: ver os sinais do modelo, favoritar um ativo, criar um agente, ativar um alerta ou monitor e concluir uma aula da Jornada. Quando não precisar mais, toque em Ocultar primeiros passos." },
      { title: "Encontre as ferramentas no menu", text: "No computador, o menu fica à esquerda, separado em Mercado, Análise, Automação, Planejamento e Aprender; as ferramentas de análise profunda ficam no grupo Avançado. No celular, use a barra de baixo e o botão Mais." },
      { title: "Use a busca do topo", text: "Clique em Buscar ativo, ferramenta ou indicador (ou use Ctrl+K no Windows, Cmd+K no Mac) e digite o nome de uma moeda ou ferramenta." },
      { title: "Ative os avisos", text: "Em Preferências, ative as Notificações no navegador e conecte o Telegram para receber os alertas dos agentes, Sentinelas e monitores." },
    ],
    tips: ["Comece pelo Scanner e pela Análise completa de uma moeda que você já acompanha.", "Se está começando agora, faça antes a Jornada Trader: 12 aulas grátis, sem cadastro.", "Instale o app na tela inicial: abre mais rápido e, no iPhone, é o que permite receber notificações."],
    faq: [
      { q: "Preciso de cartão para testar?", a: "Não. O teste grátis de 3 dias do plano PRO é sem cartão." },
      { q: "O que acontece quando o teste termina?", a: "As ferramentas ficam bloqueadas até você escolher um plano. Sua conta, favoritos, estratégias e monitores continuam salvos." },
      { q: "Esqueci minha senha. E agora?", a: "Na tela Entrar, toque em Esqueci minha senha e siga o link enviado para o seu e-mail." },
    ],
    related: ["instalar-app", "notificacoes-push", "inicio", "planos-e-conta"],
  },
  {
    slug: "instalar-app",
    title: "Instalar o app no celular e no computador",
    summary: "Coloque o CryptoScanner na tela inicial do celular ou na área de trabalho, com ícone próprio e janela própria.",
    category: "Instalar e avisos",
    icon: "download",
    route: "/",
    cta: "Abrir o CryptoScanner",
    plan: "livre",
    purpose: "O CryptoScanner funciona no navegador e também pode ser instalado como app, com ícone na tela inicial ou na área de trabalho. Ele abre em janela própria, sem barra de endereço, e no iPhone é o caminho para receber notificações.",
    before: ["No computador: Chrome ou Edge.", "No Android: Chrome.", "No iPhone ou iPad: Safari."],
    install: {
      title: "Como instalar",
      groups: [
        {
          label: "Computador (Chrome ou Edge)",
          icon: "monitor",
          steps: [
            { icon: "globe", text: "Abra www.cryptoscanner.com.br no Chrome ou no Edge." },
            { icon: "download", text: "Na barra de endereço, clique no ícone de instalar, à direita do endereço." },
            { icon: "check", text: "Confirme em Instalar. O app abre em janela própria e ganha um atalho no computador." },
            { icon: "menu", text: "Se o ícone não aparecer, abra o menu do navegador (⋮ no Chrome, … no Edge) e procure a opção de instalar o site como app." },
          ],
        },
        {
          label: "Android (Chrome)",
          icon: "smartphone",
          steps: [
            { icon: "globe", text: "Abra www.cryptoscanner.com.br no Chrome." },
            { icon: "menu", text: "Toque no menu ⋮, no canto superior direito." },
            { icon: "plus", text: "Toque em Instalar app ou em Adicionar à tela inicial." },
            { icon: "check", text: "Confirme. O ícone do CryptoScanner aparece na tela inicial." },
          ],
        },
        {
          label: "iPhone e iPad (Safari)",
          icon: "smartphone",
          steps: [
            { icon: "globe", text: "Abra www.cryptoscanner.com.br no Safari." },
            { icon: "share", text: "Toque em Compartilhar (o quadrado com a seta para cima)." },
            { icon: "plus", text: "Role as opções e toque em Adicionar à Tela de Início." },
            { icon: "check", text: "Toque em Adicionar. Daqui em diante, abra o CryptoScanner por esse ícone." },
          ],
        },
      ],
    },
    steps: [
      { title: "Abra pelo ícone", text: "Depois de instalado, abra o CryptoScanner pelo ícone. É a mesma conta do site; se pedir, entre com seu e-mail e senha." },
      { title: "Navegue pela barra de baixo", text: "No celular, a barra inferior leva a Início, Scanner, Gráficos e Carteira. O botão Mais abre o menu completo." },
      { title: "Ative as notificações", text: "Em Preferências, toque em Ativar notificações. No iPhone isso só funciona com o app aberto pelo ícone da tela inicial." },
      { title: "Receba as novidades sem baixar nada", text: "Não há loja de aplicativos: o app usa o mesmo site, então as melhorias chegam sem instalar versão nova." },
      { title: "Remova quando quiser", text: "Para desinstalar, apague o ícone como faria com qualquer app. Sua conta e seus dados continuam salvos." },
    ],
    tips: ["O botão Instalar app desta página aparece quando o seu navegador permite instalar direto por aqui.", "No iPhone, o caminho mais simples é o Safari.", "Instalado ou não, o conteúdo é o mesmo: você pode alternar entre o app e o navegador."],
    faq: [
      { q: "Não aparece a opção de instalar.", a: "Confira se está no Chrome ou Edge (computador), no Chrome (Android) ou no Safari (iPhone). O Firefox para computador não instala sites como app; nele o CryptoScanner continua funcionando normalmente no navegador." },
      { q: "Preciso instalar para usar?", a: "Não. Tudo funciona no navegador. Instalar só deixa o acesso mais rápido e, no iPhone, permite receber notificações." },
      { q: "Instalei e o app pediu login de novo.", a: "Em alguns aparelhos o app instalado guarda a sessão separada do navegador. Entre uma vez com seu e-mail e senha." },
    ],
    related: ["notificacoes-push", "conectar-telegram", "primeiros-passos"],
  },
  // ------------------------------------------------------------------ Instalar e avisos
  {
    slug: "notificacoes-push",
    title: "Ativar notificações no navegador",
    summary: "Receba no celular ou no computador os avisos de agentes, Sentinelas, monitores e alertas, mesmo com o app fechado.",
    category: "Instalar e avisos",
    icon: "bell",
    route: "/preferencias",
    cta: "Abrir Preferências",
    plan: "conta",
    planNote: "Os avisos vêm de agentes, Sentinelas, monitores e alertas, que fazem parte do teste grátis e dos planos PRO e ELITE.",
    purpose: "As notificações push avisam quando um agente ou Sentinela encontra um sinal, quando um alerta dispara e quando o ciclo automático falha. Elas chegam mesmo com o app fechado, e tocar no aviso abre a página correspondente.",
    before: ["Estar com a conta aberta.", "Chrome, Edge ou Firefox. No iPhone, o app precisa estar instalado na tela inicial (iOS 16.4 ou mais recente).", "Ter pelo menos um agente, Sentinela, monitor ou alerta para gerar avisos."],
    install: {
      title: "Como ativar",
      groups: [
        {
          label: "Computador e Android",
          icon: "monitor",
          steps: [
            { icon: "settings", text: "Abra Preferências, no menu lateral ou no menu da sua conta (canto superior direito)." },
            { icon: "bell", text: "No cartão Notificações no navegador, toque em Ativar notificações." },
            { icon: "check", text: "Quando o navegador perguntar, escolha Permitir." },
            { icon: "send", text: "Toque em Enviar teste para conferir se o aviso chega." },
          ],
        },
        {
          label: "iPhone e iPad",
          icon: "smartphone",
          steps: [
            { icon: "download", text: "Instale o app: no Safari, Compartilhar → Adicionar à Tela de Início." },
            { icon: "smartphone", text: "Abra o CryptoScanner pelo ícone da tela inicial (não pelo Safari)." },
            { icon: "bell", text: "Vá em Preferências e toque em Ativar notificações." },
            { icon: "check", text: "Toque em Permitir e depois em Enviar teste." },
          ],
        },
      ],
    },
    steps: [
      { title: "Confira o estado", text: "O cartão Notificações no navegador mostra se elas estão ativas neste navegador e quantos navegadores estão inscritos na sua conta." },
      { title: "Ative em cada aparelho", text: "A ativação vale por navegador. Repita o passo a passo no celular e no computador que você usa." },
      { title: "Escolha push nos monitores", text: "Ao criar um monitor, deixe marcada a opção Push no navegador." },
      { title: "Toque no aviso", text: "Quando a notificação chegar, toque nela para abrir o app na página do sinal ou do alerta." },
      { title: "Desative quando quiser", text: "No mesmo cartão, toque em Desativar. Os avisos continuam registrados no painel do app." },
    ],
    tips: ["Use Enviar teste sempre que trocar de navegador ou de aparelho.", "Push e Telegram podem ficar ligados ao mesmo tempo.", "Se o computador estiver em modo Não perturbe, os avisos podem ficar escondidos na central de notificações."],
    faq: [
      { q: "Toquei em Bloquear sem querer.", a: "Abra as permissões do site no navegador (ícone ao lado do endereço), mude Notificações para Permitir e toque em Ativar notificações de novo." },
      { q: "Aparece “Este navegador não suporta notificações push”.", a: "Use Chrome, Edge ou Firefox. No iPhone, instale o app na tela inicial e abra por lá." },
      { q: "O teste não chegou.", a: "Confira se as notificações do navegador estão permitidas nas configurações do sistema e se o modo Não perturbe ou Foco está desligado." },
    ],
    related: ["instalar-app", "conectar-telegram", "monitores-alertas", "agentes-ia"],
  },
  {
    slug: "conectar-telegram",
    title: "Conectar o Telegram",
    summary: "Receba os sinais dos agentes, Sentinelas, monitores e alertas no Telegram, sem precisar abrir o site.",
    category: "Instalar e avisos",
    icon: "send",
    route: "/preferencias",
    cta: "Abrir Preferências",
    plan: "pro",
    purpose: "Conectando o Telegram, os avisos das suas automações chegam como mensagem do bot do CryptoScanner. A conexão leva poucos segundos e pode ser desfeita a qualquer momento.",
    before: ["Telegram instalado no celular ou no computador.", "Conta com teste grátis, PRO ou ELITE."],
    install: {
      title: "Como conectar",
      groups: [
        {
          label: "Conexão automática",
          icon: "send",
          steps: [
            { icon: "settings", text: "Abra Preferências (ou a página Agentes IA) e encontre o cartão Alertas no Telegram." },
            { icon: "send", text: "Toque em Conectar Telegram. O Telegram abre na conversa com o bot." },
            { icon: "check", text: "No Telegram, toque em Iniciar." },
            { icon: "smartphone", text: "Volte ao app: a conexão é confirmada sozinha e aparece o selo Conectado. Se demorar, toque em Já toquei em Iniciar." },
          ],
        },
        {
          label: "Alternativa: Chat ID manual",
          icon: "settings",
          steps: [
            { icon: "menu", text: "No mesmo cartão, abra Conectar manualmente (Chat ID)." },
            { icon: "send", text: "Abra o bot indicado e toque em Iniciar." },
            { icon: "search", text: "Descubra seu Chat ID com o @userinfobot, no próprio Telegram." },
            { icon: "check", text: "Cole o número no campo Chat ID e toque em Salvar Chat ID." },
          ],
        },
      ],
    },
    steps: [
      { title: "Teste a conexão", text: "Com o selo Conectado, toque em Enviar mensagem de teste e confira a mensagem no Telegram." },
      { title: "Escolha o Telegram nos agentes", text: "No assistente do agente, em Configurações do Alerta, escolha Telegram ou Ambos em Tipo de notificação." },
      { title: "Escolha o Telegram na Sentinela", text: "Ao criar uma Sentinela, em Notificações, escolha Log + Telegram ou Somente Telegram." },
      { title: "Marque Telegram nos monitores e alertas", text: "Nos monitores, marque a opção Telegram. Nos alertas da Carteira, escolha o canal Telegram ou Ambos." },
      { title: "Desconecte quando quiser", text: "No cartão Alertas no Telegram, toque em Desconectar. Os avisos continuam no painel do app." },
    ],
    tips: ["Deixe o Telegram e as notificações push ligados juntos para não perder um aviso.", "O link Abra o bot por este link aparece se o Telegram não abrir sozinho.", "Chat ID de grupo começa com o sinal de menos (-)."],
    faq: [
      { q: "Toquei em Iniciar e não conectou.", a: "Volte ao app e toque em Já toquei em Iniciar. Se aparecer o aviso de que a confirmação não chegou, toque em Tentar de novo e repita o Iniciar na conversa com o bot." },
      { q: "As opções de Telegram aparecem bloqueadas.", a: "Os alertas no Telegram fazem parte do teste grátis e dos planos PRO e ELITE. Confira seu plano em Planos." },
      { q: "Aparece que o envio pelo Telegram está indisponível.", a: "É uma falha temporária do envio. Os alertas continuam chegando no painel e por push; tente conectar mais tarde." },
    ],
    related: ["notificacoes-push", "agentes-ia", "sentinela", "monitores-alertas"],
  },
  // ------------------------------------------------------------------ Mercado
  {
    slug: "inicio",
    title: "Tela Início: seu painel e os sinais do modelo",
    summary: "Veja seu plano, agentes, alertas e favoritos num só lugar, com os sinais ativos do modelo de rompimento testado.",
    category: "Mercado",
    icon: "home",
    route: "/",
    plan: "conta",
    planNote: "Sem conta, a Início mostra a apresentação do app. Os sinais e o painel aparecem com a conta aberta e acesso ativo.",
    purpose: "A Início é o ponto de partida depois do login. Ela reúne o estado da sua conta, atalhos para as ferramentas e os sinais ativos do modelo de rompimento, com entrada, stop e resultado em aberto.",
    before: ["Conta aberta.", "Teste grátis ou plano ativo para ver sinais, agentes e alertas."],
    steps: [
      { title: "Confira Seu painel", text: "No topo, Seu painel mostra o plano, os agentes, os monitores e alertas ativos e os seus favoritos." },
      { title: "Use as Ações rápidas", text: "Os atalhos Escanear agora, Análise completa, Novo agente e Perguntar ao Analista IA levam direto a cada ferramenta." },
      { title: "Veja os Sinais ativos", text: "Na seção Sinais ativos, escolha o timeframe e confira as posições abertas pelo modelo: ativo, preço de entrada, preço atual, stop móvel e distância ao stop." },
      { title: "Leia o bloco Como ler", text: "Ao lado dos sinais, Como ler explica cada coluna. Leia antes de usar os números." },
      { title: "Acompanhe as saídas", text: "Em Saídas nos últimos 30 dias ficam as operações que o modelo já encerrou." },
      { title: "Favorite ativos", text: "Toque na estrela de qualquer ativo para que ele apareça em Favoritos no seu painel." },
    ],
    tips: ["Toque em Atualizar sinais para buscar os números mais recentes.", "Os sinais são leitura técnica do modelo, não recomendação de compra ou venda.", "A lista Primeiros passos some quando você conclui todos os itens ou toca em Ocultar primeiros passos."],
    faq: [
      { q: "Não aparece nenhum sinal.", a: "Quando o modelo não tem posição aberta no timeframe escolhido, a tabela avisa. Troque o timeframe ou volte mais tarde." },
      { q: "Aparece “Requer plano ativo”.", a: "O teste ou o plano terminou. Escolha um plano em Planos; seus dados continuam salvos." },
    ],
    related: ["scanner", "analise-completa", "panorama", "primeiros-passos"],
  },
  {
    slug: "panorama",
    title: "Panorama Diário do mercado",
    summary: "Capitalização, dominância, Medo & Ganância, resumo do dia e os 30 ativos monitorados em uma página.",
    category: "Mercado",
    icon: "globe",
    route: "/panorama",
    plan: "pro",
    purpose: "O Panorama responde em poucos segundos como está o mercado hoje: tamanho, dominância do Bitcoin, humor dos investidores e o que mais subiu ou caiu. Serve de contexto antes de analisar uma moeda.",
    before: ["Teste grátis, PRO ou ELITE."],
    steps: [
      { title: "Leia os números do topo", text: "Os cartões mostram Cap. total, Volume 24h, Dominância BTC / ETH, Medo & Ganância e a cotação USD/BRL." },
      { title: "Veja o Resumo executivo do dia", text: "O resumo explica em texto o momento do mercado; logo abaixo, Principais fatores lista o viés de cada fator com a fonte do dado." },
      { title: "Confira os derivativos", text: "O bloco de derivativos mostra funding, open interest, contas long e a relação taker compra/venda da última hora." },
      { title: "Percorra os 30 ativos monitorados", text: "A tabela Os 30 ativos monitorados traz preço, capitalização e volume de cada moeda do app." },
      { title: "Veja quem mais se moveu", text: "Maiores altas 24h e Maiores baixas 24h mostram as moedas com maior variação do dia." },
      { title: "Acompanhe o humor do mercado", text: "O gráfico Medo & Ganância — últimos 8 dias mostra se o sentimento está melhorando ou piorando." },
    ],
    tips: ["Olhe o Panorama antes de abrir o Scanner: ajuda a entender se o mercado está em alta, em queda ou lateral.", "Pergunte ao Analista IA “Como está o mercado hoje?” para um resumo com os mesmos números."],
    faq: [
      { q: "Um bloco mostra “indisponível”.", a: "Uma das fontes públicas de dados não respondeu. O resto da página continua valendo; tente de novo em instantes." },
      { q: "De onde vêm os números?", a: "De fontes públicas de mercado, indicadas em cada bloco. Recarregue a página para buscar os números mais recentes." },
    ],
    related: ["bolhas", "inicio", "analista-ia"],
  },
  {
    slug: "bolhas",
    title: "Mapa de Bolhas",
    summary: "Os 100 maiores ativos por volume em bolhas: o tamanho mostra o volume e a cor mostra a variação do período.",
    category: "Mercado",
    icon: "bubbles",
    route: "/bubbles",
    plan: "pro",
    purpose: "O Mapa de Bolhas mostra de relance para onde o dinheiro está indo. Bolhas maiores têm mais volume (ou capitalização) e a cor indica quanto o ativo subiu ou caiu no período escolhido.",
    before: ["Teste grátis, PRO ou ELITE."],
    steps: [
      { title: "Escolha o período", text: "Use os botões 1h, 24h, 7d e 30d para trocar o período da variação." },
      { title: "Escolha o tamanho", text: "Alterne entre Tamanho: volume e Tamanho: cap. para mudar o que define o tamanho de cada bolha." },
      { title: "Leia as cores", text: "A legenda vai de > +5% a < −5%: tons de alta de um lado, tons de queda do outro." },
      { title: "Passe o mouse ou toque numa bolha", text: "O detalhe mostra o nome do ativo e a variação no período." },
      { title: "Abra o gráfico", text: "Clicar numa bolha de um dos 30 ativos monitorados abre a moeda em Gráficos." },
      { title: "Atualize", text: "Toque em ↻ Atualizar para buscar os números mais recentes." },
    ],
    tips: ["Compare 24h com 7d para ver se um movimento é de hoje ou vem de dias.", "Use o Mapa para escolher o que analisar e depois abra a Análise completa."],
    faq: [
      { q: "Cliquei numa bolha e nada aconteceu.", a: "Só as moedas monitoradas pelo app (as 30 do Scanner) abrem em Gráficos. As demais aparecem apenas para comparação." },
      { q: "Aparece que não foi possível carregar o mapa.", a: "As fontes de mercado não responderam. Tente de novo em instantes." },
    ],
    related: ["panorama", "graficos", "scanner"],
  },
  // ------------------------------------------------------------------ Análise
  {
    slug: "scanner",
    title: "Scanner de padrões gráficos",
    summary: "Encontre padrões gráficos em formação nos 30 ativos, com alvo, stop e taxa de acerto histórica de cada padrão.",
    category: "Análise",
    icon: "radar",
    route: "/scanner/padroes",
    plan: "pro",
    eliteNote: INTRADAY_ELITE,
    purpose: "O Scanner procura 17 padrões gráficos (como triângulos, bandeiras e topos duplos) nos 30 ativos monitorados e mostra onde cada um está se formando, com pontos de entrada, alvo e stop. A detecção é automática; combine com a sua estratégia e gestão de risco.",
    before: ["Teste grátis, PRO ou ELITE.", "Saber o tempo gráfico que você acompanha (4H, 1D ou 1W)."],
    steps: [
      { title: "Escolha o timeframe", text: "Em Timeframe, toque em 4H, 1D ou 1W. Botões com cadeado são do plano ELITE." },
      { title: "Filtre o que procura", text: "Em Tipo de padrão escolha Todos, ▲ Alta ou ▼ Baixa; em Moeda, uma moeda ou todas; e ajuste a Confiança mínima." },
      { title: "Toque em Escanear Agora", text: "O scanner analisa os ativos e mostra quantos foram analisados, a hora do último scan e a fonte dos dados." },
      { title: "Veja os resultados", text: "Na aba Padrões Técnicos ficam os padrões encontrados. A aba Tabela em tempo real mostra os 30 ativos lado a lado." },
      { title: "Abra o padrão no gráfico", text: "Em cada padrão, toque em Gráfico para ver os pontos, o alvo e o stop desenhados, ou em Criar agente para vigiar o padrão automaticamente." },
      { title: "Confira volume e histórico", text: "A aba Alertas de Volume mostra aumentos anormais de volume e o Histórico de Alertas guarda os scans anteriores." },
      { title: "Analise uma imagem de gráfico", text: "Em Análise de Gráfico por IA, envie a captura de um gráfico (arraste, cole ou escolha o arquivo) e toque em Analisar com IA." },
    ],
    tips: ["O cartão Padrões suportados (17) explica cada padrão; vale ler antes de operar.", "A taxa de acerto de cada padrão leva à página Taxa de acerto, com o histórico que a gerou.", "Alterne USD e BRL no topo para ver os preços em reais."],
    faq: [
      { q: "O scan não encontrou nenhum padrão.", a: "Nem sempre há padrão em formação. Troque o timeframe, reduza a Confiança mínima ou escolha Todos em Tipo de padrão." },
      { q: "Por que alguns timeframes têm cadeado?", a: "Tempos abaixo de 4H são exclusivos do ELITE. No teste grátis e no PRO use 4H, 1D ou 1W." },
      { q: "A taxa de acerto garante o resultado?", a: "Não. Ela mostra como o padrão se comportou no histórico; resultado passado não garante resultado futuro." },
    ],
    related: ["scanner-setups", "graficos", "agentes-ia", "analise-completa"],
  },
  {
    slug: "scanner-setups",
    title: "Scanner de setups",
    summary: "Ranking dos 30 ativos por estado do setup, Confluence Score, regime e relação risco/retorno.",
    category: "Análise",
    icon: "target",
    route: "/scanner",
    plan: "pro",
    eliteNote: INTRADAY_ELITE,
    purpose: "O Scanner de setups coloca os 30 ativos numa tabela com o estado do setup (em formação, pronto, acionado…), a nota de confluência de 0 a 100, o regime do mercado e os níveis de zona, gatilho, stop e primeiro alvo. É um ranking técnico, não uma recomendação.",
    before: ["Teste grátis, PRO ou ELITE.", "Ele fica no grupo Avançado do menu."],
    steps: [
      { title: "Escolha o timeframe", text: "Na barra de filtros, toque no timeframe desejado." },
      { title: "Filtre a tabela", text: "Use Direção, Regime, Categoria e Nota ≥ para ficar só com o que interessa." },
      { title: "Esconda o que não tem entrada", text: "Marque Ocultar sem entrada para ver apenas os ativos com setup operável." },
      { title: "Escolha os estados do setup", text: "Toque nos estados (Em formação, Pronto, Acionado e outros) para mostrar ou esconder cada um." },
      { title: "Ordene pelas colunas", text: "Toque no título de Nota, R:R, Dist. zona (ATR), RSI ou RVOL para ordenar." },
      { title: "Aplique uma estratégia sua", text: "Em Estratégia, escolha uma estratégia salva no Construtor: a coluna Estratégia mostra quais ativos atendem às regras." },
      { title: "Abra o ativo", text: "Toque no nome do ativo para abrir a Análise completa dele." },
    ],
    tips: ["O botão Padrões gráficos, no topo, leva ao Scanner de padrões.", "Use o botão Atualizar para recarregar a tabela.", "A nota mede a qualidade da confluência, não a chance de acerto."],
    faq: [
      { q: "Aparece “Nenhum ativo com esses filtros agora”.", a: "Desmarque Ocultar sem entrada ou reduza a nota mínima." },
      { q: "O que é o regime?", a: "É a leitura do comportamento do preço (tendência de alta, de queda ou lateral), usada para filtrar setups." },
    ],
    related: ["scanner", "analise-completa", "construtor-estrategias", "monitores-alertas"],
  },
  {
    slug: "analise-completa",
    title: "Análise completa de um ativo",
    summary: "Gráfico, estrutura, liquidez, Confluence Score, setup, derivativos e histórico de um ativo numa só tela.",
    category: "Análise",
    icon: "chart",
    route: "/charts",
    plan: "pro",
    eliteNote: "No teste grátis e no PRO a análise completa funciona em 4H, 1D e 1W. Tempos menores são do ELITE.",
    purpose: "A Análise completa junta tudo o que o app sabe sobre uma moeda: gráfico com camadas, estrutura de mercado, liquidez, suportes e resistências, nota de confluência, estado do setup, derivativos e desempenho histórico dos setups.",
    before: ["Teste grátis, PRO ou ELITE.", "Ela fica no grupo Avançado do menu e também abre ao tocar num ativo do Scanner de setups."],
    steps: [
      { title: "Escolha o ativo", text: "Toque num ativo das listas da tela (favoritos ou ranking do scanner) ou use a busca do topo (Ctrl+K) para trocar de moeda." },
      { title: "Escolha exchange e instrumento", text: "Em Exchange escolha Binance, Bybit ou OKX; em Instrumento, Spot ou Perpétuo." },
      { title: "Ligue as camadas do gráfico", text: "Em Indicadores, escolha o que desenhar sobre os candles, como zona de entrada, gatilho e stop." },
      { title: "Leia a aba Análise", text: "No painel ao lado ficam Estrutura de mercado, Liquidez, Confluence Score (com o cálculo), Estado do setup e Desempenho histórico." },
      { title: "Veja os derivativos", text: "No Perpétuo, o bloco Derivativos mostra Open Interest, Funding, liquidações e a relação long/short." },
      { title: "Monitore o setup", text: "Toque em Monitorar para ser avisado quando o setup mudar de estado, ou na estrela para favoritar o ativo." },
      { title: "Calcule a posição", text: "No bloco Gestão de risco, escolha o lado e preencha Saldo ($), Risco % e Alavancagem; Calcular tamanho da posição abre a calculadora de risco com esses valores." },
    ],
    tips: ["Os indicadores usam só candles fechados; o candle em formação aparece, mas não entra no cálculo.", "Use Foco no gráfico ou Tela cheia para ver mais candles.", "Na aba Alertas há atalhos para Criar alerta e para a Sentinela."],
    faq: [
      { q: "Aparece um aviso de fonte alternativa.", a: "A exchange escolhida não respondeu e o app usou os dados de outra. O aviso mostra qual." },
      { q: "Funding e Open Interest aparecem vazios.", a: "Esses dados existem só para contratos perpétuos. Troque o Instrumento para Perpétuo." },
    ],
    related: ["scanner-setups", "graficos", "monitores-alertas", "analista-ia"],
  },
  {
    slug: "graficos",
    title: "Gráficos com indicadores",
    summary: "Candles ao vivo com EMA, Bollinger, StochRSI, MACD, suportes, resistências, linhas de tendência e padrões.",
    category: "Análise",
    icon: "candles",
    route: "/graficos",
    plan: "pro",
    purpose: "A página Gráficos mostra os candles de qualquer um dos 30 ativos com os indicadores calculados no servidor. Clicar num padrão detectado desenha os pontos, o alvo e o stop direto no gráfico.",
    before: ["Teste grátis, PRO ou ELITE."],
    steps: [
      { title: "Escolha o ativo", text: "No seletor Ativo, escolha a moeda." },
      { title: "Escolha o timeframe", text: "Toque no tempo gráfico desejado na fileira de botões." },
      { title: "Ligue e desligue indicadores", text: "Use os botões EMA 8, EMA 25, EMA 100, EMA 200, BB, Vol, StochRSI, MACD, S/R, Fib e LT. Os ligados ficam destacados." },
      { title: "Leia o resumo técnico", text: "Os cartões mostram Tendência, Momentum, RSI 14, StochRSI K/D, MACD hist., ATR 14, Bollinger %B e Vol. relativo." },
      { title: "Veja suportes e resistências", text: "O bloco Suportes e resistências lista os níveis detectados na janela do gráfico." },
      { title: "Desenhe um padrão", text: "Em Padrões detectados, clique num padrão para desenhá-lo no gráfico com alvo e stop." },
    ],
    tips: ["As escolhas de indicadores ficam salvas neste navegador.", "Chegando pelo botão Gráfico do Scanner, o padrão já vem desenhado.", "Toque em Atualizar para recarregar os candles."],
    faq: [
      { q: "Aparece “Erro ao carregar dados”.", a: "A fonte de mercado não respondeu. Tente de novo em instantes." },
      { q: "Qual a diferença para a Análise completa?", a: "Gráficos é focado em indicadores e padrões. A Análise completa acrescenta estrutura, liquidez, nota de confluência, setup e derivativos." },
    ],
    related: ["fibonacci", "scanner", "analise-completa"],
  },
  {
    slug: "fibonacci",
    title: "Fibonacci automático e manual",
    summary: "Retrações e extensões de Fibonacci calculadas do último swing do ativo ou de uma máxima e mínima que você informa.",
    category: "Análise",
    icon: "ruler",
    route: "/fibonacci",
    plan: "pro",
    purpose: "A página Fibonacci calcula os níveis de retração (23,6 % a 78,6 %) e de extensão (127,2 % a 261,8 %) sem precisar desenhar nada. Use o modo automático para o último movimento do ativo ou a calculadora para valores seus.",
    before: ["Teste grátis, PRO ou ELITE."],
    steps: [
      { title: "Escolha o modo", text: "Use a aba Automático (swing do ativo) ou a aba Calculadora manual." },
      { title: "No automático, escolha ativo e timeframe", text: "Selecione Ativo, Timeframe e o número de Barras (lookback): a máxima e a mínima dessas barras definem o movimento." },
      { title: "Leia a tabela de níveis", text: "Cada linha mostra Tipo, Nível, Preço e Distância do preço; o nível mais próximo do preço atual vem marcado." },
      { title: "Na calculadora, informe os valores", text: "Preencha Máxima e Mínima e escolha a Direção do movimento: ▲ Alta (mín → máx) ou ▼ Baixa (máx → mín)." },
      { title: "Use os níveis no gráfico", text: "Em Gráficos, ligue o botão Fib para ver os mesmos níveis sobre os candles." },
    ],
    tips: ["Aumente as barras para pegar movimentos maiores; diminua para o movimento mais recente.", "Na calculadora, a máxima precisa ser maior que a mínima."],
    faq: [
      { q: "Aparece “Não foi possível determinar um swing válido”.", a: "O período escolhido não tem um movimento claro. Mude o número de barras ou o timeframe." },
      { q: "A direção muda os níveis?", a: "Sim. Em alta, as retrações são medidas a partir da máxima para baixo; em queda, da mínima para cima." },
    ],
    related: ["graficos", "analise-completa"],
  },
  {
    slug: "analista-ia",
    title: "Analista IA",
    summary: "Pergunte sobre qualquer um dos 30 ativos: o analista consulta as ferramentas do app e responde com os números delas.",
    category: "Análise",
    icon: "sparkles",
    route: "/analista",
    plan: "pro",
    eliteNote: "Perguntas sobre tempos abaixo de 4H são respondidas só no ELITE.",
    purpose: "O Analista IA é uma conversa sobre o mercado. Ele consulta a análise completa, o scanner, os sinais do modelo, a taxa de acerto e o panorama, e responde só com os números dessas ferramentas. Não é recomendação de investimento.",
    before: ["Teste grátis, PRO ou ELITE.", "O número de perguntas por dia depende do plano."],
    steps: [
      { title: "Abra o Analista", text: "Use o item Analista IA do menu ou o botão Analista IA no topo de qualquer página." },
      { title: "Comece por uma sugestão", text: "Na primeira tela, toque numa pergunta pronta, como “Quais sinais do modelo estão abertos agora?”." },
      { title: "Escreva sua pergunta", text: "Digite no campo de baixo (por exemplo, “Resuma BTC no 4H: estrutura, níveis e riscos”) e toque em Enviar." },
      { title: "Confira os números", text: "A resposta cita os dados das ferramentas. Números que não constam nelas são sinalizados." },
      { title: "Crie um alerta pela resposta", text: "Quando a resposta sugerir um nível, toque em Criar alerta para ser avisado quando o preço chegar lá." },
      { title: "Retome conversas", text: "Em Histórico ficam as conversas anteriores; Nova começa outra do zero." },
    ],
    tips: ["Diga o ativo e o timeframe na pergunta para respostas mais precisas.", "Use Parar para interromper uma resposta longa.", "Compare dois ativos na mesma pergunta, por exemplo “Compare BTC e ETH no 1D”."],
    faq: [
      { q: "Apareceu que a resposta será a leitura automática da tela.", a: "O serviço de IA está indisponível no momento; o analista responde com a leitura automática dos dados. Tente de novo mais tarde para a conversa completa." },
      { q: "O analista pode errar?", a: "Pode. Ele se apoia nos números do app, mas a decisão é sempre sua. Confira nas ferramentas antes de operar." },
    ],
    related: ["analise-completa", "scanner", "panorama"],
  },
  // ------------------------------------------------------------------ Automação
  {
    slug: "agentes-ia",
    title: "Agentes IA",
    summary: "Crie agentes que vigiam os ativos com as estratégias escolhidas e avisam no painel, por push ou no Telegram.",
    category: "Automação",
    icon: "bot",
    route: "/agentes",
    plan: "pro",
    eliteNote: "Timeframes 15M, 30M e 1H nos agentes exigem o plano ELITE.",
    purpose: "Um agente vigia uma lista de ativos com as estratégias que você escolhe. O servidor verifica cada agente a cada 5 minutos, mesmo com o navegador fechado, e registra o motivo de cada sinal no log.",
    before: ["Teste grátis, PRO ou ELITE (o número de agentes depende do plano).", "Para receber no Telegram, conecte-o antes."],
    steps: [
      { title: "Toque em Novo Agente", text: "No topo da página Agentes de IA, toque em Novo Agente. Para começar pronto, use Scanner de IA e escolha um preset." },
      { title: "Identidade", text: "Preencha o Nome do agente, escolha um Ícone e, se quiser, uma Descrição. Toque em Próximo." },
      { title: "Mercado & Timeframe", text: "Marque os ativos, escolha o Tipo de operação (Day Trade ou Swing Trade) e o Timeframe principal." },
      { title: "Estratégias", text: "Selecione uma ou mais estratégias. Todas são regras fixas e auditáveis." },
      { title: "Configurações do Alerta", text: "Ajuste a Confiança mínima e escolha o Tipo de notificação: Log, Telegram ou Ambos." },
      { title: "Confirmar e ativar", text: "Revise o resumo e toque em Ativar agente." },
      { title: "Acompanhe e gerencie", text: "Em Meus Agentes use Executar agora, Pausar, Retomar, Editar ou Excluir. O Log de Operações em Tempo Real mostra sinais, avisos e erros." },
    ],
    tips: ["No Scanner, o botão Criar agente abre o assistente já com o ativo e a estratégia do padrão.", "O cartão Estratégias Pré-Definidas de IA explica cada estratégia disponível.", "Há um intervalo mínimo de 30 minutos entre alertas do mesmo agente."],
    faq: [
      { q: "Criei o agente e o log está vazio.", a: "O agente é verificado a cada 5 minutos. Toque em Executar agora para rodar na hora ou aguarde o próximo ciclo." },
      { q: "Não recebo nada no Telegram.", a: "Confira se o Telegram está conectado (selo Conectado em Preferências) e se o Tipo de notificação do agente é Telegram ou Ambos." },
      { q: "Não consigo escolher 1H.", a: "Timeframes abaixo de 4H são do ELITE." },
    ],
    related: ["sentinela", "conectar-telegram", "monitores-alertas", "scanner"],
  },
  {
    slug: "sentinela",
    title: "Sentinela",
    summary: "Vigie uma moeda em todos os padrões gráficos ao mesmo tempo, 24 horas no servidor, com plano de trade em cada sinal.",
    category: "Automação",
    icon: "shield",
    route: "/sentinela",
    plan: "pro",
    purpose: "A Sentinela acompanha uma moeda em vários padrões gráficos de uma vez, no servidor, sem precisar deixar a página aberta. Cada sinal vira um relatório com entrada, alvo, stop e relação risco/retorno.",
    before: ["Teste grátis, PRO ou ELITE (os espaços de Sentinela são separados dos agentes).", "Para receber no Telegram, conecte-o antes."],
    steps: [
      { title: "Escolha a moeda", text: "No cartão Novo Sentinela, escolha a Moeda monitorada." },
      { title: "Escolha o tempo gráfico", text: "Em Tempo gráfico principal, escolha 4 horas (recomendado), Diário ou Semanal." },
      { title: "Ajuste a confiança", text: "Mova Confiança mínima para alertar: só sinais com confiança igual ou maior geram aviso." },
      { title: "Escolha as notificações", text: "Em Notificações, escolha Somente log da plataforma, Log + Telegram ou Somente Telegram." },
      { title: "Toque em Criar Sentinela", text: "A primeira varredura acontece em até 5 minutos." },
      { title: "Leia os relatórios", text: "Selecione a Sentinela em Meus Sentinelas para ver os Relatórios de sinal, com Entrada, Alvo, Stop e Risco/retorno. Toque em Ver no gráfico para conferir." },
    ],
    tips: ["Use Varrer agora para uma varredura imediata.", "Pausar mantém a Sentinela salva sem gerar avisos; Reativar volta a vigiar.", "Crie uma Sentinela por moeda que você acompanha de perto."],
    faq: [
      { q: "Qual a diferença entre Sentinela e agente?", a: "A Sentinela vigia uma moeda em todos os padrões gráficos. O agente vigia vários ativos com as estratégias que você escolhe." },
      { q: "As opções de Telegram estão bloqueadas.", a: "Elas fazem parte do teste grátis e dos planos PRO e ELITE. Depois, conecte o Telegram em Preferências." },
    ],
    related: ["agentes-ia", "scanner", "conectar-telegram"],
  },
  {
    slug: "monitores-alertas",
    title: "Monitores e alertas",
    summary: "Seja avisado quando um setup mudar de estado, quando uma estratégia for atendida ou quando o preço chegar a um nível.",
    category: "Automação",
    icon: "activity",
    route: "/monitor",
    cta: "Abrir Monitores",
    plan: "pro",
    eliteNote: INTRADAY_ELITE,
    purpose: "Monitores rodam no servidor a cada ciclo e avisam uma única vez por acontecimento: mudança de estado do setup ou estratégia salva atendida. Os alertas da Carteira avisam por preço, RSI, padrão ou volume.",
    before: ["Teste grátis, PRO ou ELITE (a quantidade de monitores e alertas depende do plano).", "Para receber fora do app, ative as notificações push ou conecte o Telegram."],
    steps: [
      { title: "Escolha o tipo de monitor", text: "Em Novo monitor, escolha Setup ou Estratégia." },
      { title: "Defina o que vigiar", text: "Escolha Ativo, Timeframe (ou a estratégia salva), Exchange e Instrumento." },
      { title: "Escolha quando avisar", text: "No tipo Setup, marque os estados em Notificar em: e ajuste Score ≥. No tipo Estratégia, o aviso vem quando todas as condições passam a valer no fechamento de um candle." },
      { title: "Escolha os canais e crie", text: "Marque Push no navegador e/ou Telegram (o aviso no app vem sempre) e toque em Criar monitor." },
      { title: "Acompanhe os eventos", text: "Na coluna Eventos ficam os avisos recebidos; toque em Marcar como lidos para limpar os novos." },
      { title: "Crie um alerta de preço", text: "Em Carteira, aba Alertas, escolha Ativo e Tipo (Preço acima de, Preço abaixo de, RSI, Padrão ou Volume anômalo), o valor e o Canal, e toque em Criar." },
    ],
    tips: ["Na Análise completa, o botão Monitorar cria um monitor do setup em um toque.", "No Construtor de estratégias, o botão Monitorar abre esta página já com a estratégia escolhida.", "Um alerta da Carteira é desativado depois de disparar; use Reativar para ligá-lo de novo."],
    faq: [
      { q: "Qual a diferença entre monitor e alerta?", a: "O monitor acompanha o estado de um setup ou de uma estratégia. O alerta avisa quando um valor simples é atingido, como o preço ou o RSI." },
      { q: "Recebi o mesmo aviso uma vez só. É normal?", a: "Sim. Cada acontecimento notifica uma única vez, para não repetir o mesmo aviso a cada ciclo." },
    ],
    related: ["notificacoes-push", "conectar-telegram", "construtor-estrategias", "carteira"],
  },
  {
    slug: "construtor-estrategias",
    title: "Construtor de estratégias",
    summary: "Monte regras próprias com indicadores em vários timeframes, teste na hora e use no scanner, no monitor e no backtest.",
    category: "Automação",
    icon: "workflow",
    route: "/strategies",
    plan: "pro",
    eliteNote: INTRADAY_ELITE,
    purpose: "O Construtor transforma a sua forma de operar em regras: condições com indicadores, agrupadas com E/OU, mais stop e saída. A mesma estratégia serve para filtrar o Scanner de setups, criar monitores e rodar backtest.",
    before: ["Teste grátis, PRO ou ELITE (a quantidade de estratégias salvas depende do plano).", "Ele fica no grupo Avançado do menu."],
    steps: [
      { title: "Comece do zero ou de um modelo", text: "Toque em Nova, ou escolha um item em Modelos (os modelos validados mostram os números fora da amostra)." },
      { title: "Dê um nome", text: "Preencha o nome no topo e, se quiser, a Descrição (opcional)." },
      { title: "Monte as condições", text: "Em cada grupo, toque em + Condição e escolha Timeframe, Indicador, Operador e Valor. Use + Grupo para outro conjunto de regras." },
      { title: "Defina a lógica", text: "Dentro do grupo, escolha AND — todas as condições ou OR — qualquer condição; entre grupos, AND (todos) ou OR (qualquer)." },
      { title: "Defina a saída", text: "Em Saída (backtest e plano), escolha o Stop (ATR × múltiplo ou Estrutural) e a Saída (Alvo fixo (R) ou Stop móvel)." },
      { title: "Teste e salve", text: "Escolha Ativo, Exchange e Instrumento e toque em Testar agora ou em Rodar no universo (os 30 ativos). Depois, toque em Salvar." },
      { title: "Use em outras ferramentas", text: "Com a estratégia salva, os botões Backtest e Monitorar abrem essas páginas com ela já escolhida." },
    ],
    tips: ["Condições marcadas “ao vivo” (como Confluence, setup, funding e open interest) valem no scanner e no monitor, mas não no backtest.", "Quando falta um dado, a condição conta como falsa: o resultado avisa qual dado faltou."],
    faq: [
      { q: "O botão Backtest não aparece.", a: "Ele aparece depois de salvar a estratégia e só quando ela não usa condições ao vivo." },
      { q: "Onde vejo minhas estratégias?", a: "Na lista Minhas estratégias, à esquerda. Toque numa para editar." },
    ],
    related: ["backtest", "monitores-alertas", "scanner-setups"],
  },
  // ------------------------------------------------------------------ Planejamento
  {
    slug: "carteira",
    title: "Carteira: favoritos, posições e alertas",
    summary: "Acompanhe favoritos com posições simuladas, crie alertas de preço, RSI, padrão ou volume e reveja análises salvas.",
    category: "Planejamento",
    icon: "wallet",
    route: "/carteira",
    plan: "pro",
    purpose: "A Carteira guarda as moedas que você acompanha, com quantidade e preço médio opcionais para ver o resultado simulado. Também reúne seus alertas e as análises de gráfico por IA feitas no Scanner.",
    before: ["Teste grátis, PRO ou ELITE."],
    steps: [
      { title: "Adicione um ativo", text: "Na aba Favoritos e posições, em Adicionar ativo / posição simulada, escolha o Ativo e toque em Adicionar." },
      { title: "Informe a posição, se quiser", text: "Preencha Quantidade e Preço médio (USD) para ver Valor, Custo e P&L simulados. Sem eles, o ativo entra só como favorito." },
      { title: "Crie um alerta", text: "Na aba Alertas, em Novo alerta, escolha Ativo, Tipo e o valor, escolha o Canal (Painel, Telegram ou Ambos) e toque em Criar." },
      { title: "Gerencie os alertas", text: "A tabela mostra Condição, Canal e Status. Depois de disparar, o alerta é desativado; toque em Reativar para usar de novo." },
      { title: "Reveja análises salvas", text: "A aba Análises salvas guarda as análises de gráfico por IA feitas no Scanner." },
    ],
    tips: ["A estrela da Análise completa também adiciona o ativo aos favoritos.", "Posições são simulações para acompanhamento: o app não se conecta à sua corretora."],
    faq: [
      { q: "Meu alerta disparou e parou de avisar.", a: "Depois de disparar, o alerta fica com status desativado e registrado no histórico do scanner. Use Reativar." },
      { q: "O canal Telegram está bloqueado.", a: "Ele faz parte do teste grátis e dos planos PRO e ELITE; conecte o Telegram em Preferências." },
    ],
    related: ["monitores-alertas", "simulador", "analise-completa"],
  },
  {
    slug: "simulador",
    title: "Simulador de aportes",
    summary: "Veja quanto teria rendido aportar todo mês (DCA) ou de uma vez, com os preços diários reais do período.",
    category: "Planejamento",
    icon: "calculator",
    route: "/simulador",
    plan: "pro",
    purpose: "O Simulador mostra o que teria acontecido com aportes numa moeda: aportes mensais (DCA) ou aporte único, usando os fechamentos diários reais. Serve para entender o comportamento passado, não para prever o futuro.",
    before: ["Teste grátis, PRO ou ELITE (para salvar simulações é preciso estar com a conta aberta)."],
    steps: [
      { title: "Escolha o ativo", text: "Em Parâmetros, escolha o Ativo." },
      { title: "Escolha a estratégia", text: "Em Estratégia, escolha DCA — aportes mensais ou Aporte único." },
      { title: "Escolha a moeda e os valores", text: "Em Moeda, escolha Real (BRL), Dólar (USD) ou Euro (EUR) e preencha Capital inicial e Aporte mensal." },
      { title: "Escolha o período", text: "Em Período, escolha de 6 a 36 meses, terminando hoje." },
      { title: "Toque em Simular", text: "Os cartões mostram Total investido, Valor final, Resultado e Queda máxima; abaixo ficam o gráfico e a tabela Mês a mês." },
      { title: "Salve e compare", text: "Toque em Salvar simulação. Em Minhas simulações, clique numa linha para recarregar os parâmetros." },
    ],
    tips: ["Compare o mesmo ativo em DCA e em aporte único para ver o efeito de espalhar as compras.", "Olhe a Queda máxima: ela mostra o pior momento do período."],
    faq: [
      { q: "O resultado mostra quanto vou ganhar?", a: "Não. É uma simulação com preços passados; resultado passado não garante resultado futuro." },
      { q: "Não consigo salvar.", a: "Entre na sua conta para salvar e comparar simulações." },
    ],
    related: ["carteira", "backtest"],
  },
  {
    slug: "backtest",
    title: "Backtest de estratégias",
    summary: "Teste um setup do app ou uma estratégia sua no histórico, com taxas, slippage e funding, e veja a curva de capital.",
    category: "Planejamento",
    icon: "flask",
    route: "/backtest",
    plan: "pro",
    eliteNote: INTRADAY_ELITE,
    purpose: "O Backtest roda um setup do CryptoScanner ou uma estratégia salva sobre o histórico, só com candles fechados no instante de cada sinal. O resultado vem em R líquido de custos, com curva de capital, drawdown e a lista de operações.",
    before: ["Teste grátis, PRO ou ELITE.", "Para testar uma estratégia sua, salve-a antes no Construtor de estratégias."],
    steps: [
      { title: "Escolha o modo", text: "Em Modo, escolha Setup CryptoScanner ou Estratégia salva (e depois a estratégia)." },
      { title: "Escolha o mercado", text: "Selecione Timeframe, Ativo, Exchange e Instrumento." },
      { title: "Defina o período", text: "Em Dias, informe quantos dias de histórico usar (o limite aparece no campo)." },
      { title: "Ajuste os custos", text: "Preencha Taxa/lado (bps), Slippage/lado (bps), Funding/8h (%) (só no Perpétuo), Atraso (candles) e Risco/operação (%)." },
      { title: "Toque em Rodar backtest", text: "Aguarde o cálculo: as métricas aparecem no topo, como a Expectativa líquida." },
      { title: "Leia a curva e as operações", text: "O gráfico Curva de capital (composta) e drawdown mostra a evolução; a tabela Detalhe lista cada operação com entrada, stop, alvo, saída e resultado." },
    ],
    tips: ["Deixe custos realistas: backtest sem taxa costuma parecer melhor do que seria.", "Se não houver operações, aumente o período ou teste outro timeframe.", "O link Estatística de padrões leva à taxa de acerto dos padrões gráficos."],
    faq: [
      { q: "Aparece “Nenhuma operação no período com essas regras”.", a: "As regras não foram atendidas no período. Aumente os dias ou teste outro timeframe." },
      { q: "O backtest garante o resultado?", a: "Não. É um resultado histórico simulado; não é garantia nem promessa de resultado futuro." },
    ],
    related: ["construtor-estrategias", "scanner-setups", "simulador"],
  },
  // ------------------------------------------------------------------ Aprender
  {
    slug: "jornada",
    title: "Jornada Trader: aulas grátis",
    summary: "12 aulas curtas, do Bitcoin à automação com agentes, com exercícios e teste rápido. Grátis e sem cadastro.",
    category: "Aprender",
    icon: "book",
    route: "/jornada",
    cta: "Abrir a Jornada",
    plan: "livre",
    purpose: "A Jornada Trader é um curso grátis de análise técnica de criptomoedas. As aulas são curtas, ilustradas e terminam com um teste rápido; algumas têm exercício interativo.",
    before: ["Nada: a Jornada é aberta, sem cadastro.", "Com conta, o progresso fica salvo para qualquer aparelho."],
    steps: [
      { title: "Escolha por onde começar", text: "Na página da Jornada, toque em Começar (ou Continuar) ou filtre as aulas por nível: Todas, Iniciante, Intermediário e Avançado." },
      { title: "Leia as partes da aula", text: "Cada aula é dividida em partes. Avance pelos botões da aula ou pelas setas ← → do teclado." },
      { title: "Revise os Pontos-chave", text: "No fim do texto, os Pontos-chave resumem o que importa." },
      { title: "Pratique", text: "Nas aulas marcadas como interativas, a etapa Pratique tem um exercício para mexer." },
      { title: "Faça o Teste rápido", text: "Responda às perguntas do Teste rápido para concluir a aula e ver quantas acertou." },
      { title: "Acompanhe o progresso", text: "Na lista de aulas, Seu progresso mostra quantas você concluiu. Sem conta, ele fica salvo neste navegador." },
    ],
    tips: ["Faça as aulas em ordem: cada uma usa o que a anterior ensinou.", "Concluir uma aula marca um item da lista Primeiros passos na Início."],
    faq: [
      { q: "Perdi meu progresso.", a: "Sem conta, o progresso fica só neste navegador. Crie uma conta para guardar em qualquer aparelho." },
      { q: "Preciso pagar para ver as aulas?", a: "Não. A Jornada é grátis e aberta, sem cadastro." },
    ],
    related: ["primeiros-passos", "scanner", "graficos"],
  },
  // ------------------------------------------------------------------ Conta
  {
    slug: "planos-e-conta",
    title: "Planos, pagamento e conta",
    summary: "Comece o teste grátis, assine PRO ou ELITE, cancele a renovação e ajuste suas preferências.",
    category: "Conta",
    icon: "creditcard",
    route: "/planos",
    cta: "Ver planos",
    plan: "livre",
    purpose: "Aqui você entende como funcionam o teste grátis, a assinatura e o cancelamento, e onde ajustar nome, tema, moeda e timeframe padrão da sua conta.",
    before: ["Para assinar, use o mesmo e-mail da sua conta no pagamento."],
    steps: [
      { title: "Compare os planos", text: "Em Planos, veja o que cada plano inclui. O PRO tem teste grátis; o ELITE não tem teste." },
      { title: "Comece o teste grátis", text: "Sem conta, toque em Começar 3 dias grátis no PRO e crie sua conta. Não é preciso cartão." },
      { title: "Assine", text: "Com a conta aberta, toque em Assinar PRO ou Assinar ELITE. O acesso é liberado automaticamente para a conta com o e-mail usado no pagamento." },
      { title: "Cancele a renovação quando quiser", text: "Em Planos, toque em Cancelar renovação e confirme. O acesso continua até o fim do período pago." },
      { title: "Ajuste suas preferências", text: "Em Preferências, no cartão Conta e interface, mude nome, tema, moeda de exibição e timeframe padrão." },
      { title: "Fale com o suporte", text: "Em Suporte, abra um chamado e acompanhe as respostas em Meus chamados." },
    ],
    tips: ["Arrependimento em até 7 dias com reembolso integral; os detalhes estão na política de Cancelamento e reembolso.", "Se o pagamento ficar pendente, o botão Resolver pagamento leva direto ao suporte."],
    faq: [
      { q: "Paguei e o acesso não liberou.", a: "Confira se usou no pagamento o mesmo e-mail da conta. Se usou outro, abra um chamado em Suporte informando os dois e-mails." },
      { q: "Como excluo minha conta?", a: "Em Suporte, com a conta aberta, toque em Solicitar exclusão da conta, informe sua senha, digite EXCLUIR e confirme. A exclusão é definitiva." },
      { q: "Se eu cancelar, perco meus dados?", a: "Não. Sua conta, favoritos, estratégias e monitores continuam salvos; as ferramentas ficam bloqueadas até você voltar a assinar." },
    ],
    related: ["primeiros-passos", "notificacoes-push", "conectar-telegram"],
  },
];

export function getTutorial(slug: string): Tutorial | undefined {
  return TUTORIALS.find((t) => t.slug === slug);
}

export const tutorialPath = (slug: string) => `/ajuda/${slug}`;

/** Tutoriais destacados na faixa "Comece aqui" da lista. */
export const STARTER_SLUGS = ["primeiros-passos", "instalar-app", "notificacoes-push", "conectar-telegram"] as const;

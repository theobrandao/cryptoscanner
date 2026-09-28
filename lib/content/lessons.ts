/**
 * Jornada Trader — trilha educacional própria (conteúdo autoral, sem cópia de terceiros).
 * Cada aula tem texto objetivo, pontos-chave e um teste rápido de 2 questões.
 */
export type LessonLevel = "iniciante" | "intermediario" | "avancado";

export interface LessonQuestion {
  q: string;
  options: string[];
  answer: number; // índice da opção correta
  why: string;
}

export interface Lesson {
  slug: string;
  order: number;
  level: LessonLevel;
  title: string;
  minutes: number;
  summary: string;
  sections: Array<{ heading: string; body: string }>;
  keyPoints: string[];
  quiz: LessonQuestion[];
  /** rota do app onde o conteúdo é praticado */
  practice?: { href: string; label: string };
}

export const LESSONS: Lesson[] = [
  {
    slug: "o-que-e-bitcoin",
    order: 1,
    level: "iniciante",
    title: "O que é Bitcoin e como funciona a blockchain",
    minutes: 8,
    summary: "Escassez programada, rede descentralizada e por que o preço é formado em corretoras.",
    sections: [
      { heading: "Escassez e emissão", body: "O Bitcoin tem oferta máxima de 21 milhões de unidades. Novas moedas entram em circulação como recompensa aos mineradores, e essa recompensa cai pela metade a cada 210.000 blocos (aproximadamente quatro anos) — o halving. A emissão previsível é a base da tese de reserva de valor; ela não garante valorização." },
      { heading: "Blockchain", body: "Transações são agrupadas em blocos encadeados por hashes criptográficos. Alterar um bloco antigo exigiria refazer a prova de trabalho de todos os blocos seguintes, o que torna a rede resistente a fraude. Qualquer pessoa pode verificar o histórico completo em um explorador público." },
      { heading: "De onde vem o preço", body: "Não existe preço oficial. Cada corretora forma seu preço pela oferta e demanda do próprio livro de ordens; índices agregam várias corretoras. Diferenças entre corretoras (spread regional) existem e costumam ser pequenas em mercados líquidos. Neste app, os preços vêm da Binance Spot com fallback para a Kraken." },
    ],
    keyPoints: ["Oferta máxima de 21 milhões; halving a cada ~4 anos.", "Blocos encadeados por hash: histórico público e verificável.", "Preço é formado em corretoras, não por uma autoridade."],
    quiz: [
      { q: "O que acontece no halving?", options: ["O preço dobra", "A recompensa por bloco cai pela metade", "A oferta máxima aumenta"], answer: 1, why: "O halving reduz a emissão de novas moedas; o efeito no preço não é garantido." },
      { q: "Quem define o preço do Bitcoin?", options: ["Uma fundação central", "A oferta e demanda em cada corretora", "Os mineradores"], answer: 1, why: "Cada corretora forma o preço no seu livro de ordens." },
    ],
    practice: { href: "/panorama", label: "Ver o panorama do mercado" },
  },
  {
    slug: "candles-e-timeframes",
    order: 2,
    level: "iniciante",
    title: "Candles, timeframes e volume",
    minutes: 10,
    summary: "Como ler um candle, o que muda entre 15M e 1D e por que o volume valida movimentos.",
    sections: [
      { heading: "Anatomia do candle", body: "Cada candle resume um período: abertura, máxima, mínima e fechamento (OHLC). O corpo mostra a distância entre abertura e fechamento; os pavios mostram até onde o preço foi rejeitado. Corpo grande com pavio curto indica convicção; pavio longo contra a direção do corpo indica rejeição." },
      { heading: "Timeframes", body: "Quanto maior o timeframe, mais ruído é filtrado e mais lento é o sinal. 1D e 1W definem a tendência principal; 4H é o tempo operacional mais usado por swing traders; 15M–1H servem a day trade e exigem gestão de risco mais rígida. Sempre confirme o timeframe menor com o maior." },
      { heading: "Volume", body: "Volume é a quantidade negociada no período. Rompimentos com volume acima da média (≥ 2× no scanner) têm mais chance de sustentar; rompimentos sem volume tendem a falhar (armadilhas). O scanner mostra o volume relativo (volume do candle ÷ média das 20 barras anteriores)." },
    ],
    keyPoints: ["OHLC: corpo = convicção, pavio = rejeição.", "Timeframe maior manda; o menor refina a entrada.", "Volume acima da média valida rompimentos."],
    quiz: [
      { q: "Um candle com corpo pequeno e pavio superior longo indica…", options: ["Compradores no controle", "Rejeição de preços mais altos", "Ausência de negócios"], answer: 1, why: "O preço subiu e foi devolvido — vendedores rejeitaram a alta." },
      { q: "Rompimento sem volume tende a…", options: ["Sustentar-se", "Falhar", "Não ter relação com volume"], answer: 1, why: "Sem participação, o movimento carece de sustentação." },
    ],
    practice: { href: "/graficos", label: "Abrir os gráficos" },
  },
  {
    slug: "suporte-resistencia",
    order: 3,
    level: "iniciante",
    title: "Suporte, resistência e pivôs",
    minutes: 9,
    summary: "Como o app encontra níveis e o que fazer quando o preço os toca.",
    sections: [
      { heading: "Definição", body: "Suporte é uma zona onde compras historicamente interromperam quedas; resistência, onde vendas interromperam altas. São zonas, não linhas exatas. Quanto mais toques e mais volume, mais relevante o nível." },
      { heading: "Como o app calcula", body: "Os níveis vêm de pivôs fractais: um candle cuja máxima é maior que as N máximas vizinhas de cada lado é um topo; o inverso é um fundo. Pivôs próximos (dentro de uma fração do ATR) são agrupados em uma zona com contagem de toques." },
      { heading: "Uso prático", body: "Toque no suporte com tendência maior de alta é candidato a compra com stop abaixo da zona; rompimento de resistência com volume é continuação. Rompimento seguido de retorno rápido ao interior da faixa é armadilha (bull/bear trap), padrão que o scanner também detecta." },
    ],
    keyPoints: ["Níveis são zonas com toques e volume.", "Pivôs fractais + agrupamento por ATR.", "Rompimento falso = armadilha; o scanner sinaliza."],
    quiz: [
      { q: "O que torna um nível mais relevante?", options: ["Ser uma linha exata", "Mais toques e mais volume", "Estar longe do preço"], answer: 1, why: "Relevância cresce com confirmações anteriores." },
      { q: "Preço rompe a resistência e volta rápido para baixo dela. Isso é…", options: ["Continuação", "Bull trap", "Suporte novo"], answer: 1, why: "Rompimento não sustentado prende compradores." },
    ],
    practice: { href: "/scanner", label: "Ver toques em S/R no scanner" },
  },
  {
    slug: "medias-moveis",
    order: 4,
    level: "iniciante",
    title: "Médias móveis: EMA 8/25/100/200",
    minutes: 8,
    summary: "Hierarquia de EMAs, pullbacks à média e o filtro de tendência usado pelos agentes.",
    sections: [
      { heading: "EMA vs. SMA", body: "A média exponencial (EMA) dá mais peso aos candles recentes e reage mais rápido que a simples (SMA). O app usa EMA 8, 25, 100 e 200 — as duas curtas para momentum, as duas longas para tendência." },
      { heading: "Hierarquia", body: "Tendência de alta saudável: preço > EMA 8 > EMA 25 > EMA 100 > EMA 200, todas inclinadas para cima. Quando as curtas cruzam abaixo das longas, o momentum virou; quando o preço está abaixo da EMA 200 diária, o viés estrutural é de baixa." },
      { heading: "Pullback à EMA 100", body: "Em tendência definida, o retorno do preço até a EMA 100 (com StochRSI em zona extrema) é uma zona clássica de entrada a favor da tendência. A estratégia “Média de 100 + StochRSI” dos agentes automatiza exatamente essa leitura." },
    ],
    keyPoints: ["EMA reage mais rápido que SMA.", "Empilhamento 8 > 25 > 100 > 200 = tendência limpa.", "Pullback à EMA 100 + StochRSI extremo = entrada a favor."],
    quiz: [
      { q: "Preço abaixo da EMA 200 diária indica…", options: ["Viés estrutural de baixa", "Sobrecompra", "Tendência de alta"], answer: 0, why: "A EMA 200 diária é a referência de tendência de longo prazo." },
      { q: "Qual média reage mais rápido?", options: ["SMA 20", "EMA 20", "As duas igualmente"], answer: 1, why: "A EMA pondera mais os candles recentes." },
    ],
    practice: { href: "/agentes", label: "Criar um agente EMA 100 + StochRSI" },
  },
  {
    slug: "rsi-stochrsi-macd",
    order: 5,
    level: "intermediario",
    title: "RSI, StochRSI e MACD sem mitos",
    minutes: 11,
    summary: "O que cada oscilador mede, zonas extremas e por que sobrecompra não é sinal de venda.",
    sections: [
      { heading: "RSI (14)", body: "Mede a força relativa das altas contra as baixas nos últimos 14 candles, de 0 a 100. Acima de 70 é sobrecompra, abaixo de 30 sobrevenda — mas em tendência forte o RSI fica “sobrecomprado” por semanas. Use o RSI a favor da tendência: em alta, compre quando ele volta a 40–50; em baixa, venda quando volta a 50–60." },
      { heading: "StochRSI", body: "É o estocástico aplicado ao RSI: mais rápido e mais extremo. Zonas < 10/20 e > 80/90 marcam pullbacks e topos de curto prazo. Combinado com a tendência (LTA/LTB) forma o que o app chama de “Padrão Ouro”: extremo do StochRSI a favor da tendência maior." },
      { heading: "MACD", body: "Diferença entre EMA 12 e EMA 26, com linha de sinal (EMA 9) e histograma. Histograma cruzando o zero mostra mudança de momentum; divergência entre preço (novo topo) e MACD (topo menor) antecipa exaustão. É lento em lateralização — use com S/R." },
    ],
    keyPoints: ["RSI extremo em tendência forte não é sinal de reversão.", "StochRSI extremo a favor da tendência = pullback.", "MACD: histograma para momentum, divergência para exaustão."],
    quiz: [
      { q: "RSI em 78 numa tendência de alta forte significa…", options: ["Venda imediata", "Força; aguarde pullback para comprar", "Erro do indicador"], answer: 1, why: "Em tendência forte, sobrecompra persiste; opere a favor." },
      { q: "Preço faz novo topo e o MACD faz topo menor. Isso é…", options: ["Divergência (exaustão)", "Confirmação", "Cruzamento"], answer: 0, why: "Divergência baixista antecipa perda de momentum." },
    ],
    practice: { href: "/graficos", label: "Ligar StochRSI e MACD no gráfico" },
  },
  {
    slug: "padroes-graficos",
    order: 6,
    level: "intermediario",
    title: "Os 17 padrões do scanner e como são detectados",
    minutes: 14,
    summary: "Reversão, continuação e armadilhas; o que a “confiança” mede e o que não mede.",
    sections: [
      { heading: "Reversão", body: "Fundo/Topo duplo, Cabeça & Ombros (e invertido), Cunha de baixa (viés de alta) e Cunha de alta (viés de baixa). Exigem uma tendência prévia para reverter e confirmação pelo rompimento da linha de pescoço ou da linha da cunha." },
      { heading: "Continuação", body: "Bandeiras de alta/baixa (mastro + consolidação curta), Triângulos ascendente/descendente (compressão contra um nível), Pivôs HH+HL / LH+LL (estrutura de mercado). Alvo padrão = movimento medido (altura do mastro ou da figura) projetado do ponto de rompimento." },
      { heading: "Armadilhas e níveis", body: "Bull trap e Bear trap são rompimentos falsos dos extremos de 50 candles; Toque no suporte/resistência e Consolidação lateral descrevem o contexto. O scanner atribui confiança pela aderência geométrica (proporções, simetria, recência) — não é probabilidade de acerto. Altcoins contra a tendência do BTC recebem rebaixamento explícito." },
    ],
    keyPoints: ["Reversão exige tendência prévia e confirmação.", "Alvo = movimento medido a partir do rompimento.", "Confiança = geometria, não probabilidade."],
    quiz: [
      { q: "O que a confiança do scanner mede?", options: ["Probabilidade de lucro", "Aderência geométrica do padrão", "Volume"], answer: 1, why: "É uma nota de forma/recência; a decisão continua sua." },
      { q: "Cunha de alta (topos e fundos ascendentes convergentes) tem viés…", options: ["De alta", "De baixa", "Neutro"], answer: 1, why: "A compressão ascendente costuma resolver-se para baixo." },
    ],
    practice: { href: "/scanner", label: "Escanear agora" },
  },
  {
    slug: "fibonacci",
    order: 7,
    level: "intermediario",
    title: "Fibonacci: retrações e extensões na prática",
    minutes: 8,
    summary: "Como traçar, os níveis 0,5/0,618 e a confluência com S/R e EMAs.",
    sections: [
      { heading: "Traçado", body: "Em tendência de alta, trace do fundo ao topo do impulso: as retrações (0,382 · 0,5 · 0,618 · 0,786) marcam zonas de pullback. Em baixa, do topo ao fundo. O app encontra automaticamente o impulso mais recente ou aceita níveis manuais." },
      { heading: "Zona de ouro", body: "0,5–0,618 é a zona mais observada; quando coincide com um suporte por pivôs ou com a EMA 100, a confluência aumenta a relevância. Extensões (1,272 · 1,618) servem de alvos após a retomada." },
      { heading: "Limites", body: "Fibonacci não prevê: organiza expectativas. Sem confluência e sem reação de preço (candle de rejeição, volume), um nível é só uma linha." },
    ],
    keyPoints: ["Trace o impulso mais recente.", "0,5–0,618 com S/R ou EMA = confluência.", "Extensões 1,272/1,618 como alvos."],
    quiz: [
      { q: "Em tendência de alta, a retração é traçada…", options: ["Do topo ao fundo", "Do fundo ao topo", "Da abertura ao fechamento"], answer: 1, why: "Você mede quanto do impulso de alta foi devolvido." },
      { q: "Qual extensão é alvo clássico?", options: ["0,382", "1,618", "0,786"], answer: 1, why: "1,618 é a extensão mais usada como alvo." },
    ],
    practice: { href: "/fibonacci", label: "Analisar Fibonacci" },
  },
  {
    slug: "gestao-de-risco",
    order: 8,
    level: "intermediario",
    title: "Gestão de risco: stop, tamanho de posição e R:R",
    minutes: 12,
    summary: "A única parte do trading sob seu controle total: quanto perder por operação.",
    sections: [
      { heading: "Risco por operação", body: "Defina antes de entrar quanto do capital pode perder se o stop for acionado — 0,5% a 2% é a faixa usual. Tamanho da posição = risco em dinheiro ÷ distância até o stop. Com stop a 3% do preço e risco de 1% do capital, a posição é 1/3 do capital." },
      { heading: "Relação risco/retorno", body: "R:R = potencial até o alvo ÷ risco até o stop. Com R:R 2:1 você pode errar 60% das vezes e ainda ter resultado positivo. O Sentinela e os cartões do scanner calculam R:R a partir de entrada, alvo e stop." },
      { heading: "Stop técnico, não emocional", body: "O stop fica onde a tese deixa de valer: abaixo do fundo do padrão, da zona de suporte ou de 0,5 ATR. Mover o stop contra a posição é a forma mais comum de transformar uma perda pequena em uma grande." },
    ],
    keyPoints: ["Risco fixo por operação (0,5–2%).", "Posição = risco ÷ distância do stop.", "R:R ≥ 2 tolera taxa de acerto baixa."],
    quiz: [
      { q: "Capital R$ 10.000, risco 1%, stop a 5% do preço. Tamanho da posição?", options: ["R$ 500", "R$ 2.000", "R$ 5.000"], answer: 1, why: "R$ 100 de risco ÷ 5% = R$ 2.000." },
      { q: "Com R:R 2:1, qual taxa de acerto mínima empata?", options: ["~33%", "50%", "66%"], answer: 0, why: "1 acerto paga 2 erros." },
    ],
    practice: { href: "/sentinela", label: "Ver planos de trade do Sentinela" },
  },
  {
    slug: "sentimento-e-derivativos",
    order: 9,
    level: "avancado",
    title: "Sentimento e derivativos: F&G, funding, open interest",
    minutes: 12,
    summary: "Como ler o posicionamento do mercado e evitar operar junto com a multidão no extremo.",
    sections: [
      { heading: "Medo & Ganância", body: "Índice 0–100 composto por volatilidade, volume, redes sociais, dominância e tendências de busca. Extremos (< 25 ou > 75) são leituras contrárias: ganância extrema precede correções com frequência; medo extremo, fundos. No meio, o índice tem pouco valor operacional." },
      { heading: "Funding rate", body: "Taxa paga entre comprados e vendidos nos perpétuos a cada 8 h. Funding muito positivo (> 0,03%) significa comprados pagando caro para manter posição — mercado lotado do lado comprado, vulnerável a liquidações em cascata. Negativo indica o oposto." },
      { heading: "Open interest e long/short", body: "OI subindo com preço subindo = dinheiro novo sustentando a alta; OI subindo com preço caindo = shorts se acumulando. Proporção de contas long/short acima de ~1,8 sinaliza consenso comprado. Agressão taker (compra/venda) mostra quem está atravessando o livro agora." },
    ],
    keyPoints: ["F&G só tem valor nos extremos (leitura contrária).", "Funding alto = lado comprado lotado.", "OI + preço juntos = movimento sustentado."],
    quiz: [
      { q: "Funding de +0,08% indica…", options: ["Vendidos lotados", "Comprados pagando caro (lotado)", "Mercado neutro"], answer: 1, why: "Comprados pagam vendidos; taxa alta = excesso de longs." },
      { q: "F&G em 85 costuma ser lido como…", options: ["Sinal de compra", "Ganância extrema, risco de correção", "Sem significado"], answer: 1, why: "Extremos são leituras contrárias." },
    ],
    practice: { href: "/panorama", label: "Ver derivativos no Panorama" },
  },
  {
    slug: "agentes-e-automacao",
    order: 10,
    level: "avancado",
    title: "Agentes, Sentinela e alertas: automatizando a vigilância",
    minutes: 10,
    summary: "O que os agentes fazem (e não fazem), cooldown, confluência e como montar uma rotina.",
    sections: [
      { heading: "O que é um agente aqui", body: "Um agente é um conjunto de estratégias determinísticas avaliado pelo servidor a cada 5 minutos sobre os ativos e o timeframe escolhidos. Quando uma estratégia dispara acima da confiança mínima, gera um sinal no log e, opcionalmente, no Telegram. Ele não executa ordens." },
      { heading: "Sentinela", body: "Um vigia por moeda que avalia todos os padrões ao mesmo tempo, monta o plano de trade (entrada, alvo, stop, R:R) e mede a confluência com EMAs, RSI, StochRSI, MACD e tendência superior. Use confiança mínima 70 para menos ruído e 60 para não perder formações iniciais." },
      { heading: "Rotina sugerida", body: "1) Panorama: viés do dia e derivativos. 2) Scanner 4H/1D: padrões com status “Confirmado”. 3) Gráfico: confluência com S/R e Fibonacci. 4) Definir risco e R:R antes de agir. 5) Deixar Sentinela/alertas vigiando o resto." },
    ],
    keyPoints: ["Agentes vigiam e alertam; não operam.", "Cooldown de 30 min evita repetição de alertas.", "Rotina: Panorama → Scanner → Gráfico → Risco → Automação."],
    quiz: [
      { q: "O agente executa ordens na corretora?", options: ["Sim", "Não, só alerta", "Só no plano PLATINUM"], answer: 1, why: "A execução é sempre decisão sua." },
      { q: "Para reduzir ruído no Sentinela você…", options: ["Baixa a confiança mínima", "Sobe a confiança mínima", "Troca o timeframe para 15M"], answer: 1, why: "Confiança mais alta filtra formações fracas." },
    ],
    practice: { href: "/sentinela", label: "Criar um Sentinela" },
  },
  {
    slug: "psicologia",
    order: 11,
    level: "avancado",
    title: "Psicologia: stop tomado, FOMO e euforia",
    minutes: 9,
    summary: "Protocolos objetivos para os quatro estados que mais destroem contas.",
    sections: [
      { heading: "Tomei stop (revenge trading)", body: "Protocolo: registrar a operação (tese, entrada, stop, resultado), fechar a plataforma por 30 minutos, só voltar com um novo setup que atenda ao checklist. Nunca dobrar o tamanho para “recuperar”." },
      { heading: "FOMO (subindo forte)", body: "Se o ativo já subiu mais de 1 ATR desde o rompimento, a relação risco/retorno da entrada tardia é ruim. Aguarde o pullback à EMA 8/25 ou ao nível rompido; se não vier, a operação não era sua." },
      { heading: "Euforia pós-ganho e medo de clicar", body: "Após ganho grande, reduza o tamanho da próxima operação pela metade — a euforia aumenta risco sem aumentar a qualidade do sinal. No medo de clicar, volte ao plano: se entrada, stop e tamanho estão definidos, a execução é mecânica; se não estão, o medo está correto." },
    ],
    keyPoints: ["Stop tomado: registrar, pausar 30 min, novo setup.", "FOMO: entrada tardia tem R:R ruim; espere o pullback.", "Euforia: reduzir tamanho; medo: checar o plano."],
    quiz: [
      { q: "Após um stop, a atitude correta é…", options: ["Dobrar a posição na próxima", "Registrar e pausar", "Trocar de ativo imediatamente"], answer: 1, why: "Revenge trading é a maior fonte de perdas em sequência." },
      { q: "Ativo subiu 3 ATR sem pullback. A entrada agora tem…", options: ["R:R ótimo", "R:R ruim", "Risco zero"], answer: 1, why: "Stop longe, alvo perto: relação desfavorável." },
    ],
    practice: { href: "/mentor", label: "Abrir o Mentor (SOS mindset)" },
  },
  {
    slug: "simulacao-e-dca",
    order: 12,
    level: "avancado",
    title: "DCA, aporte único e leitura de backtests",
    minutes: 9,
    summary: "Quando o DCA vence o aporte único, o que a queda máxima diz e as armadilhas do backtest.",
    sections: [
      { heading: "DCA vs. aporte único", body: "Aporte único vence em mercados que só sobem; DCA reduz a variância e o arrependimento em mercados voláteis, pagando um preço médio. O simulador do app usa preços diários reais (e câmbio USDTBRL diário em BRL) para comparar as duas abordagens no período escolhido." },
      { heading: "Queda máxima (drawdown)", body: "É a maior perda do pico ao vale ao longo do período. Um retorno de +40% com queda máxima de −60% no meio exige tolerância que a maioria não tem. Escolha o perfil (fração no ativo) pela queda máxima que você aguenta, não pelo retorno." },
      { heading: "Armadilhas", body: "Backtest ignora taxas, spread, impostos e rendimento da reserva; depende da janela (começar no topo ou no fundo muda tudo). Compare vários períodos e nunca trate o resultado passado como projeção." },
    ],
    keyPoints: ["DCA reduz variância; aporte único maximiza em alta contínua.", "Escolha o perfil pela queda máxima tolerável.", "Backtest não é projeção."],
    quiz: [
      { q: "Queda máxima de −60% significa…", options: ["Perda final de 60%", "Maior perda do pico ao vale no período", "Volatilidade diária"], answer: 1, why: "É uma medida de caminho, não de resultado final." },
      { q: "O simulador considera taxas e impostos?", options: ["Sim", "Não — declarado no aviso", "Só em BRL"], answer: 1, why: "Resultados são brutos, sem custos." },
    ],
    practice: { href: "/simulador", label: "Simular DCA" },
  },
];

export const LEVEL_LABEL: Record<LessonLevel, string> = { iniciante: "Iniciante", intermediario: "Intermediário", avancado: "Avançado" };

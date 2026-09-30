/**
 * Glossário de análise técnica e cripto (/glossario): fonte única das definições usadas na página, no JSON-LD
 * DefinedTermSet, no llms-full.txt e nos atalhos "Termos desta aula" (Jornada) e "Termos usados" (tutoriais).
 * Texto autoral, educativo, 2 a 3 frases por termo, sem promessa de resultado. Quando cita o app, descreve só o que ele faz.
 * `lessons` = slugs de lib/content/lessons.ts; `tutorials` = slugs de lib/content/tutorials.ts (conferidos em teste).
 */
export interface GlossaryTerm {
  /** âncora em /glossario#id (minúsculas, hífen) */
  id: string;
  term: string;
  definition: string;
  lessons: string[];
  tutorials: string[];
}

const TERMS: GlossaryTerm[] = [
  {
    id: "alvo",
    term: "Alvo (take profit)",
    definition: "Preço em que você planeja realizar o lucro de uma operação. Em padrões gráficos, o alvo costuma ser o movimento medido: a altura da figura projetada a partir do ponto de rompimento. O scanner e a Sentinela mostram o alvo calculado junto com a entrada e o stop.",
    lessons: ["padroes-graficos", "gestao-de-risco"],
    tutorials: ["scanner", "sentinela"],
  },
  {
    id: "atr",
    term: "ATR (amplitude média verdadeira)",
    definition: "Média da amplitude dos candles em um número de períodos, contando também os saltos entre um fechamento e a abertura seguinte. Mede volatilidade, não direção. O app usa o ATR para agrupar pivôs em zonas e para posicionar stops, como o stop inicial de 2 ATR do modelo de rompimento no 4H.",
    lessons: ["suporte-resistencia", "gestao-de-risco", "psicologia"],
    tutorials: ["scanner-setups"],
  },
  {
    id: "backtest",
    term: "Backtest",
    definition: "Simulação de uma regra de operação sobre dados históricos para ver como ela teria se comportado. O resultado depende da janela escolhida e dos custos considerados; sem taxas e slippage, tende a parecer melhor do que seria. Resultado de backtest não é projeção.",
    lessons: ["simulacao-e-dca"],
    tutorials: ["backtest", "construtor-estrategias"],
  },
  {
    id: "blockchain",
    term: "Blockchain",
    definition: "Registro público de transações agrupadas em blocos, cada um ligado ao anterior por um hash criptográfico. Alterar um bloco antigo exigiria refazer todos os blocos seguintes, o que torna o histórico resistente a fraude. Qualquer pessoa pode conferir as transações em um explorador público.",
    lessons: ["o-que-e-bitcoin"],
    tutorials: [],
  },
  {
    id: "bos",
    term: "BOS (quebra de estrutura)",
    definition: "Do inglês break of structure: o preço fecha além do último topo relevante numa alta, ou do último fundo relevante numa baixa, confirmando a continuação da tendência. É uma leitura de estrutura de mercado, não um sinal isolado de entrada. A Análise completa marca o BOS no gráfico.",
    lessons: ["padroes-graficos"],
    tutorials: ["analise-completa"],
  },
  {
    id: "bull-trap-bear-trap",
    term: "Bull trap e bear trap (armadilhas)",
    definition: "Rompimento falso: o preço fecha além de uma resistência (bull trap) ou de um suporte (bear trap) e volta logo para dentro da faixa, prendendo quem entrou no rompimento. No scanner, as armadilhas são rompimentos falsos dos extremos dos últimos 50 candles.",
    lessons: ["suporte-resistencia", "padroes-graficos"],
    tutorials: ["scanner"],
  },
  {
    id: "candle",
    term: "Candle (vela)",
    definition: "Representação do preço em um período com quatro valores: abertura, máxima, mínima e fechamento (OHLC). O corpo mostra a distância entre abertura e fechamento; os pavios mostram até onde o preço foi e voltou. Corpo grande indica convicção; pavio longo contra o corpo indica rejeição.",
    lessons: ["candles-e-timeframes"],
    tutorials: ["graficos"],
  },
  {
    id: "choch",
    term: "CHoCH (mudança de caráter)",
    definition: "Do inglês change of character: a primeira quebra de estrutura contra a tendência vigente, como perder o último fundo ascendente de uma alta. Indica que a tendência pode estar mudando, mas não confirma a reversão sozinha. A Análise completa marca o CHoCH junto com o BOS.",
    lessons: ["padroes-graficos"],
    tutorials: ["analise-completa"],
  },
  {
    id: "confluence-score",
    term: "Confluence Score",
    definition: "Nota de 0 a 100 do CryptoScanner que soma a evidência técnica a favor de um setup (estrutura, liquidez, tendência maior, volume, momento, derivativos, histórico e risco) e desconta penalidades. Mede a qualidade da confluência técnica, não a probabilidade de acerto. A conta aparece aberta na Análise completa.",
    lessons: ["agentes-e-automacao"],
    tutorials: ["analise-completa", "scanner-setups"],
  },
  {
    id: "contrato-perpetuo",
    term: "Contrato perpétuo",
    definition: "Contrato de derivativo sem data de vencimento, negociado em corretoras como Binance, Bybit e OKX. O preço fica próximo do mercado à vista por causa do funding pago entre comprados e vendidos. Permite alavancagem, que amplia ganhos e perdas.",
    lessons: ["sentimento-e-derivativos"],
    tutorials: ["analise-completa"],
  },
  {
    id: "dca",
    term: "DCA (aportes periódicos)",
    definition: "Do inglês dollar-cost averaging: investir o mesmo valor em intervalos regulares, independentemente do preço. Reduz a variância e o arrependimento em mercados voláteis, mas em mercados que só sobem costuma render menos que um aporte único. O Simulador compara as duas formas com preços diários reais.",
    lessons: ["simulacao-e-dca"],
    tutorials: ["simulador"],
  },
  {
    id: "drawdown",
    term: "Drawdown (queda máxima)",
    definition: "Maior perda do pico ao vale ao longo de um período, em porcentagem. É uma medida do caminho, não do resultado final: um período pode terminar positivo e ter passado por uma queda grande no meio. Escolher o risco pela queda que você tolera é mais seguro do que escolher pelo retorno.",
    lessons: ["simulacao-e-dca"],
    tutorials: ["backtest", "simulador"],
  },
  {
    id: "ema",
    term: "EMA (média móvel exponencial)",
    definition: "Média do preço que dá mais peso aos candles recentes e por isso reage mais rápido que a média simples (SMA). O app usa as EMAs de 8, 25, 100 e 200 períodos: as curtas para momentum, as longas para tendência. Preço abaixo da EMA 200 diária indica viés estrutural de baixa.",
    lessons: ["medias-moveis"],
    tutorials: ["graficos", "agentes-ia"],
  },
  {
    id: "expectativa",
    term: "Expectativa por operação",
    definition: "Resultado médio esperado por operação, em R ou em dinheiro: taxa de acerto vezes ganho médio, menos taxa de erro vezes perda média. Uma expectativa positiva depois dos custos indica vantagem no histórico testado, não garantia futura. O Backtest mostra a Expectativa líquida.",
    lessons: ["gestao-de-risco", "simulacao-e-dca"],
    tutorials: ["backtest"],
  },
  {
    id: "extensao-fibonacci",
    term: "Extensão de Fibonacci",
    definition: "Níveis projetados além do impulso original, como 1,272 e 1,618, usados como alvos depois que a tendência retoma. Funcionam como referência para organizar expectativas, não como previsão.",
    lessons: ["fibonacci"],
    tutorials: ["fibonacci"],
  },
  {
    id: "fator-de-lucro",
    term: "Fator de lucro",
    definition: "Soma dos ganhos dividida pela soma das perdas em um conjunto de operações. Acima de 1, os ganhos superaram as perdas no período medido. É um número histórico e deve ser lido junto com a quantidade de operações e o drawdown.",
    lessons: ["simulacao-e-dca"],
    tutorials: ["backtest"],
  },
  {
    id: "fibonacci",
    term: "Fibonacci",
    definition: "Ferramenta que divide um impulso de preço em proporções (0,382, 0,5, 0,618, 0,786) para marcar zonas prováveis de pullback. Em alta, traça-se do fundo ao topo; em baixa, do topo ao fundo. Ganha relevância quando coincide com suporte, resistência ou médias.",
    lessons: ["fibonacci"],
    tutorials: ["fibonacci"],
  },
  {
    id: "fora-da-amostra",
    term: "Teste fora da amostra",
    definition: "Forma de validar uma regra: ela é escolhida com dados de um período e medida em outro período, que não foi usado na escolha. Reduz o risco de a regra só funcionar no passado em que foi ajustada. O modelo de rompimento do CryptoScanner só é oferecido porque passou nesse teste, com as ressalvas publicadas.",
    lessons: ["simulacao-e-dca"],
    tutorials: ["inicio", "backtest"],
  },
  {
    id: "funding",
    term: "Funding rate",
    definition: "Taxa trocada periodicamente entre comprados e vendidos nos contratos perpétuos, em geral a cada 8 horas. Funding muito positivo indica comprados pagando caro para manter posição, um mercado lotado desse lado; negativo indica o oposto.",
    lessons: ["sentimento-e-derivativos"],
    tutorials: ["panorama", "analise-completa"],
  },
  {
    id: "halving",
    term: "Halving",
    definition: "Evento em que a recompensa por bloco do Bitcoin cai pela metade, a cada 210.000 blocos (aproximadamente quatro anos). Reduz a emissão de novas moedas até o limite de 21 milhões. O efeito no preço não é garantido.",
    lessons: ["o-que-e-bitcoin"],
    tutorials: [],
  },
  {
    id: "liquidez",
    term: "Liquidez",
    definition: "Na leitura de estrutura, são regiões onde se acumulam ordens, como acima de topos iguais e abaixo de fundos iguais, onde ficam muitos stops. O preço pode buscar essas regiões antes de definir a direção. A Análise completa mostra a liquidez de cada ativo.",
    lessons: ["suporte-resistencia"],
    tutorials: ["analise-completa"],
  },
  {
    id: "macd",
    term: "MACD",
    definition: "Diferença entre as médias exponenciais de 12 e 26 períodos, com uma linha de sinal (EMA 9) e um histograma. O histograma cruzando o zero mostra mudança de momentum; divergência entre preço e MACD pode antecipar exaustão. É lento em mercado lateral.",
    lessons: ["rsi-stochrsi-macd"],
    tutorials: ["graficos"],
  },
  {
    id: "medo-e-ganancia",
    term: "Medo & Ganância",
    definition: "Índice de 0 a 100 que resume o sentimento do mercado cripto a partir de volatilidade, volume, redes sociais, dominância e buscas. Os extremos, abaixo de 25 ou acima de 75, costumam ser lidos de forma contrária; no meio, o índice tem pouco valor operacional. O Panorama mostra o índice e os últimos dias.",
    lessons: ["sentimento-e-derivativos"],
    tutorials: ["panorama"],
  },
  {
    id: "open-interest",
    term: "Open interest",
    definition: "Total de contratos de derivativos em aberto em um momento. Open interest subindo junto com o preço indica dinheiro novo sustentando a alta; subindo com o preço caindo indica posições vendidas se acumulando.",
    lessons: ["sentimento-e-derivativos"],
    tutorials: ["panorama", "analise-completa"],
  },
  {
    id: "padrao-grafico",
    term: "Padrão gráfico",
    definition: "Formação recorrente no gráfico, como topo duplo, bandeira ou triângulo, que sugere continuação ou reversão do movimento. Padrões de reversão exigem uma tendência prévia e confirmação por rompimento. O scanner do CryptoScanner detecta 17 padrões e dá uma nota de aderência geométrica, que não é probabilidade de acerto.",
    lessons: ["padroes-graficos"],
    tutorials: ["scanner"],
  },
  {
    id: "pivo",
    term: "Pivô (fractal)",
    definition: "Candle cuja máxima é maior que as máximas vizinhas de cada lado (topo) ou cuja mínima é menor que as mínimas vizinhas (fundo). Pivôs próximos formam zonas de suporte e resistência. A sequência de pivôs (topos e fundos mais altos ou mais baixos) descreve a estrutura da tendência.",
    lessons: ["suporte-resistencia", "padroes-graficos"],
    tutorials: ["graficos"],
  },
  {
    id: "pullback",
    term: "Pullback",
    definition: "Recuo temporário do preço dentro de uma tendência, em direção a uma média, a um nível rompido ou a uma zona de Fibonacci. Em tendência definida, é o ponto em que muitos traders procuram entrada a favor do movimento principal.",
    lessons: ["medias-moveis", "rsi-stochrsi-macd", "fibonacci"],
    tutorials: ["agentes-ia"],
  },
  {
    id: "r-multiplo",
    term: "R (múltiplo de risco)",
    definition: "Unidade que expressa o resultado de uma operação em relação ao valor arriscado até o stop. Ganhar 2R significa ganhar duas vezes o que se arriscou; perder 1R significa perder o valor planejado. Permite comparar operações de tamanhos diferentes.",
    lessons: ["gestao-de-risco"],
    tutorials: ["backtest"],
  },
  {
    id: "resistencia",
    term: "Resistência",
    definition: "Zona de preço onde vendas interromperam altas anteriores. É uma faixa, não uma linha exata, e ganha relevância com mais toques e mais volume. Rompida com volume, pode indicar continuação da alta.",
    lessons: ["suporte-resistencia"],
    tutorials: ["graficos", "scanner"],
  },
  {
    id: "retracao-fibonacci",
    term: "Retração de Fibonacci",
    definition: "Níveis de 0,382, 0,5, 0,618 e 0,786 do último impulso, onde o preço pode fazer pullback antes de retomar a tendência. A faixa de 0,5 a 0,618 é a mais observada. Sem reação de preço, um nível é só uma linha.",
    lessons: ["fibonacci"],
    tutorials: ["fibonacci"],
  },
  {
    id: "risco-retorno",
    term: "Relação risco:retorno (R:R)",
    definition: "Potencial até o alvo dividido pelo risco até o stop. Com R:R de 2:1, a taxa de acerto de empate fica perto de 33%, sem contar custos. O scanner e a Sentinela calculam o R:R a partir de entrada, alvo e stop.",
    lessons: ["gestao-de-risco", "psicologia"],
    tutorials: ["scanner-setups", "sentinela"],
  },
  {
    id: "rompimento",
    term: "Rompimento",
    definition: "Fechamento do preço além de um nível relevante, como uma resistência ou a máxima de um período. Rompimentos com volume acima da média têm mais sustentação; sem volume, tendem a falhar. O modelo de sinais do app usa o rompimento da máxima de 55 candles acima da EMA 200.",
    lessons: ["candles-e-timeframes", "suporte-resistencia"],
    tutorials: ["inicio", "scanner"],
  },
  {
    id: "rsi",
    term: "RSI (Índice de Força Relativa)",
    definition: "Oscilador de 0 a 100 que compara a força das altas com a das baixas, em geral nos últimos 14 candles. Acima de 70 é sobrecompra e abaixo de 30 é sobrevenda, mas em tendência forte o indicador pode ficar nesses extremos por muito tempo. Sobrecompra não é, por si só, sinal de venda.",
    lessons: ["rsi-stochrsi-macd"],
    tutorials: ["graficos"],
  },
  {
    id: "slippage",
    term: "Slippage",
    definition: "Diferença entre o preço esperado de uma ordem e o preço em que ela é executada, comum em movimentos rápidos ou ativos com pouca liquidez. No Backtest você informa o slippage por lado, em pontos-base (bps), para o resultado ficar mais próximo do real.",
    lessons: ["simulacao-e-dca"],
    tutorials: ["backtest"],
  },
  {
    id: "stochrsi",
    term: "StochRSI",
    definition: "Estocástico aplicado ao RSI: mais rápido e mais extremo que o RSI. Zonas abaixo de 20 e acima de 80 marcam pullbacks e topos de curto prazo. Usado a favor da tendência maior, ajuda a encontrar entradas em correções.",
    lessons: ["rsi-stochrsi-macd", "medias-moveis"],
    tutorials: ["graficos", "agentes-ia"],
  },
  {
    id: "stop",
    term: "Stop (stop loss)",
    definition: "Preço em que você encerra a operação para limitar a perda. Fica onde a tese deixa de valer, como abaixo do fundo do padrão ou da zona de suporte. Mover o stop contra a posição é a forma mais comum de transformar uma perda pequena em uma grande.",
    lessons: ["gestao-de-risco", "psicologia"],
    tutorials: ["scanner", "sentinela"],
  },
  {
    id: "suporte",
    term: "Suporte",
    definition: "Zona de preço onde compras interromperam quedas anteriores. É uma faixa, não uma linha exata, e fica mais relevante com mais toques e volume. Um toque no suporte com a tendência maior de alta é um contexto clássico de compra com stop abaixo da zona.",
    lessons: ["suporte-resistencia"],
    tutorials: ["graficos", "scanner"],
  },
  {
    id: "tamanho-de-posicao",
    term: "Tamanho de posição",
    definition: "Quanto comprar em uma operação, calculado pelo risco: valor que você aceita perder dividido pela distância até o stop. Com capital de R$ 10.000, risco de 1% e stop a 5% do preço, a posição é de R$ 2.000. A ferramenta Gestão de risco faz esse cálculo.",
    lessons: ["gestao-de-risco"],
    tutorials: ["analise-completa"],
  },
  {
    id: "timeframe",
    term: "Timeframe (tempo gráfico)",
    definition: "Período que cada candle representa, como 15 minutos, 4 horas (4H) ou 1 dia (1D). Tempos maiores filtram ruído e definem a tendência principal; tempos menores refinam a entrada. No CryptoScanner, 4H, 1D e 1W estão no PRO; 1H, 30M e 15M são do ELITE.",
    lessons: ["candles-e-timeframes"],
    tutorials: ["scanner", "graficos"],
  },
  {
    id: "volume",
    term: "Volume",
    definition: "Quantidade negociada em um período. Rompimentos com volume acima da média têm mais chance de se sustentar. O scanner mostra o volume relativo: o volume do candle dividido pela média das 20 barras anteriores.",
    lessons: ["candles-e-timeframes"],
    tutorials: ["scanner"],
  },
];

/** Termos em ordem alfabética (pt-BR), como aparecem na página. */
export const GLOSSARY: GlossaryTerm[] = [...TERMS].sort((a, b) => a.term.localeCompare(b.term, "pt-BR", { sensitivity: "base" }));

export const glossaryPath = (id: string) => `/glossario#${id}`;

/** Letra inicial para o índice alfabético (sem acento). */
export function glossaryLetter(t: GlossaryTerm): string {
  return t.term.normalize("NFD").replace(/[̀-ͯ]/g, "").charAt(0).toUpperCase();
}

export function termsForLesson(slug: string): GlossaryTerm[] {
  return GLOSSARY.filter((t) => t.lessons.includes(slug));
}

export function termsForTutorial(slug: string): GlossaryTerm[] {
  return GLOSSARY.filter((t) => t.tutorials.includes(slug));
}

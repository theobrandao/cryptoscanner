/**
 * Perguntas frequentes das páginas públicas: fonte única do texto exibido na página (FaqList) e do JSON-LD FAQPage.
 * Módulo sem "use client": lido pelos componentes de cliente (landing, vendas) e pelas páginas do servidor (dados estruturados).
 * Regras do projeto: sem promessa de resultado, sem números inventados; todo material público leva o aviso de investimento.
 */
export type FaqItem = readonly [question: string, answer: string];

/** Início do visitante ("/"). */
export function landingFaq(trial: number): FaqItem[] {
  return [
    ["O CryptoScanner recomenda compra ou venda?", "Não. As ferramentas calculam padrões, níveis e sinais com regras fixas e mostram de onde vem cada número. A decisão é sua. Não é recomendação de investimento."],
    ["O que quer dizer \"testado fora da amostra\"?", "As regras do modelo foram escolhidas com dados de um período e medidas em outro período, que não foi usado na escolha. Só publicamos o modelo porque o resultado nesse segundo período foi positivo, já descontando taxa e slippage. O setup que não passou nesse teste não é vendido como estratégia."],
    ["Preciso conectar minha corretora ou informar chaves de API?", "Não. Usamos apenas dados públicos de mercado. O CryptoScanner nunca pede chaves de API nem executa ordens."],
    ["O teste grátis pede cartão?", `Não. O teste libera as funções do PRO por ${trial} dias (o ELITE não tem teste). Ao final, o acesso é pausado até você escolher um plano; seus dados ficam salvos.`],
    ["Como cancelo?", "A qualquer momento, sem multa. O acesso segue até o fim do período pago. Na primeira contratação, o pedido em até 7 dias garante reembolso integral."],
    ["Funciona no celular?", "Sim. O site é responsivo e os avisos chegam por push no navegador e pelo Telegram."],
  ];
}

/** Página de vendas (/vendas) e página de planos (/planos). `kiwify` = canal de venda vigente (BILLING_PROVIDER). */
export function salesFaq(trial: number, kiwify: boolean): FaqItem[] {
  return [
    [
      "Como recebo o acesso depois de comprar?",
      kiwify
        ? "Crie a conta (ou entre) com o mesmo e-mail usado no checkout da Kiwify. O plano é liberado automaticamente quando o pagamento é confirmado; se você comprou antes de criar a conta, o acesso entra no momento do cadastro."
        : "Assine pela página Planos, dentro da sua conta. O plano é liberado automaticamente quando o pagamento é confirmado.",
    ],
    ["O teste grátis vale para qual plano?", `Para o PRO, por ${trial} dias, sem cartão. O ELITE não tem teste. Ao final do teste, o acesso é pausado até você escolher um plano; nada é cobrado automaticamente.`],
    ["O CryptoScanner recomenda compra ou venda?", "Não. As ferramentas calculam padrões, níveis e sinais com regras fixas e mostram de onde vem cada número. A decisão é sua. Não é recomendação de investimento."],
    ["Os resultados do modelo são garantidos?", "Não. Os números são históricos, medidos em um período fora da amostra e descontando custos. Resultado passado não garante resultado futuro."],
    ["Preciso conectar minha corretora?", "Não. O CryptoScanner usa apenas dados públicos de mercado, nunca pede chaves de API e não executa ordens."],
    ["Funciona no celular?", "Sim. O site se adapta a qualquer tela e os avisos chegam por push no navegador e pelo Telegram."],
    [
      "Como cancelo? E a garantia?",
      kiwify
        ? "Cancele a qualquer momento pelos canais da Kiwify indicados no e-mail da compra ou pelo nosso suporte; o acesso segue até o fim do período pago. Pedido em até 7 dias da compra: reembolso integral."
        : "Cancele a qualquer momento em Planos; o acesso segue até o fim do período pago. Pedido em até 7 dias da primeira cobrança: reembolso integral.",
    ],
  ];
}

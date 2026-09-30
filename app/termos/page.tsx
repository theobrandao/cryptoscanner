import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo/metadata";
import Link from "next/link";
import { connection } from "next/server";
import { EntityBlock, LegalDoc, legalEntity } from "@/components/legal/legal-doc";

export const metadata: Metadata = publicPageMetadata({ path: "/termos", title: "Termos de Uso", description: "Termos de Uso do CryptoScanner: conta, teste grátis, planos e pagamento, cancelamento e responsabilidade. O conteúdo não é recomendação de investimento." });

export default async function TermsPage() {
  await connection();
  const e = legalEntity();
  return (
    <LegalDoc title="Termos de Uso">
      <h2>1. Fornecedor</h2>
      <p>O CryptoScanner ({e.appUrl}) é fornecido por:</p>
      <EntityBlock />
      <h2>2. Objeto</h2>
      <p>
        O CryptoScanner é um software acessado pela internet (SaaS) de análise técnica de criptoativos. Reúne dados públicos de mercado (Binance, Bybit, OKX e outras fontes indicadas na interface) e calcula, por regras determinísticas, estrutura de mercado,
        liquidez, suporte e resistência, indicadores, Confluence Score, estados de setup, estatísticas históricas (backtest), monitores e alertas. O AI Analyst, quando disponível, descreve o contexto usando apenas números calculados pela plataforma.
      </p>
      <h2>3. Natureza das informações — sem recomendação de investimento</h2>
      <ul>
        <li>O conteúdo tem caráter técnico e educacional. Não constitui recomendação, oferta, consultoria, gestão de carteira ou análise de valores mobiliários, nem garantia de resultado.</li>
        <li>O Confluence Score mede a qualidade da confluência técnica (0–100); não é probabilidade de acerto. Resultados históricos simulados não garantem resultados futuros.</li>
        <li>Criptoativos têm alta volatilidade e risco de perda total do capital. Operações alavancadas podem gerar perdas superiores ao valor investido. As decisões de compra, venda ou alavancagem são exclusivamente do usuário.</li>
        <li>Os dados de mercado vêm de terceiros e podem apresentar atraso, falha ou divergência. A plataforma indica a fonte, o horário e o estado de cada dado (LIVE, DELAYED, DEGRADED, FALLBACK, OFFLINE).</li>
      </ul>
      <h2>4. Conta de acesso</h2>
      <ul>
        <li>O serviço é destinado a maiores de 18 anos. O usuário informa dados verdadeiros e mantém a senha em sigilo.</li>
        <li>A conta é pessoal e intransferível. É vedado compartilhar o acesso, revender o conteúdo, extrair dados de forma automatizada ou tentar contornar limites técnicos e de plano.</li>
        <li>O descumprimento destes Termos permite a suspensão da conta, com aviso ao usuário e direito de manifestação pelo atendimento.</li>
      </ul>
      <h2>5. Teste gratuito</h2>
      <p>
        Novas contas recebem {e.trialDays} dias de teste com as funcionalidades do plano PRO (o plano ELITE não tem teste), sem cadastro de meio de pagamento e sem cobrança automática ao final. Encerrado o teste sem assinatura, o acesso ao
        workspace é pausado e os dados da conta (watchlists, estratégias, monitores e preferências) permanecem salvos.
      </p>
      <h2>6. Planos, preços e pagamento</h2>
      <ul>
        <li>
          PRO: R$ {e.pro} por mês. ELITE: R$ {e.elite} por mês. O conteúdo de cada plano está descrito na página <Link href="/planos">Planos</Link>.
        </li>
        {e.kiwify ? (
          <>
            <li>A contratação é feita no checkout da Kiwify, que processa o pagamento mensal recorrente. O CryptoScanner não recebe nem armazena dados de cartão ou de pagamento.</li>
            <li>O acesso pago é liberado para a conta do CryptoScanner cadastrada com o mesmo e-mail informado na compra. Compra feita antes do cadastro é aplicada quando a conta é criada com esse e-mail.</li>
          </>
        ) : (
          <li>A cobrança é mensal e recorrente, processada pelo Mercado Pago. O CryptoScanner não recebe nem armazena dados de cartão.</li>
        )}
        <li>Alteração de preço é comunicada com no mínimo 30 dias de antecedência e vale a partir do ciclo seguinte ao aviso.</li>
        <li>Falha de pagamento: o acesso é mantido por 3 dias de tolerância; depois, pausado até a regularização.</li>
      </ul>
      <h2>7. Cancelamento e direito de arrependimento</h2>
      <p>
        O usuário cancela a renovação a qualquer momento, sem multa ({e.kiwify ? "pelos canais da Kiwify indicados no e-mail de confirmação da compra ou pelo atendimento do CryptoScanner" : "em Planos → Cancelar renovação"}); o acesso continua até o fim
        do período já pago. Na primeira contratação paga, o usuário pode exercer o direito de arrependimento em até 7 dias (art. 49 do Código de Defesa do Consumidor), com reembolso integral. Detalhes na{" "}
        <Link href="/reembolso">Política de Cancelamento e Reembolso</Link>.
      </p>
      <h2>8. Disponibilidade e alterações do serviço</h2>
      <ul>
        <li>O serviço é prestado de forma contínua, sujeito a manutenções, falhas de provedores de infraestrutura e indisponibilidade das fontes de dados de terceiros.</li>
        <li>Funcionalidades podem ser aprimoradas ou substituídas. Remoção de funcionalidade essencial de um plano pago é comunicada com antecedência e permite cancelamento com reembolso proporcional do período não usado.</li>
      </ul>
      <h2>9. Propriedade intelectual</h2>
      <p>Software, marca, textos e metodologias do CryptoScanner pertencem ao fornecedor. O usuário recebe licença de uso pessoal, não exclusiva e revogável durante a vigência da conta.</p>
      <h2>10. Responsabilidade</h2>
      <p>
        O fornecedor responde pelo funcionamento do serviço nos termos da legislação de defesa do consumidor. O fornecedor não responde por resultados de decisões de investimento tomadas pelo usuário, por variações de mercado, nem por falhas de
        exchanges e demais serviços de terceiros fora do seu controle.
      </p>
      <h2>11. Privacidade</h2>
      <p>
        O tratamento de dados pessoais segue a <Link href="/privacidade">Política de Privacidade</Link>, em conformidade com a Lei 13.709/2018 (LGPD).
      </p>
      <h2>12. Alterações destes Termos</h2>
      <p>Mudanças relevantes são comunicadas por e-mail ou no aplicativo com pelo menos 15 dias de antecedência. A versão vigente é a indicada no topo desta página.</p>
      <h2>13. Foro</h2>
      <p>Fica eleito o foro do domicílio do usuário consumidor para questões decorrentes destes Termos, conforme o Código de Defesa do Consumidor.</p>
    </LegalDoc>
  );
}

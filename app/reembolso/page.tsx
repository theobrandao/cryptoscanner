import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { EntityBlock, LegalDoc, legalEntity } from "@/components/legal/legal-doc";

export const metadata: Metadata = { title: "Cancelamento e Reembolso — CryptoScanner" };

export default async function RefundPage() {
  await connection();
  const e = legalEntity();
  return (
    <LegalDoc title="Política de Cancelamento e Reembolso">
      <h2>1. Teste de 7 dias</h2>
      <p>O teste não exige meio de pagamento e não gera cobrança. Ao final, o acesso é pausado até a escolha de um plano.</p>
      <h2>2. Cancelamento da assinatura</h2>
      <ul>
        <li>
          Em <Link href="/planos">Plans &amp; Billing</Link> → “Cancelar renovação”, a qualquer momento, sem multa.
        </li>
        <li>O acesso continua até o fim do período já pago; não há cobrança seguinte.</li>
      </ul>
      <h2>3. Direito de arrependimento (7 dias)</h2>
      <p>
        Na primeira contratação paga, o pedido feito em até 7 dias da cobrança garante reembolso integral (art. 49 do Código de Defesa do Consumidor). Solicite em Help &amp; Support com o assunto “Reembolso” ou pelo e-mail {e.email}. O estorno é
        solicitado ao Mercado Pago em até 5 dias úteis; o prazo de crédito na fatura depende do emissor do cartão.
      </p>
      <h2>4. Demais situações</h2>
      <ul>
        <li>Cobrança em duplicidade ou indevida: reembolso integral do valor indevido.</li>
        <li>Indisponibilidade prolongada do serviço por falha do fornecedor: crédito ou reembolso proporcional, mediante solicitação.</li>
        <li>Após os 7 dias da primeira contratação e nas renovações seguintes, o cancelamento interrompe a próxima cobrança; o período já pago segue disponível.</li>
      </ul>
      <h2>5. Contato</h2>
      <EntityBlock />
    </LegalDoc>
  );
}

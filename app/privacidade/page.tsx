import type { Metadata } from "next";
import { connection } from "next/server";
import { EntityBlock, LegalDoc, legalEntity } from "@/components/legal/legal-doc";

export const metadata: Metadata = { title: "Política de Privacidade — CryptoScanner" };

export default async function PrivacyPage() {
  await connection();
  const e = legalEntity();
  return (
    <LegalDoc title="Política de Privacidade">
      <h2>1. Controlador e encarregado</h2>
      <EntityBlock />
      <p>Encarregado pelo tratamento de dados (DPO): {e.dpo}</p>
      <h2>2. Dados tratados</h2>
      <ul>
        <li>Cadastro: nome, e-mail e senha (armazenada somente como hash bcrypt).</li>
        <li>Uso do serviço: preferências, watchlists, carteira informada pelo usuário, alertas, monitores, estratégias, backtests, análises salvas e chamados de suporte.</li>
        <li>Imagens de gráfico enviadas voluntariamente para análise.</li>
        <li>Notificações: endereço de inscrição push do navegador e, se informado, o chat ID do Telegram.</li>
        <li>Assinatura: plano, status e identificador da assinatura no Mercado Pago. Dados de cartão são tratados pelo Mercado Pago e não chegam ao CryptoScanner.</li>
        <li>Registros de acesso: endereço IP, evento (cadastro, login, redefinição de senha, exclusão de conta) e data/hora, guardados por 6 meses (Marco Civil da Internet, art. 15).</li>
        <li>Eventos de uso do produto (ex.: abertura do dashboard, criação de monitor) vinculados ao identificador da conta, sem IP e sem conteúdo livre.</li>
      </ul>
      <h2>3. Finalidades e bases legais (LGPD, art. 7º)</h2>
      <ul>
        <li>Prestar o serviço contratado, autenticar, cobrar e dar suporte — execução de contrato.</li>
        <li>Guardar registros de acesso e documentos fiscais — cumprimento de obrigação legal.</li>
        <li>Segurança, prevenção de abuso (limites de requisição) e melhoria do produto com eventos de uso — legítimo interesse, com mínimo de dados.</li>
        <li>Enviar notificações push e mensagens no Telegram — consentimento, revogável nas configurações.</li>
      </ul>
      <h2>4. Compartilhamento com operadores</h2>
      <p>Os dados são tratados por fornecedores de infraestrutura contratados, somente para operar o serviço:</p>
      <ul>
        <li>Hospedagem da aplicação (Vercel), banco de dados (Neon) e cache (Upstash).</li>
        <li>Pagamentos (Mercado Pago) e e-mail transacional (Resend), quando ativos.</li>
        <li>AI Analyst (Anthropic), quando ativo: recebe dados de mercado do contexto e a pergunta digitada; não recebe nome nem e-mail.</li>
        <li>Serviços de push do navegador (Google, Mozilla, Apple) e Telegram, quando o usuário ativa esses canais.</li>
      </ul>
      <p>
        Parte desses fornecedores processa dados fora do Brasil. A transferência internacional ocorre para execução do contrato e com cláusulas contratuais de proteção de dados dos fornecedores (LGPD, art. 33). Não vendemos dados pessoais.
      </p>
      <h2>5. Retenção</h2>
      <ul>
        <li>Dados da conta: enquanto a conta existir. Após a exclusão, removidos em até 30 dias dos sistemas ativos.</li>
        <li>Registros de acesso: 6 meses. Documentos fiscais e de cobrança: prazo legal aplicável.</li>
      </ul>
      <h2>6. Direitos do titular (LGPD, art. 18)</h2>
      <p>
        Confirmação e acesso, correção, anonimização ou eliminação, portabilidade, informação sobre compartilhamento e revogação de consentimento. A exclusão da conta pode ser feita diretamente em Help &amp; Support → Excluir conta. Os demais pedidos:
        {` ${e.dpo}`}. Resposta em até 15 dias.
      </p>
      <h2>7. Segurança</h2>
      <p>Conexão criptografada (HTTPS), senha com hash, sessão em cookie HttpOnly, controle de acesso por conta e plano no servidor, segredos fora do código e registro de acessos.</p>
      <h2>8. Cookies e armazenamento local</h2>
      <p>Usamos um cookie essencial de sessão e armazenamento local do navegador para preferências de interface (tema, layout, filtros). Não usamos cookies de publicidade.</p>
      <h2>9. Menores</h2>
      <p>O serviço não se destina a menores de 18 anos.</p>
      <h2>10. Alterações</h2>
      <p>Mudanças relevantes desta política são comunicadas por e-mail ou no aplicativo antes de entrarem em vigor.</p>
    </LegalDoc>
  );
}

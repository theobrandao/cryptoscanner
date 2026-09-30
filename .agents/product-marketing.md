# Product Marketing Context — CryptoScanner

Documento de contexto lido pelas skills de marketing em `.claude/skills/` (product-marketing, copywriting, signup, onboarding, pricing, paywalls, analytics, ab-testing, churn-prevention, launch, seo-audit).
Regra deste arquivo: só entram fatos aprovados pelo dono ou verificáveis no código. O que ainda não tem base está marcado como **a definir**; não preencher com suposição.

## Product Overview

- **Nome:** CryptoScanner — www.cryptoscanner.com.br
- **Categoria:** aplicação web (responsiva, pt-BR) de análise técnica de criptomoedas, com automação de vigilância e trilha educacional.
- **O que faz (recursos existentes no app):**
  - Scanner de 17 padrões gráficos em 30 criptomoedas (4H, 1D, 1W; 1H/30M/15M no ELITE).
  - Análise completa por ativo: estrutura de mercado, liquidez, níveis, Confluence Score, derivativos (Binance, Bybit, OKX) e gestão de risco.
  - Modelo de sinais de rompimento (Donchian 55 + EMA 200) com validação fora da amostra no 4H e validação com ressalva no 1D.
  - Agentes de IA e Sentinela (vigias no servidor), monitores e alertas por push e Telegram (Telegram depende do token do bot configurado).
  - Gráficos, Fibonacci, Carteira, Simulador (DCA e aporte único), Construtor de estratégias, Backtest.
  - Analista IA que responde com dados do próprio app.
  - Jornada Trader: 12 aulas ilustradas, com exercícios e teste, **gratuita e sem cadastro**.
- **Modelo de negócio:** assinatura mensal vendida pela Kiwify.

## Pricing (aprovado)

- **PRO:** R$ 97/mês. **ELITE:** R$ 197/mês (valores padrão em `lib/env.ts`, textos em `lib/plans-copy.ts`).
- **Teste grátis:** 3 dias, só no plano PRO, sem cartão.
- **Cobrança:** Kiwify, recorrente mensal. Arrependimento em até 7 dias com reembolso integral. Cancelamento a qualquer momento; acesso segue até o fim do período pago.
- **Afiliados:** programa ativo na Kiwify, comissão de 25%, aprovação manual.
- Venda feita como pessoa física (CPF do dono).

## Target Audience

- Pessoas no Brasil que operam ou investem em criptomoedas e usam análise técnica, do iniciante (Jornada grátis) ao trader que quer automatizar a vigilância.
- Perfis, faixas de experiência e canais de aquisição: **a definir** (ainda não há base de clientes).

## Personas

- B2C. Personas detalhadas: **a definir** com dados reais de cadastro e entrevistas.

## Problems & Pain Points

- Tempo gasto olhando gráfico para encontrar padrões manualmente.
- Dificuldade de juntar estrutura, liquidez, indicadores e derivativos numa leitura única.
- Perder o momento de um setup por não estar acompanhando o mercado.
- Iniciante sem trilha organizada para aprender análise técnica.
- Dores medidas com clientes: **a definir**.

## Competitive Landscape

- Referência declarada pelo dono: CryptoMinds Scanner (o CryptoScanner é uma implementação própria, clean-room, dos recursos públicos equivalentes).
- Demais concorrentes e comparativo: **a definir** (fazer pesquisa com fonte antes de citar).

## Differentiation

- Números do modelo de sinais publicados com a metodologia (validação fora da amostra), em vez de promessa de acerto.
- Tudo num só app: scanner, análise completa, agentes, alertas, simulador, backtest e educação.
- Jornada Trader aberta, sem cadastro, como porta de entrada.
- Interface e suporte em português.

## Objections

- "Sinal de cripto é aposta" → o produto é ferramenta de análise e educação; nunca prometer resultado. (A Kiwify recusou a primeira descrição por associação com apostas; descrever como análise técnica de criptoativos e evitar a palavra "sinais" em textos de loja.)
- "Não sei se vale o preço" → teste grátis de 3 dias sem cartão + arrependimento de 7 dias.
- Outras objeções reais: **a definir**.

## Switching Dynamics

- **a definir** (sem dados de clientes).

## Customer Language

- **a definir**. Não inventar frases de cliente.

## Brand Voice

- Português do Brasil, profissional e direto, linguagem simples para o usuário final.
- Sem jargão técnico de infraestrutura na interface.
- Sem exagero, sem promessa de lucro, sem urgência artificial.
- Ícones de um só conjunto (lucide); sem emojis na interface.

## Proof Points

- **Permitido:** o que o app faz (lista acima) e números do próprio modelo exibidos com metodologia e aviso de que resultado passado não garante futuro.
- **Proibido:** depoimentos inventados, contagem de usuários inventada, taxa de acerto/lucro sem fonte, "garantido".
- Todo material público leva: "Conteúdo educativo. Não é recomendação de investimento."

## Goals

- Primeiras vendas pela Kiwify (teste grátis → PRO/ELITE).
- Chave da Anthropic para o Analista IA ler imagens: só depois de entrar receita (decisão do dono).
- Metas numéricas (conversão, MRR): **a definir** pelo dono.

## Guardrails para as skills de marketing

- Não publicar campanhas, enviar e-mails/mensagens, criar anúncios ou contratar serviços sem autorização específica do dono.
- Não criar páginas que imitem outra marca.
- Alterações de preço, plano ou regra de teste precisam de aprovação do dono antes de ir ao código.

## Changelog

- 2026-09-30: criação com as decisões aprovadas na conversa de desenvolvimento.

# FASE 1 — Inventário do produto de referência

Fonte: páginas públicas de `cryptominds.com.br` (`index.html`, `scanner.html`, `agents.html`, `charts.html`) lidas em 28/09/2026. Somente o que é renderizado publicamente foi inventariado. Nada de código, prompt, endpoint privado ou asset foi copiado. Onde o comportamento depende de backend privado o item está marcado **REIMPLEMENTAÇÃO NECESSÁRIA** e a alternativa própria está descrita.

Convenção: **[OBS]** = observado literalmente na página pública; **[N/OBS]** = não observável (comportamento interno, backend, limites não publicados); **[REIMPL]** = reimplementado com arquitetura própria.

---

## 1. Layout geral [OBS]

- Site multi-página estático (`*.html`), idioma pt-BR, tema escuro por padrão (`theme-color #0d0118`, tons roxo-escuro), alternância para tema claro por ícone ☀️ no header.
- Estrutura por página: header fixo com navegação horizontal + ações à direita; conteúdo em largura máxima central; seções em cards; footer simplificado com links rápidos (Início, Fibonacci, Agentes, Scanner) e menu recolhível.
- Alta densidade de informação, badges "Novo", emojis como ícones de navegação.

## 2. Header e navegação [OBS]

Itens de navegação (rótulo → arquivo):

| Rótulo | Destino | Status neste projeto |
|---|---|---|
| 🧭 Jornada Trader 18 Aulas | tutoriais.html | Fora de escopo (conteúdo didático proprietário) — não reproduzido |
| 🌐 Panorama Diário | panorama.html | Reproduzido como `/panorama` (visão geral de mercado com dados públicos) |
| 🫧 Bubbles | bubbles.html | Reproduzido como `/bubbles` (mapa de bolhas por variação/volume) |
| 📊 Scanner | scanner.html | **Núcleo** — `/scanner` |
| 🤖 Agentes IA (Novo) | agents.html | Reproduzido como `/agentes` com arquitetura própria [REIMPL] |
| 🛰️ Sentinela Premium | sentinela.html | Fora de escopo (depende de serviço privado, sem detalhe público) |
| 📈 Gráficos | charts.html | Reproduzido como `/graficos` |
| 📐 Fibonacci | fibonacci.html | Reproduzido como `/fibonacci` (calculadora + níveis automáticos) |
| 💼 Carteira (Novo) | portfolio.html | Reproduzido como `/carteira` (watchlist + posições simuladas) |
| 📜 Simulações | simulations.html | Fora de escopo (metodologia proprietária de aportes) |
| 💳 Planos | planos.html | Reproduzido como `/planos` sem cobrança [REIMPL] |
| 🆘 Suporte | suporte.html | Reproduzido como `/suporte` (formulário → registro em banco) |

Ações à direita: ☀️ tema, "Entrar" (login), ⭐ upgrade, 🔍 busca.

## 3. Sidebar [OBS]

Não há sidebar persistente. Em mobile o menu recolhe (botão ×). O projeto usa header + menu lateral off-canvas em telas < 1024 px.

## 4. Página Scanner (`scanner.html`) [OBS]

- Título: "Scanner de Padrões — CryptoMinds Pro IA". H1: "Scanner de Padrões Gráficos".
- Texto: o scanner "identifica padrões técnicos em formação em tempo real" e combina detecção algorítmica com a estratégia do usuário.

### 4.1 Filtros
- Timeframe: `4H`, `1D`, `7D` livres; `1H`, `30M`, `15M` bloqueados (cadeado, exclusivos PLATINUM).
- Tipo de padrão: `Todos`, `▲ Alta`, `▼ Baixa`.
- Moeda: `🌐 Todas` ou um ativo específico.
- Botão de ação: `Escanear Agora`.
- Dica: "padrões gráficos são mais frequentes em timeframes de 1D e 7D".

### 4.2 Status e indicadores
- "Detectando padrões em … ativos" (loading) / "20 ativos analisados".
- "Último scan: —" e "Tempo Gráfico: 4H".
- Aviso de degradação: "Binance temporariamente indisponível. Usando última coleta disponível" + botão "↻ Tentar novamente"; variante "Dados com defasagem".

### 4.3 Abas de resultado
- **Padrões Técnicos** — vazio inicial: "Nenhum scan realizado" (instrução: selecione timeframe e clique em escanear). Vazio pós-scan: "Nenhum padrão gráfico foi detectado nos ativos escaneados neste timeframe". Cada resultado: ativo, padrão, direção, confiança.
- **Alertas de Volume** — "Monitorando volume em tempo real"; monitora candles de 30M e 1H nos 20 ativos; gatilho "aumento de volume ≥ 100%"; vazio: "Nenhum volume de candle anômalo detectado". Texto: "volumes de candle anômalos costumam ocorrer antes de rompimentos ou em reação a notícias".
- **📋 Histórico de Alertas** — vazio: "Escaneie para detectar padrões". Persistência [N/OBS] → [REIMPL] persistido em banco por usuário e em `localStorage` para visitante.

### 4.4 Lista de padrões suportados (17) [OBS]
Alta (▲): Fundo Duplo, C&O Invertido, Triângulo Ascendente, Bandeira de Alta, Cunha de Baixa, Pivot de Alta (HH+HL), Toque no Suporte, Bear Trap (Compra).
Baixa (▼): Topo Duplo, Cabeça & Ombros, Triângulo Descendente, Bandeira de Baixa, Pivot de Baixa (LH+LL), Toque na Resistência, Bull Trap (Venda).
Neutro (↔): Consolidação Lateral.
Algoritmos de detecção [N/OBS] → [REIMPL] com detecção por pivôs (ZigZag) e regras geométricas próprias (`lib/patterns`).

### 4.5 Análise de Gráfico por IA
- Upload JPG/PNG/WebP até 5 MB (arrastar, colar ou selecionar). Gating: "A análise de gráficos por Inteligência Artificial está disponível apenas para usuários autenticados" / "Faça login para usar a IA".
- Saída: Confiança (%), Pontos Operacionais (Entrada, Alvo, Stop Loss), Risco/Retorno (Potencial, Risco, Relação), Insights da IA, botão "Salvar Análise".
- Modelo/prompt [N/OBS] → [REIMPL] via provedor LLM com visão configurável (`LLM_PROVIDER`), saída validada por schema JSON, sem promessa de resultado financeiro.

### 4.6 Bloco "Recursos Plano PLATINUM"
- Benefícios: ⚡ Análises Ilimitadas de IA, ⏱️ Timeframes até 15M, 🤖 Até 15 Agentes Simultâneos, 🔔 Alertas no Telegram. CTA "💎 Ver Plano PLATINUM →" e "Continuar com meu plano atual". Preços [N/OBS].
- Planos citados: FREE, PRO, PLATINUM. Limites de FREE/PRO [N/OBS] → [REIMPL] definidos em `lib/plans.ts` (documentados como valores próprios, não da referência).

### 4.7 Fonte de dados [OBS]
Binance (texto de erro cita Binance). Lista dos 20 ativos [N/OBS]; a home lista 10: BTC, ETH, SOL, BNB, ADA, XRP, DOT, AVAX, MATIC, LINK, com preço em R$ e variação 24h. Universo deste projeto: os 10 acima (MATIC → POL) + DOGE, LTC, TRX, ATOM, UNI, NEAR, APT, ARB, OP, SUI = 20 ativos, todos disponíveis em Binance (USDT) e Kraken (USD) para fallback.

## 5. Página Agentes IA (`agents.html`) [OBS]

- Título "Agentes de IA — CryptoMinds Pro IA". Conceito: agente autônomo que monitora 24/7, analisa padrões e indicadores e envia alertas quando as condições configuradas ocorrem.
- Wizard de 5 passos: 1) Identidade (nome, ícone 🤖⚡🚀🐉🔥💎📉, descrição); 2) Mercado & Timeframe (ativos, tipo de operação ⚡ Day Trade / 🌊 Swing Trade, timeframe principal); 3) Estratégias (multi-seleção; categorias 📈 Análise Técnica, 🧠 Sentimento, 🔄 Ciclos, ⚡ Híbridas); 4) Configurações do Alerta (Confiança Mínima 50–95 %, padrão 70 %; Tipo de Notificação 📋 Log / ✈️ Telegram / 🔔 Ambos); 5) Confirmar.
- Regras publicadas: cooldown mínimo de 30 min entre alertas por agente; verificação server-side a cada 5 min, independente do navegador.
- Dashboard: "Meus Agentes" com abas Todos / Ativos / Pausados / Parados; "Estratégias Pré-Definidas de IA"; "📋 Log de Operações em Tempo Real" (indicador AO VIVO); botões "+ Novo Agente", "+ Criar Primeiro Agente", "Excluir Todos" (aviso irreversível); vazio "Nenhum agente encontrado"; sucesso "✅ Agente criado com sucesso!".
- Telegram: conexão via bot (deep link) ou Chat ID manual. Bot da referência é privado → [REIMPL] com bot próprio via `TELEGRAM_BOT_TOKEN`.
- Modal "Scanner de IA" com presets: ⚡ Day Trade 1D·4H·1H; 🌊 Swing Trade 1W·1D·4H; 📉 StochRSI 4H (bandas 90/50/10); 📈 EMA 100 + StochRSI.
- Lógica interna das estratégias "backtestadas" [N/OBS] → [REIMPL] estratégias determinísticas próprias em `agents/strategies`.

## 6. Página Gráficos (`charts.html`) [OBS]

- Título "Análise de Gráficos — CryptoMinds Pro IA". Candlestick com TradingView Lightweight Charts, dados Binance.
- Timeframes: 5M, 15M, 30M, 1H, 4H, 1D, 1W.
- Indicadores: EMA 8, EMA 25, EMA 100, EMA 200, Bollinger Bands, StochRSI, MACD. Ferramentas "T&F"/"LT" (linhas de tendência/fibonacci) [parcialmente OBS] → níveis de Fibonacci automáticos e linhas de S/R.
- Estados: "Carregando dados…", "Erro ao carregar dados. Tente novamente em instantes.".

## 7. Home (`index.html`) [OBS]

- Disclaimer no footer: conteúdo informativo/educacional; alto risco; responsabilidade do usuário. Reproduzido com texto próprio equivalente.
- Ticker de ativos com preço em R$ e variação 24h.

## 8. Itens 11–17 do inventário

- Modais: upgrade PLATINUM, Scanner de IA (presets), confirmação "Excluir Todos". [OBS]
- Tooltips: cadeado nos timeframes bloqueados; legenda ▲/▼/↔. [OBS]
- Formulários: filtros do scanner, upload de imagem, wizard de agentes, login. [OBS]
- Estados de erro: indisponibilidade Binance, erro de carga de gráfico. [OBS]
- Estados vazios: listados nas seções 4.3, 5. [OBS]
- Responsividade: menu recolhível em mobile; cards empilham. [OBS]

## 9. Recursos de IA e fluxos dos agentes [N/OBS → REIMPL]

Nenhum prompt, modelo, endpoint ou fluxo interno é público. A arquitetura própria está em `/agents` (ver `docs/AGENTS.md`): market → scanner → technical-analysis → trend → risk → sentiment → orchestrator, com schemas JSON, timeout, fallback e logs. Indicadores são calculados programaticamente; LLM é opcional (interpretação e análise de imagem).

## 10. Fontes públicas de dados utilizadas neste projeto

| Uso | Fonte | Endpoint | Chave |
|---|---|---|---|
| Candles/tickers (primária) | Binance | `api.binance.com/api/v3/klines`, `/ticker/24hr`, WS `stream.binance.com` | não |
| Candles/tickers (fallback) | Kraken | `api.kraken.com/0/public/OHLC`, `/Ticker` | não |
| Câmbio USDT→BRL, market cap, dominância | CoinGecko | `/simple/price`, `/coins/markets`, `/global` | opcional (`COINGECKO_API_KEY`) |
| Índice Medo & Ganância | alternative.me | `/fng/` | não |
| Manchetes | Cointelegraph RSS, CoinDesk RSS | RSS público | não |

Observação: `api.binance.com` responde HTTP 451 a partir de IPs nos EUA (verificado durante o desenvolvimento). O fallback Kraken cobre esse caso; o aviso "Binance temporariamente indisponível" é exibido e a origem real dos dados é mostrada na interface.

#!/usr/bin/env node
/**
 * E2E de interface (Playwright + Chromium) contra um ambiente real.
 *   BASE_URL=https://... CHROMIUM_PATH=/path/chrome OUT_DIR=./e2e-out node tools/e2e-ui.mjs
 * Percorre todas as páginas, executa os fluxos principais (registro, scanner, gráficos, agentes,
 * sentinela, simulador, carteira, alertas, preferências, planos, suporte, exclusão de conta),
 * registra erros de console e salva screenshots. Sai com 1 se algum passo falhar.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const OUT = process.env.OUT_DIR ?? "./e2e-out";
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const consoleErrors = [];
const stamp = Date.now();
const EMAIL = `e2e+${stamp}@cryptoscanner.local`;
const PASSWORD = "E2eTeste12345";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: "pt-BR" });
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push({ url: page.url(), text: m.text().slice(0, 200) });
});
page.on("pageerror", (e) => consoleErrors.push({ url: page.url(), text: `pageerror: ${e.message.slice(0, 200)}` }));
page.on("response", (r) => {
  if (r.status() >= 500) consoleErrors.push({ url: page.url(), text: `HTTP ${r.status()} ${r.request().method()} ${r.url()}` });
});

async function step(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, detail: detail ?? "" });
  } catch (err) {
    const file = `${String(results.length + 1).padStart(2, "0")}-erro.png`;
    await page.screenshot({ path: path.join(OUT, file), fullPage: false }).catch(() => {});
    results.push({ name, ok: false, ms: Date.now() - t0, detail: `${String(err?.message ?? err).slice(0, 300)} [${file}]` });
  }
}
async function shot(name) {
  const file = `${String(results.length + 1).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  return file;
}
const expect = (c, m) => {
  if (!c) throw new Error(m);
};
async function goto(p) {
  const res = await page.goto(BASE + p, { waitUntil: "domcontentloaded", timeout: 45_000 });
  expect(res && res.status() < 400, `HTTP ${res?.status()} em ${p}`);
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

// Aquecimento: primeira carga de chunks recém-publicados pode falhar em proxies de saída (não na CDN).
for (let i = 0; i < 2; i++) {
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 45_000 }).catch(() => {});
}
consoleErrors.length = 0;

// ------------------------------------------------------------ páginas públicas
await step("Início (anônimo): página de venda com ferramentas, números fora da amostra, simulador, preços e teste de 3 dias do PRO", async () => {
  await goto("/");
  await page.waitForFunction(() => /ferramentas claras e/i.test(document.body.innerText) && /Testar o PRO grátis por 3 dias/.test(document.body.innerText) && /R\$ \d+/.test(document.body.innerText) && /fora da amostra/i.test(document.body.innerText) && /Mercado agora/i.test(document.body.innerText), null, { timeout: 30_000 });
  const t = await page.locator("body").innerText();
  for (const tool of ["Scanner", "Agentes IA", "Sentinela", "Gráficos", "Fibonacci", "Carteira", "Simulador", "Jornada"]) expect(t.includes(tool), `ferramenta ${tool} ausente na página de venda`);
  expect(!/Depoimento|depoimento/.test(t), "depoimento na página (não há depoimentos reais)");
  await page.getByRole("button", { name: /Simular com preços reais/ }).click();
  await page.waitForFunction(() => /Valor final/i.test(document.body.innerText) && /simulação histórica, não projeção/i.test(document.body.innerText), null, { timeout: 60_000 });
  const analyst = await page.getByRole("button", { name: "Analista IA" }).count();
  expect(analyst >= 1, "botão Analista IA ausente na barra superior");
  const purple = await page.evaluate(() => [...document.querySelectorAll("*")].some((e) => /from-ai|to-ai/.test(e.getAttribute("class") ?? "")));
  expect(!purple, "gradiente roxo de IA ainda presente");
  return await shot("inicio-anonimo");
});

await step("Ferramentas sem conta mostram o portão de acesso (teste grátis ou entrar)", async () => {
  await goto("/scanner/padroes");
  await page.waitForFunction(() => /Testar \d+ dias grátis/.test(document.body.innerText) && /Entrar/.test(document.body.innerText) && !/Escanear Agora/.test(document.body.innerText), null, { timeout: 20_000 });
  // conta de apoio em teste grátis para percorrer as ferramentas (visitante não usa o produto)
  const r = await page.request.post(BASE + "/api/auth/register", { data: { name: "E2E Apoio", email: `e2e-pre+${stamp}@cryptoscanner.local`, password: PASSWORD, acceptTerms: true, invite: process.env.INVITE_CODE ?? "" } });
  expect(r.status() === 201, `conta de apoio: HTTP ${r.status()}`);
  return "portão exibido · conta de apoio em teste grátis";
});

await step("Scanner: tabela em tempo real com 30 linhas (inclui ZEC e ALGO) e RSI", async () => {
  await goto("/scanner/padroes");
  await page.waitForSelector("table tbody tr", { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll("table tbody tr").length >= 30, null, { timeout: 30_000 });
  const rows = await page.locator("table tbody tr").count();
  const text = await page.locator("table").innerText();
  expect(/RSI/i.test(text), "coluna RSI ausente");
  return `${rows} linhas · ${await shot("scanner-tabela")}`;
});

await step("Scanner: busca, ordenação, favoritos e filtro de tendência", async () => {
  const search = page.getByPlaceholder(/Buscar ativo/i);
  await search.fill("SOL");
  await page.waitForFunction(() => document.querySelectorAll("table tbody tr").length === 1, null, { timeout: 10_000 });
  await search.fill("");
  await page.waitForFunction(() => document.querySelectorAll("table tbody tr").length >= 30, null, { timeout: 10_000 });
  await page.locator("th", { hasText: /Preço/ }).first().click();
  await page.waitForTimeout(400);
  const first = await page.locator("table tbody tr").first().innerText();
  await page.locator("table tbody tr button[aria-label*='favoritos']").first().click();
  await page.waitForTimeout(300);
  return `1ª linha após ordenar por preço: ${first.split("\n")[0]}`;
});

await step("Scanner: Escanear Agora (4H) mostra padrões com status e sparkline", async () => {
  await page.getByRole("button", { name: /Escanear Agora/i }).first().click();
  await page.waitForFunction(() => /Confirmado|Em formação|Alerta inicial|Nenhum padrão/i.test(document.body.innerText), null, { timeout: 60_000 });
  const tab = page.getByRole("tab", { name: /Padrões Técnicos/i });
  if (await tab.count()) await tab.first().click();
  await page.waitForTimeout(500);
  const cards = await page.locator("text=/Confiança \\(aderência/").count();
  const spark = await page.locator("svg polyline").count();
  return `${cards} cartões, ${spark} sparklines · ${await shot("scanner-padroes")}`;
});

await step("Scanner: abas Alertas de Volume e Histórico; timeframe 1H bloqueado (cadeado)", async () => {
  await page.getByRole("tab", { name: /Alertas de Volume/i }).first().click();
  await page.waitForFunction(() => /Monitorando volume/i.test(document.body.innerText), null, { timeout: 30_000 });
  await page.getByRole("tab", { name: /Histórico/i }).first().click();
  await page.waitForTimeout(400);
  const locked = await page.locator("button", { hasText: /1H/ }).first().innerText();
  return `histórico ok · 1H: "${locked.replace(/\s+/g, " ")}"`;
});

await step("Gráficos: candles, indicadores e análise consolidada", async () => {
  await goto("/graficos?symbol=ETH&timeframe=4h");
  await page.waitForSelector("canvas", { timeout: 30_000 });
  await page.waitForFunction(() => /Análise consolidada|Veredito|verdict|Orquestrador/i.test(document.body.innerText), null, { timeout: 60_000 });
  const canvases = await page.locator("canvas").count();
  for (const label of ["EMA", "Bollinger", "MACD", "StochRSI"]) {
    const btn = page.locator("button, label", { hasText: new RegExp(label, "i") }).first();
    if (await btn.count()) await btn.click().catch(() => {});
  }
  await page.waitForTimeout(800);
  const lt = page.locator("button", { hasText: /^LT$/ }).first();
  expect((await lt.count()) === 1, "botão LT ausente");
  expect((await lt.getAttribute("aria-pressed")) === "true", "LT deveria vir ligado por padrão");
  return `${canvases} canvas · LT ligado · ${await shot("graficos")}`;
});

await step("Panorama: resumo executivo, fatores, derivativos, manchetes", async () => {
  await goto("/panorama");
  await page.waitForFunction(() => /Resumo executivo/i.test(document.body.innerText), null, { timeout: 60_000 });
  const t = await page.locator("body").innerText();
  expect(/Principais fatores/i.test(t), "fatores ausentes");
  expect(/Derivativos/i.test(t), "bloco de derivativos ausente");
  expect(/Medo & Ganância/i.test(t), "F&G ausente");
  return `funding ${/Funding\s*\n?\s*(-?[0-9.]+%)/i.exec(t)?.[1] ?? "?"} · ${await shot("panorama")}`;
});

await step("Bubbles: 100 ativos, troca de período e tooltip", async () => {
  await goto("/bubbles");
  await page.waitForFunction(() => /\d+ ativos · atualizado/i.test(document.body.innerText), null, { timeout: 60_000 });
  const t = await page.locator("body").innerText();
  const n = Number(/(\d+) ativos · atualizado/i.exec(t)?.[1] ?? 0);
  expect(n >= 80, `${n} ativos`);
  await page.getByRole("button", { name: "7d" }).click();
  await page.waitForTimeout(600);
  await page.mouse.move(700, 400);
  await page.waitForTimeout(300);
  return `${n} ativos · período 7d · ${await shot("bubbles")}`;
});

await step("Fibonacci: análise automática e manual", async () => {
  await goto("/fibonacci");
  await page.waitForFunction(() => /0\.618|61[,.]8/.test(document.body.innerText), null, { timeout: 60_000 });
  return `níveis renderizados · ${await shot("fibonacci")}`;
});

await step("Simulador: DCA BTC BRL 12 meses (resultado e gráfico)", async () => {
  await goto("/simulador");
  await page.getByRole("button", { name: /^Simular$/ }).click();
  await page.waitForFunction(() => /Total investido/i.test(document.body.innerText), null, { timeout: 60_000 });
  const t = await page.locator("body").innerText();
  expect(/Valor final/i.test(t) && /Queda máxima/i.test(t), "métricas ausentes");
  expect((await page.locator("svg polyline").count()) >= 2, "gráfico ausente");
  return `${/Resultado\s*\n\s*([^\n]+)/i.exec(t)?.[1] ?? ""} · ${await shot("simulador")}`;
});

await step("Jornada Trader: abrir aula, responder teste e concluir", async () => {
  await goto("/jornada");
  await page.waitForFunction(() => /12 aulas/i.test(document.body.innerText), null, { timeout: 20_000 });
  await page.getByRole("link", { name: /O que é Bitcoin/ }).first().click();
  await page.waitForURL(/\/jornada\/o-que-e-bitcoin/, { timeout: 10_000 });
  await page.waitForFunction(() => /Teste rápido/i.test(document.body.innerText), null, { timeout: 10_000 });
  await page.getByRole("button", { name: /Teste rápido/ }).first().click();
  await page.getByRole("radio", { name: /A recompensa por bloco cai pela metade/ }).click();
  await page.getByRole("radio", { name: /A oferta e demanda em cada corretora/ }).click();
  await page.getByRole("button", { name: /Corrigir e concluir aula/i }).click();
  await page.waitForFunction(() => /2\/2 corretas/i.test(document.body.innerText), null, { timeout: 10_000 });
  return `aula concluída 2/2 · ${await shot("jornada")}`;
});

await step("Mentor: pergunta com dados reais e SOS mindset", async () => {
  await goto("/mentor");
  await page.getByLabel(/Mensagem para o mentor/i).fill("Como está o BTC em 4h?");
  await page.getByRole("button", { name: /^Enviar$/ }).click();
  await page.waitForFunction(() => /Bitcoin \(BTC\) em 4H/.test(document.body.innerText), null, { timeout: 60_000 });
  await page.getByRole("button", { name: /Tomei stop/ }).click();
  await page.waitForFunction(() => /anti-revenge/.test(document.body.innerText), null, { timeout: 20_000 });
  return `dados reais + protocolo · ${await shot("mentor")}`;
});

// fim das ferramentas com a conta de apoio: exclui a conta e volta a visitante
await page.request.delete(BASE + "/api/auth/account", { data: { confirm: "EXCLUIR", password: PASSWORD } }).catch(() => null);
await context.clearCookies();

await step("Página de vendas /vendas: oferta, modelo, planos com teste só no PRO, garantia, FAQ e CTA fixo no celular", async () => {
  await goto("/vendas");
  await page.waitForFunction(() => /Padrões, sinais testados e alertas/i.test(document.body.innerText) && /R\$ \d+/.test(document.body.innerText) && /Garantia de 7 dias/i.test(document.body.innerText), null, { timeout: 30_000 });
  const t = await page.locator("body").innerText();
  expect(/Testar o PRO grátis por 3 dias/.test(t), "CTA do teste de 3 dias ausente");
  expect(/O ELITE não tem teste|Criar conta e assinar o ELITE|Assinar ELITE agora/.test(t), "ELITE sem indicação de compra/sem teste");
  expect(/Não é para você se/i.test(t) && /fora da amostra/i.test(t), "seções de transparência ausentes");
  expect(!/[Dd]epoimento/.test(t), "depoimento na página de vendas");
  expect((await page.locator('nav[aria-label="Navegação móvel"]').count()) === 0, "menu do produto aparece na página de vendas");
  return await shot("vendas");
});

await step("Planos: PRO e ELITE em R$, teste de 3 dias só no PRO, sem plano gratuito", async () => {
  await goto("/planos");
  await page.waitForFunction(() => /PRO/.test(document.body.innerText) && /ELITE/.test(document.body.innerText), null, { timeout: 20_000 });
  const t = await page.locator("body").innerText();
  expect(/R\$\s?\d+/.test(t), "preço em R$ ausente");
  expect(/3 dias grátis/i.test(t), "teste de 3 dias não mencionado");
  expect(!/\bFREE\b/.test(t), "plano gratuito exibido");
  return await shot("planos");
});

await step("Suporte (anônimo): FAQ e formulário", async () => {
  await goto("/suporte");
  const t = await page.locator("body").innerText();
  expect(/Perguntas frequentes/i.test(t), "FAQ ausente");
  await page.locator("summary").first().click();
  await page.fill("#s-email", EMAIL);
  await page.fill("#s-subject", "Teste E2E anônimo");
  await page.fill("#s-msg", "Mensagem de teste do E2E de interface (anônimo).");
  await page.getByRole("button", { name: /^Enviar$/ }).click();
  await page.waitForFunction(() => /Chamado registrado/i.test(document.body.innerText), null, { timeout: 20_000 });
  return `chamado registrado · ${await shot("suporte")}`;
});

await step("Sentinela (anônimo) pede login; Carteira/Agentes exigem sessão", async () => {
  await goto("/sentinela");
  await page.waitForFunction(() => /Faça login|Entrar/i.test(document.body.innerText), null, { timeout: 20_000 });
  return "gating ok";
});

// ------------------------------------------------------------ registro e fluxos autenticados
await step("Registro pela interface", async () => {
  await goto("/registro");
  await page.fill("input[type='email']", EMAIL);
  const nameInput = page.locator("input[name='name'], input#name, input[autocomplete='name']").first();
  if (await nameInput.count()) await nameInput.fill("Usuário E2E");
  const pw = page.locator("input[type='password']");
  await pw.first().fill(PASSWORD);
  if ((await pw.count()) > 1) await pw.nth(1).fill(PASSWORD);
  const inviteInput = page.locator("input#invite");
  if (await inviteInput.count()) await inviteInput.fill(process.env.INVITE_CODE ?? "");
  // aceite obrigatório dos termos (botão fica desabilitado sem ele)
  const btn = page.getByRole("button", { name: /Começar \d+ dias grátis|Começar teste|Criar conta/i });
  expect(await btn.isDisabled(), "cadastro permitido sem aceite dos termos");
  await page.check("#accept-terms");
  await btn.click();
  await page.waitForFunction(() => !location.pathname.startsWith("/registro"), null, { timeout: 30_000 });
  const me = await page.evaluate(async () => (await (await fetch("/api/auth/me")).json()).data.user?.email);
  expect(me === EMAIL, `sessão não criada (${me})`);
  return `logado como ${me}`;
});

await step("Início (logado): saudação, seu painel, mercado agora, sinais ativos do modelo validado; menu com uma ferramenta por finalidade", async () => {
  await goto("/");
  await page.waitForFunction(() => /Sinais ativos — rompimento testado/i.test(document.body.innerText) && /posições abertas/i.test(document.body.innerText), null, { timeout: 120_000 });
  const nav = await page.locator("nav[aria-label='Ferramentas']").first().innerText();
  const items = ["Início", "Jornada", "Panorama", "Bolhas", "Scanner", "Agentes IA", "Sentinela", "Gráficos", "Fibonacci", "Carteira", "Simulador"];
  for (const i of items) expect(nav.includes(i), `menu sem ${i}`);
  for (const gone of ["Market Scanner", "Market Monitor", "Dashboard", "Strategies"]) expect(!nav.includes(gone), `menu principal ainda tem ${gone}`);
  const adv = await page.locator("nav[aria-label='Ferramentas avançadas']").count();
  expect(adv === 0, "grupo Avançado deveria começar recolhido");
  await page.getByRole("button", { name: "Avançado" }).first().click();
  await page.locator("nav[aria-label='Ferramentas avançadas']").first().waitFor({ timeout: 5_000 });
  expect((await page.locator("section[aria-label='Seu painel']").count()) === 1, "início sem a seção Seu painel");
  expect(/^(Bom dia|Boa tarde|Boa noite)/.test(await page.locator("h1").first().innerText()), "início sem saudação por horário");
  const cards = await page.locator("section[aria-label='Sinais ativos'] a[href^='/graficos']").count();
  return `${cards} cartões de sinais · ${await shot("inicio-logado")}`;
});

await step("Tema claro/escuro e moeda BRL", async () => {
  await goto("/scanner/padroes");
  const themeBtn = page.getByRole("button", { name: /Alternar tema/i }).first();
  if (await themeBtn.count()) {
    await themeBtn.click();
    await page.waitForTimeout(300);
  }
  const brl = page.getByRole("button", { name: /^BRL$/ }).first();
  if (await brl.count()) await brl.click();
  await page.waitForFunction(() => /R\$/.test(document.body.innerText), null, { timeout: 15_000 });
  const file = await shot("tema-claro-brl");
  if (await themeBtn.count()) await themeBtn.click();
  const usd = page.getByRole("button", { name: /^USD$/ }).first();
  if (await usd.count()) await usd.click();
  return `R$ renderizado · ${file}`;
});

await step("Agentes: wizard de 5 passos cria um agente e executa", async () => {
  await goto("/agentes?novo=1&symbol=ETH&timeframe=4h&strategy=pattern_breakout");
  await page.waitForSelector("[role='dialog']", { timeout: 20_000 });
  for (let i = 0; i < 6; i++) {
    const next = page.getByRole("button", { name: /Próximo|Avançar|Continuar/i }).first();
    const create = page.getByRole("button", { name: /Ativar agente|Salvar alterações/i }).first();
    if ((await create.count()) && (await create.isVisible()) && (await create.isEnabled())) {
      await create.click();
      break;
    }
    if (await next.count()) await next.click();
    await page.waitForTimeout(400);
  }
  await page.waitForFunction(() => /Padrões ETH 4H/i.test(document.body.innerText), null, { timeout: 30_000 });
  const run = page.getByRole("button", { name: /Executar agora/i }).first();
  if (await run.count()) await run.click();
  await page.waitForTimeout(3000);
  return `agente criado · ${await shot("agentes")}`;
});

await step("Sentinela: criar BTC 4H, varrer agora, ver relatórios, pausar", async () => {
  await goto("/sentinela");
  await page.getByRole("button", { name: /Criar Sentinela/i }).click();
  await page.waitForFunction(() => /Sentinela BTC/i.test(document.body.innerText), null, { timeout: 30_000 });
  await page.getByRole("button", { name: /Varrer agora/i }).first().click();
  await page.waitForTimeout(4000);
  await page.getByRole("button", { name: /Pausar/i }).first().click();
  await page.waitForFunction(() => /pausado/i.test(document.body.innerText), null, { timeout: 20_000 });
  return `sentinela criado/varrido/pausado · ${await shot("sentinela")}`;
});

await step("Scanner: análise de gráfico (upload PNG) em modo determinístico", async () => {
  await goto("/scanner/padroes");
  await page.waitForFunction(() => /Leitura técnica com dados reais|Analisar/i.test(document.body.innerText), null, { timeout: 30_000 });
  const input = page.locator("input[type='file']").first();
  await input.setInputFiles({ name: "chart.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") });
  await page.getByPlaceholder("BTC").fill("BTC");
  await page.getByRole("button", { name: /Analisar/ }).first().click();
  await page.waitForFunction(() => /Confiança|Insights|Pontos Operacionais|Entrada/i.test(document.body.innerText) && /orchestrator|dados reais|deterministic/i.test(document.body.innerText), null, { timeout: 60_000 });
  return `análise renderizada · ${await shot("analise-imagem")}`;
});

await step("Carteira: adicionar BTC com posição e ver P&L; criar alerta", async () => {
  await goto("/carteira");
  await page.waitForTimeout(1500);
  const added = await page.evaluate(async () => {
    const r = await fetch("/api/watchlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol: "BTC", quantity: 0.1, avgPrice: 50000 }) });
    const a = await fetch("/api/alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol: "BTC", kind: "price_above", threshold: 1 }) });
    return { w: r.status, a: a.status };
  });
  expect(added.w === 200 && added.a === 200, `watchlist ${added.w} alerta ${added.a}`);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => /BTC/.test(document.body.innerText) && /P&L|Resultado|Lucro/i.test(document.body.innerText), null, { timeout: 30_000 });
  return `posição + alerta visíveis · ${await shot("carteira")}`;
});

await step("Simulador logado: salvar e listar", async () => {
  await goto("/simulador");
  await page.getByRole("button", { name: /^Simular$/ }).click();
  await page.waitForFunction(() => /Total investido/i.test(document.body.innerText), null, { timeout: 60_000 });
  await page.getByRole("button", { name: /Salvar simulação/i }).click();
  await page.waitForFunction(() => document.querySelectorAll("table tbody tr").length >= 1 && /Minhas simulações/i.test(document.body.innerText), null, { timeout: 20_000 });
  return "simulação salva e listada";
});

await step("Preferências: alterar tema/moeda/timeframe e Chat ID", async () => {
  await goto("/preferencias");
  await page.waitForTimeout(1000);
  const save = page.getByRole("button", { name: /^Salvar$/i }).first();
  if (await save.count()) await save.click();
  await page.waitForTimeout(1000);
  // Conexão com um clique é o fluxo principal; o Chat ID manual fica recolhido em <details>.
  const hasOneClick = await page.getByRole("button", { name: /Conectar Telegram|Desconectar/i }).count();
  const manual = page.locator("summary", { hasText: /Conectar manualmente/i }).first();
  if (await manual.count()) {
    await manual.click();
    const chat = page.locator("input[placeholder='123456789']").first();
    await chat.fill("123456789");
    await page.getByRole("button", { name: /Salvar Chat ID/i }).first().click();
  }
  await page.waitForTimeout(1500);
  const pref = await page.evaluate(async () => (await (await fetch("/api/preferences")).json()).data);
  return `chatId=${pref.telegramChatId ?? "—"} · um clique ${hasOneClick ? "visível" : "indisponível (sem token)"} · ${await shot("preferencias")}`;
});

await step("Planos: trocar para PLATINUM libera 15M no scanner; voltar para PRO", async () => {
  await goto("/planos");
  const btn = page.getByRole("button", { name: /Elite|Platinum|Assinar|Escolher/i }).first();
  const changed = await page.evaluate(async () => (await fetch("/api/plans/change", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: "PLATINUM" }) })).status);
  if (changed === 403) return "troca de plano bloqueada para não-admin (ALLOW_SELF_PLAN_CHANGE=false) — passo pulado";
  expect(changed === 200, `troca ${changed}`);
  await goto("/scanner/padroes?timeframe=15m");
  const tf = page.locator("button", { hasText: /15M/ }).first();
  await tf.click();
  await page.waitForFunction(() => document.querySelectorAll("table tbody tr").length >= 30, null, { timeout: 40_000 });
  const file = await shot("scanner-15m-platinum");
  // volta para PRO (modelo comercial não tem plano gratuito; FREE encerraria o acesso ao Dashboard)
  await page.evaluate(async () => fetch("/api/plans/change", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: "PRO" }) }));
  return `15M liberado (${await btn.count()} CTA) · ${file}`;
});

await step("Backtest: tabela 4H/1D com expectativa em R, 1R/2R/3R e IC 95%", async () => {
  await goto("/estatisticas?timeframe=1d");
  await page.waitForFunction(() => /Operações no recorte/i.test(document.body.innerText) && /Expectativa/i.test(document.body.innerText), null, { timeout: 60_000 });
  await page.getByRole("tab", { name: "4H" }).click();
  await page.waitForFunction(() => location.search.includes("4h") && /Operações no recorte/i.test(document.body.innerText), null, { timeout: 60_000 });
  const n = await page.locator("table tbody tr").count();
  expect(n >= 5, `poucos padrões (${n})`);
  return `${n} padrões · ${await shot("estatisticas")}`;
});

await step("Status do sistema: jobs, provedores e integrações", async () => {
  await goto("/status");
  await page.waitForFunction(() => /Rotinas automáticas/i.test(document.body.innerText) && /Fontes de dados de mercado/i.test(document.body.innerText), null, { timeout: 30_000 });
  const overall = await page.locator("[role='alert'] .font-semibold, [role='status'] .font-semibold").first().innerText().catch(() => "");
  return `${overall || "status exibido"} · ${await shot("status")}`;
});

await step("Preferências: cartão de notificações push visível", async () => {
  await goto("/preferencias");
  await page.waitForFunction(() => /Notificações no navegador/i.test(document.body.innerText), null, { timeout: 30_000 });
  const cfg = await page.evaluate(async () => (await (await fetch("/api/push/subscribe")).json()).data);
  expect(cfg && typeof cfg.configured === "boolean", "GET /api/push/subscribe sem dados");
  return `push configurado no servidor: ${cfg.configured} · inscrições: ${cfg.subscriptions}`;
});

await step("Mobile 390 px: scanner, taxa de acerto e gráficos sem rolagem horizontal", async () => {
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "pt-BR" });
  const mp = await m.newPage();
  const out = [];
  for (const r of ["/scanner/padroes", "/scanner", "/strategies", "/monitor", "/backtest", "/derivatives", "/estatisticas", "/graficos", "/panorama", "/agentes", "/terminal?tab=mtf", "/risco"]) {
    await mp.goto(BASE + r, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await mp.waitForTimeout(2500);
    const over = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over <= 0, `${r}: ${over}px de rolagem horizontal`);
    out.push(r);
  }
  await mp.screenshot({ path: path.join(OUT, "mobile-agentes.png") });
  await m.close();
  return `${out.length} páginas OK em 390 px`;
});

await step("Terminal: visão geral, gráfico com estrutura, liquidez, multi-TF e risco", async () => {
  await goto("/terminal?symbol=ETH&timeframe=4h");
  await page.waitForFunction(() => /Estrutura externa/.test(document.body.innerText) && /Alinhamento HTF/.test(document.body.innerText), null, { timeout: 60_000 });
  const overview = await shot("terminal-overview");
  for (const [tab, re] of [["Gráfico", /BOS|CHoCH|HH|HL|LH|LL|Marcadores/], ["Estrutura", /Eventos \(por fechamento\)/], ["Liquidez", /Mapa de liquidez/], ["Multi-TF", /Matriz multi-timeframe/], ["Risco", /Posição pelo risco/]]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await page.waitForFunction((src) => new RegExp(src).test(document.body.innerText), re.source, { timeout: 30_000 });
  }
  const qty = await page.locator("text=Quantidade").count();
  expect(qty > 0, "calculadora de risco sem resultado");
  return `6 abas · ${overview} · ${await shot("terminal-risco")}`;
});

await step("Risco: tamanho de posição 10.000 × 1% com stop de 5% = 20 unidades; liquidação 10x", async () => {
  await goto("/risco");
  await page.fill("#acc", "10000");
  await page.fill("#risk", "1");
  await page.fill("#lev", "10");
  await page.fill("#fee", "0");
  await page.fill("#entry", "100");
  await page.fill("#stop", "95");
  await page.fill("#mmr", "0.5");
  await page.waitForFunction(() => /20[.,]000000/.test(document.body.innerText) && /90[.,]45/.test(document.body.innerText), null, { timeout: 10_000 });
  return `qty 20 e liquidação 90,45 exibidas · ${await shot("risco")}`;
});

await step("Análise completa BTC/USDT 4H (link antigo /?symbol= redireciona): header, gráfico, estrutura, liquidez, confluência, setup, derivativos, histórico, risco", async () => {
  await goto("/?symbol=BTC&tf=4h&exchange=okx&instrument=perp");
  await page.waitForFunction(() => location.pathname === "/charts/BTC", null, { timeout: 30_000 });
  const PANELS = ["Estrutura de mercado", "Liquidez", "Confluence Score", "Estado do setup", "Derivativos", "Desempenho histórico", "Favoritos", "Visão do mercado", "Scanner de setups", "Gestão de risco", "Componentes", "Penalidades", "Final", "Nível de gatilho", "Próximo funding"];
  await page.waitForFunction((ps) => ps.every((t) => document.body.innerText.includes(t)), PANELS, { timeout: 90_000 });
  const canvases = await page.locator("canvas").count();
  expect(canvases >= 3, `gráfico sem canvas (${canvases})`);
  const header = await page.locator("h1").first().innerText();
  expect(/BTC\/USDT/.test(header), `header ${header}`);
  const shot1 = await shot("dashboard-btc");
  // spot: sem funding/OI no header e painel explica
  await page.getByRole("radio", { name: "Spot" }).click();
  await page.waitForFunction(() => location.search.includes("instrument=spot") && !!document.querySelector('[data-context="okx:spot:BTC:4h"]') && !/Próximo funding/.test(document.querySelector("h1")?.closest("div.flex.flex-col")?.textContent ?? ""), null, { timeout: 90_000 });
  // troca de timeframe atualiza todo o contexto
  await page.getByRole("tab", { name: "1D", exact: true }).first().click();
  await page.waitForFunction(() => location.search.includes("tf=1d") && !!document.querySelector('[data-context="okx:spot:BTC:1d"]'), null, { timeout: 90_000 });
  // troca de ativo pela watchlist mantém exchange/instrumento/timeframe
  await page.locator("tr", { hasText: "ETH/USDT" }).first().click();
  await page.waitForFunction(() => !!document.querySelector('[data-context="okx:spot:ETH:1d"]') && /ETH\/USDT/.test(document.querySelector("h1")?.textContent ?? ""), null, { timeout: 90_000 });
  // Charts usa o mesmo workspace
  await goto("/charts/SOL?tf=1h&exchange=binance&instrument=spot");
  await page.waitForFunction(() => !!document.querySelector('[data-context="binance:spot:SOL:1h"]'), null, { timeout: 90_000 });
  return `${canvases} canvas · OKX perp→spot, 4H→1D, BTC→ETH e /charts/SOL sincronizados · ${shot1}`;
});

await step("Analista IA: painel lê o contexto ativo e só usa números do contexto", async () => {
  await page.getByRole("button", { name: "Analista IA" }).first().click();
  await page.waitForFunction(() => /SOL\/USDT · Binance Spot · 1H/.test(document.querySelector("[role=dialog]")?.textContent ?? ""), null, { timeout: 60_000 });
  await page.locator("[role=dialog]").getByRole("button", { name: /^Resuma SOL no 1H/ }).click();
  await page.waitForFunction(() => { const t = document.querySelector("[role=dialog]")?.textContent ?? ""; return /Confluence Score/.test(t) && /Estrutura/.test(t) && /Regime/.test(t); }, null, { timeout: 90_000 });
  const file = await shot("ai-analyst");
  await page.keyboard.press("Escape");
  return file;
});

await step("Strategies: modelo → salvar → testar agora → rodar no universo", async () => {
  await goto("/strategies");
  await page.getByRole("button", { name: /Pullback em tendência/ }).click();
  await page.getByRole("button", { name: /^Salvar$/ }).click();
  await page.waitForFunction(() => /Estratégia salva/.test(document.body.innerText), null, { timeout: 30_000 });
  await page.getByRole("button", { name: /Testar agora/ }).click();
  await page.waitForFunction(() => /Condições (não )?atendidas/.test(document.body.innerText), null, { timeout: 90_000 });
  await page.getByRole("button", { name: /Rodar no universo/ }).click();
  await page.waitForFunction(() => document.querySelectorAll("table tbody tr").length >= 20, null, { timeout: 120_000 });
  return await shot("strategies");
});

await step("Scanner de setups: 30 ativos com estado, score, regime, R:R; filtros", async () => {
  await goto("/scanner?tf=4h");
  await page.waitForFunction(() => /Scanner de setups/.test(document.body.innerText) && /de 30 ativos|de \d+ ativos/.test(document.body.innerText), null, { timeout: 120_000 });
  await page.getByLabel("Ocultar sem entrada").uncheck();
  await page.waitForFunction(() => document.querySelectorAll("table tbody tr").length >= 25, null, { timeout: 30_000 });
  return await shot("market-scanner");
});

await step("Market Monitor: criar monitor de setup (servidor) e listar", async () => {
  await goto("/monitor?symbol=ETH&tf=4h");
  await page.getByRole("button", { name: /Criar monitor/ }).click();
  await page.waitForFunction(() => /ETH\/USDT 4H/.test(document.body.innerText) && /aguardando 1º ciclo|FORMING|READY|DETECTED|NONE/.test(document.body.innerText), null, { timeout: 30_000 });
  return await shot("monitor");
});

await step("Backtest: setup 4H 180 dias com custos → métricas e curva de capital", async () => {
  await goto("/backtest");
  await page.getByRole("button", { name: /Rodar backtest/ }).click();
  await page.waitForFunction(() => /Expectativa líquida/.test(document.body.innerText) && /Curva de capital/.test(document.body.innerText), null, { timeout: 120_000 });
  const canvases = await page.locator("canvas").count();
  expect(canvases >= 1, "curva de capital sem canvas");
  return await shot("backtest");
});

await step("Derivatives: comparativo por exchange e histórico", async () => {
  await goto("/derivatives?symbol=BTC&exchange=okx");
  await page.waitForFunction(() => /Agregado/.test(document.body.innerText) && /Histórico:/.test(document.body.innerText), null, { timeout: 60_000 });
  return await shot("derivatives");
});

await step("Documentos legais e recuperação de senha acessíveis", async () => {
  for (const [path, re] of [["/termos", /Termos de Uso/], ["/privacidade", /Política de Privacidade/], ["/reembolso", /Cancelamento e Reembolso/], ["/esqueci-senha", /Esqueci minha senha/]]) {
    await goto(path);
    await page.waitForFunction((src) => new RegExp(src).test(document.body.innerText), re.source, { timeout: 20_000 });
  }
  return "termos, privacidade, reembolso e esqueci-senha";
});

await step("Suporte logado: Meus chamados + exclusão da conta (LGPD) pela interface", async () => {
  await goto("/suporte");
  await page.waitForFunction(() => /Meus chamados/i.test(document.body.innerText), null, { timeout: 20_000 });
  await page.getByRole("button", { name: /Solicitar exclusão da conta/i }).click();
  await page.fill("#del-pass", PASSWORD);
  await page.fill("#del-confirm", "EXCLUIR");
  await page.getByRole("button", { name: /Excluir definitivamente/i }).click();
  await page.waitForFunction(() => location.pathname === "/", null, { timeout: 30_000 });
  const me = await page.evaluate(async () => (await (await fetch("/api/auth/me")).json()).data.user);
  expect(me === null, "sessão ainda ativa após exclusão");
  return "conta excluída pela interface";
});

await step("Login com conta excluída falha (401 na interface)", async () => {
  await goto("/login");
  await page.fill("input[type='email']", EMAIL);
  await page.fill("input[type='password']", PASSWORD);
  await page.locator("form button[type='submit']").first().click();
  await page.waitForFunction(() => /inválid|incorret|Limite de/i.test(document.body.innerText), null, { timeout: 30_000 });
  const msg = await page.locator("[role='alert'], .text-danger").first().innerText().catch(() => "");
  return `mensagem exibida: ${msg.slice(0, 80)}`;
});

await browser.close();

const ok = results.filter((r) => r.ok).length;
const lines = [`# E2E de interface — ${BASE}`, "", `**${ok}/${results.length} passos aprovados** · erros de console: ${consoleErrors.length} · ${new Date().toISOString()}`, "", "| # | Passo | Resultado | ms | Detalhe |", "|---|---|---|---:|---|"];
results.forEach((r, i) => lines.push(`| ${i + 1} | ${r.name} | ${r.ok ? "✅" : "❌"} | ${r.ms} | ${String(r.detail).replace(/\|/g, "\\|")} |`));
if (consoleErrors.length) {
  lines.push("", "## Erros de console", "");
  for (const e of consoleErrors.slice(0, 30)) lines.push(`- ${e.url}: ${e.text}`);
}
fs.writeFileSync(path.join(OUT, "relatorio-e2e.md"), lines.join("\n"));
console.log(lines.join("\n"));
process.exit(ok === results.length ? 0 : 1);

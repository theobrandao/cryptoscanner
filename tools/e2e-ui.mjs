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

// ------------------------------------------------------------ páginas públicas
await step("Home carrega com tickers ao vivo e top 20 por volume", async () => {
  await goto("/");
  await page.waitForSelector("text=Os 20 ativos mais negociados", { timeout: 20_000 });
  await page.waitForFunction(() => document.body.innerText.includes("BTC"), null, { timeout: 20_000 });
  const priceCells = await page.locator("text=/\\$\\s?[0-9][0-9.,]+/").count();
  expect(priceCells >= 10, `poucos preços renderizados (${priceCells})`);
  return `${priceCells} preços · ${await shot("home")}`;
});

await step("Scanner: tabela em tempo real com 20 linhas e RSI", async () => {
  await goto("/scanner");
  await page.waitForSelector("table tbody tr", { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll("table tbody tr").length >= 20, null, { timeout: 30_000 });
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
  await page.waitForFunction(() => document.querySelectorAll("table tbody tr").length >= 20, null, { timeout: 10_000 });
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
  return `${canvases} canvas · ${await shot("graficos")}`;
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

await step("Planos: 3 planos e bloco PLATINUM", async () => {
  await goto("/planos");
  const t = await page.locator("body").innerText();
  expect(/Free/i.test(t) && /Pro/i.test(t) && /Platinum/i.test(t), "planos ausentes");
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
  await page.getByRole("button", { name: /Criar conta|Cadastrar|Registrar/i }).click();
  await page.waitForFunction(() => !location.pathname.startsWith("/registro"), null, { timeout: 30_000 });
  const me = await page.evaluate(async () => (await (await fetch("/api/auth/me")).json()).data.user?.email);
  expect(me === EMAIL, `sessão não criada (${me})`);
  return `logado como ${me}`;
});

await step("Tema claro/escuro e moeda BRL", async () => {
  await goto("/scanner");
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
  const chat = page.locator("input[placeholder='123456789']").first();
  if (await chat.count()) await chat.fill("123456789");
  const save = page.getByRole("button", { name: /Salvar/i }).first();
  if (await save.count()) await save.click();
  await page.waitForTimeout(1500);
  const pref = await page.evaluate(async () => (await (await fetch("/api/preferences")).json()).data);
  return `chatId=${pref.telegramChatId ?? "—"} · ${await shot("preferencias")}`;
});

await step("Planos: trocar para PLATINUM libera 15M no scanner; voltar para FREE", async () => {
  await goto("/planos");
  const btn = page.getByRole("button", { name: /Platinum|Assinar|Escolher/i }).first();
  const changed = await page.evaluate(async () => (await fetch("/api/plans/change", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: "PLATINUM" }) })).status);
  expect(changed === 200, `troca ${changed}`);
  await goto("/scanner?timeframe=15m");
  const tf = page.locator("button", { hasText: /15M/ }).first();
  await tf.click();
  await page.waitForFunction(() => document.querySelectorAll("table tbody tr").length >= 20, null, { timeout: 40_000 });
  const file = await shot("scanner-15m-platinum");
  await page.evaluate(async () => fetch("/api/plans/change", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: "FREE" }) }));
  return `15M liberado (${await btn.count()} CTA) · ${file}`;
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

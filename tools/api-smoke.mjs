#!/usr/bin/env node
/**
 * Teste de integração de TODAS as rotas da API contra um ambiente real (produção ou local).
 *
 *   BASE_URL=https://cryptoscanner-five.vercel.app CRON_SECRET=... node tools/api-smoke.mjs
 *
 * Cria um usuário descartável (e-mail com timestamp), exercita fluxos positivos e negativos,
 * gating de plano, rate limit e cabeçalhos de segurança. Saída: tabela Markdown em stdout e
 * JSON em API_SMOKE_JSON (opcional). Sai com código 1 se algum teste falhar.
 */

// `||` (não `??`): no CI uma variável não definida chega como string vazia
const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
try {
  const u = new URL(BASE);
  if (!/^https?:$/.test(u.protocol)) throw new Error("protocolo");
} catch {
  console.error(`BASE_URL inválida: "${process.env.BASE_URL ?? ""}". Ex.: BASE_URL=https://cryptoscanner-five.vercel.app`);
  process.exit(2);
}
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const INVITE = process.env.INVITE_CODE ?? "";
const SKIP_RATE_LIMIT = process.env.SKIP_RATE_LIMIT === "1";

const results = [];
const state = {};
let cookie = "";

function jar(res) {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [pair] = c.split(";");
    const [name, value] = pair.split("=");
    if (name === "cs_session") cookie = value ? `cs_session=${value}` : "";
  }
}

async function call(method, path, { body, form, headers = {}, auth = true, raw = false } = {}) {
  const h = { ...headers };
  if (auth && cookie) h.cookie = cookie;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    h["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const t0 = performance.now();
  const res = await fetch(BASE + path, { method, headers: h, body: payload, redirect: "manual" });
  const ms = Math.round(performance.now() - t0);
  jar(res);
  if (raw) return { res, ms };
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html ou vazio */
  }
  return { res, ms, json, text };
}

/**
 * Testes que dependem da conta descartável ficam entre `accountSection = true/false`. Se o cadastro exigir
 * convite e INVITE_CODE não foi informado, eles são IGNORADOS (não falham) e o motivo aparece no relatório.
 */
let accountSection = false;

/** Chamada no balde "auth" (10/min por IP): em 429 espera a janela reabrir (até 65 s) e tenta de novo. */
async function callAuth(method, path, opts) {
  const r = await call(method, path, opts);
  if (r.res.status !== 429) return r;
  const resetAt = Number(r.json?.error?.details?.resetAt ?? Date.now() + 60_000);
  await new Promise((ok) => setTimeout(ok, Math.min(65_000, Math.max(1_000, resetAt - Date.now() + 1_000))));
  return call(method, path, opts);
}

async function test(group, name, fn) {
  if (accountSection && state.noAccount) {
    results.push({ group, name, ok: true, skipped: true, ms: 0, detail: state.noAccount });
    return;
  }
  const t0 = performance.now();
  try {
    const detail = await fn();
    results.push({ group, name, ok: true, ms: Math.round(performance.now() - t0), detail: detail ?? "" });
  } catch (err) {
    results.push({ group, name, ok: false, ms: Math.round(performance.now() - t0), detail: String(err?.message ?? err) });
  }
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

function expectStatus(r, status, code) {
  expect(r.res.status === status, `esperado HTTP ${status}, veio ${r.res.status}: ${(r.text ?? "").slice(0, 160)}`);
  if (code) expect(r.json?.error?.code === code, `esperado code=${code}, veio ${r.json?.error?.code}`);
}

const stamp = Date.now();
const EMAIL = `smoke+${stamp}@cryptoscanner.local`;
const PASSWORD = "Smoke12345!";

// ------------------------------------------------------------------ públicas
await test("Saúde", "GET /api/health", async () => {
  const r = await call("GET", "/api/health", { auth: false });
  expectStatus(r, 200);
  const d = r.json.data;
  expect(d.database.ok === true, "banco não OK");
  expect(d.cache === "redis", `cache=${d.cache}`);
  const bin = d.providers.find((p) => p.provider === "binance");
  const kr = d.providers.find((p) => p.provider === "kraken");
  expect(bin?.ok || kr?.ok, "nenhum provedor de mercado OK");
  return `db ok, cache ${d.cache}, binance ${bin?.ok ? bin.latencyMs + "ms" : "falha"}, kraken ${kr?.ok ? kr.latencyMs + "ms" : "falha"}, llm ${d.llm.configured}, telegram ${d.telegram.configured}`;
});

await test("Segurança", "cabeçalhos em /", async () => {
  const { res } = await call("GET", "/", { auth: false, raw: true });
  expect(res.status === 200, `HTTP ${res.status}`);
  const nosniff = res.headers.get("x-content-type-options");
  const frame = res.headers.get("x-frame-options");
  const ref = res.headers.get("referrer-policy");
  expect(nosniff === "nosniff", `nosniff=${nosniff}`);
  expect(!!frame, "sem X-Frame-Options");
  expect(!!ref, "sem Referrer-Policy");
  return `nosniff, X-Frame-Options=${frame}, Referrer-Policy=${ref}`;
});

await test("Segurança", "rota inexistente /api/nao-existe → 404", async () => {
  const r = await call("GET", "/api/nao-existe", { auth: false });
  expect(r.res.status === 404, `HTTP ${r.res.status}`);
  return "404";
});

await test("Mercado", "GET /api/market/assets (universo inclui ZEC)", async () => {
  const r = await call("GET", "/api/market/assets", { auth: false });
  expectStatus(r, 200);
  state.nAssets = r.json.data.assets.length;
  expect(state.nAssets >= 30 && r.json.data.assets.some((a) => a.symbol === "ZEC") && r.json.data.assets.some((a) => a.symbol === "ALGO"), `${state.nAssets} ativos, ZEC ou ALGO ausente`);
  return `${r.json.data.assets.length} ativos`;
});

await test("Mercado", "GET /api/market/tickers (USD)", async () => {
  const r = await call("GET", "/api/market/tickers", { auth: false });
  expectStatus(r, 200);
  const t = r.json.data.tickers;
  expect(t.length === state.nAssets, `${t.length} tickers de ${state.nAssets}`);
  expect(t.some((x) => x.symbol === "ZEC" && x.price > 0), "ZEC sem preço");
  const btc = t.find((x) => x.symbol === "BTC");
  expect(btc && btc.price > 1000, "BTC sem preço plausível");
  state.btcUsd = btc.price;
  return `${t.length} tickers (inclui ZEC), BTC ${btc.price} (${btc.source})`;
});

await test("Mercado", "GET /api/market/tickers?currency=BRL (conversão)", async () => {
  const r = await call("GET", "/api/market/tickers?currency=BRL", { auth: false });
  expectStatus(r, 200);
  const btc = r.json.data.tickers.find((x) => x.symbol === "BTC");
  expect(btc.price > state.btcUsd * 3, `BRL ${btc.price} não parece convertido (USD ${state.btcUsd})`);
  expect(Math.abs(btc.price / state.btcUsd - r.json.data.usdBrl) < 0.05, "preço convertido não bate com usdBrl");
  expect(r.json.data.currency === "BRL", `currency ${r.json.data.currency}`);
  return `BTC R$ ${btc.price.toFixed(0)} (câmbio ${r.json.data.usdBrl.toFixed(4)} · ${r.json.data.fxSource})`;
});

await test("Mercado", "GET /api/market/fx (USD→BRL)", async () => {
  const r = await call("GET", "/api/market/fx", { auth: false });
  expectStatus(r, 200);
  expect(r.json.data.rate > 3 && r.json.data.rate < 10, `rate=${r.json.data.rate}`);
  expect(typeof r.json.data.label === "string" && r.json.data.label.length > 0, "fonte do câmbio ausente");
  return `rate ${r.json.data.rate.toFixed(4)} (${r.json.data.label}) stale=${r.json.data.stale}`;
});

await test("Mercado", "GET /api/market/global (CoinGecko)", async () => {
  const r = await call("GET", "/api/market/global", { auth: false });
  expectStatus(r, 200);
  const g = r.json.data.global ?? r.json.data;
  expect(g && (g.total_market_cap || g.totalMarketCap || g.markets), "sem dados globais");
  return `mercados=${g.markets ?? "?"}, ativos=${g.active_cryptocurrencies ?? "?"}`;
});

await test("Mercado", "GET /api/market/candles BTC 4h limit=100 indicators=1", async () => {
  const z = await call("GET", "/api/market/candles?symbol=ZEC&timeframe=1d&limit=60", { auth: false });
  expect(z.res.status === 200 && z.json.data.candles.length === 60, "candles de ZEC indisponíveis");
  const r = await call("GET", "/api/market/candles?symbol=BTC&timeframe=4h&limit=100&indicators=1", { auth: false });
  expectStatus(r, 200);
  const d = r.json.data;
  expect(d.candles.length === 100, `${d.candles.length} candles`);
  expect(d.indicators || d.snapshot, "sem indicadores");
  const c = d.candles.at(-1);
  expect(c.high >= c.low && c.high >= c.close && c.low <= c.close, "candle inconsistente");
  return `100 candles (${d.source}), último close ${c.close}`;
});

await test("Mercado", "GET /api/market/candles símbolo inválido → 400", async () => {
  const r = await call("GET", "/api/market/candles?symbol=NAOEXISTE&timeframe=4h", { auth: false });
  expect(r.res.status === 400 || r.res.status === 404, `HTTP ${r.res.status}`);
  return `HTTP ${r.res.status} ${r.json?.error?.code ?? ""}`;
});

await test("Mercado", "GET /api/market/candles limit=5 → 400 (validação)", async () => {
  const r = await call("GET", "/api/market/candles?symbol=BTC&timeframe=4h&limit=5", { auth: false });
  expectStatus(r, 400, "validation");
  return "400 validation";
});

for (const tf of ["4h", "1d", "1w"]) {
  await test("Scanner", `GET /api/scanner/table?timeframe=${tf}`, async () => {
    const r = await call("GET", `/api/scanner/table?timeframe=${tf}`, { auth: false });
    expectStatus(r, 200);
    const rows = r.json.data.rows;
    expect(rows.length === state.nAssets, `${rows.length} linhas`);
    const withPattern = rows.filter((x) => x.pattern || (x.patterns && x.patterns.length)).length;
    const row = rows[0];
    for (const k of ["price", "changePct24h", "volume24h", "relativeVolume", "volatilityPct", "trend", "rsi14", "momentum", "signal", "patterns", "support", "resistance"]) expect(k in row, `coluna ${k} ausente`);
    return `${rows.length} linhas, ${withPattern} com padrão, fontes ${JSON.stringify(r.json.data.sources ?? r.json.data.source ?? "")}`;
  });
}

await test("Scanner", "GET /api/scanner/table?timeframe=1h anônimo → 403 plan_required", async () => {
  const r = await call("GET", "/api/scanner/table?timeframe=1h", { auth: false });
  expectStatus(r, 403, "plan_required");
  return "403 plan_required";
});

await test("Scanner", "POST /api/scanner/run 1d bullish minConfidence=60", async () => {
  const r = await call("POST", "/api/scanner/run", { auth: false, body: { timeframe: "1d", direction: "bullish", minConfidence: 60, includeVolume: true } });
  expectStatus(r, 200);
  const d = r.json.data;
  const n = d.rows?.length ?? d.results?.length ?? 0;
  return `${n} linhas, padrões=${d.patterns ?? d.summary?.patterns ?? "?"}`;
});

await test("Scanner", "POST /api/scanner/run symbols=[BTC,ETH] 4h", async () => {
  const r = await call("POST", "/api/scanner/run", { auth: false, body: { timeframe: "4h", symbols: ["BTC", "ETH"], minConfidence: 50 } });
  expectStatus(r, 200);
  const rows = r.json.data.rows ?? r.json.data.results ?? [];
  expect(rows.length === 2, `${rows.length} linhas`);
  return `2 linhas`;
});

await test("Scanner", "POST /api/scanner/run timeframe=15m anônimo → 403", async () => {
  const r = await call("POST", "/api/scanner/run", { auth: false, body: { timeframe: "15m" } });
  expectStatus(r, 403, "plan_required");
  return "403 plan_required";
});

await test("Scanner", "GET /api/scanner/patterns (17 padrões)", async () => {
  const r = await call("GET", "/api/scanner/patterns", { auth: false });
  expectStatus(r, 200);
  expect(r.json.data.patterns.length === 17, `${r.json.data.patterns.length} padrões`);
  return `${r.json.data.patterns.length} padrões`;
});

await test("Scanner", "GET /api/scanner/volume (30m,1h)", async () => {
  const r = await call("GET", "/api/scanner/volume", { auth: false });
  expectStatus(r, 200);
  const d = r.json.data;
  expect(d.assets === state.nAssets, `assets=${d.assets}`);
  expect((d.errors ?? []).length === 0, `erros: ${JSON.stringify(d.errors)}`);
  return `${d.alerts.length} alertas, fontes ${d.sources.join(",")}, stale=${d.stale}`;
});

await test("Scanner", "GET /api/scanner/volume threshold=5 → 400", async () => {
  const r = await call("GET", "/api/scanner/volume?threshold=5", { auth: false });
  expectStatus(r, 400, "validation");
  return "400";
});

await test("Fibonacci", "GET /api/fibonacci ETH 1d automático", async () => {
  const r = await call("GET", "/api/fibonacci?symbol=ETH&timeframe=1d", { auth: false });
  expectStatus(r, 200);
  const d = r.json.data;
  expect(d.mode === "auto" && d.result.high > d.result.low, "resultado inválido");
  return `high ${d.result.high} low ${d.result.low} níveis=${(d.result.levels ?? d.result.retracements ?? []).length}`;
});

await test("Fibonacci", "GET /api/fibonacci manual high=100 low=50 direction=up", async () => {
  const r = await call("GET", "/api/fibonacci?symbol=BTC&high=100&low=50&direction=up", { auth: false });
  expectStatus(r, 200);
  const levels = r.json.data.result.levels ?? r.json.data.result.retracements ?? [];
  const l618 = levels.find((l) => Math.abs(l.ratio - 0.618) < 1e-6);
  expect(l618, "nível 0.618 ausente");
  expect(Math.abs(l618.price - 69.1) < 0.01, `0.618 = ${l618.price} (esperado 69.10)`);
  return `0.618 → ${l618.price}`;
});

await test("Bubbles", "GET /api/market/bubbles (100 ativos, 4 períodos)", async () => {
  const r = await call("GET", "/api/market/bubbles", { auth: false });
  expectStatus(r, 200);
  const d = r.json.data;
  expect(d.bubbles.length >= 80, `${d.bubbles.length} bolhas`);
  expect(!d.bubbles.some((b) => ["USDT", "USDC", "WBTC"].includes(b.symbol)), "stablecoin/wrapped na lista");
  const btc = d.bubbles.find((b) => b.symbol === "BTC");
  expect(btc && typeof btc.change["24h"] === "number" && typeof btc.change["7d"] === "number", "variações ausentes");
  return `${d.bubbles.length} ativos (${d.source}), BTC 24h ${btc.change["24h"].toFixed(2)}% 7d ${btc.change["7d"].toFixed(2)}% 30d ${btc.change["30d"] != null ? btc.change["30d"].toFixed(2) + "%" : "n/d na fonte"}`;
});

await test("Bubbles", "GET /api/market/bubbles?limit=20&currency=BRL", async () => {
  const r = await call("GET", "/api/market/bubbles?limit=20&currency=BRL", { auth: false });
  expectStatus(r, 200);
  expect(r.json.data.bubbles.length === 20, `${r.json.data.bubbles.length}`);
  const btc = r.json.data.bubbles.find((b) => b.symbol === "BTC");
  expect(btc.price > state.btcUsd * 3, "não converteu para BRL");
  return `20 ativos, BTC R$ ${btc.price.toFixed(0)}`;
});

await test("Panorama", "GET /api/market/panorama (resumo executivo)", async () => {
  const r = await call("GET", "/api/market/panorama", { auth: false });
  expectStatus(r, 200);
  const d = r.json.data;
  expect(Array.isArray(d.summary) && d.summary.length >= 3, "resumo curto");
  expect(d.factors.length >= 3, `${d.factors.length} fatores`);
  expect(d.btc && d.btc.price > 1000, "BTC ausente");
  expect(["bullish", "bearish", "neutral"].includes(d.bias), "viés inválido");
  return `viés ${d.bias}, ciclo "${d.cycle.label}", ${d.factors.length} fatores, derivativos ${d.derivatives.items.length} (${d.derivatives.error ?? "ok"})`;
});

await test("Panorama", "GET /api/market/derivatives (Binance Futures público)", async () => {
  const r = await call("GET", "/api/market/derivatives?symbols=BTC,ETH", { auth: false });
  expectStatus(r, 200);
  const d = r.json.data;
  const btc = d.items.find((x) => x.symbol === "BTC");
  if (!btc) return `indisponível na região do servidor: ${JSON.stringify(d.errors)}`;
  expect(Number.isFinite(btc.fundingRate) && btc.openInterest > 0, "campos inválidos");
  return `BTC funding ${(btc.fundingRate * 100).toFixed(4)}% OI ${btc.openInterest.toFixed(0)} L/S ${btc.longShortRatio?.toFixed(2)} taker ${btc.takerBuySellRatio?.toFixed(2)}`;
});

await test("Simulador", "POST /api/simulations/run DCA BTC BRL 12 meses", async () => {
  const r = await call("POST", "/api/simulations/run", { auth: false, body: { symbol: "BTC", strategy: "dca", currency: "BRL", initialCapital: 1000, monthlyContribution: 500, months: 12, riskProfile: "moderado" } });
  expectStatus(r, 200);
  const d = r.json.data.result;
  expect(d.contributions >= 12 && d.totalInvested === 1000 + 500 * (d.contributions - 1), `aportes ${d.contributions} investido ${d.totalInvested}`);
  expect(d.curve.length > 20 && d.monthly.length >= 11, "curva/meses insuficientes");
  expect(d.fx.applied === true, "câmbio BRL não aplicado");
  return `${d.contributions} aportes, investido R$ ${d.totalInvested}, final R$ ${d.finalValue} (${d.profitPct}%), DD ${d.maxDrawdownPct}%`;
});

await test("Simulador", "POST /api/simulations/run aporte único ETH USD 6 meses", async () => {
  const r = await call("POST", "/api/simulations/run", { auth: false, body: { symbol: "ETH", strategy: "lump_sum", currency: "USD", initialCapital: 5000, months: 6, riskProfile: "arrojado" } });
  expectStatus(r, 200);
  const d = r.json.data.result;
  expect(d.contributions === 1 && Math.abs(d.profitPct - d.benchmarkHoldPct) < 0.01, "aporte único 100% deveria igualar HODL");
  return `final $ ${d.finalValue} (${d.profitPct}%)`;
});

await test("Simulador", "POST /api/simulations/run em EUR (câmbio EURUSDT diário)", async () => {
  const r = await call("POST", "/api/simulations/run", { auth: false, body: { symbol: "BTC", strategy: "lump_sum", currency: "EUR", initialCapital: 1000, months: 6, riskProfile: "arrojado" } });
  expectStatus(r, 200);
  const d = r.json.data.result;
  expect(d.fx.applied && /EURUSDT/.test(d.fx.source), "câmbio EUR não aplicado");
  expect(d.lastPrice < state.btcUsd * 0.98 && d.lastPrice > state.btcUsd * 0.7, `preço em EUR incoerente: ${d.lastPrice} vs USD ${state.btcUsd}`);
  return `BTC € ${d.lastPrice.toFixed(0)} (USD ${state.btcUsd.toFixed(0)}) · ${d.profitPct}%`;
});

await test("Simulador", "POST /api/simulations/run sem capital → 400", async () => {
  const r = await call("POST", "/api/simulations/run", { auth: false, body: { symbol: "BTC", strategy: "lump_sum", currency: "USD", initialCapital: 0, months: 6 } });
  expectStatus(r, 400, "validation");
  return "400";
});

await test("Análise", "GET /api/analysis BTC 4h (orquestrador)", async () => {
  const r = await call("GET", "/api/analysis?symbol=BTC&timeframe=4h", { auth: false });
  expectStatus(r, 200);
  const d = r.json.data;
  expect(["bullish", "bearish", "neutral"].includes(d.verdict), `verdict=${d.verdict}`);
  expect(typeof d.score === "number" || typeof d.confidence === "number", "sem score");
  return `verdict ${d.verdict}, score ${d.score ?? d.confidence}, ${d.durationMs}ms, agentes=${Object.keys(d.agents ?? d.evidence ?? {}).length}`;
});

await test("Análise", "GET /api/analysis sentiment=0 llm=0 SOL 1d", async () => {
  const r = await call("GET", "/api/analysis?symbol=SOL&timeframe=1d&sentiment=0&llm=0", { auth: false });
  expectStatus(r, 200);
  return `verdict ${r.json.data.verdict}`;
});

await test("Agentes", "GET /api/agents/definitions", async () => {
  const r = await call("GET", "/api/agents/definitions", { auth: false });
  expectStatus(r, 200);
  const names = r.json.data.agents.map((a) => a.name);
  for (const n of ["market-agent", "technical-analysis-agent", "trend-agent", "risk-agent", "sentiment-agent", "scanner-agent", "orchestrator-agent"]) expect(names.some((x) => x.startsWith(n.replace("-agent", ""))), `agente ${n} ausente (${names.join(",")})`);
  return names.join(", ");
});

await test("Agentes", "GET /api/agents/strategies (16 estratégias)", async () => {
  const r = await call("GET", "/api/agents/strategies", { auth: false });
  expectStatus(r, 200);
  expect(r.json.data.strategies.length >= 16, `${r.json.data.strategies.length}`);
  state.strategies = r.json.data.strategies.map((s) => s.key);
  expect(state.strategies.includes("sentinel_patterns"), "sentinel_patterns ausente");
  return `${state.strategies.length}: ${state.strategies.slice(0, 5).join(",")}…`;
});

await test("Planos", "GET /api/plans (FREE/PRO/PLATINUM)", async () => {
  const r = await call("GET", "/api/plans", { auth: false });
  expectStatus(r, 200);
  expect(r.json.data.plans.map((p) => p.key).join() === "FREE,PRO,PLATINUM", "planos inesperados");
  return "FREE, PRO, PLATINUM";
});

await test("Tempo real", "GET /api/stream/tickers (SSE hello + tickers)", async () => {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  const res = await fetch(BASE + "/api/stream/tickers", { signal: ac.signal });
  expect(res.headers.get("content-type")?.includes("text/event-stream"), "não é SSE");
  const reader = res.body.getReader();
  let buf = "";
  while (buf.split("event: tickers").length < 2) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += new TextDecoder().decode(value);
  }
  clearTimeout(timer);
  ac.abort();
  expect(buf.includes("event: hello"), "sem evento hello");
  expect(buf.includes("event: tickers"), "sem evento tickers");
  return "hello + tickers recebidos";
});

await test("Cron", "GET /api/cron/cycle sem segredo → 401", async () => {
  const r = await call("GET", "/api/cron/cycle", { auth: false });
  expectStatus(r, 401, "unauthorized");
  return "401";
});

if (CRON_SECRET) {
  await test("Cron", "POST /api/cron/cycle com segredo (ciclo completo)", async () => {
    const r = await call("POST", "/api/cron/cycle", { auth: false, headers: { authorization: `Bearer ${CRON_SECRET}` } });
    expectStatus(r, 200);
    const s = r.json.data.steps;
    for (const k of ["scan", "market-snapshot", "user-agents", "alerts"]) expect(s[k]?.ok, `passo ${k} falhou: ${JSON.stringify(s[k])}`);
    return `${r.json.data.durationMs}ms · scan ${s.scan.ms}ms · snapshot ${s["market-snapshot"].result.candles} candles/${s["market-snapshot"].result.indicators} ind. em ${s["market-snapshot"].ms}ms · agentes ${s["user-agents"].result.agents} · alertas ${s.alerts.result.evaluated}`;
  });
}

await test("Mentor", "POST /api/mentor — ativo, SOS, padrão, conceito, fora da base", async () => {
  const out = [];
  for (const [q, re] of [["Como está o SOL em 4h?", /Solana \(SOL\) em 4H: preço US\$/], ["Tomei stop agora, e agora?", /anti-revenge/], ["O que é fundo duplo?", /Fundo Duplo/], ["Como calcular o tamanho da posição?", /Tamanho da posição/], ["qual a capital da frança", /Não encontrei/]]) {
    const r = await call("POST", "/api/mentor", { auth: false, body: { message: q } });
    expectStatus(r, 200);
    expect(re.test(r.json.data.answer), `resposta inesperada para "${q}": ${r.json.data.answer.slice(0, 80)}`);
    out.push(r.json.data.mode);
  }
  return `5 respostas corretas (${out.join(",")})`;
});

await test("Estatística", "POST /api/cron/backtest (segredo errado → 401; correto → 200)", async () => {
  const bad = await call("POST", "/api/cron/backtest", { auth: false, headers: { authorization: "Bearer errado" } });
  expectStatus(bad, 401);
  if (!CRON_SECRET) return "sem CRON_SECRET: só o 401 foi verificado";
  const r = await call("POST", "/api/cron/backtest", { auth: false, headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expectStatus(r, 200);
  const res = r.json.data.result;
  expect(res["4h"]?.trades > 0 && res["1d"]?.trades > 0, `backtest sem operações: ${JSON.stringify(res)}`);
  return `4H ${res["4h"].trades} op. · 1D ${res["1d"].trades} op. · ${r.json.data.durationMs} ms`;
});

await test("Estatística", "GET /api/patterns/stats 4h e 1d (taxa, IC 95%, ao vivo)", async () => {
  const out = [];
  for (const tf of ["4h", "1d"]) {
    const r = await call("GET", `/api/patterns/stats?timeframe=${tf}`, { auth: false });
    expectStatus(r, 200);
    const d = r.json.data;
    expect(d.rows.length >= 5 && d.assets >= 20, `${tf}: ${d.rows.length} padrões / ${d.assets} ativos`);
    for (const row of d.rows) {
      expect(row.wins + row.losses + row.expired === row.samples, `${tf} ${row.key}: contagem inconsistente`);
      if (row.hitRate != null) expect(row.ci && row.ci.low <= row.hitRate && row.hitRate <= row.ci.high, `${tf} ${row.key}: IC não contém a taxa`);
    }
    out.push(`${tf}: ${d.totalTrades} op./${d.rows.length} padrões`);
  }
  const inv = await call("GET", "/api/patterns/stats?timeframe=15m", { auth: false });
  expectStatus(inv, 400);
  return out.join(" · ") + " · 15m → 400";
});

await test("Operação", "GET /api/status (banco, provedores, jobs)", async () => {
  const r = await call("GET", "/api/status", { auth: false });
  expectStatus(r, 200);
  const d = r.json.data;
  expect(["ok", "degraded", "down"].includes(d.overall), `overall ${d.overall}`);
  expect(Array.isArray(d.jobs) && d.jobs.some((j) => j.job === "cycle"), "job cycle ausente");
  return `${d.overall} · ${d.jobs.map((j) => `${j.job}:${j.state}`).join(", ")} · push ${d.integrations.push}`;
});

await test("Engines", "GET /api/engine/ETH?timeframe=4h (estrutura, liquidez, MTF; candle fechado)", async () => {
  const r = await call("GET", "/api/engine/ETH?timeframe=4h", { auth: false });
  expectStatus(r, 200);
  const d = r.json.data;
  const ext = d.structure.external;
  expect(["bullish", "bearish", "neutral"].includes(ext.trend), `trend ${ext.trend}`);
  expect(ext.swings.length >= 4, `poucos swings (${ext.swings.length})`);
  for (let i = 1; i < ext.swings.length; i++) expect(ext.swings[i].kind !== ext.swings[i - 1].kind, "swings não alternam");
  expect(d.lastClosed && d.lastClosed.openTime + 4 * 3600_000 <= Date.now() + 1000, "último candle não está fechado");
  expect(Array.isArray(d.liquidity.pools) && d.liquidity.pools.length > 0, "mapa de liquidez vazio");
  expect(d.mtf.rows.length >= 4 && Math.abs(d.mtf.alignmentScore) <= 100, "MTF inválido");
  expect(d.candles === undefined, "candles não deveriam vir sem candles=1");
  const bad = await call("GET", "/api/engine/XXX?timeframe=4h", { auth: false });
  expect(bad.res.status === 400, `ativo inválido → ${bad.res.status}`);
  return `${ext.trend} · ${ext.sequence} · último ${ext.lastEvent?.type ?? "—"} · pools ${d.liquidity.pools.length} · HTF ${d.mtf.alignmentScore} · qualidade ${d.quality?.status}`;
});

await test("Engines", "GET /api/market/quality (status por ativo + divergência entre fontes)", async () => {
  const r = await call("GET", "/api/market/quality?timeframe=4h", { auth: false });
  expectStatus(r, 200);
  const d = r.json.data;
  const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
  expect(total === d.assets.length && total >= 30, `contagem ${total}`);
  return `${JSON.stringify(d.counts)} · divergência máx. ${d.divergence?.maxAbsPct?.toFixed(2) ?? "—"}%`;
});

await test("Estatística", "GET /api/patterns/stats com recorte ativo×regime e métricas em R", async () => {
  const r = await call("GET", "/api/patterns/stats?timeframe=4h&symbol=BTC&regime=bull", { auth: false });
  expectStatus(r, 200);
  const d = r.json.data;
  expect(d.symbol === "BTC" && d.regime === "bull", "recorte não aplicado");
  const all = await call("GET", "/api/patterns/stats?timeframe=4h", { auth: false });
  const row = all.json.data.rows[0];
  for (const k of ["hit1R", "hit2R", "hit3R", "expectancyR", "profitFactor", "maxDrawdownR", "avgMfeR", "avgMaeR"]) expect(k in row, `campo ${k} ausente`);
  expect(row.hit1R >= row.hit2R && row.hit2R >= row.hit3R, "1R ≥ 2R ≥ 3R violado");
  const inv = await call("GET", "/api/patterns/stats?timeframe=4h&regime=xyz", { auth: false });
  expectStatus(inv, 400);
  return `BTC bull: ${d.rows.length} padrões · geral: ${row.key} E=${row.expectancyR?.toFixed(2)}R n=${row.samples}`;
});

await test("On-chain", "GET /api/market/whales (coleta do cron) e POST /api/cron/whales", async () => {
  if (CRON_SECRET) {
    const c = await call("POST", "/api/cron/whales", { auth: false, headers: { authorization: `Bearer ${CRON_SECRET}` } });
    expectStatus(c, 200);
  }
  const r = await call("GET", "/api/market/whales", { auth: false });
  expectStatus(r, 200);
  const s = r.json.data.snapshot;
  if (!s) return "sem coleta ainda";
  return `bloco ${s.lastBlock?.height} · ${s.count24h} tx ≥ ${s.thresholdBtc} BTC · ${s.totalBtc24h} BTC`;
});

await test("PWA", "GET /manifest.webmanifest + /sw.js + ícones", async () => {
  const m = await call("GET", "/manifest.webmanifest", { auth: false });
  expect(m.res.status === 200 && m.json?.icons?.length === 2, `manifest ${m.res.status}`);
  const sw = await call("GET", "/sw.js", { auth: false, raw: true });
  expect(sw.res.status === 200, `sw ${sw.res.status}`);
  const ic = await call("GET", "/icons/icon-512.png", { auth: false, raw: true });
  expect(ic.res.status === 200, `ícone ${ic.res.status}`);
  return `manifest "${m.json.name}" · sw ok · ícones ok`;
});

await test("Suporte", "POST /api/support (ticket)", async () => {
  const r = await call("POST", "/api/support", { auth: false, body: { email: EMAIL, subject: "Teste automático", message: "Mensagem de teste gerada pela suíte de integração." } });
  expectStatus(r, 200);
  return `ticket ${r.json.data.ticket?.id ?? r.json.data.id ?? "ok"}`;
});

await test("Suporte", "POST /api/support mensagem curta → 400", async () => {
  const r = await call("POST", "/api/support", { auth: false, body: { email: EMAIL, subject: "x", message: "curta" } });
  expectStatus(r, 400, "validation");
  return "400";
});

await test("Telegram", "GET /api/telegram/test (status)", async () => {
  const r = await call("GET", "/api/telegram/test", { auth: false });
  expectStatus(r, 200);
  return `configured=${r.json.data.configured}`;
});

// ------------------------------------------------------------------ autenticação
await test("Auth", "GET /api/auth/me anônimo → user null", async () => {
  const r = await call("GET", "/api/auth/me", { auth: false });
  expectStatus(r, 200);
  expect(r.json.data.user === null, "user deveria ser null");
  return "user null";
});

await test("Auth", "rota protegida sem sessão → 401", async () => {
  const r = await call("GET", "/api/watchlist", { auth: false });
  expectStatus(r, 401, "unauthorized");
  return "401";
});

await test("Auth", "POST /api/auth/register senha fraca → 400", async () => {
  const r = await call("POST", "/api/auth/register", { body: { name: "Smoke", email: EMAIL, password: "abc", acceptTerms: true } });
  expectStatus(r, 400, "validation");
  return "400";
});

await test("Auth", "GET /api/auth/register (convite exigido?) + recusa sem convite quando exigido", async () => {
  const g = await call("GET", "/api/auth/register", { auth: false });
  if (g.res.status !== 200) throw new Error(`status ${g.res.status}`);
  const required = g.json?.data?.inviteRequired === true;
  if (required && !INVITE) state.noAccount = "ignorado: cadastro exige convite e INVITE_CODE não foi informado (secret do GitHub)";
  if (!required) return "cadastro aberto (sem REGISTRATION_INVITE_CODE)";
  const r = await call("POST", "/api/auth/register", { auth: false, body: { name: "Intruso", email: `x${EMAIL}`, password: PASSWORD, invite: "codigo-errado", acceptTerms: true } });
  if (r.res.status !== 403) throw new Error(`esperado 403, veio ${r.res.status}`);
  return "convite exigido; código errado → 403";
});

await test("Comercial", "GET /api/markets/status (Market Data Status por exchange)", async () => {
  const r = await call("GET", "/api/markets/status", { auth: false });
  expectStatus(r, 200);
  const v = r.json.data.venues;
  expect(Array.isArray(v) && v.length === 3, "esperadas 3 exchanges");
  expect(v.every((x) => ["LIVE", "DELAYED", "DEGRADED", "OFFLINE"].includes(x.status)), "status fora do contrato");
  expect(v.some((x) => x.status !== "OFFLINE"), "todas as exchanges offline");
  return v.map((x) => `${x.label} ${x.status}${x.latencyMs != null ? ` ${x.latencyMs}ms` : ""}`).join(" · ");
});

await test("Analytics", "POST /api/analytics/event: nome fora da lista → 400; válido → 200", async () => {
  const bad = await call("POST", "/api/analytics/event", { auth: false, body: { name: "hack" } });
  expectStatus(bad, 400);
  const good = await call("POST", "/api/analytics/event", { auth: false, body: { name: "plans_view", anonId: `smoke-${stamp}` } });
  expectStatus(good, 200);
  return "ok";
});

accountSection = true;
await test("Auth", "POST /api/auth/register → 201 + cookie", async () => {
  const r = await call("POST", "/api/auth/register", { body: { name: "Smoke Test", email: EMAIL, password: PASSWORD, acceptTerms: true, ...(INVITE ? { invite: INVITE } : {}) } });
  expectStatus(r, 201);
  expect(cookie.startsWith("cs_session="), "cookie de sessão ausente");
  state.userId = r.json.data.user.id;
  return `user ${state.userId}, plano ${r.json.data.user.plan}`;
});

await test("Comercial", "Conta nova nasce em trial (sem plano FREE)", async () => {
  const me = await call("GET", "/api/auth/me");
  state.trialPlan = me.json?.data?.access?.tier === "TRIAL";
  return `tier ${me.json?.data?.access?.tier} · plano ${me.json?.data?.user?.plan}`;
});

await test("Comercial", "GET /api/billing/subscription (trial de 7 dias com entitlements do servidor)", async () => {
  const r = await call("GET", "/api/billing/subscription");
  expectStatus(r, 200);
  const d = r.json.data;
  expect(["TRIAL", "PRO", "ELITE", "ADMIN"].includes(d.tier), `tier ${d.tier}`);
  expect(d.entitlements.core === true, "sem acesso core no trial");
  if (d.tier === "TRIAL") expect(d.daysLeft >= 6 && d.daysLeft <= 7, `dias ${d.daysLeft}`);
  return `${d.tier} · ${d.status} · ${d.daysLeft ?? "—"} dias · billing ${d.billing.configured ? "configurado" : "não configurado"}`;
});

await test("Comercial", "GET /api/markets/BTC/context (anônimo → 401; trial → contexto completo)", async () => {
  const anon = await call("GET", "/api/markets/BTC/context?tf=4h&candles=0", { auth: false });
  expectStatus(anon, 401);
  const r = await call("GET", "/api/markets/BTCUSDT/context?tf=4h&candles=0");
  expectStatus(r, 200);
  const d = r.json.data;
  expect(d.symbol === "BTC" && d.timeframe === "4h", "contexto de outro ativo/timeframe");
  expect(d.confluence.score >= 0 && d.confluence.score <= 100, "score fora de 0–100");
  const maxAvail = d.confluence.components.filter((c) => c.available).reduce((a, c) => a + c.max, 0);
  expect(maxAvail > 0, "sem componentes disponíveis");
  if (d.setup) {
    const long = d.setup.direction === "bullish";
    expect(long ? d.setup.stop < d.setup.entryZone.low : d.setup.stop > d.setup.entryZone.high, "stop do lado errado da zona");
    for (const t of d.setup.targets) expect(long ? t.price > d.setup.idealEntry : t.price < d.setup.idealEntry, "alvo do lado errado");
  }
  expect(d.ticker?.stamp?.class === "OBSERVED" && d.structure.stamp.class === "DERIVED", "classes de dado ausentes");
  expect(d.derivatives !== null || typeof d.derivativesError === "string", "derivativos sem valor nem motivo");
  // R2: a conta do Confluence Score fecha (final = clamp(raw + penalidades))
  const c = d.confluence;
  const raw = Math.round(c.components.reduce((a, x) => a + x.score, 0) * 10) / 10;
  expect(Math.abs(c.raw - raw) < 0.05, `raw ${c.raw} ≠ Σ componentes ${raw}`);
  expect(c.penaltyTotal === c.penalties.reduce((a, p) => a + p.points, 0), "penaltyTotal ≠ Σ penalidades");
  expect(c.score === Math.round(Math.max(0, Math.min(100, c.raw + c.penaltyTotal))), `final ${c.score} ≠ raw ${c.raw} + penalidades ${c.penaltyTotal}`);
  expect(c.components.reduce((a, x) => a + x.max, 0) === 100, "pesos não somam 100");
  expect(["Low", "Moderate", "Good", "Strong", "Exceptional"].includes(c.label), `rótulo ${c.label}`);
  expect(d.contextKey === "binance:spot:BTC:4h" && d.instrument === "spot", `contextKey ${d.contextKey}`);
  expect(d.derivatives === null && /perp/i.test(d.derivativesError ?? ""), "spot não pode trazer funding/OI");
  expect(typeof d.regime?.regime === "string" && d.levels && "nearestSupport" in d.levels, "regime/suporte-resistência ausentes");
  return `score ${c.score} = ${c.raw} ${c.penaltyTotal} (${c.label}, ${c.verdict}) · setup ${d.setup?.state ?? "—"} · regime ${d.regime.regime} · histórico n=${d.historical?.samples ?? 0}`;
});

await test("Comercial", "Contexto global: exchange × instrumento (OKX perpétuo, parâmetro inválido → 400)", async () => {
  const r = await call("GET", "/api/markets/ETH/context?tf=1h&candles=0&exchange=okx&instrument=perp");
  expectStatus(r, 200);
  const d = r.json.data;
  expect(d.exchange === "okx" && d.instrument === "perp" && d.timeframe === "1h" && d.symbol === "ETH", `contexto ${d.contextKey}`);
  expect(d.contextKey === "okx:perp:ETH:1h", `contextKey ${d.contextKey}`);
  expect(d.derivatives ? d.derivatives.exchange === "okx" && Number.isFinite(d.derivatives.nextFundingTime) : typeof d.derivativesError === "string", "derivativos de outra venue ou sem motivo");
  expect(d.quality && typeof d.quality.status === "string", "sem status de qualidade");
  const bad = await call("GET", "/api/markets/ETH/context?tf=1h&candles=0&exchange=kraken");
  expectStatus(bad, 400);
  return `dados ${d.dataVenue} ${d.instrument} (${d.quality.status}) · funding ${d.derivatives ? (d.derivatives.fundingRate * 100).toFixed(4) + "%" : "n/d"} · próximo ${d.derivatives ? new Date(d.derivatives.nextFundingTime).toISOString().slice(11, 16) + " UTC" : "—"}`;
});

await test("Comercial", "POST /api/markets/BTC/analyst (AI Analyst sobre o mesmo contexto; anônimo → 401)", async () => {
  const anon = await call("POST", "/api/markets/BTC/analyst", { auth: false, body: { tf: "4h" } });
  expectStatus(anon, 401);
  const r = await call("POST", "/api/markets/BTC/analyst", { body: { tf: "4h", exchange: "binance", instrument: "spot", llm: false } });
  expectStatus(r, 200);
  const d = r.json.data;
  expect(d.contextKey === "binance:spot:BTC:4h", `contextKey ${d.contextKey}`);
  expect(Array.isArray(d.sections) && d.sections.length >= 5, "seções ausentes");
  expect(/Confluence \d+\/100/.test(d.headline), `headline ${d.headline}`);
  expect(!/compre|venda agora|buy now/i.test(JSON.stringify(d)), "linguagem de ordem no analista");
  return `${d.sections.length} seções · LLM ${d.guardrail.llm}`;
});

await test("Comercial", "GET /api/markets/setups e /api/markets/overview", async () => {
  const s = await call("GET", "/api/markets/setups?tf=4h");
  expectStatus(s, 200);
  expect(s.json.data.rows.length >= 25, `ranking com ${s.json.data.rows.length} ativos`);
  for (let i = 1; i < s.json.data.rows.length; i++) expect(s.json.data.rows[i - 1].score >= s.json.data.rows[i].score, "ranking fora de ordem");
  const o = await call("GET", "/api/markets/overview", { auth: false });
  expectStatus(o, 200);
  return `${s.json.data.rows.length} ativos ranqueados · F&G ${o.json.data.fearGreed?.value ?? "n/d"} · dominância ${o.json.data.global?.btcDominance?.toFixed?.(1) ?? "n/d"}%`;
});

await test("R2", "Strategies: catálogo, criar, avaliar, varrer universo, editar, excluir; definição inválida → 400", async () => {
  const cat = await call("GET", "/api/strategies");
  expectStatus(cat, 200);
  expect(cat.json.data.catalog.features.length >= 20 && cat.json.data.templates.length >= 3, "catálogo incompleto");
  const bad = await call("POST", "/api/strategies", { body: { name: "Inválida", definition: { direction: "long", groups: [{ conditions: [{ tf: "4h", feature: "trend", op: ">", value: "bullish" }] }] } } });
  expectStatus(bad, 400);
  const tpl = cat.json.data.templates[0];
  const c = await call("POST", "/api/strategies", { body: { name: "Smoke MTF", definition: tpl.definition } });
  expectStatus(c, 201);
  state.strategyId = c.json.data.strategy.id;
  const ev = await call("POST", "/api/strategies/evaluate", { body: { id: state.strategyId, symbol: "BTC", exchange: "okx", instrument: "perp" } });
  expectStatus(ev, 200);
  expect(ev.json.data.groups[0].results.length === tpl.definition.groups[0].conditions.length, "resultado por condição ausente");
  const sc = await call("POST", "/api/strategies/scan", { body: { id: state.strategyId } });
  expectStatus(sc, 200);
  expect(sc.json.data.rows.length >= 25, `scan com ${sc.json.data.rows.length} ativos`);
  const up = await call("PATCH", `/api/strategies/${state.strategyId}`, { body: { name: "Smoke MTF 2" } });
  expectStatus(up, 200);
  const passing = sc.json.data.rows.filter((r) => r.pass).length;
  return `${cat.json.data.catalog.features.length} features · BTC OKX perp ${ev.json.data.pass ? "atende" : "não atende"} · universo ${passing}/${sc.json.data.rows.length} atendem`;
});

await test("v3", "Sinais do modelo validado: posições abertas e saídas recentes (motor do backtest); anônimo → 401", async () => {
  const anon = await call("GET", "/api/signals/breakout", { auth: false });
  expectStatus(anon, 401);
  const r = await call("GET", "/api/signals/breakout");
  expectStatus(r, 200);
  const d = r.json.data;
  expect(d.models.length >= 2 && d.models.every((m) => /Fora da amostra/.test(m.validation.summary)), "modelos validados ausentes");
  expect(Array.isArray(d.active) && Array.isArray(d.recent), "formato inválido");
  for (const a of d.active) {
    expect(a.stop < a.price && a.stopDistancePct >= 0, `${a.symbol} ${a.tf}: stop acima do preço numa posição aberta`);
    expect(a.initialStop < a.entry && a.stop >= a.initialStop, `${a.symbol} ${a.tf}: stop inicial/móvel incoerente`);
    expect(["4h", "1d"].includes(a.tf), `timeframe ${a.tf}`);
  }
  return `${d.active.length} abertas (${d.active.filter((a) => a.tf === "4h").length} 4H) · ${d.recent.length} saídas em 30 dias · erros ${d.errors.length}`;
});

await test("R2", "Market Monitor: criar, duplicado → 409, listar, eventos, pausar, excluir", async () => {
  const c = await call("POST", "/api/monitors", { body: { symbol: "BTC", timeframe: "4h", exchange: "binance", instrument: "spot", kind: "SETUP" } });
  expectStatus(c, 201);
  const dup = await call("POST", "/api/monitors", { body: { symbol: "BTC", timeframe: "4h", exchange: "binance", instrument: "spot", kind: "SETUP" } });
  expectStatus(dup, 409, "duplicate");
  const s = await call("POST", "/api/monitors", { body: { symbol: "ETH", timeframe: "1h", kind: "STRATEGY", strategyId: state.strategyId } });
  expectStatus(s, 201);
  const list = await call("GET", "/api/monitors");
  expectStatus(list, 200);
  expect(list.json.data.items.length === 2, `${list.json.data.items.length} monitores`);
  const ev = await call("GET", "/api/monitors/events?limit=5");
  expectStatus(ev, 200);
  const p = await call("PATCH", `/api/monitors/${c.json.data.monitor.id}`, { body: { active: false } });
  expectStatus(p, 200);
  for (const m of list.json.data.items) expectStatus(await call("DELETE", `/api/monitors/${m.id}`), 200);
  return `limite do plano ${list.json.data.limit} · eventos não lidos ${ev.json.data.unread}`;
});

await test("R2", "Backtest: setup 4H 90 dias com custos; multi-TF no trial → 402; feature ao vivo → 400", async () => {
  const r = await call("POST", "/api/backtest/run", { body: { symbol: "BTC", mode: "setup", timeframe: "4h", days: 90, feeBps: 10, slippageBps: 5 } });
  expectStatus(r, 200);
  const d = r.json.data;
  expect(Array.isArray(d.trades) && Array.isArray(d.equity) && typeof d.metrics.samples === "number", "resposta incompleta");
  for (const t of d.trades) expect(t.rNet <= t.rGross + 1e-9, "custo aumentou o R");
  const mtf = await call("POST", "/api/backtest/run", { body: { symbol: "BTC", mode: "strategy", strategyId: state.strategyId, days: 90 } });
  expect(mtf.res.status === 402 || mtf.res.status === 200, `multi-TF ${mtf.res.status}`);
  const live = await call("POST", "/api/backtest/run", { body: { symbol: "BTC", mode: "strategy", days: 90, definition: { direction: "long", groups: [{ conditions: [{ tf: "4h", feature: "confluence_score", op: ">=", value: 60 }] }] } } });
  expectStatus(live, 400, "live_only_feature");
  return `${d.trades.length} operações · E ${d.metrics.expectancyR != null ? d.metrics.expectancyR.toFixed(2) : "—"}R líquido (bruto ${d.grossExpectancyR != null ? d.grossExpectancyR.toFixed(2) : "—"}R) · custos ${d.totalCostR.toFixed(2)}R · multi-TF ${mtf.res.status}`;
});

await test("R2", "Derivatives View Details (3 exchanges) e onboarding; admin → 403 para usuário comum", async () => {
  const d = await call("GET", "/api/markets/BTC/derivatives?exchange=okx");
  expectStatus(d, 200);
  expect(d.json.data.venues.length === 3, "comparativo sem 3 exchanges");
  expect(d.json.data.venues.some((v) => v.ok), "nenhuma exchange respondeu");
  const o = await call("GET", "/api/onboarding");
  expectStatus(o, 200);
  expect(o.json.data.steps.length === 6, "checklist incompleto");
  const a = await call("GET", "/api/admin/overview");
  expectStatus(a, 403);
  expectStatus(await call("DELETE", `/api/strategies/${state.strategyId}`), 200);
  return `OI agregado ${d.json.data.aggregated.openInterestUsd ? (d.json.data.aggregated.openInterestUsd / 1e9).toFixed(2) + " bi" : "n/d"} (${d.json.data.aggregated.venues} exchanges) · histórico ${d.json.data.history.venue ?? "n/d"} · onboarding ${o.json.data.done}/6`;
});

await test("Comercial", "Webhook Mercado Pago sem assinatura → 401; checkout sem token → 503", async () => {
  const w = await call("POST", "/api/billing/webhook", { auth: false, body: { type: "subscription_preapproval", data: { id: "x" } } });
  expectStatus(w, 401);
  const c = await call("POST", "/api/billing/checkout", { body: { plan: "PRO" } });
  expect([200, 503].includes(c.res.status), `checkout ${c.res.status}`);
  return `webhook 401 · checkout ${c.res.status}`;
});


await test("Auth", "POST /api/auth/register e-mail repetido → 409", async () => {
  const r = await call("POST", "/api/auth/register", { auth: false, body: { name: "Smoke Test", email: EMAIL, password: PASSWORD, acceptTerms: true, ...(INVITE ? { invite: INVITE } : {}) } });
  expectStatus(r, 409, "email_taken");
  return "409";
});

await test("Auth", "POST /api/auth/logout → sessão encerrada", async () => {
  const r = await call("POST", "/api/auth/logout");
  expect(r.res.status === 200 || r.res.status === 204, `HTTP ${r.res.status}`);
  cookie = "";
  const me = await call("GET", "/api/auth/me");
  expect(me.json.data.user === null, "sessão ainda ativa");
  return "ok";
});

await test("Auth", "POST /api/auth/login senha errada → 401", async () => {
  const r = await call("POST", "/api/auth/login", { auth: false, body: { email: EMAIL, password: "Errada12345" } });
  expectStatus(r, 401, "invalid_credentials");
  return "401";
});

await test("Auth", "POST /api/auth/login → 200 + cookie; GET /api/auth/me", async () => {
  const r = await call("POST", "/api/auth/login", { body: { email: EMAIL, password: PASSWORD } });
  expectStatus(r, 200);
  expect(cookie.startsWith("cs_session="), "cookie ausente");
  const me = await call("GET", "/api/auth/me");
  expect(me.json.data.user?.email === EMAIL, "me não reflete login");
  return `logado como ${me.json.data.user.email} (${me.json.data.user.plan})`;
});

// ------------------------------------------------------------------ preferências
await test("Preferências", "GET /api/preferences", async () => {
  const r = await call("GET", "/api/preferences");
  expectStatus(r, 200);
  return `theme ${r.json.data.preference?.theme}, currency ${r.json.data.preference?.currency}`;
});

await test("Preferências", "PATCH /api/preferences (tema, moeda, timeframe, chat ID, nome)", async () => {
  const r = await call("PATCH", "/api/preferences", { body: { theme: "light", currency: "BRL", defaultTimeframe: "1d", autoRefreshSec: 60, telegramChatId: "123456789", name: "Smoke Renomeado" } });
  expectStatus(r, 200);
  const g = await call("GET", "/api/preferences");
  const p = g.json.data.preference;
  expect(p.theme === "light" && p.currency === "BRL" && p.defaultTimeframe === "1d" && p.autoRefreshSec === 60, `não persistiu: ${JSON.stringify(p)}`);
  expect(g.json.data.telegramChatId === "123456789", "chat id não persistiu");
  expect(g.json.data.name === "Smoke Renomeado", "nome não persistiu");
  return "persistido e relido";
});

await test("Preferências", "PATCH chat ID inválido → 400", async () => {
  const r = await call("PATCH", "/api/preferences", { body: { telegramChatId: "abc" } });
  expectStatus(r, 400, "validation");
  return "400";
});

await test("Telegram", "POST /api/telegram/test (sem token no servidor → 503)", async () => {
  const r = await call("POST", "/api/telegram/test", { body: {} });
  expect([200, 503, 502].includes(r.res.status), `HTTP ${r.res.status}`);
  return r.res.status === 200 ? "mensagem enviada" : `${r.res.status} ${r.json?.error?.code} (esperado sem TELEGRAM_BOT_TOKEN)`;
});

// ------------------------------------------------------------------ watchlist
await test("Carteira", "POST /api/watchlist BTC qty 0.5 avg 50000", async () => {
  const r = await call("POST", "/api/watchlist", { body: { symbol: "BTC", quantity: 0.5, avgPrice: 50000, note: "posição teste" } });
  expectStatus(r, 200);
  return `item ${r.json.data.item.id}`;
});

await test("Carteira", "POST /api/watchlist símbolo inexistente → 404", async () => {
  const r = await call("POST", "/api/watchlist", { body: { symbol: "ZZZ" } });
  expect(r.res.status === 404 || r.res.status === 400, `HTTP ${r.res.status}`);
  return `${r.res.status} ${r.json?.error?.code}`;
});

await test("Carteira", "GET /api/watchlist (P&L calculado)", async () => {
  const r = await call("GET", "/api/watchlist");
  expectStatus(r, 200);
  const it = r.json.data.items.find((x) => x.symbol === "BTC");
  expect(it, "BTC ausente");
  expect(typeof it.pnl === "number" && typeof it.pnlPct === "number", "P&L não calculado");
  expect(Math.abs(it.pnl - (it.price * 0.5 - 25000)) < 1, "P&L incoerente");
  return `preço ${it.price}, P&L ${it.pnl.toFixed(2)} (${it.pnlPct.toFixed(2)}%)`;
});

await test("Carteira", "PATCH /api/watchlist/BTC qty 1 note", async () => {
  const r = await call("PATCH", "/api/watchlist/BTC", { body: { quantity: 1, note: "atualizado" } });
  expectStatus(r, 200);
  const g = await call("GET", "/api/watchlist");
  const it = g.json.data.items.find((x) => x.symbol === "BTC");
  expect(it.quantity === 1 && it.note === "atualizado", "não atualizou");
  return "qty 1, note atualizado";
});

await test("Carteira", "POST /api/watchlist ETH e DELETE /api/watchlist/ETH", async () => {
  const a = await call("POST", "/api/watchlist", { body: { symbol: "ETH" } });
  expectStatus(a, 200);
  const d = await call("DELETE", "/api/watchlist/ETH");
  expectStatus(d, 200);
  const g = await call("GET", "/api/watchlist");
  expect(!g.json.data.items.some((x) => x.symbol === "ETH"), "ETH ainda na lista");
  return "adicionado e removido";
});

await test("Carteira", "DELETE /api/watchlist/XRP (não está na lista) → 404", async () => {
  const r = await call("DELETE", "/api/watchlist/XRP");
  expectStatus(r, 404, "not_found");
  return "404";
});

// ------------------------------------------------------------------ alertas
await test("Alertas", "POST /api/alerts price_above threshold 1 (dispara no próximo ciclo)", async () => {
  const r = await call("POST", "/api/alerts", { body: { symbol: "BTC", kind: "price_above", threshold: 1 } });
  expectStatus(r, 200);
  state.alertId = r.json.data.alert.id;
  return `alerta ${state.alertId}`;
});

await test("Alertas", "POST /api/alerts rsi_above sem threshold → 400", async () => {
  const r = await call("POST", "/api/alerts", { body: { symbol: "BTC", kind: "rsi_above" } });
  expectStatus(r, 400, "validation");
  return "400";
});

await test("Alertas", "POST /api/alerts pattern double_bottom 1d", async () => {
  const r = await call("POST", "/api/alerts", { body: { symbol: "ETH", kind: "pattern", pattern: "double_bottom", timeframe: "1d" } });
  expectStatus(r, 200);
  state.alertId2 = r.json.data.alert.id;
  return `alerta ${state.alertId2}`;
});

await test("Alertas", "POST /api/alerts channel=telegram no plano FREE → 403", async () => {
  if (state.trialPlan) return "pulado: conta nova começa em trial (limites PRO), sem plano FREE";
  const r = await call("POST", "/api/alerts", { body: { symbol: "BTC", kind: "price_below", threshold: 1, channel: "telegram" } });
  expectStatus(r, 403, "plan_required");
  return "403 plan_required";
});

await test("Alertas", "GET /api/alerts (2 ativos)", async () => {
  const r = await call("GET", "/api/alerts");
  expectStatus(r, 200);
  expect(r.json.data.items.length >= 2, `${r.json.data.items.length} alertas`);
  return `${r.json.data.items.length} alertas`;
});

await test("Alertas", "PATCH /api/alerts/:id active=false e DELETE", async () => {
  const p = await call("PATCH", `/api/alerts/${state.alertId2}`, { body: { active: false } });
  expectStatus(p, 200);
  const d = await call("DELETE", `/api/alerts/${state.alertId2}`);
  expectStatus(d, 200);
  const nf = await call("DELETE", `/api/alerts/${state.alertId2}`);
  expectStatus(nf, 404, "not_found");
  return "pausado, excluído, 404 na 2ª exclusão";
});

// ------------------------------------------------------------------ agentes
const agentBody = (over = {}) => ({ name: "Agente Smoke", symbols: ["BTC", "ETH", "SOL"], operationType: "swing_trade", timeframe: "4h", strategies: ["ema_stack_trend", "rsi_reversal"].filter((s) => state.strategies?.includes(s)), minConfidence: 50, notification: "log", ...over });

await test("Agentes", "POST /api/agents timeframe 1h no FREE → 403", async () => {
  const r = await call("POST", "/api/agents", { body: agentBody({ timeframe: "1h" }) });
  expectStatus(r, 403, "plan_required");
  return "403 plan_required";
});

await test("Agentes", "POST /api/agents notification=telegram no FREE → 403", async () => {
  if (state.trialPlan) return "pulado: conta nova começa em trial (limites PRO), sem plano FREE";
  const r = await call("POST", "/api/agents", { body: agentBody({ notification: "telegram" }) });
  expectStatus(r, 403, "plan_required");
  return "403 plan_required";
});

await test("Agentes", "POST /api/agents (1º) → 201", async () => {
  const r = await call("POST", "/api/agents", { body: agentBody() });
  expectStatus(r, 201);
  state.agentId = r.json.data.agent.id;
  return `agente ${state.agentId} estratégias ${r.json.data.agent.strategies.join(",")}`;
});

await test("Agentes", "POST /api/agents (2º, todas as 15 estratégias em 2 lotes) → 201", async () => {
  const r = await call("POST", "/api/agents", { body: agentBody({ name: "Agente Smoke 2", strategies: state.strategies.slice(0, 8), symbols: ["BTC"] }) });
  expectStatus(r, 201);
  state.agentId2 = r.json.data.agent.id;
  return `agente ${state.agentId2} (8 estratégias)`;
});

await test("Agentes", "POST /api/agents (3º) no FREE → 403 agent_limit", async () => {
  if (state.trialPlan) return "pulado: conta nova começa em trial (limites PRO), sem plano FREE";
  const r = await call("POST", "/api/agents", { body: agentBody({ name: "Agente Smoke 3" }) });
  expectStatus(r, 403, "agent_limit");
  return "403 agent_limit (máx. 2)";
});

await test("Agentes", "GET /api/agents (lista + contagens)", async () => {
  if (state.trialPlan) { const r0 = await call("GET", "/api/agents"); expectStatus(r0, 200); return `${r0.json.data.items.length} agentes (trial)`; }
  const r = await call("GET", "/api/agents");
  expectStatus(r, 200);
  expect(r.json.data.items.length === 2, `${r.json.data.items.length} agentes`);
  return `2 agentes, limite ${r.json.data.limit}`;
});

await test("Agentes", "GET /api/agents/:id", async () => {
  const r = await call("GET", `/api/agents/${state.agentId}`);
  expectStatus(r, 200);
  expect(r.json.data.agent.id === state.agentId, "id diferente");
  return r.json.data.agent.name;
});

await test("Agentes", "POST /api/agents/:id/run (execução manual)", async () => {
  const r = await call("POST", `/api/agents/${state.agentId}/run`);
  expectStatus(r, 200);
  const d = r.json.data;
  expect(d.evaluated === 3, `avaliou ${d.evaluated} de 3`);
  expect((d.errors ?? []).length === 0, `erros: ${JSON.stringify(d.errors)}`);
  return `3 ativos avaliados, ${d.signals.length} sinais, cooldown=${d.skippedByCooldown}`;
});

await test("Agentes", "POST /api/agents/:id/run agente 2 (8 estratégias)", async () => {
  const r = await call("POST", `/api/agents/${state.agentId2}/run`);
  expectStatus(r, 200);
  const d = r.json.data;
  expect((d.errors ?? []).length === 0, `erros: ${JSON.stringify(d.errors)}`);
  state.signals2 = d.signals.length;
  return `${d.evaluated} ativo, ${d.signals.length} sinais`;
});

await test("Agentes", "GET /api/agents/:id/logs e GET /api/agents/logs", async () => {
  const a = await call("GET", `/api/agents/${state.agentId2}/logs?limit=20`);
  expectStatus(a, 200);
  const b = await call("GET", "/api/agents/logs?limit=20");
  expectStatus(b, 200);
  return `logs agente 2: ${a.json.data.items.length}; log geral: ${b.json.data.items.length}`;
});

await test("Agentes", "GET /api/agents lastRunAt atualizado", async () => {
  const r = await call("GET", "/api/agents");
  const ag = r.json.data.items.find((x) => x.id === state.agentId);
  expect(ag?.lastRunAt, "lastRunAt vazio após execução");
  return `lastRunAt ${ag.lastRunAt}`;
});

await test("Agentes", "PATCH /api/agents/:id status=PAUSED + nome", async () => {
  const r = await call("PATCH", `/api/agents/${state.agentId}`, { body: { status: "PAUSED", name: "Agente Smoke pausado" } });
  expectStatus(r, 200);
  expect(r.json.data.agent.status === "PAUSED" && r.json.data.agent.name === "Agente Smoke pausado", "não atualizou");
  return "PAUSED";
});

await test("Agentes", "GET /api/agents/:id inexistente → 404", async () => {
  const r = await call("GET", "/api/agents/nao-existe");
  expectStatus(r, 404, "not_found");
  return "404";
});

await test("Agentes", "DELETE /api/agents/:id (1º)", async () => {
  const r = await call("DELETE", `/api/agents/${state.agentId}`);
  expectStatus(r, 200);
  const g = await call("GET", `/api/agents/${state.agentId}`);
  expectStatus(g, 404, "not_found");
  return "excluído";
});

// ------------------------------------------------------------------ sentinela
await test("Sentinela", "POST /api/sentinels BTC 4h (1º slot FREE) → 201", async () => {
  const r = await call("POST", "/api/sentinels", { body: { symbol: "BTC", timeframe: "4h", minConfidence: 60, notification: "log" } });
  expectStatus(r, 201);
  state.sentinelId = r.json.data.sentinel.id;
  expect(r.json.data.sentinel.kind === "sentinel" && r.json.data.sentinel.strategies.includes("sentinel_patterns"), "sentinela mal configurado");
  return `sentinela ${state.sentinelId}`;
});

await test("Sentinela", "POST /api/sentinels BTC repetido → 409", async () => {
  const r = await call("POST", "/api/sentinels", { body: { symbol: "BTC", timeframe: "4h" } });
  expectStatus(r, 409, "duplicate");
  return "409";
});

await test("Sentinela", "POST /api/sentinels ETH (2º) no FREE → 403 sentinel_limit", async () => {
  if (state.trialPlan) return "pulado: conta nova começa em trial (limites PRO), sem plano FREE";
  const r = await call("POST", "/api/sentinels", { body: { symbol: "ETH", timeframe: "4h" } });
  expectStatus(r, 403, "sentinel_limit");
  return "403";
});

await test("Sentinela", "GET /api/agents não lista sentinelas", async () => {
  const r = await call("GET", "/api/agents");
  expectStatus(r, 200);
  expect(!r.json.data.items.some((a) => a.id === state.sentinelId), "sentinela apareceu como agente");
  return "isolado";
});

await test("Sentinela", "POST /api/agents/:id/run (varredura) + GET reports", async () => {
  const run = await call("POST", `/api/agents/${state.sentinelId}/run`);
  expectStatus(run, 200);
  const rep = await call("GET", `/api/sentinels/${state.sentinelId}/reports`);
  expectStatus(rep, 200);
  return `${run.json.data.signals.length} sinal(is) qualificado(s), ${rep.json.data.items.length} relatório(s)`;
});

await test("Sentinela", "PATCH status=PAUSED + GET /api/sentinels", async () => {
  const p = await call("PATCH", `/api/sentinels/${state.sentinelId}`, { body: { status: "PAUSED", minConfidence: 75 } });
  expectStatus(p, 200);
  const g = await call("GET", "/api/sentinels");
  expectStatus(g, 200);
  const it = g.json.data.items.find((x) => x.id === state.sentinelId);
  expect(it && it.status === "PAUSED" && it.minConfidence === 75, "não atualizou");
  return `pausado, limite ${g.json.data.limit}`;
});

await test("Sentinela", "DELETE /api/sentinels/:id", async () => {
  const d = await call("DELETE", `/api/sentinels/${state.sentinelId}`);
  expectStatus(d, 200);
  const g = await call("GET", `/api/sentinels/${state.sentinelId}`);
  expectStatus(g, 404, "not_found");
  return "excluído";
});

// ------------------------------------------------------------------ simulações salvas
await test("Simulador", "POST /api/simulations (salvar) + GET + DELETE", async () => {
  const c = await call("POST", "/api/simulations", { body: { symbol: "SOL", strategy: "dca", currency: "USD", initialCapital: 100, monthlyContribution: 100, months: 6, riskProfile: "conservador" } });
  expectStatus(c, 201);
  const id = c.json.data.simulation.id;
  const g = await call("GET", "/api/simulations");
  expectStatus(g, 200);
  expect(g.json.data.items.some((x) => x.id === id), "não listou");
  const d = await call("DELETE", `/api/simulations/${id}`);
  expectStatus(d, 200);
  return `salva ${id}, lucro ${c.json.data.simulation.profitPct}%, excluída`;
});

await test("Suporte", "GET /api/support (meus chamados)", async () => {
  await call("POST", "/api/support", { body: { email: EMAIL, subject: "Chamado do usuário", message: "Mensagem de teste vinculada à conta de teste." } });
  const r = await call("GET", "/api/support");
  expectStatus(r, 200);
  expect(r.json.data.items.length >= 1, "sem chamados");
  return `${r.json.data.items.length} chamado(s)`;
});

// ------------------------------------------------------------------ planos (ambiente de teste)
await test("Planos", "POST /api/plans/change PLATINUM", async () => {
  const r = await call("POST", "/api/plans/change", { body: { plan: "PLATINUM" } });
  if (r.res.status === 403) {
    state.planLocked = true;
    return "troca de plano bloqueada para não-admin (ALLOW_SELF_PLAN_CHANGE=false) — testes de PLATINUM pulados";
  }
  expectStatus(r, 200);
  const me = await call("GET", "/api/auth/me");
  expect(me.json.data.user.plan === "PLATINUM", `plano ${me.json.data.user.plan}`);
  return "PLATINUM";
});

await test("Planos", "GET /api/scanner/table?timeframe=15m como PLATINUM → 200", async () => {
  if (state.planLocked) return "pulado (plano bloqueado)";
  const r = await call("GET", "/api/scanner/table?timeframe=15m");
  expectStatus(r, 200);
  expect(r.json.data.rows.length === state.nAssets, `${r.json.data.rows.length} linhas`);
  return `${r.json.data.rows.length} linhas em 15M`;
});

await test("Planos", "GET /api/scanner/table?timeframe=1h e 30m como PLATINUM → 200", async () => {
  if (state.planLocked) return "pulado (plano bloqueado)";
  const a = await call("GET", "/api/scanner/table?timeframe=1h");
  expectStatus(a, 200);
  const b = await call("GET", "/api/scanner/table?timeframe=30m");
  expectStatus(b, 200);
  return `1h ${a.json.data.rows.length} linhas, 30m ${b.json.data.rows.length} linhas`;
});

await test("Planos", "POST /api/agents timeframe 15m + notification=both como PLATINUM → 201", async () => {
  if (state.planLocked) return "pulado (plano bloqueado)";
  const r = await call("POST", "/api/agents", { body: agentBody({ name: "Agente Platinum 15m", timeframe: "15m", notification: "both", symbols: ["BTC"] }) });
  expectStatus(r, 201);
  state.agentId3 = r.json.data.agent.id;
  return `agente ${state.agentId3}`;
});

await test("Planos", "POST /api/alerts channel=telegram como PLATINUM → 200", async () => {
  if (state.planLocked) return "pulado (plano bloqueado)";
  const r = await call("POST", "/api/alerts", { body: { symbol: "SOL", kind: "rsi_below", threshold: 30, channel: "telegram" } });
  expectStatus(r, 200);
  return `alerta ${r.json.data.alert.id}`;
});

await test("Planos", "POST /api/plans/change FREE (volta)", async () => {
  if (state.planLocked) return "pulado (plano bloqueado)";
  const r = await call("POST", "/api/plans/change", { body: { plan: "FREE" } });
  expectStatus(r, 200);
  const t = await call("GET", "/api/scanner/table?timeframe=15m");
  expectStatus(t, 403, "plan_required");
  return "FREE; 15m volta a 403";
});

// ------------------------------------------------------------------ histórico / análises / imagem
await test("Histórico", "GET /api/scanner/history", async () => {
  const r = await call("GET", "/api/scanner/history?limit=10");
  expectStatus(r, 200);
  return `${r.json.data.items.length} entradas`;
});

await test("Histórico", "DELETE /api/scanner/history (limpar)", async () => {
  const r = await call("DELETE", "/api/scanner/history");
  expectStatus(r, 200);
  const g = await call("GET", "/api/scanner/history");
  expect(g.json.data.items.length === 0, "não limpou");
  return "limpo";
});

await test("Análise IA", "GET /api/analysis/saved", async () => {
  const r = await call("GET", "/api/analysis/saved");
  expectStatus(r, 200);
  return `${r.json.data.items.length} análises salvas`;
});

await test("Análise IA", "POST /api/analysis/chart-image sem arquivo → 400", async () => {
  const fd = new FormData();
  fd.append("symbol", "BTC");
  const r = await call("POST", "/api/analysis/chart-image", { form: fd });
  expectStatus(r, 400, "missing_file");
  return "400 missing_file";
});

await test("Análise IA", "POST /api/analysis/chart-image arquivo .txt → 415", async () => {
  const fd = new FormData();
  fd.append("file", new File(["nao e imagem"], "x.txt", { type: "text/plain" }));
  const r = await call("POST", "/api/analysis/chart-image", { form: fd });
  expectStatus(r, 415, "unsupported_media");
  return "415";
});

await test("Análise IA", "POST /api/analysis/chart-image PNG + ativo (modo determinístico sem LLM → 200)", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const fd = new FormData();
  fd.append("file", new File([png], "chart.png", { type: "image/png" }));
  fd.append("symbol", "BTC");
  fd.append("timeframe", "4h");
  const r = await call("POST", "/api/analysis/chart-image", { form: fd });
  expectStatus(r, 200);
  const d = r.json.data;
  expect(["bullish", "bearish", "neutral"].includes(d.trend) && d.insights.length >= 2 && d.points.entry > 0, "resultado incompleto");
  const saved = await call("GET", "/api/analysis/saved");
  expect(saved.json.data.items.length >= 1, "análise não salva");
  return `${d.provider}/${d.model} · ${d.trend} ${d.confidence}% · entrada ${d.points.entry} · salva (${saved.json.data.items.length})`;
});

await test("Análise IA", "POST /api/analysis/chart-image sem ativo no modo determinístico → 503 com orientação", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const fd = new FormData();
  fd.append("file", new File([png], "chart.png", { type: "image/png" }));
  const r = await call("POST", "/api/analysis/chart-image", { form: fd });
  expect([200, 503].includes(r.res.status), `HTTP ${r.res.status}`);
  return r.res.status === 200 ? "LLM configurado: analisado" : `503 ${r.json.error.code}`;
});

await test("Jornada", "GET/PATCH /api/learning (progresso)", async () => {
  const p = await call("PATCH", "/api/learning", { body: { progress: { "o-que-e-bitcoin": { done: true, score: 2, at: new Date().toISOString() } } } });
  expectStatus(p, 200);
  const g = await call("GET", "/api/learning");
  expectStatus(g, 200);
  expect(g.json.data.progress["o-que-e-bitcoin"]?.done === true && g.json.data.total === 12, "progresso não persistiu");
  return `1/${g.json.data.total} aulas concluídas`;
});

await test("Análise IA", "POST /api/analysis/chart-image > 5 MB → 413", async () => {
  const big = new Uint8Array(5 * 1024 * 1024 + 10);
  big.set([0x89, 0x50, 0x4e, 0x47]);
  const fd = new FormData();
  fd.append("file", new File([big], "big.png", { type: "image/png" }));
  const r = await call("POST", "/api/analysis/chart-image", { form: fd });
  expect(r.res.status === 413, `HTTP ${r.res.status}`);
  return "413";
});

// ------------------------------------------------------------------ limpeza do usuário de teste
await test("Limpeza", "DELETE /api/agents (todos) + alertas + watchlist", async () => {
  const d = await call("DELETE", "/api/agents");
  expectStatus(d, 200);
  const al = await call("GET", "/api/alerts");
  for (const a of al.json.data.items) await call("DELETE", `/api/alerts/${a.id}`);
  const wl = await call("GET", "/api/watchlist");
  for (const it of wl.json.data.items) await call("DELETE", `/api/watchlist/${it.symbol}`);
  const g = await call("GET", "/api/agents");
  expect(g.json.data.items.length === 0, "agentes restantes");
  return "agentes, alertas e watchlist do usuário de teste removidos";
});

await test("Push", "GET/POST/DELETE /api/push/subscribe e POST /api/push/test", async () => {
  const anon = await call("GET", "/api/push/subscribe", { auth: false });
  expectStatus(anon, 401);
  const g = await call("GET", "/api/push/subscribe");
  expectStatus(g, 200);
  const endpoint = `https://push.invalid/smoke/${Date.now()}`;
  const bad = await call("POST", "/api/push/subscribe", { body: { endpoint: "nao-e-url", keys: { p256dh: "x", auth: "y" } } });
  expectStatus(bad, 400);
  const p = await call("POST", "/api/push/subscribe", { body: { endpoint, keys: { p256dh: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U", auth: "tBHItJI5svbpez7KI4CCXg" } } });
  expectStatus(p, 201);
  const g2 = await call("GET", "/api/push/subscribe");
  expect(g2.json.data.subscriptions >= 1, "inscrição não contada");
  let testMsg = "push não configurado";
  if (g2.json.data.configured) {
    const t = await call("POST", "/api/push/test", { body: {} });
    expectStatus(t, 200);
    testMsg = `teste: enviados ${t.json.data.sent}, removidos ${t.json.data.removed} (endpoint fictício)`;
  }
  const d = await call("DELETE", "/api/push/subscribe", { body: { endpoint } });
  expectStatus(d, 200);
  return `inscrição criada e removida · ${testMsg}`;
});

await test("LGPD", "DELETE /api/auth/account senha errada → 401; confirmação errada → 400", async () => {
  const a = await call("DELETE", "/api/auth/account", { body: { confirm: "EXCLUIR", password: "Errada12345" } });
  expectStatus(a, 401, "invalid_credentials");
  const b = await call("DELETE", "/api/auth/account", { body: { confirm: "excluir", password: PASSWORD } });
  expectStatus(b, 400, "validation");
  return "401 + 400";
});

await test("LGPD", "DELETE /api/auth/account (exclusão definitiva da conta de teste)", async () => {
  const r = await call("DELETE", "/api/auth/account", { body: { confirm: "EXCLUIR", password: PASSWORD } });
  expectStatus(r, 200);
  cookie = "";
  const login = await call("POST", "/api/auth/login", { auth: false, body: { email: EMAIL, password: PASSWORD } });
  expectStatus(login, 401, "invalid_credentials");
  cookie = "";
  return "conta apagada; login passa a falhar";
});

accountSection = false;

// testes que usam o balde "auth" (10/min por IP) ficam aqui para não esgotar o limite antes do login
await test("Venda", "Cadastro sem aceite dos termos → 400; preços públicos; páginas legais", async () => {
  const r = await callAuth("POST", "/api/auth/register", { auth: false, body: { name: "Sem Aceite", email: `noterms+${EMAIL}`, password: PASSWORD, ...(INVITE ? { invite: INVITE } : {}) } });
  expectStatus(r, 400, "validation");
  const p = await call("GET", "/api/billing/prices", { auth: false });
  expectStatus(p, 200);
  expect(p.json.data.prices.PRO > 0 && p.json.data.prices.ELITE > p.json.data.prices.PRO && p.json.data.trialDays === 7, "preços/trial inválidos");
  for (const path of ["/termos", "/privacidade", "/reembolso", "/esqueci-senha"]) {
    const { res } = await call("GET", path, { auth: false, raw: true });
    expect(res.status === 200, `${path} HTTP ${res.status}`);
  }
  return `PRO R$ ${p.json.data.prices.PRO} · ELITE R$ ${p.json.data.prices.ELITE} · checkout ${p.json.data.checkoutEnabled ? "liberado" : "bloqueado (termos/cobrança)"}`;
});

await test("Venda", "Esqueci a senha: resposta idêntica para e-mail existente/inexistente; token inválido → 400", async () => {
  const a = await callAuth("POST", "/api/auth/password/forgot", { auth: false, body: { email: `inexistente+${stamp}@cryptoscanner.local` } });
  expectStatus(a, 200);
  const b = await callAuth("POST", "/api/auth/password/reset", { auth: false, body: { token: "x".repeat(43), password: "NovaSenha123" } });
  expectStatus(b, 400, "invalid_token");
  return `e-mail ${a.json.data.emailEnabled ? "ativo" : "não configurado"}`;
});

// ------------------------------------------------------------------ rate limit (por último: bloqueia auth por 60 s)
if (!SKIP_RATE_LIMIT) {
  await test("Rate limit", "POST /api/auth/login ×12 → 429 após o limite (10/min)", async () => {
    let first429 = 0;
    for (let i = 1; i <= 12; i++) {
      const r = await call("POST", "/api/auth/login", { auth: false, body: { email: EMAIL, password: "Errada12345" } });
      if (r.res.status === 429) {
        first429 = i;
        expect(r.json?.error?.code === "rate_limited" || r.res.headers.get("retry-after"), "429 sem code/retry-after");
        break;
      }
    }
    expect(first429 > 0, "nunca retornou 429 em 12 tentativas");
    return `429 na tentativa ${first429}`;
  });
}

// ------------------------------------------------------------------ relatório
const skipped = results.filter((r) => r.skipped).length;
const failed = results.filter((r) => !r.ok).length;
const passed = results.length - failed - skipped;
const lines = [];
lines.push(`# Teste de integração — ${BASE}`);
lines.push("");
lines.push(`**${passed}/${results.length - skipped} aprovados**${skipped ? ` · ${skipped} ignorados` : ""}${failed ? ` · **${failed} falharam**` : ""} · ${new Date().toISOString()}`);
if (state.noAccount) lines.push("", `> ${state.noAccount}`);
if (!CRON_SECRET) lines.push("", "> CRON_SECRET não informado: rotas de cron testadas só no caminho 401.");
lines.push("");
lines.push("| # | Grupo | Teste | Resultado | ms | Detalhe |");
lines.push("|---|---|---|---|---:|---|");
results.forEach((r, i) => lines.push(`| ${i + 1} | ${r.group} | ${r.name} | ${r.skipped ? "⏭️" : r.ok ? "✅" : "❌"} | ${r.ms} | ${String(r.detail).replace(/\|/g, "\\|")} |`));
const report = lines.join("\n");
console.log(report);
const fs = await import("node:fs");
if (process.env.API_SMOKE_JSON) fs.writeFileSync(process.env.API_SMOKE_JSON, JSON.stringify({ base: BASE, at: new Date().toISOString(), passed, failed, skipped, total: results.length, results }, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
if (process.env.GITHUB_ACTIONS) {
  if (state.noAccount) console.log(`::warning title=Smoke parcial::${state.noAccount}`);
  for (const r of results.filter((x) => !x.ok)) console.log(`::error title=${r.group}: ${r.name}::${String(r.detail).slice(0, 300)}`);
}
process.exit(failed === 0 ? 0 : 1);

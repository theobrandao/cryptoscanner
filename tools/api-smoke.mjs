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

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const SKIP_RATE_LIMIT = process.env.SKIP_RATE_LIMIT === "1";

const results = [];
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

async function test(group, name, fn) {
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
const state = {};

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

await test("Mercado", "GET /api/market/assets (20 ativos)", async () => {
  const r = await call("GET", "/api/market/assets", { auth: false });
  expectStatus(r, 200);
  expect(r.json.data.assets.length === 20, `${r.json.data.assets.length} ativos`);
  return `${r.json.data.assets.length} ativos`;
});

await test("Mercado", "GET /api/market/tickers (USD)", async () => {
  const r = await call("GET", "/api/market/tickers", { auth: false });
  expectStatus(r, 200);
  const t = r.json.data.tickers;
  expect(t.length === 20, `${t.length} tickers`);
  const btc = t.find((x) => x.symbol === "BTC");
  expect(btc && btc.price > 1000, "BTC sem preço plausível");
  state.btcUsd = btc.price;
  return `20 tickers, BTC ${btc.price} (${btc.source})`;
});

await test("Mercado", "GET /api/market/tickers?currency=BRL (conversão)", async () => {
  const r = await call("GET", "/api/market/tickers?currency=BRL", { auth: false });
  expectStatus(r, 200);
  const btc = r.json.data.tickers.find((x) => x.symbol === "BTC");
  expect(btc.price > state.btcUsd * 3, `BRL ${btc.price} não parece convertido (USD ${state.btcUsd})`);
  expect(Math.abs(btc.price / state.btcUsd - r.json.data.usdBrl) < 0.05, "preço convertido não bate com usdBrl");
  return `BTC R$ ${btc.price.toFixed(0)} (câmbio ${r.json.data.usdBrl.toFixed(4)})`;
});

await test("Mercado", "GET /api/market/fx (USD→BRL)", async () => {
  const r = await call("GET", "/api/market/fx", { auth: false });
  expectStatus(r, 200);
  expect(r.json.data.rate > 3 && r.json.data.rate < 10, `rate=${r.json.data.rate}`);
  return `rate ${r.json.data.rate.toFixed(4)} stale=${r.json.data.stale}`;
});

await test("Mercado", "GET /api/market/global (CoinGecko)", async () => {
  const r = await call("GET", "/api/market/global", { auth: false });
  expectStatus(r, 200);
  const g = r.json.data.global ?? r.json.data;
  expect(g && (g.total_market_cap || g.totalMarketCap || g.markets), "sem dados globais");
  return `mercados=${g.markets ?? "?"}, ativos=${g.active_cryptocurrencies ?? "?"}`;
});

await test("Mercado", "GET /api/market/candles BTC 4h limit=100 indicators=1", async () => {
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
    expect(rows.length === 20, `${rows.length} linhas`);
    const withPattern = rows.filter((x) => x.pattern || (x.patterns && x.patterns.length)).length;
    const row = rows[0];
    for (const k of ["price", "changePct24h", "volume24h", "relativeVolume", "volatilityPct", "trend", "rsi14", "momentum", "signal", "patterns", "support", "resistance"]) expect(k in row, `coluna ${k} ausente`);
    return `20 linhas, ${withPattern} com padrão, fontes ${JSON.stringify(r.json.data.sources ?? r.json.data.source ?? "")}`;
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
  expect(d.assets === 20, `assets=${d.assets}`);
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
  return `${d.bubbles.length} ativos, BTC 24h ${btc.change["24h"].toFixed(2)}% 7d ${btc.change["7d"].toFixed(2)}% 30d ${btc.change["30d"]?.toFixed(2)}%`;
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
  const r = await call("POST", "/api/auth/register", { body: { name: "Smoke", email: EMAIL, password: "abc" } });
  expectStatus(r, 400, "validation");
  return "400";
});

await test("Auth", "POST /api/auth/register → 201 + cookie", async () => {
  const r = await call("POST", "/api/auth/register", { body: { name: "Smoke Test", email: EMAIL, password: PASSWORD } });
  expectStatus(r, 201);
  expect(cookie.startsWith("cs_session="), "cookie de sessão ausente");
  state.userId = r.json.data.user.id;
  return `user ${state.userId}, plano ${r.json.data.user.plan}`;
});

await test("Auth", "POST /api/auth/register e-mail repetido → 409", async () => {
  const r = await call("POST", "/api/auth/register", { auth: false, body: { name: "Smoke Test", email: EMAIL, password: PASSWORD } });
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
  const r = await call("POST", "/api/agents", { body: agentBody({ name: "Agente Smoke 3" }) });
  expectStatus(r, 403, "agent_limit");
  return "403 agent_limit (máx. 2)";
});

await test("Agentes", "GET /api/agents (lista + contagens)", async () => {
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
  expectStatus(r, 200);
  const me = await call("GET", "/api/auth/me");
  expect(me.json.data.user.plan === "PLATINUM", `plano ${me.json.data.user.plan}`);
  return "PLATINUM";
});

await test("Planos", "GET /api/scanner/table?timeframe=15m como PLATINUM → 200", async () => {
  const r = await call("GET", "/api/scanner/table?timeframe=15m");
  expectStatus(r, 200);
  expect(r.json.data.rows.length === 20, `${r.json.data.rows.length} linhas`);
  return "20 linhas em 15M";
});

await test("Planos", "GET /api/scanner/table?timeframe=1h e 30m como PLATINUM → 200", async () => {
  const a = await call("GET", "/api/scanner/table?timeframe=1h");
  expectStatus(a, 200);
  const b = await call("GET", "/api/scanner/table?timeframe=30m");
  expectStatus(b, 200);
  return `1h ${a.json.data.rows.length} linhas, 30m ${b.json.data.rows.length} linhas`;
});

await test("Planos", "POST /api/agents timeframe 15m + notification=both como PLATINUM → 201", async () => {
  const r = await call("POST", "/api/agents", { body: agentBody({ name: "Agente Platinum 15m", timeframe: "15m", notification: "both", symbols: ["BTC"] }) });
  expectStatus(r, 201);
  state.agentId3 = r.json.data.agent.id;
  return `agente ${state.agentId3}`;
});

await test("Planos", "POST /api/alerts channel=telegram como PLATINUM → 200", async () => {
  const r = await call("POST", "/api/alerts", { body: { symbol: "SOL", kind: "rsi_below", threshold: 30, channel: "telegram" } });
  expectStatus(r, 200);
  return `alerta ${r.json.data.alert.id}`;
});

await test("Planos", "POST /api/plans/change FREE (volta)", async () => {
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

await test("Análise IA", "POST /api/analysis/chart-image PNG válido (sem LLM → 503 llm_unavailable)", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const fd = new FormData();
  fd.append("file", new File([png], "chart.png", { type: "image/png" }));
  fd.append("symbol", "BTC");
  fd.append("timeframe", "4h");
  const r = await call("POST", "/api/analysis/chart-image", { form: fd });
  expect([200, 503].includes(r.res.status), `HTTP ${r.res.status}: ${(r.text ?? "").slice(0, 120)}`);
  return r.res.status === 200 ? "analisado" : `503 ${r.json.error.code} (esperado sem ANTHROPIC_API_KEY)`;
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
const okCount = results.filter((r) => r.ok).length;
const lines = [];
lines.push(`# Teste de integração — ${BASE}`);
lines.push("");
lines.push(`**${okCount}/${results.length} aprovados** · ${new Date().toISOString()}`);
lines.push("");
lines.push("| # | Grupo | Teste | Resultado | ms | Detalhe |");
lines.push("|---|---|---|---|---:|---|");
results.forEach((r, i) => lines.push(`| ${i + 1} | ${r.group} | ${r.name} | ${r.ok ? "✅" : "❌"} | ${r.ms} | ${String(r.detail).replace(/\|/g, "\\|")} |`));
console.log(lines.join("\n"));
if (process.env.API_SMOKE_JSON) {
  const fs = await import("node:fs");
  fs.writeFileSync(process.env.API_SMOKE_JSON, JSON.stringify({ base: BASE, at: new Date().toISOString(), ok: okCount, total: results.length, results }, null, 2));
}
process.exit(okCount === results.length ? 0 : 1);

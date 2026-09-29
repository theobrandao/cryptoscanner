/**
 * Auditoria de responsividade: todas as rotas em 360, 390, 768 e 1280 px.
 * Critérios por página/largura:
 *  - sem rolagem horizontal do documento (scrollWidth ≤ largura da janela);
 *  - elementos que ultrapassam a borda direita e não estão dentro de um contêiner com rolagem própria;
 *  - alvos de toque (botões/links visíveis) com menos de 32 px de altura em larguras ≤ 390 (aviso).
 * Uso: BASE_URL=... INVITE_CODE=... CHROMIUM_PATH=... OUT_DIR=... node tools/responsive-audit.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const OUT = process.env.OUT_DIR ?? "./responsive-out";
const WIDTHS = (process.env.WIDTHS ?? "360,390,768,1280").split(",").map(Number);
const ROUTES = (
  process.env.ROUTES ??
  "/,/charts/BTC,/strategies,/monitor,/backtest,/derivatives,/scanner/padroes,/termos,/privacidade,/reembolso,/esqueci-senha,/admin,/terminal,/terminal?tab=liquidity,/terminal?tab=mtf,/risco,/scanner,/estatisticas,/graficos,/agentes,/sentinela,/panorama,/bubbles,/fibonacci,/carteira,/simulador,/mentor,/jornada,/planos,/preferencias,/suporte,/status,/login,/registro"
).split(",");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true });
const results = [];

async function newSession(width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 800 : 900 }, locale: "pt-BR", isMobile: width < 768, hasTouch: width < 768, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  // conta autenticada para as páginas que exigem login
  const email = `resp+${Date.now()}-${width}@cryptoscanner.local`;
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    async ({ email, invite }) => {
      await fetch("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Responsivo", email, password: "Resp12345678", acceptTerms: true, ...(invite ? { invite } : {}) }) });
    },
    { email, invite: process.env.INVITE_CODE ?? "" },
  );
  return { ctx, page, email };
}

for (const width of WIDTHS) {
  const { ctx, page } = await newSession(width);
  for (const route of ROUTES) {
    const t0 = Date.now();
    try {
      await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
      await page.waitForTimeout(800);
      const m = await page.evaluate((mobile) => {
        const vw = document.documentElement.clientWidth;
        const docOverflow = document.documentElement.scrollWidth - vw;
        const scrollable = (el) => {
          for (let p = el.parentElement; p; p = p.parentElement) {
            const s = getComputedStyle(p);
            if ((s.overflowX === "auto" || s.overflowX === "scroll" || s.overflowX === "hidden" || s.overflowX === "clip") && p !== document.body && p !== document.documentElement) return true;
          }
          return false;
        };
        const offenders = [];
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const s = getComputedStyle(el);
          if (s.position === "fixed" && (r.right <= vw + 1)) continue;
          if (r.right > vw + 1 && !scrollable(el)) {
            offenders.push({ tag: el.tagName.toLowerCase(), cls: String(el.className?.baseVal ?? el.className ?? "").slice(0, 80), text: (el.innerText ?? "").slice(0, 40).replace(/\s+/g, " "), right: Math.round(r.right), w: Math.round(r.width) });
            if (offenders.length > 6) break;
          }
        }
        const smallTargets = [];
        if (mobile) {
          for (const el of document.querySelectorAll("button, a[href], [role=tab], select, input:not([type=hidden])")) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.bottom < 0 || r.top > window.innerHeight * 3) continue;
            if (r.height < 32 && !el.closest("p, td, li, dd, footer")) smallTargets.push(`${el.tagName.toLowerCase()}:${(el.getAttribute("aria-label") ?? el.innerText ?? "").slice(0, 24).replace(/\s+/g, " ")}(${Math.round(r.height)}px)`);
          }
        }
        return { vw, docOverflow, offenders, smallTargets: smallTargets.slice(0, 8), smallCount: smallTargets.length };
      }, width <= 390);
      const file = `${width}-${route === "/" ? "home" : route.slice(1).replace(/\//g, "_")}.png`;
      if (width <= 390 || m.docOverflow > 0) await page.screenshot({ path: `${OUT}/${file}`, fullPage: false });
      results.push({ width, route, ok: m.docOverflow <= 0 && m.offenders.length === 0, ...m, ms: Date.now() - t0, file });
    } catch (err) {
      results.push({ width, route, ok: false, error: String(err?.message ?? err).slice(0, 200), ms: Date.now() - t0 });
    }
  }
  await ctx.close();
}
await browser.close();

writeFileSync(`${OUT}/responsive.json`, JSON.stringify(results, null, 2));
const bad = results.filter((r) => !r.ok);
for (const r of results) {
  const flag = r.ok ? "OK " : "ERR";
  const extra = r.error ? r.error : `overflow=${r.docOverflow}px offenders=${r.offenders.length}${r.smallCount ? ` alvos<32px=${r.smallCount}` : ""}`;
  console.log(`${flag} ${String(r.width).padStart(4)} ${r.route.padEnd(15)} ${extra}`);
  if (!r.ok && r.offenders) for (const o of r.offenders) console.log(`      ↳ <${o.tag} class="${o.cls}"> right=${o.right} w=${o.w} "${o.text}"`);
}
console.log(`\n${results.length - bad.length}/${results.length} combinações sem estouro horizontal`);
process.exit(bad.length ? 1 : 0);

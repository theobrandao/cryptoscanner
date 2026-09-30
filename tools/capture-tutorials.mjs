#!/usr/bin/env node
/**
 * Captura de mídia REAL do app para a central de tutoriais (public/tutoriais/<slug>/ + lib/content/tutorial-media.json).
 *
 *   set -a; . ./.env.local; set +a
 *   BASE_URL=http://localhost:3000 INVITE_CODE=$REGISTRATION_INVITE_CODE CHROMIUM_PATH=... node tools/capture-tutorials.mjs [slug ...]
 *
 * - Conta fictícia demo-tutorial@example.com ("Conta Demo"): cadastro/login pela API; SÓ no banco local
 *   (BASE_URL localhost) recebe ELITE (Subscription ACTIVE/ELITE/manual, +1 ano; User.plan PLATINUM, role USER).
 * - Uso de demonstração criado pelas APIs do próprio app (favoritos BTC/ETH/SOL, 1 agente 4H, 1 monitor,
 *   1 alerta de preço, aula 1 concluída). Nenhum dado de mercado é inventado: tudo vem do app rodando.
 * - Idempotente: recria só o que falta; sobrescreve as mídias do(s) slug(s) capturado(s) e mescla o JSON.
 * - Sem argumentos captura todos os slugs; com argumentos, só os informados.
 */
import { chromium } from "playwright";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const INVITE = process.env.INVITE_CODE || process.env.REGISTRATION_INVITE_CODE || "";
const CHROMIUM = process.env.CHROMIUM_PATH || (fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined);
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const OUT = path.join(ROOT, "public", "tutoriais");
const JSON_OUT = path.join(ROOT, "lib", "content", "tutorial-media.json");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "cs-tutoriais-"));

const DEMO = { name: "Conta Demo", email: "demo-tutorial@example.com", password: process.env.DEMO_PASSWORD || "Demo-Tutorial-2026!" };
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE);

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- API + conta demo
let cookieValue = "";
async function api(method, p, body) {
  const headers = { accept: "application/json" };
  if (cookieValue) headers.cookie = `cs_session=${cookieValue}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    if (pair.slice(0, i) === "cs_session") cookieValue = pair.slice(i + 1);
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* sem corpo JSON */
  }
  return { status: res.status, json };
}

async function login() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await api("POST", "/api/auth/login", { email: DEMO.email, password: DEMO.password });
    if (r.status === 200) return r.json.data.user;
    if (r.status === 429) {
      log("limite de login; aguardando 65 s");
      await sleep(65_000);
      continue;
    }
    throw new Error(`login falhou (${r.status}): ${JSON.stringify(r.json?.error ?? r.json)}`);
  }
  throw new Error("login: limite de tentativas");
}

function psql(sql) {
  const url = (process.env.DATABASE_URL || "").split("?")[0];
  if (!url) throw new Error("DATABASE_URL ausente (carregue .env.local)");
  return execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-qAt", "-c", sql], { encoding: "utf8" }).trim();
}

async function ensureDemoAccount() {
  const reg = await api("POST", "/api/auth/register", { name: DEMO.name, email: DEMO.email, password: DEMO.password, acceptTerms: true, ...(INVITE ? { invite: INVITE } : {}) });
  if (reg.status === 201) log("conta demo criada");
  else if (reg.status === 409) log("conta demo já existe");
  else throw new Error(`cadastro falhou (${reg.status}): ${JSON.stringify(reg.json?.error ?? reg.json)}`);

  if (IS_LOCAL) {
    const esc = DEMO.email.replace(/'/g, "''");
    const id = "c" + randomBytes(12).toString("hex");
    psql(`UPDATE "User" SET plan='PLATINUM', role='USER', name='${DEMO.name}', "onboardedAt"=NULL, "telegramChatId"=NULL WHERE email='${esc}';`);
    psql(`INSERT INTO "Subscription" (id, "userId", plan, status, provider, "currentPeriodEnd", "cancelAtPeriodEnd", "createdAt", "updatedAt")
          SELECT '${id}', u.id, 'ELITE', 'ACTIVE', 'manual', now() + interval '1 year', false, now(), now() FROM "User" u WHERE u.email='${esc}'
          ON CONFLICT ("userId") DO UPDATE SET plan='ELITE', status='ACTIVE', provider='manual', "currentPeriodEnd"=now() + interval '1 year', "cancelAtPeriodEnd"=false, "trialEndsAt"=NULL, "updatedAt"=now();`);
    // "Ver os sinais do modelo" volta a pendente: a lista Primeiros passos aparece (5 de 6) em toda captura
    psql(`DELETE FROM "AnalyticsEvent" e USING "User" u WHERE e."userId"=u.id AND u.email='${esc}' AND e.name='onboarding_step' AND e.props->>'step'='sinais';`);
    log("ELITE concedido no banco local");
  } else {
    log("BASE_URL não é local: plano NÃO alterado (somente banco local)");
  }
  cookieValue = "";
  const user = await login(); // sessão nova já com o plano atualizado
  log(`sessão: ${user.name} plano=${user.plan}`);
  await seedDemoUsage();
}

async function seedDemoUsage() {
  // favoritos
  const wl = await api("GET", "/api/watchlist");
  const have = new Set((wl.json?.data?.items ?? []).map((i) => i.symbol));
  for (const s of ["BTC", "ETH", "SOL"]) if (!have.has(s)) log(`favorito ${s}:`, (await api("POST", "/api/watchlist", { symbol: s })).status);
  // agente 4H
  const ag = await api("GET", "/api/agents");
  const agents = ag.json?.data?.agents ?? ag.json?.data?.items ?? [];
  if (!agents.length) {
    const st = await api("GET", "/api/agents/strategies");
    const keys = (st.json?.data?.strategies ?? []).map((s) => s.key);
    const strategies = ["ema_stack_trend", "rsi_reversal"].filter((k) => keys.includes(k));
    const r = await api("POST", "/api/agents", { name: "Tendência BTC/ETH", symbols: ["BTC", "ETH", "SOL"], operationType: "swing_trade", timeframe: "4h", strategies, minConfidence: 60, notification: "log" });
    log("agente:", r.status, r.status >= 300 ? JSON.stringify(r.json?.error) : "");
  }
  // monitor
  const mo = await api("GET", "/api/monitors");
  if (!(mo.json?.data?.items ?? []).length) {
    const r = await api("POST", "/api/monitors", { symbol: "BTC", timeframe: "4h", exchange: "binance", instrument: "spot", kind: "SETUP" });
    log("monitor:", r.status, r.status >= 300 ? JSON.stringify(r.json?.error) : "");
  }
  // alerta de preço: limiar derivado do preço real atual do app (+5 %, arredondado)
  const al = await api("GET", "/api/alerts");
  const alerts = al.json?.data?.alerts ?? al.json?.data?.items ?? [];
  if (!alerts.length) {
    const t = await api("GET", "/api/market/tickers");
    const btc = (t.json?.data?.tickers ?? []).find((x) => x.symbol === "BTC");
    if (btc?.price) {
      const threshold = Math.round((btc.price * 1.05) / 1000) * 1000;
      const r = await api("POST", "/api/alerts", { symbol: "BTC", kind: "price_above", threshold });
      log(`alerta BTC > ${threshold}:`, r.status, r.status >= 300 ? JSON.stringify(r.json?.error) : "");
    } else log("alerta: sem preço do BTC no app; pulado");
  }
  // aula 1 concluída
  const lr = await api("PATCH", "/api/learning", { progress: { "o-que-e-bitcoin": { done: true, score: 2, at: new Date().toISOString() } } });
  log("aula 1:", lr.status);
}


// ---------------------------------------------------------------- navegador: sobreposição (cursor + legenda) e máscara de e-mail
/** Roda em toda página antes dos scripts do app. Máscara do e-mail sempre; cursor/legenda só quando __CS_CAPTURE_OVERLAY. */
function pageInit({ email, overlay }) {
  try {
    localStorage.setItem("cs-theme", "dark");
    // contexto de mercado padrão das capturas: Binance Spot (o perpétuo da Binance não responde no ambiente local)
    localStorage.setItem("cs-selection-v1", JSON.stringify({ symbol: "BTC", timeframe: "4h", exchange: "binance", instrument: "spot" }));
  } catch {
    /* sem storage */
  }
  const MASK = "••••••••@example.com";
  const maskNode = (root) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) if (n.nodeValue && n.nodeValue.includes(email)) n.nodeValue = n.nodeValue.split(email).join(MASK);
    for (const el of root.querySelectorAll ? root.querySelectorAll("input") : []) if (el.value === email) el.style.filter = "blur(5px)";
  };
  const start = () => {
    maskNode(document.body);
    new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === "characterData" && m.target.nodeValue?.includes(email)) m.target.nodeValue = m.target.nodeValue.split(email).join(MASK);
        for (const a of m.addedNodes) if (a.nodeType === 1) maskNode(a);
        else if (a.nodeType === 3 && a.nodeValue?.includes(email)) a.nodeValue = a.nodeValue.split(email).join(MASK);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    const st = document.createElement("style");
    // indicador de progresso de rota do app não aparece nas capturas
    st.textContent = `nextjs-portal{display:none!important}`;
    document.head.appendChild(st);
    if (!overlay) return;
    const css = document.createElement("style");
    css.textContent = `
#__cs_cap{position:fixed;left:50%;bottom:28px;transform:translate(-50%,8px);opacity:0;transition:opacity .3s cubic-bezier(.4,0,.2,1),transform .3s cubic-bezier(.4,0,.2,1);background:rgba(13,20,36,.94);border:1px solid rgba(148,163,184,.18);color:#F8FAFC;font:500 14px/1.45 Inter,ui-sans-serif,system-ui,sans-serif;letter-spacing:.005em;padding:10px 18px 10px 14px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);z-index:2147483647;pointer-events:none;max-width:78vw;display:flex;align-items:center;gap:10px}
#__cs_cap.on{opacity:1;transform:translate(-50%,0)}
#__cs_cap b{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:linear-gradient(135deg,#22D3EE,#1687FF);color:#07101a;font:700 12px/1 Inter,system-ui,sans-serif}
#__cs_cur{position:fixed;left:-40px;top:-40px;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:rgba(34,211,238,.85);border:2px solid #F8FAFC;box-shadow:0 0 0 5px rgba(34,211,238,.22),0 2px 8px rgba(0,0,0,.4);z-index:2147483647;pointer-events:none;transition:transform .15s cubic-bezier(.4,0,.2,1)}
#__cs_cur.down{transform:scale(.8)}
.__cs_rip{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:2px solid #22D3EE;z-index:2147483646;pointer-events:none;animation:__cs_rip .6s cubic-bezier(.4,0,.2,1) forwards}
@keyframes __cs_rip{from{transform:scale(1);opacity:.9}to{transform:scale(3.4);opacity:0}}`;
    document.head.appendChild(css);
    const cap = document.createElement("div");
    cap.id = "__cs_cap";
    const cur = document.createElement("div");
    cur.id = "__cs_cur";
    document.body.append(cap, cur);
    const pos = (x, y) => {
      cur.style.left = x + "px";
      cur.style.top = y + "px";
      try {
        sessionStorage.setItem("__cs_cur", JSON.stringify([x, y]));
      } catch {
        /* */
      }
    };
    try {
      const p = JSON.parse(sessionStorage.getItem("__cs_cur") || "null");
      if (p) pos(p[0], p[1]);
    } catch {
      /* */
    }
    addEventListener("mousemove", (e) => pos(e.clientX, e.clientY), true);
    addEventListener("mousedown", (e) => {
      cur.classList.add("down");
      const r = document.createElement("div");
      r.className = "__cs_rip";
      r.style.left = e.clientX + "px";
      r.style.top = e.clientY + "px";
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 700);
    }, true);
    addEventListener("mouseup", () => cur.classList.remove("down"), true);
    const setCap = (n, text) => {
      if (!text) {
        cap.classList.remove("on");
        return;
      }
      cap.innerHTML = "";
      const b = document.createElement("b");
      b.textContent = String(n);
      const s = document.createElement("span");
      s.textContent = text;
      cap.append(b, s);
      requestAnimationFrame(() => cap.classList.add("on"));
    };
    window.__csCaption = (n, text) => {
      try {
        sessionStorage.setItem("__cs_capt", JSON.stringify([n, text]));
      } catch {
        /* */
      }
      if (!text) setCap(0, "");
      else if (cap.classList.contains("on")) {
        cap.classList.remove("on");
        setTimeout(() => setCap(n, text), 260);
      } else setCap(n, text);
    };
    try {
      const c = JSON.parse(sessionStorage.getItem("__cs_capt") || "null");
      if (c && c[1]) setCap(c[0], c[1]);
    } catch {
      /* */
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
}

// ---------------------------------------------------------------- utilidades de página
async function settle(page, extra = 1500) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  // espera esqueletos/carregadores sumirem (até 12 s)
  await page
    .waitForFunction(() => !document.querySelector('[aria-busy="true"], .animate-pulse, [data-loading="true"]'), null, { timeout: 12_000 })
    .catch(() => {});
  await page.waitForTimeout(extra);
}

function helpers(page, video) {
  const h = {
    video,
    async move(loc) {
      await loc.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
      const box = await loc.boundingBox();
      if (!box) throw new Error("elemento sem posição");
      const x = box.x + box.width / 2;
      const y = box.y + Math.min(box.height / 2, 20);
      await page.mouse.move(x, y, { steps: video ? 28 : 1 });
      if (video) await page.waitForTimeout(250);
      return { x, y };
    },
    async click(loc) {
      loc = loc.filter({ visible: true }).first();
      await loc.waitFor({ state: "visible", timeout: 10_000 });
      await h.move(loc);
      await loc.click({ timeout: 10_000 });
    },
    /** aponta o elemento: move o cursor e desenha um anel ciano em volta (anotação do tutorial) */
    async hover(loc) {
      loc = loc.filter({ visible: true }).first();
      await loc.waitFor({ state: "visible", timeout: 10_000 });
      await h.move(loc);
      await loc.hover({ force: true, timeout: 5000 }).catch(() => {});
      await h.ring(loc);
    },
    async ring(loc) {
      await loc.evaluate((el) => {
        el.setAttribute("data-cs-ring", "");
        el.style.outline = "2px solid #22D3EE";
        el.style.outlineOffset = "3px";
        el.style.boxShadow = "0 0 0 7px rgba(34,211,238,.16)";
        el.style.transition = "outline-color .2s, box-shadow .2s";
      });
    },
    async clearRing() {
      await page.evaluate(() => {
        for (const el of document.querySelectorAll("[data-cs-ring]")) {
          el.removeAttribute("data-cs-ring");
          el.style.outline = "";
          el.style.outlineOffset = "";
          el.style.boxShadow = "";
        }
      }).catch(() => {});
    },
    /** Select (Radix) do conteúdo: abre o gatilho e escolhe a opção pelo texto */
    async choose(trigger, option) {
      await h.click(trigger);
      await page.waitForTimeout(video ? 600 : 300);
      await h.click(page.getByRole("option", { name: option }));
    },
    async type(loc, text) {
      loc = loc.filter({ visible: true }).first();
      await h.click(loc);
      await loc.fill("");
      if (video) await loc.pressSequentially(text, { delay: 32 });
      else await loc.fill(text);
    },
    /** rola suavemente até o elemento (topo com margem para o cabeçalho fixo) */
    async scrollTo(loc, offset = 90) {
      loc = loc.first();
      await loc.waitFor({ state: "attached", timeout: 10_000 });
      await loc.evaluate((el, off) => {
        const y = el.getBoundingClientRect().top + window.scrollY - off;
        window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
      }, offset);
      await page.waitForTimeout(video ? 900 : 700);
    },
    async top() {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      await page.waitForTimeout(600);
    },
    heading: (name) => page.locator("main").getByRole("heading", { name, exact: false }),
    /** <button> do conteúdo pelo texto visível (inclui botões com role radio/tab) */
    button: (name, exact = false) => page.locator("main button").filter({ hasText: exact ? new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`) : name }),
  };
  return h;
}

// ---------------------------------------------------------------- roteiros por ferramenta
const S = (caption, run, opts = {}) => ({ caption, run, ...opts });

const FLOWS = [
  {
    slug: "primeiros-passos",
    url: "/registro",
    anonStart: true,
    coverAuth: "/",
    mobileUrl: "/registro",
    mobileAnon: true,
    steps: [
      S("Abra a página de cadastro e preencha nome, e-mail e senha", async (p, h) => {
        await h.type(p.locator("#name"), "Conta Demo");
        await h.type(p.locator("#email"), "voce@example.com");
        await h.type(p.locator("#password"), "Exemplo-Senha-2026");
      }, { anon: true }),
      S("Marque o aceite dos Termos e clique em Começar 3 dias grátis", async (p, h) => {
        await h.click(p.locator("#accept-terms"));
        await h.hover(p.locator("form button[type=submit]"));
      }, { anon: true }),
      S("No Início, siga a lista Primeiros passos", async (p, h) => h.hover(p.locator('section[aria-label="Primeiros passos"]')), { url: "/" }),
      S("Logo abaixo, Seu painel mostra plano, agentes, alertas e aulas", async (p, h) => {
        await h.scrollTo(p.getByText("Seu painel", { exact: true }), 80);
        await h.hover(p.getByText("Seu painel", { exact: true }).locator("xpath=following-sibling::*[1]"));
      }),
    ],
  },
  {
    slug: "inicio",
    url: "/",
    steps: [
      S("Seu painel mostra plano, agentes, alertas e progresso na Jornada", async (p, h) => h.scrollTo(p.getByText("Seu painel", { exact: true }), 80)),
      S("Acompanhe os sinais ativos do modelo validado", async (p, h) => h.scrollTo(h.heading("Sinais ativos"), 110)),
      S("Filtre os sinais por timeframe: 4H ou 1D", async (p, h) => h.click(h.button("4H", true))),
      S("Veja o Mercado agora e troque a lista em Maiores altas", async (p, h) => {
        await h.scrollTo(h.heading("Mercado agora"), 80);
        await h.click(p.getByRole("tab", { name: "Maiores altas" }));
      }),
    ],
  },
  {
    slug: "scanner",
    url: "/scanner/padroes",
    steps: [
      S("Escolha o timeframe 4H", async (p, h) => {
        await h.click(h.button("4H", true));
        await h.ring(h.button("4H", true).first());
      }),
      S("Clique em Escanear agora", async (p, h) => {
        await h.click(h.button("Escanear Agora"));
        await p.waitForTimeout(2500);
      }),
      S("Veja os padrões encontrados com alvo, stop e taxa de acerto", async (p, h) => h.scrollTo(p.getByRole("tab", { name: /Padrões Técnicos/ }), 80)),
      S("Na Tabela em tempo real, clique numa coluna para ordenar (ex.: 24h)", async (p, h) => {
        await h.click(p.getByRole("tab", { name: "Tabela em tempo real" }));
        await p.waitForTimeout(600);
        await h.click(h.button("24h", true));
      }),
    ],
  },
  {
    slug: "scanner-setups",
    url: "/scanner",
    steps: [
      S("Escolha o timeframe (ex.: 1D)", async (p, h) => h.click(p.getByRole("tab", { name: "1D", exact: true }))),
      S("Filtre pelo estado do setup (ex.: Em formação)", async (p, h) => h.click(h.button("Em formação", true))),
      S("Ordene pela Nota (Confluence Score)", async (p, h) => {
        await h.click(p.locator("main thead").getByText("Nota", { exact: true }));
        await p.waitForTimeout(400);
        await h.click(p.locator("main thead").getByText("Nota", { exact: true }));
      }),
    ],
  },
  {
    slug: "analise-completa",
    url: "/charts/BTC?tf=4h&exchange=binance&instrument=spot",
    steps: [
      S("No topo: ativo, corretora, mercado e timeframe", async (p, h) => h.hover(p.getByRole("tablist").filter({ has: p.getByRole("tab", { name: "4H", exact: true }) }))),
      S("Troque entre as abas Análise, Indicadores e Alertas", async (p, h) => h.click(p.getByRole("tab", { name: "Indicadores", exact: true }))),
      S("Na aba Análise, confira o Confluence Score e o estado do setup", async (p, h) => {
        await h.click(p.getByRole("tab", { name: "Análise", exact: true }));
        await h.scrollTo(h.heading("Confluence Score"), 80);
      }),
      S("Use o painel de Gestão de risco para dimensionar a posição", async (p, h) => {
        await h.scrollTo(h.heading("Gestão de risco"), 80);
        await h.hover(h.heading("Gestão de risco").locator("xpath=ancestor::*[self::section or contains(@class,'rounded')][1]"));
      }),
    ],
  },
  {
    slug: "graficos",
    url: "/graficos",
    steps: [
      S("Escolha o ativo e o timeframe (ex.: 1D)", async (p, h) => h.click(h.button("1D", true))),
      S("Ligue indicadores como MACD e Fibonacci", async (p, h) => {
        await h.click(h.button("MACD", true));
        await p.waitForTimeout(600);
        await h.click(h.button("Fib", true));
      }),
      S("Veja suportes e resistências calculados", async (p, h) => h.scrollTo(h.heading("Suportes e resistências"), 80)),
      S("Confira os padrões detectados e clique num deles para desenhá-lo", async (p, h) => {
        await h.scrollTo(h.heading("Padrões detectados"), 80);
        await h.hover(h.heading("Padrões detectados"));
      }),
    ],
  },
  {
    slug: "fibonacci",
    url: "/fibonacci",
    steps: [
      S("Escolha o ativo e o timeframe do swing (ex.: 4H)", async (p, h) => h.choose(p.locator("main").getByRole("combobox").nth(1), "4H")),
      S("Leia as retrações e extensões; o nível mais próximo fica destacado", async (p, h) => {
        await h.scrollTo(h.heading("Níveis automáticos"), 80);
        await h.hover(p.locator("main").getByText("mais próximo", { exact: false }).first());
      }),
      S("Use a Calculadora manual com máxima e mínima próprias", async (p, h) => {
        await h.top();
        await h.click(p.getByRole("tab", { name: "Calculadora manual" }));
      }),
    ],
  },
  {
    slug: "panorama",
    url: "/panorama",
    steps: [
      S("Comece pelo resumo executivo do dia", async (p, h) => {
        await h.scrollTo(h.heading("Resumo executivo"), 80);
        await h.hover(h.heading("Resumo executivo"));
      }),
      S("Veja os principais fatores e as manchetes", async (p, h) => h.scrollTo(h.heading("Principais fatores"), 80)),
      S("Compare os 30 ativos monitorados", async (p, h) => h.scrollTo(h.heading("Os 30 ativos monitorados"), 80)),
      S("Acompanhe o Medo & Ganância dos últimos dias", async (p, h) => {
        await h.scrollTo(h.heading("Medo & Ganância"), 80);
        await h.hover(h.heading("Medo & Ganância"));
      }),
    ],
  },
  {
    slug: "bolhas",
    url: "/bubbles",
    steps: [
      S("Escolha o período da variação (ex.: 7d)", async (p, h) => h.click(h.button("7d", true))),
      S("Troque o tamanho das bolhas para capitalização", async (p, h) => h.click(h.button("Tamanho: cap."))),
      S("Verde subiu e vermelho caiu no período; clique numa bolha para abrir o gráfico", async (p, h) => h.click(h.button("24h", true))),
    ],
  },
  {
    slug: "carteira",
    url: "/carteira",
    steps: [
      S("Seus favoritos e posições simuladas ficam na primeira aba", async (p, h) => h.hover(p.locator("main table").first())),
      S("Adicione um ativo; quantidade e preço médio são opcionais", async (p, h) => {
        await h.type(p.getByPlaceholder("0.5"), "0.1");
        await h.hover(h.button("Adicionar", true));
      }),
      S("Na aba Alertas, crie e acompanhe alertas de preço", async (p, h) => h.click(p.getByRole("tab", { name: "Alertas" }))),
      S("Em Análises salvas ficam as leituras de gráfico por IA", async (p, h) => h.click(p.getByRole("tab", { name: "Análises salvas" }))),
    ],
  },
  {
    slug: "simulador",
    url: "/simulador",
    steps: [
      S("Escolha BTC, DCA — aportes mensais e o período de 1 ano", async (p, h) => {
        await h.click(h.button("1 ano", true));
        await h.ring(h.button("1 ano", true).first());
      }),
      S("Clique em Simular", async (p, h) => {
        await h.click(h.button("Simular", true));
        await p.waitForTimeout(2500);
      }),
      S("Veja quanto o aporte teria rendido com preços diários reais", async (p, h) => h.hover(p.locator("main").getByText(/Valor final/i).first().locator("xpath=.."))),
    ],
  },
  {
    slug: "backtest",
    url: "/backtest",
    steps: [
      S("Confira setup, timeframe e ativo e clique em Rodar backtest", async (p, h) => {
        await h.click(h.button("Rodar backtest"));
        await p.waitForFunction(() => /Curva de capital/i.test(document.querySelector("main")?.innerText ?? ""), null, { timeout: 60_000 }).catch(() => {});
        await p.waitForTimeout(1500);
      }),
      S("Leia operações, expectativa, acerto e drawdown", async (p, h) => h.hover(p.locator("main").getByText("Operações", { exact: true }).first().locator("xpath=../.."))),
      S("Acompanhe a curva de capital e a lista de operações", async (p, h) => h.scrollTo(p.locator("main").getByText(/Curva de capital/i).first(), 90)),
    ],
  },
  {
    slug: "construtor-estrategias",
    url: "/strategies",
    steps: [
      S("Abra um modelo validado como ponto de partida", async (p, h) => {
        await h.click(p.locator("main button", { hasText: "Rompimento Donchian 55 + EMA 200 (4H)" }));
        await p.waitForTimeout(800);
      }),
      S("Ajuste as condições e a saída da estratégia", async (p, h) => {
        await h.scrollTo(h.button("Condição", true), 260);
        await h.hover(h.button("Condição", true));
      }),
      S("Clique em Testar agora para ver se as condições batem hoje", async (p, h) => {
        await h.click(h.button("Testar agora"));
        await p.waitForTimeout(3500);
      }),
    ],
  },
  {
    slug: "monitores-alertas",
    url: "/monitor",
    cleanup: async () => {
      const r = await api("GET", "/api/monitors");
      for (const m of r.json?.data?.items ?? []) if (m.symbol !== "BTC") await api("DELETE", `/api/monitors/${m.id}`);
    },
    steps: [
      S("Em Novo monitor, escolha o ativo e o timeframe", async (p, h) => {
        const sel = p.locator("main select").first();
        await h.hover(sel);
        await sel.selectOption({ label: "ETH/USDT" });
      }),
      S("Marque em quais estados do setup quer ser avisado", async (p, h) => h.click(h.button("ACTIVE", true))),
      S("Clique em Criar monitor", async (p, h) => {
        await h.click(h.button("Criar monitor"));
        await p.waitForTimeout(1500);
      }),
      S("Seus monitores aparecem na lista, com pausar e excluir", async (p, h) => h.hover(p.locator("main").getByText("ETH/USDT 4H").first().locator("xpath=.."))),
    ],
  },
  {
    slug: "agentes-ia",
    url: "/agentes",
    steps: [
      S("Clique em Novo Agente", async (p, h) => {
        await h.click(h.button("Novo Agente"));
        await p.waitForTimeout(700);
      }),
      S("Dê um nome ao agente e escolha um ícone", async (p, h) => h.type(p.getByRole("dialog").getByPlaceholder("Ex.: Sentinela BTC 4H"), "Tendência ETH 4H")),
      S("Clique em Próximo e escolha ativos, tipo de operação e timeframe", async (p, h) => {
        const dlg = p.getByRole("dialog");
        await h.click(dlg.getByRole("button", { name: "Próximo" }));
        await p.waitForTimeout(500);
        await h.click(dlg.locator("label").filter({ hasText: /\bETH\s*$/ }).first());
      }),
      S("Selecione as estratégias que o agente vai vigiar", async (p, h) => {
        const dlg = p.getByRole("dialog");
        await h.click(dlg.getByRole("button", { name: "Próximo" }));
        await p.waitForTimeout(500);
        await h.click(dlg.getByText("Tendência por EMAs (8/25/100)").first());
      }),
      S("Depois de criado, o agente aparece em Meus Agentes", async (p, h) => {
        await p.keyboard.press("Escape");
        await p.waitForTimeout(500);
        await h.hover(h.heading("Meus Agentes").locator("xpath=ancestor::*[contains(@class,'rounded')][1]"));
      }),
    ],
  },
  {
    slug: "sentinela",
    url: "/sentinela",
    cleanup: async () => {
      const r = await api("GET", "/api/sentinels");
      for (const s of r.json?.data?.items ?? []) await api("DELETE", `/api/sentinels/${s.id}`);
    },
    steps: [
      S("Escolha a moeda que o Sentinela vai vigiar", async (p, h) => h.choose(p.getByRole("combobox", { name: "Moeda" }), /ETH — Ethereum/)),
      S("Defina o tempo gráfico (4 horas é o recomendado) e a confiança mínima", async (p, h) => h.hover(p.getByRole("combobox", { name: "Timeframe" }))),
      S("Clique em Criar Sentinela", async (p, h) => {
        await h.click(h.button("Criar Sentinela"));
        await p.waitForTimeout(1800);
      }),
      S("Ele aparece em Meus Sentinelas e roda 24h no servidor", async (p, h) => {
        await h.scrollTo(h.heading("Meus Sentinelas"), 80);
        await h.hover(h.heading("Meus Sentinelas").locator("xpath=ancestor::*[contains(@class,'rounded')][1]"));
      }),
    ],
  },
  {
    slug: "analista-ia",
    url: "/analista",
    steps: [
      S("Abra o Analista IA e escolha uma pergunta sugerida", async (p, h) => h.hover(h.button("Resuma BTC no 4H"))),
      S("Clique na pergunta e aguarde a resposta", async (p, h) => {
        await h.click(h.button("Resuma BTC no 4H"));
        await p.waitForTimeout(1200);
      }),
      S("A resposta usa só os números do app: estrutura, níveis e setup", async (p, h) => {
        await p.waitForFunction(() => /Confluence Score/.test(document.querySelector("main")?.innerText ?? ""), null, { timeout: 60_000 }).catch(() => {});
        await p.waitForTimeout(800);
        const q = p.locator("main").getByText("Resuma BTC no 4H: estrutura, níveis e riscos").last();
        await h.scrollTo(q, 140);
      }),
    ],
  },
  {
    slug: "jornada",
    url: "/jornada",
    steps: [
      S("Escolha uma aula na Jornada Trader", async (p, h) => h.hover(p.locator("main").getByRole("link", { name: /Candles, timeframes e volume/ }))),
      S("Leia cada etapa da aula no seu ritmo", async (p, h) => {
        await h.click(p.locator("main").getByRole("link", { name: /Candles, timeframes e volume/ }));
        await p.waitForURL(/candles-e-timeframes/, { timeout: 15_000 });
        await settle(p, 800);
      }),
      S("Avance para a próxima etapa: Timeframes", async (p, h) => h.click(p.locator("main").getByRole("button", { name: /^Timeframes/ }).last())),
      S("Pratique com o exercício interativo", async (p, h) => h.click(p.locator("main").getByRole("button", { name: /Pratique/ }).first())),
      S("Responda o teste rápido para concluir a aula", async (p, h) => {
        await h.click(p.locator("main").getByRole("button", { name: /Teste rápido/ }).first());
        await p.waitForTimeout(500);
        await h.click(p.locator('main [role="radiogroup"]').first().getByRole("radio").nth(1));
      }),
    ],
  },
  {
    slug: "planos-e-conta",
    url: "/planos",
    steps: [
      S("Em Planos, veja sua assinatura e compare PRO e ELITE", async (p, h) => h.hover(p.locator("main").getByText("Sua assinatura", { exact: false }).first().locator("xpath=.."))),
      S("Em Preferências, ajuste nome, tema, moeda e timeframe padrão", async (p, h) => {
        await p.goto(BASE + "/preferencias", { waitUntil: "domcontentloaded" });
        await settle(p, 800);
        await h.hover(h.heading("Conta e interface").locator("xpath=ancestor::*[contains(@class,'rounded')][1]"));
      }),
      S("Abra o menu da conta no canto superior direito", async (p, h) => {
        await h.click(p.getByRole("button", { name: "Conta", exact: true }));
        await p.waitForTimeout(500);
      }),
    ],
  },
  {
    slug: "notificacoes-push",
    url: "/preferencias",
    prep: async (p, h) => h.scrollTo(h.heading("Notificações no navegador"), 200),
    steps: [
      S("Em Preferências, encontre o cartão Notificações no navegador", async (p, h) => h.hover(h.heading("Notificações no navegador").locator("xpath=ancestor::*[contains(@class,'rounded')][1]"))),
      S("Clique em Ativar notificações e permita no aviso do navegador", async (p, h) => h.hover(h.button("Ativar notificações"))),
      S("Depois de ativar, use Enviar teste para conferir", async (p, h) => h.hover(h.button("Enviar teste"))),
    ],
  },
  {
    slug: "conectar-telegram",
    url: "/preferencias",
    prep: async (p, h) => h.scrollTo(h.heading("Alertas no Telegram"), 200),
    video: false,
    steps: [
      S("Em Preferências, encontre o cartão Alertas no Telegram", async (p, h) => h.hover(h.heading("Alertas no Telegram").locator("xpath=ancestor::*[contains(@class,'rounded')][1]"))),
      S("Clique em Conectar Telegram e siga o link para o bot", async (p, h) => h.hover(h.button("Conectar Telegram"))),
    ],
  },
];

// ---------------------------------------------------------------- saída de imagens e vídeo
async function saveWebp(pngBuf, file, maxWidth) {
  let img = sharp(pngBuf);
  const meta = await img.metadata();
  if (maxWidth && meta.width > maxWidth) img = img.resize({ width: maxWidth });
  const info = await img.webp({ quality: 80, effort: 5 }).toFile(file);
  return { width: info.width, height: info.height };
}

function ffprobeDuration(file) {
  try {
    return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).trim());
  } catch {
    return NaN;
  }
}

async function encodeVideo(webm, startSec, durSec, mp4, poster, posterAt) {
  const dur = Math.min(Math.max(durSec, 8), 25);
  let crf = 28;
  for (;;) {
    execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-ss", startSec.toFixed(2), "-i", webm, "-t", dur.toFixed(2), "-vf", "fps=30,scale=1280:720:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-profile:v", "high", "-movflags", "+faststart", "-an", mp4]);
    const size = fs.statSync(mp4).size;
    if (size <= 2.5 * 1024 * 1024 || crf >= 36) break;
    crf += 3;
  }
  const png = path.join(TMP, "poster.png");
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-ss", Math.max(0.5, Math.min(posterAt ?? ffprobeDuration(mp4) * 0.55, ffprobeDuration(mp4) - 0.4)).toFixed(2), "-i", mp4, "-frames:v", "1", png]);
  const dims = await saveWebp(fs.readFileSync(png), poster, 1600);
  return { ...dims, crf, duration: ffprobeDuration(mp4) };
}

// ---------------------------------------------------------------- execução de um roteiro
const DESKTOP = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, colorScheme: "dark", locale: "pt-BR", timezoneId: "America/Sao_Paulo" };
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "dark", locale: "pt-BR", timezoneId: "America/Sao_Paulo", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" };

async function newContext(browser, opts, { auth, overlay = false, video = null }) {
  const ctx = await browser.newContext({ ...opts, ...(video ? { recordVideo: { dir: video, size: { width: 1280, height: 720 } } } : {}) });
  await ctx.addInitScript(pageInit, { email: DEMO.email, overlay });
  if (auth) await addAuth(ctx);
  return ctx;
}
async function addAuth(ctx) {
  await ctx.addCookies([{ name: "cs_session", value: cookieValue, url: BASE }]);
}

async function goto(page, url) {
  await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await settle(page);
}

const report = {};

async function runFlow(browser, flow) {
  const dir = path.join(OUT, flow.slug);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const rel = (f) => `/tutoriais/${flow.slug}/${f}`;
  const rep = (report[flow.slug] = { skipped: [], errors: [] });
  const entry = { cover: null, coverWidth: null, coverHeight: null, mobile: null, mobileWidth: null, mobileHeight: null, video: null, poster: null, posterWidth: null, posterHeight: null, steps: [], capturedAt: new Date().toISOString() };

  // 1) capturas desktop (capa + passos)
  {
    const ctx = await newContext(browser, DESKTOP, { auth: !flow.anonStart });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => rep.errors.push(`pageerror: ${e.message.slice(0, 160)}`));
    const h = helpers(page, false);
    // capa: tela logada principal (para primeiros-passos, o Início com a lista)
    if (flow.coverAuth) {
      const c2 = await newContext(browser, DESKTOP, { auth: true });
      const p2 = await c2.newPage();
      await goto(p2, flow.coverAuth);
      entry.cover = rel("capa.webp");
      Object.assign(entry, dimsOf("cover", await saveWebp(await p2.screenshot(), path.join(dir, "capa.webp"), 1600)));
      await c2.close();
    }
    await goto(page, flow.url);
    if (flow.prep) await flow.prep(page, h);
    if (!flow.coverAuth) {
      entry.cover = rel("capa.webp");
      Object.assign(entry, dimsOf("cover", await saveWebp(await page.screenshot(), path.join(dir, "capa.webp"), 1600)));
    }
    let n = 0;
    let authed = !flow.anonStart;
    for (const step of flow.steps) {
      try {
        if (!step.anon && !authed) {
          await addAuth(ctx);
          authed = true;
        }
        await h.clearRing();
        if (step.url) await goto(page, step.url);
        await step.run(page, h);
        await page.waitForTimeout(900);
        await settle(page, 600);
        await page.mouse.move(2, 2); // tira hover/tooltip de cima do conteúdo
        n++;
        const f = `passo-${n}.webp`;
        const d = await saveWebp(await page.screenshot(), path.join(dir, f), 1600);
        entry.steps.push({ src: rel(f), caption: step.caption, width: d.width, height: d.height });
      } catch (e) {
        rep.skipped.push(`passo "${step.caption}": ${String(e.message).split("\n")[0].slice(0, 200)}`);
      }
    }
    await ctx.close();
    if (flow.cleanup) await flow.cleanup();
  }

  // 2) celular
  {
    const ctx = await newContext(browser, MOBILE, { auth: !flow.mobileAnon });
    const page = await ctx.newPage();
    await goto(page, flow.mobileUrl ?? flow.url);
    if (flow.prep && !flow.mobileUrl) await flow.prep(page, helpers(page, false)).catch(() => {});
    entry.mobile = rel("celular.webp");
    Object.assign(entry, dimsOf("mobile", await saveWebp(await page.screenshot(), path.join(dir, "celular.webp"))));
    await ctx.close();
  }

  // 3) vídeo do fluxo principal
  if (flow.video !== false) {
    const vdir = fs.mkdtempSync(path.join(TMP, flow.slug + "-"));
    const ctx = await newContext(browser, { ...DESKTOP, deviceScaleFactor: 1 }, { auth: !flow.anonStart, overlay: true, video: vdir });
    const page = await ctx.newPage();
    const t0 = Date.now();
    const h = helpers(page, true);
    let start = 0;
    let posterAt = null;
    let authed = !flow.anonStart;
    try {
      await goto(page, flow.url);
      if (flow.prep) await flow.prep(page, h);
      await page.mouse.move(640, 420, { steps: 1 });
      start = (Date.now() - t0) / 1000;
      await page.waitForTimeout(900);
      let n = 0;
      for (const step of flow.steps) {
        n++;
        try {
          if (!step.anon && !authed) {
            await addAuth(ctx);
            authed = true;
          }
          await page.evaluate(([i, c]) => window.__csCaption?.(i, c), [n, step.caption]);
          await page.waitForTimeout(700);
          await h.clearRing();
          if (step.url) await goto(page, step.url);
          await step.run(page, h);
          await page.waitForTimeout(1200);
        } catch (e) {
          rep.skipped.push(`vídeo, passo ${n}: ${String(e.message).split("\n")[0].slice(0, 160)}`);
        }
      }
      // pôster: último passo concluído, tela já assentada (sem esqueleto de carregamento)
      posterAt = (Date.now() - t0) / 1000 - start - 0.4;
      await page.waitForTimeout(600);
      await page.evaluate(() => window.__csCaption?.(0, ""));
      await page.waitForTimeout(700);
    } catch (e) {
      rep.errors.push(`vídeo: ${e.message.slice(0, 200)}`);
    }
    const end = (Date.now() - t0) / 1000;
    const video = page.video();
    await ctx.close();
    if (flow.cleanup) await flow.cleanup();
    const webm = await video.path();
    const r = await encodeVideo(webm, start, end - start, path.join(dir, "video.mp4"), path.join(dir, "video-poster.webp"), posterAt);
    if (end - start > 25) rep.skipped.push(`vídeo cortado em 25 s (roteiro durou ${(end - start).toFixed(1)} s)`);
    entry.video = rel("video.mp4");
    entry.poster = rel("video-poster.webp");
    entry.posterWidth = r.width;
    entry.posterHeight = r.height;
    rep.video = { duration: r.duration, crf: r.crf };
  }
  return entry;
}

function dimsOf(kind, d) {
  return { [`${kind}Width`]: d.width, [`${kind}Height`]: d.height };
}

// ---------------------------------------------------------------- instalar-app (sem UI de sistema inventada)
async function runInstallApp(browser) {
  const slug = "instalar-app";
  const dir = path.join(OUT, slug);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const rel = (f) => `/tutoriais/${slug}/${f}`;
  const rep = (report[slug] = { skipped: [], errors: [] });
  const entry = { cover: null, coverWidth: null, coverHeight: null, mobile: null, mobileWidth: null, mobileHeight: null, video: null, poster: null, posterWidth: null, posterHeight: null, steps: [], capturedAt: new Date().toISOString() };

  // capa: logo oficial centralizado no fundo navy do design system (sem esticar nem recolorir)
  const W = 1600;
  const H = 900;
  const logo = await sharp(path.join(ROOT, "public", "brand", "logo.png")).resize({ width: 560, height: 360, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="g" cx="20%" cy="0%" r="70%"><stop offset="0" stop-color="#2563EB" stop-opacity=".10"/><stop offset="1" stop-color="#2563EB" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="#070B14"/><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
  const cover = await sharp(bg).composite([{ input: logo, gravity: "center" }]).png().toBuffer();
  entry.cover = rel("capa.webp");
  Object.assign(entry, dimsOf("cover", await saveWebp(cover, path.join(dir, "capa.webp"), 1600)));

  // botão "Instalar app" do próprio app: aparece só quando o navegador oferece a instalação (evento beforeinstallprompt).
  // O Chromium sem janela não dispara o evento; disparamos um evento com o mesmo nome para o app mostrar o botão real.
  const ctx = await newContext(browser, { ...DESKTOP, viewport: { width: 1440, height: 810 } }, { auth: true });
  const page = await ctx.newPage();
  await goto(page, "/");
  await page.evaluate(() => window.dispatchEvent(new Event("beforeinstallprompt", { cancelable: true })));
  await page.waitForTimeout(800);
  const btn = page.getByRole("button", { name: "Instalar aplicativo" });
  if (await btn.isVisible().catch(() => false)) {
    await btn.hover();
    await page.waitForTimeout(400);
    const d = await saveWebp(await page.screenshot(), path.join(dir, "passo-1.webp"), 1600);
    entry.steps.push({ src: rel("passo-1.webp"), caption: "No computador (Chrome ou Edge), clique em Instalar app no topo da tela", width: d.width, height: d.height });
  } else {
    rep.skipped.push("botão Instalar app não é renderizado no layout atual (o cabeçalho que o usa não está na tela logada)");
  }
  await ctx.close();

  // ícone do manifesto (o que aparece na tela inicial depois de instalar), sobre a cor de fundo do próprio manifesto
  const icon = await sharp(path.join(ROOT, "public", "icons", "icon-512.png")).resize(256, 256).png().toBuffer();
  const iconImg = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><rect width="100%" height="100%" fill="#07101a"/></svg>`)).composite([{ input: icon, gravity: "center" }]).png().toBuffer();
  const n = entry.steps.length + 1;
  const d2 = await saveWebp(iconImg, path.join(dir, `passo-${n}.webp`), 1600);
  entry.steps.push({ src: rel(`passo-${n}.webp`), caption: "Depois de instalado, o CryptoScanner abre pelo ícone, em tela cheia", width: d2.width, height: d2.height });

  // celular: tela inicial do app no celular (é daí que se instala pelo menu do navegador)
  const mctx = await newContext(browser, MOBILE, { auth: true });
  const mp = await mctx.newPage();
  await goto(mp, "/");
  entry.mobile = rel("celular.webp");
  Object.assign(entry, dimsOf("mobile", await saveWebp(await mp.screenshot(), path.join(dir, "celular.webp"))));
  await mctx.close();
  return entry;
}

// ---------------------------------------------------------------- principal
const onlyArgs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
await ensureDemoAccount();
if (process.argv.includes("--seed-only")) process.exit(0);

const browser = await chromium.launch({ executablePath: CHROMIUM });
let media = {};
try {
  media = JSON.parse(fs.readFileSync(JSON_OUT, "utf8"));
} catch {
  /* primeiro run */
}
const ALL = [...FLOWS.map((f) => f.slug), "instalar-app"];
const wanted = onlyArgs.length ? onlyArgs : ALL;
for (const slug of wanted) {
  if (!ALL.includes(slug)) {
    log(`slug desconhecido: ${slug}`);
    continue;
  }
  log(`▶ ${slug}`);
  try {
    media[slug] = slug === "instalar-app" ? await runInstallApp(browser) : await runFlow(browser, FLOWS.find((f) => f.slug === slug));
  } catch (e) {
    (report[slug] ??= { skipped: [], errors: [] }).errors.push(String(e.stack || e).slice(0, 400));
  }
  const r = report[slug];
  log(`  passos=${media[slug]?.steps?.length ?? 0} vídeo=${media[slug]?.video ? "sim" : "não"}${r?.skipped?.length ? " | pulado: " + r.skipped.join(" ; ") : ""}${r?.errors?.length ? " | erros: " + r.errors.join(" ; ") : ""}`);
}
await browser.close();
const ordered = Object.fromEntries(ALL.filter((s) => media[s]).map((s) => [s, media[s]]));
fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
fs.writeFileSync(JSON_OUT, JSON.stringify(ordered, null, 2) + "\n");
if (process.env.REPORT_OUT) fs.writeFileSync(process.env.REPORT_OUT, JSON.stringify(report, null, 2));
log(`JSON: ${path.relative(ROOT, JSON_OUT)}`);
fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 2 });

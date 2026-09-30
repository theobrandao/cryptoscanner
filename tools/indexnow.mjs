#!/usr/bin/env node
/**
 * Envia as URLs do sitemap ao IndexNow (Bing/Copilot, Yandex, Seznam, Naver…) para indexação mais rápida.
 * Rodar manualmente depois de um deploy com conteúdo novo (não roda sozinho):
 *
 *   INDEXNOW_KEY=<a mesma chave da Vercel> node tools/indexnow.mjs            # envia
 *   INDEXNOW_KEY=<chave> node tools/indexnow.mjs --dry-run                    # só lista o que seria enviado
 *
 * Variáveis: INDEXNOW_KEY (obrigatória; a mesma configurada na Vercel e servida em /indexnow-key.txt),
 * BASE_URL (padrão https://www.cryptoscanner.com.br). Antes de enviar, confere que BASE_URL/indexnow-key.txt devolve a chave.
 * Protocolo: https://www.indexnow.org/documentation (POST JSON; até 10.000 URLs por envio; 200/202 = aceito).
 */

const BASE = (process.env.BASE_URL || "https://www.cryptoscanner.com.br").replace(/\/$/, "");
const KEY = (process.env.INDEXNOW_KEY || "").trim();
const DRY = process.argv.includes("--dry-run");
const ENDPOINT = "https://api.indexnow.org/indexnow";
const KEY_LOCATION = `${BASE}/indexnow-key.txt`;

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

if (!/^[A-Za-z0-9-]{8,128}$/.test(KEY)) fail("INDEXNOW_KEY ausente ou inválida (8 a 128 caracteres: letras, números e hífen).", 2);
let host;
try {
  host = new URL(BASE).host;
} catch {
  fail(`BASE_URL inválida: "${BASE}"`, 2);
}

/** URLs de <loc> do sitemap, só do próprio host. */
async function sitemapUrls() {
  const res = await fetch(`${BASE}/sitemap.xml`);
  if (!res.ok) fail(`sitemap.xml respondeu HTTP ${res.status}`);
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  return [...new Set(urls)].filter((u) => {
    try {
      return new URL(u).host === host;
    } catch {
      return false;
    }
  });
}

const urls = await sitemapUrls();
if (urls.length === 0) fail("Nenhuma URL do próprio domínio no sitemap.");
console.log(`${urls.length} URLs de ${BASE}/sitemap.xml`);

const keyRes = await fetch(KEY_LOCATION);
const published = keyRes.ok ? (await keyRes.text()).trim() : "";
if (published !== KEY) fail(`${KEY_LOCATION} não devolve a chave informada (HTTP ${keyRes.status}). Configure INDEXNOW_KEY na Vercel e faça o deploy antes de enviar.`);

if (DRY) {
  for (const u of urls) console.log(`  ${u}`);
  console.log("--dry-run: nada foi enviado.");
  process.exit(0);
}

let sent = 0;
for (let i = 0; i < urls.length; i += 10_000) {
  const urlList = urls.slice(i, i + 10_000);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key: KEY, keyLocation: KEY_LOCATION, urlList }),
  });
  const body = await res.text().catch(() => "");
  if (res.status !== 200 && res.status !== 202) fail(`IndexNow respondeu HTTP ${res.status}: ${body.slice(0, 300)}`);
  sent += urlList.length;
  console.log(`Lote enviado: ${urlList.length} URLs (HTTP ${res.status}).`);
}
console.log(`Pronto: ${sent} URLs enviadas ao IndexNow.`);

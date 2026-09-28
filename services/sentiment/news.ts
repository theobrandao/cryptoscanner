import { XMLParser } from "fast-xml-parser";
import { cached } from "@/lib/cache";
import { getEnv } from "@/lib/env";
import { fetchText } from "@/lib/http";
import { createLogger } from "@/lib/logger";
import { getAsset } from "@/lib/assets";

const log = createLogger("news");

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: number;
  /** -1..1 por léxico; null quando nenhum termo casou */
  score: number | null;
  matchedTerms: string[];
}

/**
 * Léxico simples pt/en para pontuação determinística de manchetes.
 * Não substitui análise editorial; serve como sinal fraco e auditável (os termos casados são devolvidos).
 */
const POSITIVE = [
  "surge",
  "surges",
  "rally",
  "rallies",
  "record",
  "all-time high",
  "ath",
  "bullish",
  "gains",
  "gain",
  "soars",
  "soar",
  "jump",
  "jumps",
  "approval",
  "approved",
  "adoption",
  "inflow",
  "inflows",
  "breakout",
  "recovers",
  "recovery",
  "upgrade",
  "partnership",
  "launch",
  "launches",
  "etf",
  "buy",
  "accumulate",
  "alta",
  "recorde",
  "valoriza",
  "sobe",
  "dispara",
];
const NEGATIVE = [
  "crash",
  "crashes",
  "plunge",
  "plunges",
  "dump",
  "bearish",
  "loss",
  "losses",
  "hack",
  "hacked",
  "exploit",
  "lawsuit",
  "sec sues",
  "ban",
  "banned",
  "outflow",
  "outflows",
  "liquidation",
  "liquidations",
  "fraud",
  "scam",
  "collapse",
  "drops",
  "drop",
  "falls",
  "fall",
  "slump",
  "selloff",
  "sell-off",
  "warning",
  "delist",
  "queda",
  "despenca",
  "cai",
  "prejuízo",
  "golpe",
];

export function scoreHeadline(title: string): { score: number | null; matched: string[] } {
  const t = ` ${title.toLowerCase()} `;
  const matched: string[] = [];
  let pos = 0;
  let neg = 0;
  for (const w of POSITIVE)
    if (t.includes(` ${w} `) || t.includes(` ${w},`) || t.includes(` ${w}:`)) {
      pos++;
      matched.push(`+${w}`);
    }
  for (const w of NEGATIVE)
    if (t.includes(` ${w} `) || t.includes(` ${w},`) || t.includes(` ${w}:`)) {
      neg++;
      matched.push(`-${w}`);
    }
  if (pos + neg === 0) return { score: null, matched };
  return { score: (pos - neg) / (pos + neg), matched };
}

interface RssItem {
  title?: string | { "#text"?: string };
  link?: string | { "@_href"?: string; "#text"?: string };
  pubDate?: string;
  published?: string;
  updated?: string;
}

function text(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "#text" in v) return String((v as { "#text"?: unknown })["#text"] ?? "");
  return "";
}

function parseFeed(xml: string, source: string): NewsItem[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", cdataPropName: "#cdata" });
  const doc = parser.parse(xml) as Record<string, unknown>;
  const channel = (doc.rss as { channel?: { item?: RssItem[] | RssItem } } | undefined)?.channel;
  const feed = doc.feed as { entry?: RssItem[] | RssItem } | undefined;
  let items: RssItem[] = [];
  if (channel?.item) items = Array.isArray(channel.item) ? channel.item : [channel.item];
  else if (feed?.entry) items = Array.isArray(feed.entry) ? feed.entry : [feed.entry];
  return items
    .map((it) => {
      const rawTitle = it.title as unknown;
      const title = typeof rawTitle === "string" ? rawTitle : text(rawTitle) || String((rawTitle as { "#cdata"?: string } | undefined)?.["#cdata"] ?? "");
      const rawLink = it.link as unknown;
      const link = typeof rawLink === "string" ? rawLink : String((rawLink as { "@_href"?: string } | undefined)?.["@_href"] ?? text(rawLink));
      const dateStr = it.pubDate ?? it.published ?? it.updated ?? "";
      const publishedAt = Date.parse(dateStr) || Date.now();
      const { score, matched } = scoreHeadline(title);
      return { title: title.trim(), link, source, publishedAt, score, matchedTerms: matched };
    })
    .filter((n) => n.title.length > 0);
}

async function loadAllNews(): Promise<NewsItem[]> {
  const urls = getEnv()
    .NEWS_RSS_URLS.split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const results = await Promise.allSettled(
    urls.map(async (u) => {
      const xml = await fetchText(u);
      const host = new URL(u).hostname.replace(/^www\./, "");
      return parseFeed(xml, host);
    }),
  );
  const items: NewsItem[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") items.push(...r.value);
    else log.warn("feed indisponível", { url: urls[i], error: String(r.reason) });
  });
  if (items.length === 0) throw new Error("nenhum feed de notícias disponível");
  return items.sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 120);
}

export async function getNews(): Promise<{ items: NewsItem[]; stale: boolean; fetchedAt: number }> {
  const res = await cached<{ items: NewsItem[]; fetchedAt: number }>("sentiment:news", 600, async () => ({ items: await loadAllNews(), fetchedAt: Date.now() }), { staleTtlSeconds: 24 * 3600 });
  return { items: res.value.items, stale: res.stale, fetchedAt: res.value.fetchedAt };
}

/** Filtra manchetes que mencionam o ativo (símbolo ou nome) e as mais gerais de mercado. */
export function filterNewsForSymbol(items: NewsItem[], symbol: string, max = 12): NewsItem[] {
  const asset = getAsset(symbol);
  const terms = [symbol.toLowerCase(), asset?.name.toLowerCase() ?? ""].filter(Boolean);
  const general = ["crypto", "bitcoin", "market", "cripto", "mercado"];
  const specific = items.filter((n) => terms.some((t) => new RegExp(`\\b${escapeRegExp(t)}\\b`, "i").test(n.title)));
  const rest = items.filter((n) => !specific.includes(n) && general.some((g) => n.title.toLowerCase().includes(g)));
  return [...specific, ...rest].slice(0, max);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

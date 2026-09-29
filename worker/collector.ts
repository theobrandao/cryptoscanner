import WebSocket from "ws";
import { ASSETS, getAssetByBinancePair } from "@/lib/assets";
import { getCache } from "@/lib/cache";
import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { CACHE_KEYS, getTickers, type TickersResult } from "@/services/market/market-service";
import type { Ticker } from "@/types/market";

const log = createLogger("collector");

/**
 * Coletor de tickers em tempo real.
 *  - Binance WebSocket (miniTicker) quando disponível: atualiza `tickers:live` no cache a cada segundo.
 *  - Fallback: polling REST (com fallback de provedor) a cada 20 s.
 * Pipeline: Exchange → coletor → normalização → cache → scanner/agentes → frontend (SSE).
 */
interface MiniTicker {
  s: string; // símbolo
  c: string; // close
  o: string; // open
  h: string;
  l: string;
  v: string; // base volume
  q: string; // quote volume
  E: number; // event time
}

export class TickerCollector {
  private ws: WebSocket | null = null;
  private live = new Map<string, Ticker>();
  private flushTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private wsHealthy = false;
  private stopped = false;
  private reconnectDelay = 2000;

  start() {
    this.stopped = false;
    if (getEnv().WORKER_ENABLE_BINANCE_WS) this.connect();
    else log.info("WebSocket Binance desabilitado; usando polling REST");
    this.pollTimer = setInterval(() => void this.pollRest(), 20_000);
    void this.pollRest();
    this.flushTimer = setInterval(() => void this.flush(), 1000);
  }

  stop() {
    this.stopped = true;
    this.ws?.close();
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  /** Alterna entre a base principal e a base "market data only" (data-stream.binance.vision) a cada falha. */
  private wsAttempt = 0;

  private connect() {
    const streams = ASSETS.map((a) => `${a.binancePair.toLowerCase()}@miniTicker`).join("/");
    const env = getEnv();
    const bases = [env.BINANCE_WS_URL, env.BINANCE_WS_FALLBACK_URL].filter((b, i, arr) => b && arr.indexOf(b) === i);
    const base = bases[this.wsAttempt % bases.length] ?? env.BINANCE_WS_URL;
    this.wsAttempt++;
    const url = `${base}?streams=${streams}`;
    log.info("conectando WebSocket", { url: base });
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.on("open", () => {
      this.wsHealthy = true;
      this.reconnectDelay = 2000;
      log.info("WebSocket conectado");
    });
    ws.on("message", (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString()) as { data?: MiniTicker };
        const d = msg.data;
        if (!d) return;
        const asset = getAssetByBinancePair(d.s);
        if (!asset) return;
        const open = Number(d.o);
        const close = Number(d.c);
        this.live.set(asset.symbol, {
          symbol: asset.symbol,
          pair: asset.binancePair,
          price: close,
          changePct24h: open > 0 ? ((close - open) / open) * 100 : 0,
          high24h: Number(d.h),
          low24h: Number(d.l),
          volume24h: Number(d.v),
          quoteVolume24h: Number(d.q),
          updatedAt: d.E,
          source: "binance",
        });
      } catch (err) {
        log.warn("mensagem inválida", { error: (err as Error).message });
      }
    });
    const onDown = (reason: string) => {
      if (this.wsHealthy) log.warn("WebSocket caiu", { reason });
      this.wsHealthy = false;
      if (this.stopped) return;
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(60_000, this.reconnectDelay * 2);
    };
    ws.on("close", () => onDown("close"));
    ws.on("error", (err: Error) => onDown(err.message));
  }

  private async flush() {
    if (!this.wsHealthy || this.live.size === 0) return;
    // idade real = evento mais recente recebido (não o instante do flush): WebSocket parado envelhece e sai do "ao vivo"
    const lastEvent = Math.max(...[...this.live.values()].map((t) => t.updatedAt));
    if (!Number.isFinite(lastEvent) || Date.now() - lastEvent > 15_000) return;
    const payload: TickersResult = { tickers: [...this.live.values()], source: "binance", stale: false, fetchedAt: lastEvent };
    await getCache().set(CACHE_KEYS.tickersLive, payload, 30);
  }

  private async pollRest() {
    if (this.wsHealthy && this.live.size >= ASSETS.length) return;
    try {
      const res = await getTickers({ refresh: true });
      // preserva fetchedAt e stale da coleta; dado de cache não vira "ao vivo"
      if (!res.stale) await getCache().set(CACHE_KEYS.tickersLive, res, 30);
      log.debug("tickers via REST", { source: res.source, stale: res.stale });
    } catch (err) {
      log.warn("polling REST falhou", { error: (err as Error).message });
    }
  }

  isWebSocketHealthy() {
    return this.wsHealthy;
  }
}

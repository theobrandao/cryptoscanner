"use client";

import * as React from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type ISeriesPrimitive,
  type SeriesAttachedParameter,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import { atr, bollinger, ema, macd, rsi } from "@/lib/indicators/core";
import { useTheme } from "@/components/providers/theme-provider";
import type { Candle } from "@/types/market";

export interface ChartZone {
  top: number;
  bottom: number;
  /** epoch ms de início; a zona se estende até a borda direita */
  from: number;
  label: string;
  color: "danger" | "success" | "info" | "warning";
}

export interface ChartLabel {
  time: number;
  price: number;
  text: string;
  position: "above" | "below";
  color: "success" | "danger" | "info" | "muted";
}

export interface ChartLine {
  price: number;
  label: string;
  color: "success" | "danger" | "info" | "warning" | "muted";
  dashed?: boolean;
}

export interface ChartSegmentLine {
  from: { time: number; price: number };
  to: { time: number; price: number };
  color: "success" | "danger";
  label: string;
}

export interface Overlays {
  ema: boolean;
  atr: boolean;
  /** suporte/resistência por swings (linhas) */
  levels: boolean;
  bb: boolean;
  vwap: boolean;
  volume: boolean;
  rsi: boolean;
  macd: boolean;
  structure: boolean;
  liquidity: boolean;
  setup: boolean;
}

export const DEFAULT_OVERLAYS: Overlays = { ema: true, atr: false, levels: true, bb: false, vwap: false, volume: true, rsi: true, macd: false, structure: true, liquidity: true, setup: true };

/** Completa preferências salvas antes da inclusão de novas camadas. */
export const withOverlayDefaults = (o: Partial<Overlays> | null | undefined): Overlays => ({ ...DEFAULT_OVERLAYS, ...(o ?? {}) });

/** Painéis inferiores ativos (RSI, MACD, ATR) — usado para calcular a altura do gráfico. */
export const lowerPanes = (o: Overlays) => Number(o.rsi) + Number(o.macd) + Number(o.atr);

/* design system → charts: candle alta #10B981 / baixa #EF4444 (pavio na mesma cor); indicadores em no máximo 5 cores (ciano, azul, violeta, amarelo, cinza) */
const COLORS = { up: "#10B981", down: "#EF4444", info: "#38BDF8", warning: "#F59E0B", muted: "#94A3B8", e9: "#22D3EE", e21: "#1687FF", e50: "#8B5CF6", e100: "#F59E0B", e200: "#94A3B8", bb: "#94A3B8", vwap: "#22D3EE" };
const tone = (c: string) => (c === "success" ? COLORS.up : c === "danger" ? COLORS.down : c === "warning" ? COLORS.warning : c === "info" ? COLORS.info : COLORS.muted);
const T = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;
const nz = (v: number | undefined) => (v != null && Number.isFinite(v) ? v : null);

/** Primitiva de desenho: caixas de zona (resistência, entrada, liquidez) estendidas até a borda direita. */
class ZonesPrimitive implements ISeriesPrimitive<Time> {
  private zones: ChartZone[] = [];
  private p: SeriesAttachedParameter<Time> | null = null;
  setZones(z: ChartZone[]) {
    this.zones = z;
    this.p?.requestUpdate();
  }
  attached(p: SeriesAttachedParameter<Time>) {
    this.p = p;
  }
  detached() {
    this.p = null;
  }
  paneViews() {
    const getP = () => this.p;
    const getZones = () => this.zones;
    return [
      {
        zOrder: () => "bottom" as const,
        renderer: () => ({
          draw(target: CanvasRenderingTarget2D) {
            const p = getP();
            if (!p) return;
            target.useMediaCoordinateSpace(({ context, mediaSize }) => {
              for (const z of getZones()) {
                const y1 = p.series.priceToCoordinate(z.top);
                const y2 = p.series.priceToCoordinate(z.bottom);
                let x1 = p.chart.timeScale().timeToCoordinate(T(z.from));
                if (y1 == null || y2 == null) continue;
                if (x1 == null) x1 = 0 as never;
                const x = Math.max(0, x1 as number);
                const top = Math.min(y1, y2);
                const h = Math.max(2, Math.abs(y2 - y1));
                const w = mediaSize.width - x;
                const c = tone(z.color);
                // zona discreta: preenchimento leve (≈8%) + contorno; não pintar grandes áreas do gráfico
                context.fillStyle = `${c}14`;
                context.strokeStyle = `${c}66`;
                context.lineWidth = 1;
                context.fillRect(x, top, w, h);
                context.strokeRect(x + 0.5, top + 0.5, w - 1, h - 1);
                context.font = "11px Inter, system-ui, sans-serif";
                context.fillStyle = c;
                const tw = context.measureText(z.label).width;
                context.fillText(z.label, Math.max(x + 6, x + w / 2 - tw / 2), top + Math.min(h - 4, 14));
              }
            });
          },
        }),
      },
    ];
  }
}

export interface Legend {
  o: number;
  h: number;
  l: number;
  c: number;
  chg: number;
  vol: number;
}

/**
 * Gráfico do terminal (TradingView Lightweight Charts, Apache-2.0): candles, volume, EMAs 9/21/50/100/200, ATR,
 * Bollinger, VWAP, painéis RSI e MACD, e camadas de estrutura/liquidez/setup ligáveis.
 */
export function TerminalChart({
  candles,
  overlays,
  zones,
  labels,
  lines,
  segments,
  height = 560,
  onLegend,
}: {
  candles: readonly Candle[];
  overlays: Overlays;
  zones: ChartZone[];
  labels: ChartLabel[];
  lines: ChartLine[];
  segments: ChartSegmentLine[];
  height?: number;
  onLegend?: (l: Legend | null) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const legendRef = React.useRef(onLegend);
  React.useEffect(() => {
    legendRef.current = onLegend;
  });

  React.useEffect(() => {
    const el = ref.current;
    if (!el || candles.length === 0) return;
    const dark = theme === "dark";
    const grid = dark ? "rgba(148,163,184,0.06)" : "rgba(100,116,139,0.10)";
    const chart: IChartApi = createChart(el, {
      height,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: dark ? "#8193a8" : "#5b6778",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize: 11,
        panes: { separatorColor: dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)", enableResize: true },
      },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: grid },
      timeScale: { borderColor: grid, timeVisible: true, secondsVisible: false, rightOffset: 6 },
      localization: { locale: "pt-BR" },
    });
    const compact = el.clientWidth < 640;
    const candle = chart.addSeries(CandlestickSeries, { upColor: COLORS.up, downColor: COLORS.down, borderVisible: false, wickUpColor: COLORS.up, wickDownColor: COLORS.down });
    candle.setData(candles.map((c) => ({ time: T(c.openTime), open: c.open, high: c.high, low: c.low, close: c.close })));
    const closes = candles.map((c) => c.close);
    const line = (values: number[], color: string, width: 1 | 2, pane = 0, style: LineStyle = LineStyle.Solid, title?: string): ISeriesApi<"Line"> => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: compact ? undefined : title }, pane);
      s.setData(candles.flatMap((c, i) => (nz(values[i]) != null ? [{ time: T(c.openTime), value: values[i] as number }] : [])));
      return s;
    };
    if (overlays.ema) {
      line(ema(closes, 9), COLORS.e9, 1);
      line(ema(closes, 21), COLORS.e21, 1);
      line(ema(closes, 50), COLORS.e50, 1);
      line(ema(closes, 100), COLORS.e100, 1);
      line(ema(closes, 200), COLORS.e200, 2);
    }
    if (overlays.bb) {
      const b = bollinger(closes, 20, 2);
      line(b.upper, COLORS.bb, 1, 0, LineStyle.Dotted);
      line(b.middle, COLORS.bb, 1, 0, LineStyle.Dashed);
      line(b.lower, COLORS.bb, 1, 0, LineStyle.Dotted);
    }
    if (overlays.vwap) {
      // VWAP diária ancorada 00:00 UTC, recalculada por dia
      const out: number[] = [];
      let day = -1;
      let pv = 0;
      let v = 0;
      for (const c of candles) {
        const d = Math.floor(c.openTime / 86_400_000);
        if (d !== day) {
          day = d;
          pv = 0;
          v = 0;
        }
        pv += ((c.high + c.low + c.close) / 3) * c.volume;
        v += c.volume;
        out.push(v > 0 ? pv / v : NaN);
      }
      line(out, COLORS.vwap, 1, 0, LineStyle.Solid, "VWAP");
    }
    if (overlays.volume) {
      const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false }, 0);
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
      vol.setData(candles.map((c) => ({ time: T(c.openTime), value: c.volume, color: c.close >= c.open ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)" })));
    }
    let pane = 1;
    if (overlays.rsi) {
      const r = line(rsi(closes, 14), "#8B5CF6", 1, pane, LineStyle.Solid, "RSI 14");
      r.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
      for (const lvl of [30, 70]) r.createPriceLine({ price: lvl, color: "rgba(148,163,184,0.45)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
      pane++;
    }
    if (overlays.macd) {
      const m = macd(closes);
      const h = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane);
      h.setData(candles.flatMap((c, i) => (nz(m.histogram[i]) != null ? [{ time: T(c.openTime), value: m.histogram[i] as number, color: (m.histogram[i] as number) >= 0 ? "rgba(16,185,129,0.6)" : "rgba(239,68,68,0.6)" }] : [])));
      line(m.macd, COLORS.info, 1, pane, LineStyle.Solid, "MACD");
      line(m.signal, COLORS.warning, 1, pane, LineStyle.Solid, "Signal");
      pane++;
    }
    if (overlays.atr) {
      line(atr(candles as Candle[], 14), COLORS.warning, 1, pane, LineStyle.Solid, "ATR 14");
      pane++;
    }
    // painel principal 4× maior que RSI/MACD/ATR
    chart.panes().forEach((p, i) => p.setStretchFactor(i === 0 ? 4 : 1));

    for (const l of lines) candle.createPriceLine({ price: l.price, color: tone(l.color), lineWidth: 1, lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid, axisLabelVisible: true, title: compact ? "" : l.label });
    for (const sgm of segments) {
      if (sgm.to.time <= sgm.from.time) continue;
      const s = chart.addSeries(LineSeries, { color: tone(sgm.color), lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0);
      s.setData([
        { time: T(sgm.from.time), value: sgm.from.price },
        { time: T(sgm.to.time), value: sgm.to.price },
      ]);
    }
    const markers: SeriesMarker<Time>[] = labels
      .filter((m) => m.time >= (candles[0]?.openTime ?? 0))
      .sort((a, b) => a.time - b.time)
      .map((m) => ({ time: T(m.time), position: m.position === "above" ? "aboveBar" : "belowBar", color: tone(m.color), shape: "circle", size: 0.4, text: m.text }));
    if (markers.length) createSeriesMarkers(candle, markers);
    const zp = new ZonesPrimitive();
    candle.attachPrimitive(zp);
    zp.setZones(zones);

    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - (compact ? 90 : 160)), to: candles.length + 5 });
    const last = candles[candles.length - 1] as Candle;
    const prev = candles[candles.length - 2];
    const legendOf = (c: Candle, p?: Candle): Legend => ({ o: c.open, h: c.high, l: c.low, c: c.close, chg: p ? c.close - p.close : 0, vol: c.volume });
    legendRef.current?.(legendOf(last, prev));
    const byTime = new Map(candles.map((c, i) => [T(c.openTime) as number, i]));
    chart.subscribeCrosshairMove((param) => {
      const idx = param.time != null ? byTime.get(param.time as number) : undefined;
      const c = idx != null ? candles[idx] : last;
      if (c) legendRef.current?.(legendOf(c, idx != null ? candles[idx - 1] : prev));
    });
    return () => chart.remove();
  }, [candles, overlays, zones, labels, lines, segments, height, theme]);

  return <div ref={ref} className="w-full" style={{ height }} role="img" aria-label="Gráfico de candles com indicadores e camadas de análise" />;
}

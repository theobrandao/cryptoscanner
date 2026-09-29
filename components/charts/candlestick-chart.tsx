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
  type IPriceLine,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/types/market";
import { useTheme } from "@/components/providers/theme-provider";

export interface IndicatorSeries {
  ema8: Array<number | null>;
  ema25: Array<number | null>;
  ema100: Array<number | null>;
  ema200: Array<number | null>;
  bbUpper: Array<number | null>;
  bbMiddle: Array<number | null>;
  bbLower: Array<number | null>;
  macd: Array<number | null>;
  macdSignal: Array<number | null>;
  macdHist: Array<number | null>;
  stochK: Array<number | null>;
  stochD: Array<number | null>;
}

export interface ChartToggles {
  ema8: boolean;
  ema25: boolean;
  ema100: boolean;
  ema200: boolean;
  bb: boolean;
  volume: boolean;
  stochRsi: boolean;
  macd: boolean;
  levels: boolean;
  fibonacci: boolean;
  /** linhas de tendência automáticas (LTA/LTB) */
  trendlines?: boolean;
}

export interface ChartSegment {
  from: { time: number; price: number };
  to: { time: number; price: number };
  color: string;
  label: string;
  dashed?: boolean;
}

export interface PriceLevel {
  price: number;
  label: string;
  color: string;
  style?: "solid" | "dashed" | "dotted";
}

export interface ChartMarker {
  time: number; // epoch ms
  position: "aboveBar" | "belowBar" | "inBar";
  color: string;
  shape: "circle" | "arrowUp" | "arrowDown" | "square";
  text: string;
}

const COLORS = {
  ema8: "#f59e0b",
  ema25: "#22d3ee",
  ema100: "#a78bfa",
  ema200: "#f472b6",
  bb: "#94a3b8",
  macd: "#22d3ee",
  signal: "#f59e0b",
};

function toTime(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp;
}

function lineData(candles: readonly Candle[], values: Array<number | null>) {
  const out: Array<{ time: UTCTimestamp; value: number }> = [];
  candles.forEach((c, i) => {
    const v = values[i];
    if (v !== null && v !== undefined && Number.isFinite(v)) out.push({ time: toTime(c.openTime), value: v });
  });
  return out;
}

/**
 * Gráfico de candles (TradingView Lightweight Charts) com EMAs, Bollinger, volume,
 * painéis de StochRSI e MACD, linhas de nível (S/R, Fibonacci, alvo/stop) e marcadores de padrões.
 */
export function CandlestickChart({
  candles,
  series,
  toggles,
  levels,
  markers,
  segments = [],
  height = 520,
}: {
  candles: readonly Candle[];
  series: IndicatorSeries | null;
  toggles: ChartToggles;
  levels: PriceLevel[];
  markers: ChartMarker[];
  segments?: ChartSegment[];
  height?: number;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const candleRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = React.useRef<IPriceLine[]>([]);
  const { theme } = useTheme();

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const dark = theme === "dark";
    const chart = createChart(el, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: dark ? "#9a94bf" : "#5f5a7a",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        panes: { separatorColor: dark ? "#2a2550" : "#dcd8ec", separatorHoverColor: "rgba(139,92,246,0.3)", enableResize: true },
      },
      grid: { vertLines: { color: dark ? "rgba(42,37,80,0.6)" : "rgba(220,216,236,0.8)" }, horzLines: { color: dark ? "rgba(42,37,80,0.6)" : "rgba(220,216,236,0.8)" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: dark ? "#2a2550" : "#dcd8ec" },
      timeScale: { borderColor: dark ? "#2a2550" : "#dcd8ec", timeVisible: true, secondsVisible: false },
      localization: { locale: "pt-BR" },
      autoSize: true,
    });
    chartRef.current = chart;

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#f43f5e",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#f43f5e",
      priceFormat: { type: "price", precision: precisionFor(candles), minMove: minMoveFor(candles) },
    });
    candleRef.current = candle;
    candle.setData(candles.map((c) => ({ time: toTime(c.openTime), open: c.open, high: c.high, low: c.low, close: c.close })));

    const lines: ISeriesApi<"Line">[] = [];
    const addLine = (values: Array<number | null>, color: string, width: 1 | 2 = 1, style = LineStyle.Solid, pane = 0, title?: string) => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title }, pane);
      s.setData(lineData(candles, values));
      lines.push(s);
      return s;
    };

    if (series) {
      if (toggles.ema8) addLine(series.ema8, COLORS.ema8, 1, LineStyle.Solid, 0, "EMA 8");
      if (toggles.ema25) addLine(series.ema25, COLORS.ema25, 1, LineStyle.Solid, 0, "EMA 25");
      if (toggles.ema100) addLine(series.ema100, COLORS.ema100, 2, LineStyle.Solid, 0, "EMA 100");
      if (toggles.ema200) addLine(series.ema200, COLORS.ema200, 2, LineStyle.Solid, 0, "EMA 200");
      if (toggles.bb) {
        addLine(series.bbUpper, COLORS.bb, 1, LineStyle.Dotted);
        addLine(series.bbMiddle, COLORS.bb, 1, LineStyle.Dashed);
        addLine(series.bbLower, COLORS.bb, 1, LineStyle.Dotted);
      }
    }

    let paneIndex = 1;
    if (toggles.volume) {
      const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", lastValueVisible: false, priceLineVisible: false }, 0);
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(candles.map((c) => ({ time: toTime(c.openTime), value: c.volume, color: c.close >= c.open ? "rgba(34,197,94,0.35)" : "rgba(244,63,94,0.35)" })));
    }
    if (series && toggles.stochRsi) {
      const k = addLine(series.stochK, COLORS.macd, 1, LineStyle.Solid, paneIndex, "StochRSI K");
      k.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 }, margins: { above: 0, below: 0 } }) });
      k.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.05 } });
      addLine(series.stochD, COLORS.signal, 1, LineStyle.Solid, paneIndex, "StochRSI D");
      for (const lvl of [10, 50, 90]) k.createPriceLine({ price: lvl, color: "rgba(148,163,184,0.5)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });
      paneIndex++;
    }
    if (series && toggles.macd) {
      const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, paneIndex);
      const histData: Array<{ time: UTCTimestamp; value: number; color: string }> = [];
      candles.forEach((c, i) => {
        const v = series.macdHist[i];
        if (v !== null && v !== undefined && Number.isFinite(v)) histData.push({ time: toTime(c.openTime), value: v, color: v >= 0 ? "rgba(34,197,94,0.6)" : "rgba(244,63,94,0.6)" });
      });
      hist.setData(histData);
      addLine(series.macd, COLORS.macd, 1, LineStyle.Solid, paneIndex, "MACD");
      addLine(series.macdSignal, COLORS.signal, 1, LineStyle.Solid, paneIndex, "Sinal");
      paneIndex++;
    }
    // Alturas dos painéis secundários
    const panes = chart.panes();
    panes.forEach((p, i) => {
      if (i > 0) p.setHeight(110);
    });

    // Linhas de nível
    priceLinesRef.current = levels.map((l) =>
      candle.createPriceLine({
        price: l.price,
        color: l.color,
        lineWidth: 1,
        lineStyle: l.style === "dashed" ? LineStyle.Dashed : l.style === "dotted" ? LineStyle.Dotted : LineStyle.Solid,
        axisLabelVisible: true,
        title: l.label,
      }),
    );

    // Segmentos (linhas de tendência): série de linha com dois pontos no painel principal
    for (const seg of segments) {
      if (seg.to.time <= seg.from.time) continue;
      const s = chart.addSeries(LineSeries, { color: seg.color, lineWidth: 2, lineStyle: seg.dashed ? LineStyle.Dashed : LineStyle.Solid, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, title: seg.label }, 0);
      s.setData([
        { time: toTime(seg.from.time), value: seg.from.price },
        { time: toTime(seg.to.time), value: seg.to.price },
      ]);
    }

    // Marcadores
    if (markers.length) {
      const ms: SeriesMarker<Time>[] = markers
        .slice()
        .sort((a, b) => a.time - b.time)
        .map((m) => ({ time: toTime(m.time), position: m.position, color: m.color, shape: m.shape, text: m.text }));
      createSeriesMarkers(candle, ms);
    }

    chart.timeScale().fitContent();
    const last = candles.length;
    if (last > 120) chart.timeScale().setVisibleLogicalRange({ from: last - 120, to: last + 5 });

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
    };
  }, [candles, series, toggles, levels, markers, segments, height, theme]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}

function precisionFor(candles: readonly Candle[]): number {
  const p = candles[candles.length - 1]?.close ?? 1;
  if (p >= 1000) return 2;
  if (p >= 1) return 3;
  if (p >= 0.1) return 4;
  if (p >= 0.01) return 5;
  return 6;
}
function minMoveFor(candles: readonly Candle[]): number {
  return 10 ** -precisionFor(candles);
}

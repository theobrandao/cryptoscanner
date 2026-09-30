/** Exchanges e instrumentos do contexto global (constantes puras, usadas no cliente e no servidor). */
export const VENUES = ["binance", "bybit", "okx"] as const;
export type Venue = (typeof VENUES)[number];
export const INSTRUMENTS = ["spot", "perp"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

export const VENUE_LABEL: Record<Venue, string> = { binance: "Binance", bybit: "Bybit", okx: "OKX" };
export const INSTRUMENT_LABEL: Record<Instrument, string> = { spot: "Spot", perp: "Perpétuo" };

export const isVenue = (v: unknown): v is Venue => typeof v === "string" && (VENUES as readonly string[]).includes(v);
export const isInstrument = (v: unknown): v is Instrument => typeof v === "string" && (INSTRUMENTS as readonly string[]).includes(v);

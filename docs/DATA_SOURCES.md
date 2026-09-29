# Fontes de dados

| Dado | Fonte primária | Reserva | Cache (fresco / reserva) |
|---|---|---|---|
| Candles OHLCV | Binance spot (`api.binance.com` → `data-api.binance.vision`) | Kraken (USD) | ≈ período/12 (20 s–5 min) / 3 períodos (30 min–3 d) |
| Tickers | WebSocket do worker (se ativo) → Binance REST | Kraken | 20 s / 6 h |
| Divergência de preço | Binance × Kraken (`/0/public/Ticker`, 1 chamada) | — | 60 s / 10 min |
| Derivativos (funding, OI, long/short, taker) | Binance Futures (`fapi.binance.com`) | — | 60 s / 1 h |
| Capitalização, dominância, bubbles, USD/BRL | CoinGecko | — | 2–5 min / 24 h |
| Medo & Ganância | alternative.me | — | 30 min / 48 h |
| Notícias | RSS Cointelegraph, CoinDesk | — | 10 min / 24 h |
| Baleias BTC | blockchain.info (bloco mais recente) | — | 48 h |

Todas as séries passam pelo Data Quality Engine (`docs/TRADING_ENGINE.md`). Nenhum dado é gerado por LLM.

# Paper Trader (statisch) – Live + Fake Market

Browser-Web-App für **Paper Trading** (kein Echtgeld). Läuft als **statische Website** (GitHub Pages kompatibel), ohne Backend, ohne npm.

## Features

- **Live Markets:** BTC / ETH / SOL (Preis + Candlestick Chart)
  - Datenquelle: **CoinGecko API**
  - Endpoints:
    - `/simple/price` (Live-Preis)
    - `/coins/{id}/ohlc` (Candles / OHLC)
- **Fake Market:** komplett synthetisch (Trend + Volatilität + Regime-Wechsel)
  - Speed: **Fast / Medium / Slow**
  - Kein Bezug zu echten Daten
- **Trading:**
  - Virtuelles Startkapital
  - Market Orders: Buy / Sell
  - PnL (Total / Unrealized / Realized)
  - Trade-Historie (localStorage)

## Start / Run

### GitHub Pages
- Ordner-Inhalt so hochladen, dass `index.html` in der Root liegt.

### Lokal
Wegen ES-Modules (`type="module"`) und Fetch ist **Live Server** empfohlen:

- VS Code Extension: *Live Server*
- Rechtsklick auf `index.html` → *Open with Live Server*

## Konfiguration

In `assets/js/app.js` oben:

- `startCash`
- `vsCurrency` (`usd` oder `eur`)
- Poll-Intervalle (Price/Candles)
- Fake Seed Price / Candle Length

## Hinweise

- Öffentliche kostenlose APIs haben Limits. Die App pollt moderat, aber bei sehr häufigem Neuladen kann es zu Rate-Limits kommen.
- Kein Shorting (Sell ist nur bis Bestand möglich).

# Paper Trader (Offline‑First, EUR)

Single‑File Paper‑Trading Web‑App (kein Echtgeld).

## Features
- **Fake Market** (immer verfügbar): trend + volatil, Speed: fast/medium/slow
- **Live‑Market (optional)**: BTC / ETH / SOL via **CoinGecko** (kostenlos)
  - Candles: **OHLC** → Fallback **market_chart** → wenn beides failt: **Fallback auf FAKE**
- Buy / Sell, virtuelles Startkapital, PnL, Trade‑Historie
- Läuft als **statische Website** (GitHub Pages kompatibel)
- Läuft auch per **Doppelklick** (`file://`)

## Ordnerstruktur
- `index.html`  (alles drin: HTML/CSS/JS)
- `README.md`

## Lokal starten
1. `index.html` doppelklicken

## Auf GitHub Pages
Wichtig: `index.html` muss im **Repo‑Root** liegen.
1. Repo öffnen
2. `index.html` + `README.md` ins Repo‑Root legen (nicht in Unterordner)
3. Commit + Push
4. GitHub: Settings → Pages → Deploy from branch → Branch auswählen
5. Seite öffnen, dann **Strg+F5**

## Hinweise
- Live nutzt CoinGecko. Bei Rate‑Limits kann Live zeitweise failen → App fällt automatisch auf FAKE zurück.
- Das ist eine Simulation, keine Finanzberatung.

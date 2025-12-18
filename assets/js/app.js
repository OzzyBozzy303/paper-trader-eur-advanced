// assets/js/app.js
// Main App Controller (UI, Chart, Live API, Fake Market, Trading)
//
// Architektur-Note:
// - Kein Backend, keine npm Abhängigkeit.
// - Persistenz: localStorage.
// - Live: CoinGecko (simple price + OHLC).
// - Chart: lightweight-charts (global: LightweightCharts).

import { LIVE_ASSETS, CHART_DAYS, fetchOHLC, fetchSimplePrices } from "./api.js";
import { FakeMarket } from "./fakeMarket.js";
import { loadState, saveState, clearState } from "./storage.js";
import { fmtCurrency, fmtNumber, fmtPct, isoTime, uid, isLiveSymbol } from "./utils.js";

/* ------------------------- Konfiguration ------------------------- */

const CONFIG = {
  vsCurrency: "usd",        // "usd" oder "eur" (UI-Währung)
  startCash: 10_000,        // virtuelles Startkapital
  pricePollMs: 10_000,      // live price polling
  candlesPollMs: 120_000,   // live candles refresh
  defaultDays: 1,           // Chart range (CoinGecko OHLC days)
  fakeSeedPrice: 1000,      // Fake-Asset Startpreis (rein synthetisch)
  fakeCandleSeconds: 60,    // 60 Sim-Sek. pro Candle (Fake)
};

/* ------------------------- UI references ------------------------- */

const el = {
  assetSelect: document.getElementById("assetSelect"),
  daysSelect: document.getElementById("daysSelect"),
  speedSelect: document.getElementById("speedSelect"),
  resetBtn: document.getElementById("resetBtn"),

  priceText: document.getElementById("priceText"),
  priceMeta: document.getElementById("priceMeta"),
  statusText: document.getElementById("statusText"),
  statusMeta: document.getElementById("statusMeta"),

  cashText: document.getElementById("cashText"),
  equityText: document.getElementById("equityText"),
  pnlText: document.getElementById("pnlText"),
  upnlText: document.getElementById("upnlText"),
  rpnlText: document.getElementById("rpnlText"),
  posText: document.getElementById("posText"),

  qtyInput: document.getElementById("qtyInput"),
  buyBtn: document.getElementById("buyBtn"),
  sellBtn: document.getElementById("sellBtn"),
  orderHint: document.getElementById("orderHint"),

  tradesTable: document.getElementById("tradesTable"),
  toastHost: document.getElementById("toastHost"),
};

const CURRENCY = CONFIG.vsCurrency.toUpperCase();

/* ------------------------- State (persisted) ------------------------- */

function defaultState(){
  return {
    settings: {
      selectedSymbol: "BTC",
      days: CONFIG.defaultDays,
      fakeSpeed: "medium",
    },
    portfolio: {
      startCash: CONFIG.startCash,
      cash: CONFIG.startCash,
      positions: {}, // symbol -> { qty, avgPrice, realizedPnl }
    },
    trades: [], // newest first
  };
}

let state = loadState() ?? defaultState();

/* ------------------------- Market meta ------------------------- */

const ASSETS = [
  ...LIVE_ASSETS,
  { symbol: "FAKE", name: "Fake Market", coinId: null },
];

function getAsset(sym){
  return ASSETS.find(a => a.symbol === sym);
}

function ensurePosition(sym){
  if (!state.portfolio.positions[sym]){
    state.portfolio.positions[sym] = { qty: 0, avgPrice: 0, realizedPnl: 0 };
  }
  return state.portfolio.positions[sym];
}

/* ------------------------- Toasts ------------------------- */

function toast({ title, message, kind = "ok", ttlMs = 2500 }){
  const n = document.createElement("div");
  n.className = `toast ${kind}`;
  n.innerHTML = `<div class="t">${title}</div><div class="m">${message}</div>`;
  el.toastHost.appendChild(n);
  setTimeout(() => {
    n.style.opacity = "0";
    n.style.transform = "translateY(6px)";
    setTimeout(() => n.remove(), 250);
  }, ttlMs);
}

/* ------------------------- Chart setup ------------------------- */

let chart, series;
function initChart(){
  const host = document.getElementById("chart");
  chart = LightweightCharts.createChart(host, {
    layout: {
      background: { color: "transparent" },
      textColor: "rgba(255,255,255,.78)",
      fontFamily: getComputedStyle(document.body).fontFamily,
    },
    grid: {
      vertLines: { color: "rgba(255,255,255,.06)" },
      horzLines: { color: "rgba(255,255,255,.06)" },
    },
    rightPriceScale: {
      borderColor: "rgba(255,255,255,.10)",
    },
    timeScale: {
      borderColor: "rgba(255,255,255,.10)",
      timeVisible: true,
      secondsVisible: true,
    },
    crosshair: {
      vertLine: { color: "rgba(96,165,250,.45)" },
      horzLine: { color: "rgba(96,165,250,.45)" },
    },
  });

  series = chart.addCandlestickSeries({
    upColor: "rgba(34,197,94,.95)",
    downColor: "rgba(239,68,68,.95)",
    borderUpColor: "rgba(34,197,94,.95)",
    borderDownColor: "rgba(239,68,68,.95)",
    wickUpColor: "rgba(34,197,94,.95)",
    wickDownColor: "rgba(239,68,68,.95)",
  });

  const resize = () => {
    const r = host.getBoundingClientRect();
    chart.applyOptions({ width: Math.floor(r.width), height: Math.floor(r.height) });
  };
  window.addEventListener("resize", resize);
  resize();
}

/* ------------------------- Market runtime ------------------------- */

let livePriceTimer = null;
let liveCandlesTimer = null;
let fake = null;

const livePrices = new Map(); // symbol -> { price, lastUpdatedAt }

function currentSymbol(){ return state.settings.selectedSymbol; }

function currentPrice(sym = currentSymbol()){
  const pos = isLiveSymbol(sym) ? livePrices.get(sym)?.price : fake?.getPrice();
  return Number.isFinite(pos) ? pos : null;
}

function stopMarket(){
  if (livePriceTimer) clearInterval(livePriceTimer);
  if (liveCandlesTimer) clearInterval(liveCandlesTimer);
  livePriceTimer = null;
  liveCandlesTimer = null;
  if (fake){ fake.stop(); fake = null; }
}

function setStatus(text, meta = ""){
  el.statusText.textContent = text;
  el.statusMeta.textContent = meta;
}

function setPriceUI(price, meta = ""){
  el.priceText.textContent = price ? fmtCurrency(price, CURRENCY) : "–";
  el.priceMeta.textContent = meta;
}

async function runLiveMarket(sym){
  const asset = getAsset(sym);
  if (!asset?.coinId) throw new Error("Ungültiger Live-Asset");

  el.speedSelect.disabled = true;
  el.speedSelect.classList.toggle("disabled", true);

  setStatus("Live API (CoinGecko)", "Lade Candles…");

  const loadCandles = async () => {
    try{
      const candles = await fetchOHLC({ coinId: asset.coinId, vsCurrency: CONFIG.vsCurrency, days: state.settings.days });
      if (candles.length) series.setData(candles);
      const last = candles[candles.length - 1];
      setPriceUI(last?.close ?? null, `OHLC • ${state.settings.days}D`);
      setStatus("Live API (CoinGecko)", `Candles: ${candles.length} • Updated: ${new Date().toLocaleTimeString()}`);
    }catch(err){
      setStatus("Live API Fehler", String(err?.message ?? err));
      toast({ title: "Live API", message: "Candles konnten nicht geladen werden.", kind: "warn", ttlMs: 3500 });
    }
  };

  await loadCandles();

  liveCandlesTimer = setInterval(loadCandles, CONFIG.candlesPollMs);

  // Price polling
  const pollPrice = async () => {
    try{
      const json = await fetchSimplePrices({ vsCurrency: CONFIG.vsCurrency });
      // json example: { bitcoin: { usd: 123, last_updated_at: 123 } , ... }
      for (const a of LIVE_ASSETS){
        const node = json[a.coinId];
        const p = node?.[CONFIG.vsCurrency];
        const t = node?.last_updated_at ? node.last_updated_at * 1000 : Date.now();
        if (Number.isFinite(p)){
          livePrices.set(a.symbol, { price: p, lastUpdatedAt: t });
        }
      }
      const mine = livePrices.get(sym);
      setPriceUI(mine?.price ?? null, mine?.lastUpdatedAt ? `Last update: ${isoTime(mine.lastUpdatedAt)}` : "");
      renderPortfolio(); // damit PnL live ist
    }catch(err){
      setStatus("Live API Fehler", String(err?.message ?? err));
    }
  };

  await pollPrice();
  livePriceTimer = setInterval(pollPrice, CONFIG.pricePollMs);
}

function runFakeMarket(){
  el.speedSelect.disabled = false;

  setStatus("Fake Market", "Generiere…");

  fake = new FakeMarket({
    seedPrice: CONFIG.fakeSeedPrice,
    speed: state.settings.fakeSpeed,
    candleSeconds: CONFIG.fakeCandleSeconds,
  });

  fake.start((evt) => {
    if (evt.type === "init"){
      series.setData(evt.candles);
    }else{
      // update current candle OR new candle
      series.update(evt.candle);
    }
    setPriceUI(evt.price, `Regime: ${evt.regime}`);
    setStatus("Fake Market", `Speed: ${state.settings.fakeSpeed} • ${new Date().toLocaleTimeString()}`);
    renderPortfolio();
  });
}

/* ------------------------- Trading logic ------------------------- */

function updateOrderHint(){
  const sym = currentSymbol();
  const p = currentPrice(sym);
  const pos = ensurePosition(sym);

  if (!p){
    el.orderHint.textContent = "Kein Preis verfügbar (warte auf Daten).";
    el.buyBtn.disabled = true;
    el.sellBtn.disabled = true;
    return;
  }

  el.buyBtn.disabled = false;
  el.sellBtn.disabled = pos.qty <= 0;

  const maxBuyQty = state.portfolio.cash / p;
  el.orderHint.textContent = `Max Buy: ${fmtNumber(maxBuyQty)} • Held: ${fmtNumber(pos.qty)} • Avg: ${pos.avgPrice ? fmtCurrency(pos.avgPrice, CURRENCY) : "–"}`;
}

function pushTrade(trade){
  state.trades.unshift(trade);
  if (state.trades.length > 200) state.trades = state.trades.slice(0, 200);
}

function doBuy(qty){
  const sym = currentSymbol();
  const price = currentPrice(sym);
  if (!price) throw new Error("Kein Preis verfügbar.");

  const notional = qty * price;
  if (notional <= 0) throw new Error("Qty muss > 0 sein.");
  if (notional > state.portfolio.cash + 1e-9) throw new Error("Nicht genug Cash.");

  const pos = ensurePosition(sym);
  const newQty = pos.qty + qty;
  const newAvg = (pos.qty * pos.avgPrice + qty * price) / newQty;

  pos.qty = newQty;
  pos.avgPrice = newAvg;

  state.portfolio.cash -= notional;

  pushTrade({
    id: uid("t"),
    ts: Date.now(),
    symbol: sym,
    side: "BUY",
    qty,
    price,
    notional,
  });
}

function doSell(qty){
  const sym = currentSymbol();
  const price = currentPrice(sym);
  if (!price) throw new Error("Kein Preis verfügbar.");

  if (qty <= 0) throw new Error("Qty muss > 0 sein.");

  const pos = ensurePosition(sym);
  if (qty > pos.qty + 1e-12) throw new Error("Nicht genug Bestand (kein Short).");

  const notional = qty * price;
  const realized = (price - pos.avgPrice) * qty;

  pos.qty -= qty;
  pos.realizedPnl += realized;

  if (pos.qty <= 1e-12){
    pos.qty = 0;
    pos.avgPrice = 0;
  }

  state.portfolio.cash += notional;

  pushTrade({
    id: uid("t"),
    ts: Date.now(),
    symbol: sym,
    side: "SELL",
    qty,
    price,
    notional,
  });
}

/* ------------------------- Rendering ------------------------- */

function computePortfolio(){
  const sym = currentSymbol();
  const priceNow = currentPrice(sym) ?? 0;

  let equity = state.portfolio.cash;
  let unreal = 0;
  let real = 0;

  for (const [s, p] of Object.entries(state.portfolio.positions)){
    const px = (s === sym) ? priceNow : (isLiveSymbol(s) ? (livePrices.get(s)?.price ?? 0) : (s === "FAKE" ? (fake?.getPrice() ?? 0) : 0));
    equity += p.qty * px;
    unreal += (px - p.avgPrice) * p.qty;
    real += p.realizedPnl;
  }

  const start = state.portfolio.startCash;
  const pnl = equity - start;

  return { equity, pnl, unreal, real };
}

function renderPortfolio(){
  const sym = currentSymbol();
  const pos = ensurePosition(sym);
  const { equity, pnl, unreal, real } = computePortfolio();

  el.cashText.textContent = fmtCurrency(state.portfolio.cash, CURRENCY);
  el.equityText.textContent = fmtCurrency(equity, CURRENCY);

  el.pnlText.textContent = `${fmtCurrency(pnl, CURRENCY)} (${fmtPct(pnl / state.portfolio.startCash)})`;
  el.upnlText.textContent = fmtCurrency(unreal, CURRENCY);
  el.rpnlText.textContent = fmtCurrency(real, CURRENCY);

  el.posText.textContent = pos.qty > 0
    ? `${fmtNumber(pos.qty)} @ ${fmtCurrency(pos.avgPrice, CURRENCY)}`
    : "–";

  updateOrderHint();
  renderTrades();
  saveState(state);
}

function renderTrades(){
  const tbody = el.tradesTable.querySelector("tbody");
  tbody.innerHTML = "";

  for (const t of state.trades.slice(0, 60)){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(t.ts).toLocaleTimeString()}</td>
      <td>${t.symbol}</td>
      <td class="mono">${t.side}</td>
      <td class="right mono">${fmtNumber(t.qty)}</td>
      <td class="right mono">${fmtCurrency(t.price, CURRENCY)}</td>
      <td class="right mono">${fmtCurrency(t.notional, CURRENCY)}</td>
    `;
    tbody.appendChild(tr);
  }
}

/* ------------------------- UI wiring ------------------------- */

function populateSelects(){
  // Assets
  el.assetSelect.innerHTML = ASSETS.map(a => `<option value="${a.symbol}">${a.symbol} • ${a.name}</option>`).join("");

  // Days
  el.daysSelect.innerHTML = CHART_DAYS.map(d => `<option value="${d.value}">${d.label}</option>`).join("");

  // Initial values
  el.assetSelect.value = state.settings.selectedSymbol;
  el.daysSelect.value = String(state.settings.days);
  el.speedSelect.value = state.settings.fakeSpeed;
}

async function switchAsset(){
  stopMarket();

  // Reset chart view / data
  series.setData([]);

  const sym = currentSymbol();
  const asset = getAsset(sym);

  try{
    if (sym === "FAKE"){
      runFakeMarket();
    } else {
      await runLiveMarket(sym);
    }
  } catch (err){
    setStatus("Fehler", String(err?.message ?? err));
    toast({ title: "Init", message: "Market konnte nicht gestartet werden.", kind: "bad", ttlMs: 3500 });
  }

  renderPortfolio();
}

function quickQty(kind){
  const sym = currentSymbol();
  const p = currentPrice(sym);
  const pos = ensurePosition(sym);
  if (!p) return;

  if (kind.startsWith("buy")){
    const frac = kind === "buy25" ? 0.25 : (kind === "buy50" ? 0.50 : 1.0);
    const qty = (state.portfolio.cash * frac) / p;
    el.qtyInput.value = qty > 0 ? String(qty) : "";
  } else {
    const frac = kind === "sell25" ? 0.25 : (kind === "sell50" ? 0.50 : 1.0);
    const qty = pos.qty * frac;
    el.qtyInput.value = qty > 0 ? String(qty) : "";
  }
  updateOrderHint();
}

function wireUI(){
  el.assetSelect.addEventListener("change", async () => {
    state.settings.selectedSymbol = el.assetSelect.value;
    await switchAsset();
  });

  el.daysSelect.addEventListener("change", async () => {
    state.settings.days = Number(el.daysSelect.value);
    if (currentSymbol() !== "FAKE"){
      await switchAsset(); // reload candles with new range
    } else {
      // Fake: keep running, just UI update
      toast({ title: "Chart Range", message: "Fake Market ignoriert Days-Range (läuft als Live-Sim).", kind: "warn" });
    }
  });

  el.speedSelect.addEventListener("change", () => {
    state.settings.fakeSpeed = el.speedSelect.value;
    if (currentSymbol() === "FAKE"){
      // neu starten, damit Intervalle sauber sind
      switchAsset();
    }
  });

  el.qtyInput.addEventListener("input", updateOrderHint);

  document.querySelectorAll("[data-quick]").forEach(btn => {
    btn.addEventListener("click", () => quickQty(btn.getAttribute("data-quick")));
  });

  el.buyBtn.addEventListener("click", () => {
    try{
      const qty = Number(el.qtyInput.value);
      doBuy(qty);
      toast({ title: "BUY", message: `Kauf ausgeführt: ${fmtNumber(qty)} ${currentSymbol()}`, kind: "ok" });
      renderPortfolio();
    }catch(err){
      toast({ title: "BUY abgelehnt", message: String(err?.message ?? err), kind: "bad", ttlMs: 3500 });
    }
  });

  el.sellBtn.addEventListener("click", () => {
    try{
      const qty = Number(el.qtyInput.value);
      doSell(qty);
      toast({ title: "SELL", message: `Verkauf ausgeführt: ${fmtNumber(qty)} ${currentSymbol()}`, kind: "ok" });
      renderPortfolio();
    }catch(err){
      toast({ title: "SELL abgelehnt", message: String(err?.message ?? err), kind: "bad", ttlMs: 3500 });
    }
  });

  el.resetBtn.addEventListener("click", () => {
    const ok = confirm("Wirklich Portfolio + Trades zurücksetzen? (localStorage wird gelöscht)");
    if (!ok) return;
    clearState();
    state = defaultState();
    populateSelects();
    toast({ title: "Reset", message: "Zurückgesetzt.", kind: "warn" });
    switchAsset();
  });
}

/* ------------------------- Boot ------------------------- */

function bootstrap(){
  initChart();
  populateSelects();
  wireUI();
  switchAsset();
}

bootstrap();

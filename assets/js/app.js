// assets/js/app.js
(function(){
  const U = window.PT_UTILS;
  const Store = window.PT_STORE;
  const API = window.PT_API;
  const Fake = window.PT_FAKE;

  const CONFIG = {
    vsCurrency: "eur",
    startCash: 10000,
    pricePollMs: 10000,
    candlesPollMs: 120000,
    defaultDays: 7,
    fakeSeedPrice: 1000,
    fakeCandleSeconds: 60,
  };
  const CURRENCY = CONFIG.vsCurrency.toUpperCase();

  const el = {};
  function $(id){ return document.getElementById(id); }

  function toast({ title, message, kind = "ok", ttlMs = 2600 }){
    const host = el.toastHost;
    const n = document.createElement("div");
    n.className = "toast " + kind;
    n.innerHTML = `<div class="t">${title}</div><div class="m">${message}</div>`;
    host.appendChild(n);
    setTimeout(() => {
      n.style.opacity = "0";
      n.style.transform = "translateY(6px)";
      setTimeout(() => n.remove(), 250);
    }, ttlMs);
  }

  function setStatus(t, m){
    el.statusText.textContent = t || "";
    el.statusMeta.textContent = m || "";
  }
  function setPrice(p, m){
    el.priceText.textContent = Number.isFinite(p) ? U.fmtCurrency(p, CURRENCY) : "–";
    el.priceMeta.textContent = m || "";
  }

  function defaultState(){
    return {
      settings: {
        selectedSymbol: "BTC",
        days: CONFIG.defaultDays,
        fakeSpeed: "medium",
        advanced: false,
        orderMode: "qty",
        allowShort: false,
        maxLeverage: 2.0,
        feeBps: 0,
        slipBps: 0,
      },
      portfolio: {
        startCash: CONFIG.startCash,
        cash: CONFIG.startCash,
        positions: {},
      },
      trades: [],
    };
  }

  let state = Store.loadState() || defaultState();
  function migrate(){
    state.settings ||= {};
    state.portfolio ||= { startCash: CONFIG.startCash, cash: CONFIG.startCash, positions: {} };
    state.portfolio.positions ||= {};
    state.trades ||= [];
    state.settings.selectedSymbol ||= "BTC";
    state.settings.days = Number(state.settings.days || CONFIG.defaultDays);
    state.settings.fakeSpeed ||= "medium";
    state.settings.advanced = !!state.settings.advanced;
    state.settings.orderMode ||= "qty";
    state.settings.allowShort = !!state.settings.allowShort;
    state.settings.maxLeverage = Number(state.settings.maxLeverage || 2.0);
    state.settings.feeBps = Number(state.settings.feeBps || 0);
    state.settings.slipBps = Number(state.settings.slipBps || 0);
  }
  migrate();

  const ASSETS = [...API.LIVE_ASSETS, { symbol: "FAKE", name: "Fake Market", coinId: null }];

  function getAsset(sym){ return ASSETS.find(a => a.symbol === sym); }
  function ensurePos(sym){
    if (!state.portfolio.positions[sym]) state.portfolio.positions[sym] = { qty: 0, avgPrice: 0, realizedPnl: 0 };
    return state.portfolio.positions[sym];
  }

  // error surfacing
  window.addEventListener("error", (e) => {
    setStatus("JS Fehler", e.message || String(e.error || e));
    toast({ title: "JS Fehler", message: e.message || String(e.error || e), kind: "bad", ttlMs: 6000 });
  });
  window.addEventListener("unhandledrejection", (e) => {
    setStatus("Promise Fehler", String(e.reason || e));
    toast({ title: "Promise Fehler", message: String(e.reason || e), kind: "bad", ttlMs: 6000 });
  });

  // chart
  let chart = null, series = null;
  function initChart(){
    if (!window.LightweightCharts){
      setStatus("Chart Lib fehlt", "CDN blockiert? lightweight-charts konnte nicht geladen werden.");
      return;
    }
    const host = $("chart");
    chart = LightweightCharts.createChart(host, {
      layout: { background: { color: "transparent" }, textColor: "rgba(255,255,255,.78)", fontFamily: getComputedStyle(document.body).fontFamily },
      grid: { vertLines: { color: "rgba(255,255,255,.06)" }, horzLines: { color: "rgba(255,255,255,.06)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,.10)" },
      timeScale: { borderColor: "rgba(255,255,255,.10)", timeVisible: true, secondsVisible: true },
      crosshair: { vertLine: { color: "rgba(96,165,250,.45)" }, horzLine: { color: "rgba(96,165,250,.45)" } },
    });
    series = chart.addCandlestickSeries({
      upColor: "rgba(34,197,94,.95)", downColor: "rgba(239,68,68,.95)",
      borderUpColor: "rgba(34,197,94,.95)", borderDownColor: "rgba(239,68,68,.95)",
      wickUpColor: "rgba(34,197,94,.95)", wickDownColor: "rgba(239,68,68,.95)",
    });

    const resize = () => {
      const r = host.getBoundingClientRect();
      chart.applyOptions({ width: Math.floor(r.width), height: Math.floor(r.height) });
    };
    window.addEventListener("resize", resize);
    resize();
  }

  const priceCache = new Map(); // sym -> { price, tsMs }
  function setCached(sym, price, tsMs){ if (Number.isFinite(price)) priceCache.set(sym, { price, tsMs: tsMs || Date.now() }); }
  function px(sym){ const p = priceCache.get(sym)?.price; return Number.isFinite(p) ? p : null; }

  let livePriceTimer = null;
  let liveCandleTimer = null;

  // fake
  let fake = null;
  function startFake(){
    if (fake) return;
    fake = new Fake.FakeMarket({ seedPrice: CONFIG.fakeSeedPrice, speed: state.settings.fakeSpeed, candleSeconds: CONFIG.fakeCandleSeconds });
    fake.start((evt) => {
      setCached("FAKE", evt.price, Date.now());
      if (state.settings.selectedSymbol === "FAKE" && series){
        if (evt.type === "init") series.setData(evt.candles);
        else series.update(evt.candle);
        setPrice(evt.price, "Regime: " + evt.regime);
        setStatus("Fake Market", "Speed: " + state.settings.fakeSpeed);
      }
      renderPortfolio();
    });
    setCached("FAKE", fake.getPrice(), Date.now());
  }
  function restartFake(){
    if (!fake) return startFake();
    fake.stop();
    fake = null;
    startFake();
  }

  async function startLivePrices(){
    if (livePriceTimer) return;
    const poll = async () => {
      try{
        const json = await API.fetchSimplePrices(CONFIG.vsCurrency);
        API.LIVE_ASSETS.forEach(a => {
          const node = json[a.coinId];
          const p = node?.[CONFIG.vsCurrency];
          const t = node?.last_updated_at ? node.last_updated_at * 1000 : Date.now();
          if (Number.isFinite(p)) setCached(a.symbol, p, t);
        });

        const sym = state.settings.selectedSymbol;
        if (U.isLiveSymbol(sym)){
          const node = priceCache.get(sym);
          setPrice(node?.price ?? null, node?.tsMs ? ("Last update: " + U.isoTime(node.tsMs)) : "");
        }
        renderPortfolio();
      }catch(err){
        if (U.isLiveSymbol(state.settings.selectedSymbol)){
          setStatus("Live API Fehler", String(err?.message || err));
        }
      }
    };
    await poll();
    livePriceTimer = setInterval(poll, CONFIG.pricePollMs);
  }

  async function loadLiveCandles(sym){
    const asset = getAsset(sym);
    if (!asset?.coinId) throw new Error("Ungültiger Live-Asset");
    if (liveCandleTimer) clearInterval(liveCandleTimer);

    const load = async () => {
      try{
        setStatus("Live API", "Lade Candles…");
        const candles = await API.fetchOHLC(asset.coinId, CONFIG.vsCurrency, state.settings.days);
        if (state.settings.selectedSymbol !== sym) return;
        series && series.setData(candles);
        const last = candles[candles.length - 1];
        if (last?.close) setCached(sym, last.close, Date.now());
        setStatus("Live API (CoinGecko)", "Candles: " + candles.length + " • " + new Date().toLocaleTimeString());
      }catch(err){
        setStatus("Live API Fehler", String(err?.message || err));
        toast({ title: "Live API", message: "Candles konnten nicht geladen werden.", kind: "warn", ttlMs: 4000 });
      }
    };

    await load();
    liveCandleTimer = setInterval(load, CONFIG.candlesPollMs);
  }

  function advancedOn(){ return !!state.settings.advanced; }
  function allowShort(){ return advancedOn() && !!state.settings.allowShort; }
  function feeRate(){ return advancedOn() ? (Number(state.settings.feeBps)||0)/10000 : 0; }
  function slipRate(){ return advancedOn() ? (Number(state.settings.slipBps)||0)/10000 : 0; }
  function maxLev(){ const v = Number(state.settings.maxLeverage); return advancedOn() && Number.isFinite(v) && v >= 1 ? v : 1; }

  function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

  function marginCheck(simCash, simPos){
    let equity = simCash;
    let exposure = 0;
    Object.entries(simPos).forEach(([s,p]) => {
      const pxx = px(s) || 0;
      equity += p.qty * pxx;
      exposure += Math.abs(p.qty) * pxx;
    });
    if (equity <= 0) throw new Error("Equity wäre <= 0 (Margin fail).");
    if (exposure > equity * maxLev()) throw new Error("Exposure-Limit überschritten (Leverage).");
  }

  function parseQty(){
    const sym = state.settings.selectedSymbol;
    const p = px(sym);
    const raw = Number(el.qtyInput.value);
    if (!Number.isFinite(raw) || raw <= 0 || !p) return NaN;
    return state.settings.orderMode === "amount" ? (raw / p) : raw;
  }

  function doBuy(qty){
    const sym = state.settings.selectedSymbol;
    const mkt = px(sym);
    if (!mkt) throw new Error("Kein Preis verfügbar.");
    if (qty <= 0) throw new Error("Qty muss > 0 sein.");

    const exec = mkt * (1 + slipRate());
    const notional = exec * qty;
    const fee = notional * feeRate();
    const cost = notional + fee;

    if (!allowShort() && cost > state.portfolio.cash + 1e-9) throw new Error("Nicht genug Cash.");

    if (allowShort()){
      const simPos = deepClone(state.portfolio.positions);
      const p = simPos[sym] || { qty: 0, avgPrice: 0, realizedPnl: 0 };
      p.qty += qty; simPos[sym] = p;
      marginCheck(state.portfolio.cash - cost, simPos);
    }

    const pos = ensurePos(sym);

    if (pos.qty < 0){
      const cover = Math.min(qty, Math.abs(pos.qty));
      pos.realizedPnl += (pos.avgPrice - exec) * cover;
      pos.qty += cover;
      const rem = qty - cover;
      if (rem > 0){ pos.qty = rem; pos.avgPrice = exec; }
      else if (Math.abs(pos.qty) < 1e-12){ pos.qty = 0; pos.avgPrice = 0; }
    } else {
      const newQty = pos.qty + qty;
      pos.avgPrice = (pos.qty*pos.avgPrice + qty*exec) / newQty;
      pos.qty = newQty;
    }

    state.portfolio.cash -= cost;
    state.trades.unshift({ id: U.uid("t"), ts: Date.now(), symbol: sym, side: "BUY", qty, price: exec, notional, fee });
    state.trades = state.trades.slice(0,200);
  }

  function doSell(qty){
    const sym = state.settings.selectedSymbol;
    const mkt = px(sym);
    if (!mkt) throw new Error("Kein Preis verfügbar.");
    if (qty <= 0) throw new Error("Qty muss > 0 sein.");

    const exec = mkt * (1 - slipRate());
    const notional = exec * qty;
    const fee = notional * feeRate();
    const proceeds = notional - fee;

    const pos = ensurePos(sym);

    if (!allowShort() && qty > pos.qty + 1e-12) throw new Error("Nicht genug Bestand (kein Short).");

    if (allowShort()){
      const simPos = deepClone(state.portfolio.positions);
      const p = simPos[sym] || { qty: 0, avgPrice: 0, realizedPnl: 0 };
      p.qty -= qty; simPos[sym] = p;
      marginCheck(state.portfolio.cash + proceeds, simPos);
    }

    if (pos.qty > 0){
      const sellLong = Math.min(qty, pos.qty);
      pos.realizedPnl += (exec - pos.avgPrice) * sellLong;
      pos.qty -= sellLong;

      const rem = qty - sellLong;
      if (rem > 0){
        if (!allowShort()) throw new Error("Shorting ist aus.");
        pos.qty = -rem;
        pos.avgPrice = exec;
      } else if (pos.qty <= 1e-12){ pos.qty = 0; pos.avgPrice = 0; }
    } else if (pos.qty < 0){
      const newAbs = Math.abs(pos.qty) + qty;
      pos.avgPrice = (Math.abs(pos.qty)*pos.avgPrice + qty*exec) / newAbs;
      pos.qty -= qty;
    } else {
      if (!allowShort()) throw new Error("Shorting ist aus.");
      pos.qty = -qty;
      pos.avgPrice = exec;
    }

    state.portfolio.cash += proceeds;
    state.trades.unshift({ id: U.uid("t"), ts: Date.now(), symbol: sym, side: "SELL", qty, price: exec, notional, fee });
    state.trades = state.trades.slice(0,200);
  }

  function computePortfolio(){
    let equity = state.portfolio.cash;
    let unreal = 0;
    let real = 0;
    Object.entries(state.portfolio.positions).forEach(([s,p]) => {
      const pxx = px(s) || 0;
      equity += p.qty * pxx;
      if (p.qty > 0) unreal += (pxx - p.avgPrice) * p.qty;
      else if (p.qty < 0) unreal += (p.avgPrice - pxx) * Math.abs(p.qty);
      real += p.realizedPnl;
    });
    return { equity, pnl: equity - state.portfolio.startCash, unreal, real };
  }

  function renderTrades(){
    const tbody = el.tradesTable.querySelector("tbody");
    tbody.innerHTML = "";
    state.trades.slice(0,60).forEach(t => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${new Date(t.ts).toLocaleTimeString()}</td>
        <td>${t.symbol}</td>
        <td class="mono">${t.side}</td>
        <td class="right mono">${U.fmtNumber(t.qty)}</td>
        <td class="right mono">${U.fmtCurrency(t.price, CURRENCY)}</td>
        <td class="right mono">${U.fmtCurrency(t.notional, CURRENCY)}</td>
        <td class="right mono">${U.fmtCurrency(t.fee || 0, CURRENCY)}</td>`;
      tbody.appendChild(tr);
    });
  }

  function updateHint(){
    const sym = state.settings.selectedSymbol;
    const p = px(sym);
    const pos = ensurePos(sym);
    if (!p){
      el.orderHint.textContent = "Kein Preis verfügbar (warte auf Daten).";
      el.buyBtn.disabled = true;
      el.sellBtn.disabled = true;
      return;
    }
    el.buyBtn.disabled = false;
    el.sellBtn.disabled = (!allowShort() && pos.qty <= 0);

    if (allowShort()){
      let exposure = 0;
      let eq = state.portfolio.cash;
      Object.entries(state.portfolio.positions).forEach(([s,pp]) => {
        const pxx = px(s) || 0;
        eq += pp.qty * pxx;
        exposure += Math.abs(pp.qty) * pxx;
      });
      el.orderHint.textContent = `Advanced • Equity: ${U.fmtCurrency(eq, CURRENCY)} • Exposure: ${U.fmtCurrency(exposure, CURRENCY)} • Max: x${maxLev().toFixed(1)}`;
    } else {
      if (state.settings.orderMode === "amount"){
        el.orderHint.textContent = `Max Buy: ${U.fmtCurrency(state.portfolio.cash, CURRENCY)} • Held: ${U.fmtNumber(pos.qty)}`;
      } else {
        el.orderHint.textContent = `Max Buy: ${U.fmtNumber(state.portfolio.cash / p)} • Held: ${U.fmtNumber(pos.qty)}`;
      }
    }
  }

  function renderPortfolio(){
    const sym = state.settings.selectedSymbol;
    const pos = ensurePos(sym);
    const { equity, pnl, unreal, real } = computePortfolio();

    el.cashText.textContent = U.fmtCurrency(state.portfolio.cash, CURRENCY);
    el.equityText.textContent = U.fmtCurrency(equity, CURRENCY);
    el.pnlText.textContent = `${U.fmtCurrency(pnl, CURRENCY)} (${U.fmtPct(pnl / state.portfolio.startCash)})`;
    el.upnlText.textContent = U.fmtCurrency(unreal, CURRENCY);
    el.rpnlText.textContent = U.fmtCurrency(real, CURRENCY);
    el.posText.textContent = pos.qty !== 0 ? `${U.fmtNumber(pos.qty)} @ ${U.fmtCurrency(pos.avgPrice, CURRENCY)}` : "–";

    updateHint();
    renderTrades();
    Store.saveState(state);
  }

  function applySettingsUI(){
    el.advancedToggle.checked = !!state.settings.advanced;
    el.orderModeSelect.value = state.settings.orderMode || "qty";
    el.shortToggle.checked = !!state.settings.allowShort;
    el.levInput.value = String(state.settings.maxLeverage ?? 2.0);
    el.feeInput.value = String(state.settings.feeBps ?? 0);
    el.slipInput.value = String(state.settings.slipBps ?? 0);

    const adv = advancedOn();
    el.shortToggle.disabled = !adv;
    el.levInput.disabled = !adv;
    el.feeInput.disabled = !adv;
    el.slipInput.disabled = !adv;

    el.shortStatus.textContent = allowShort() ? "An" : "Aus";
    el.shortStatus.style.opacity = adv ? "1" : ".6";

    if (state.settings.orderMode === "amount"){
      el.orderInputLabel.textContent = "Betrag (€)";
      el.qtyInput.placeholder = "z.B. 200";
      el.qtyInput.step = "1";
    } else {
      el.orderInputLabel.textContent = "Menge (Qty)";
      el.qtyInput.placeholder = "z.B. 0.05";
      el.qtyInput.step = "0.0001";
    }
  }

  function populateSelects(){
    el.assetSelect.innerHTML = ASSETS.map(a => `<option value="${a.symbol}">${a.symbol} • ${a.name}</option>`).join("");
    el.daysSelect.innerHTML = API.CHART_DAYS.map(d => `<option value="${d.value}">${d.label}</option>`).join("");
    el.assetSelect.value = state.settings.selectedSymbol;
    el.daysSelect.value = String(state.settings.days);
    el.speedSelect.value = state.settings.fakeSpeed;
    applySettingsUI();
  }

  async function switchAsset(){
    series && series.setData([]);
    const sym = state.settings.selectedSymbol;
    if (sym === "FAKE"){
      el.speedSelect.disabled = false;
      el.speedSelect.classList.remove("disabled");
      const candles = fake?.getCandles?.() || [];
      if (candles.length) series && series.setData(candles);
      setPrice(px("FAKE"), "Fake Market");
      setStatus("Fake Market", "Speed: " + state.settings.fakeSpeed);
    } else {
      el.speedSelect.disabled = true;
      el.speedSelect.classList.add("disabled");
      await loadLiveCandles(sym);
    }
    renderPortfolio();
  }

  function quick(kind){
    const sym = state.settings.selectedSymbol;
    const p = px(sym);
    if (!p) return;
    const pos = ensurePos(sym);
    const mode = state.settings.orderMode;

    const frac = kind.endsWith("25") ? 0.25 : (kind.endsWith("50") ? 0.5 : 1.0);
    if (kind.startsWith("buy")){
      if (mode === "amount") el.qtyInput.value = String(state.portfolio.cash * frac);
      else el.qtyInput.value = String((state.portfolio.cash * frac) / p);
    } else {
      const abs = Math.abs(pos.qty);
      if (mode === "amount") el.qtyInput.value = String((abs * p) * frac);
      else el.qtyInput.value = String(abs * frac);
    }
    updateHint();
  }

  function wireUI(){
    el.assetSelect.addEventListener("change", async () => { state.settings.selectedSymbol = el.assetSelect.value; await switchAsset(); });
    el.daysSelect.addEventListener("change", async () => {
      state.settings.days = Number(el.daysSelect.value);
      if (state.settings.selectedSymbol !== "FAKE") await switchAsset();
      else toast({ title: "Chart Range", message: "Fake Market ignoriert Days-Range.", kind: "warn" });
    });
    el.speedSelect.addEventListener("change", async () => {
      state.settings.fakeSpeed = el.speedSelect.value;
      restartFake();
      if (state.settings.selectedSymbol === "FAKE") await switchAsset();
    });

    el.qtyInput.addEventListener("input", updateHint);

    document.querySelectorAll("[data-quick]").forEach(btn => btn.addEventListener("click", () => quick(btn.getAttribute("data-quick"))));

    el.buyBtn.addEventListener("click", () => {
      try{
        const q = parseQty();
        if (!Number.isFinite(q)) throw new Error("Ungültige Eingabe.");
        doBuy(q);
        toast({ title: "BUY", message: "Ausgeführt: " + U.fmtNumber(q) + " " + state.settings.selectedSymbol, kind: "ok" });
        renderPortfolio();
      }catch(err){ toast({ title: "BUY abgelehnt", message: String(err?.message || err), kind: "bad", ttlMs: 4000 }); }
    });

    el.sellBtn.addEventListener("click", () => {
      try{
        const q = parseQty();
        if (!Number.isFinite(q)) throw new Error("Ungültige Eingabe.");
        doSell(q);
        toast({ title: "SELL", message: "Ausgeführt: " + U.fmtNumber(q) + " " + state.settings.selectedSymbol, kind: "ok" });
        renderPortfolio();
      }catch(err){ toast({ title: "SELL abgelehnt", message: String(err?.message || err), kind: "bad", ttlMs: 4000 }); }
    });

    el.advancedToggle.addEventListener("change", () => {
      state.settings.advanced = el.advancedToggle.checked;
      if (!advancedOn()){
        state.settings.allowShort = false;
        state.settings.feeBps = 0;
        state.settings.slipBps = 0;
        state.settings.maxLeverage = 1;
      } else {
        state.settings.maxLeverage = Number(state.settings.maxLeverage) || 2.0;
      }
      applySettingsUI();
      renderPortfolio();
    });

    el.orderModeSelect.addEventListener("change", () => { state.settings.orderMode = el.orderModeSelect.value; applySettingsUI(); updateHint(); Store.saveState(state); });
    el.shortToggle.addEventListener("change", () => { state.settings.allowShort = el.shortToggle.checked; applySettingsUI(); renderPortfolio(); });

    el.levInput.addEventListener("change", () => { state.settings.maxLeverage = Number(el.levInput.value); renderPortfolio(); });
    el.feeInput.addEventListener("change", () => { state.settings.feeBps = Number(el.feeInput.value); renderPortfolio(); });
    el.slipInput.addEventListener("change", () => { state.settings.slipBps = Number(el.slipInput.value); renderPortfolio(); });

    el.resetBtn.addEventListener("click", async () => {
      if (!confirm("Wirklich Portfolio + Trades zurücksetzen? (localStorage wird gelöscht)")) return;
      Store.clearState();
      state = defaultState(); migrate();
      populateSelects();
      toast({ title: "Reset", message: "Zurückgesetzt.", kind: "warn" });
      await switchAsset();
    });
  }

  function grabEls(){
    el.assetSelect = $("assetSelect");
    el.daysSelect = $("daysSelect");
    el.speedSelect = $("speedSelect");
    el.resetBtn = $("resetBtn");
    el.priceText = $("priceText");
    el.priceMeta = $("priceMeta");
    el.statusText = $("statusText");
    el.statusMeta = $("statusMeta");
    el.cashText = $("cashText");
    el.equityText = $("equityText");
    el.pnlText = $("pnlText");
    el.upnlText = $("upnlText");
    el.rpnlText = $("rpnlText");
    el.posText = $("posText");
    el.orderInputLabel = $("orderInputLabel");
    el.qtyInput = $("qtyInput");
    el.buyBtn = $("buyBtn");
    el.sellBtn = $("sellBtn");
    el.orderHint = $("orderHint");
    el.tradesTable = $("tradesTable");
    el.toastHost = $("toastHost");
    el.advancedToggle = $("advancedToggle");
    el.orderModeSelect = $("orderModeSelect");
    el.shortToggle = $("shortToggle");
    el.shortStatus = $("shortStatus");
    el.levInput = $("levInput");
    el.feeInput = $("feeInput");
    el.slipInput = $("slipInput");
  }

  async function bootstrap(){
    grabEls();

    if (location.protocol === "file:"){
      setStatus("Hinweis: file://", "Live-API kann geblockt sein. Fake läuft trotzdem. Für Live: GitHub Pages oder VS Code Live Server.");
    } else {
      setStatus("Initialisiere…", "");
    }

    initChart();
    populateSelects();
    wireUI();

    startFake();
    await startLivePrices();
    await switchAsset();
  }

  document.addEventListener("DOMContentLoaded", () => {
    bootstrap().catch(err => {
      setStatus("Bootstrap Fehler", String(err?.message || err));
      toast({ title: "Bootstrap", message: String(err?.message || err), kind: "bad", ttlMs: 6000 });
    });
  });
})();

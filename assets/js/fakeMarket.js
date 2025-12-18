// assets/js/fakeMarket.js
// Synthetischer Markt ohne Bezug zu echten Daten.
// Ziel: realistisch wirken (Trend + Volatilität + Regime-Wechsel).

import { clamp } from "./utils.js";

function randn(){
  // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export class FakeMarket{
  /**
   * @param {object} opts
   * @param {number} opts.seedPrice  Startpreis
   * @param {"fast"|"medium"|"slow"} opts.speed
   * @param {number} opts.candleSeconds  Candle-Länge in Simulations-Sekunden (nicht Realzeit)
   */
  constructor({ seedPrice = 1000, speed = "medium", candleSeconds = 60 } = {}){
    this.seedPrice = seedPrice;
    this.speed = speed;
    this.candleSeconds = candleSeconds;

    this._timer = null;
    this._t = Math.floor(Date.now() / 1000); // chart time in seconds
    this._price = seedPrice;

    // Regime-State
    this._trend = 0;         // drift-like
    this._vol = 0.012;       // per-step volatility (synthetic)
    this._regime = "neutral";
    this._regimeTtl = 0;

    this._current = null;    // current candle
    this._candles = [];
  }

  setSpeed(speed){
    this.speed = speed;
  }

  getPrice(){ return this._price; }
  getCandles(){ return [...this._candles]; }

  stop(){
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  start(onUpdate){
    // Tick-Raten: je schneller, desto mehr Candles pro Realzeit.
    const tickMs = this.speed === "fast" ? 250 : (this.speed === "slow" ? 2000 : 1000);

    // initial seed candles
    this._candles = [];
    this._current = null;

    for (let i = 0; i < 120; i++){
      this._step(); // build history
    }

    onUpdate?.({ type: "init", candles: this.getCandles(), price: this._price });

    this._timer = setInterval(() => {
      const out = this._step();
      onUpdate?.(out);
    }, tickMs);
  }

  _maybeSwitchRegime(){
    // Regime hält zufällig eine Weile an.
    if (this._regimeTtl > 0){
      this._regimeTtl--;
      return;
    }
    const r = Math.random();
    if (r < 0.25){
      this._regime = "trend_up";
      this._regimeTtl = 40 + Math.floor(Math.random() * 90);
    } else if (r < 0.50){
      this._regime = "trend_down";
      this._regimeTtl = 40 + Math.floor(Math.random() * 90);
    } else if (r < 0.70){
      this._regime = "high_vol";
      this._regimeTtl = 30 + Math.floor(Math.random() * 70);
    } else {
      this._regime = "neutral";
      this._regimeTtl = 30 + Math.floor(Math.random() * 80);
    }
  }

  _step(){
    // Ein Step = 1 Sim-Sekunde; Candle = this.candleSeconds
    this._t += 1;

    this._maybeSwitchRegime();

    // Trend/Vol langsam „wandern“ lassen
    const trendNoise = 0.00035 * randn();
    this._trend = clamp(this._trend + trendNoise, -0.003, 0.003);

    const volNoise = 0.00015 * randn();
    this._vol = clamp(this._vol + volNoise, 0.004, 0.03);

    // Regime beeinflusst Drift/Vol
    let drift = this._trend;
    let vol = this._vol;

    if (this._regime === "trend_up") drift += 0.0012;
    if (this._regime === "trend_down") drift -= 0.0012;
    if (this._regime === "high_vol") vol *= 1.8;

    // Mean reversion (gegen extremes Weglaufen)
    const anchor = this.seedPrice;
    const pull = (anchor - this._price) / anchor; // negative wenn zu hoch
    drift += 0.00035 * pull;

    // Preis-Update (multiplikativ, damit prozentuale Moves „realistisch“ sind)
    const ret = drift + vol * randn();
    const next = this._price * Math.exp(ret);
    this._price = clamp(next, 0.01, Number.MAX_SAFE_INTEGER);

    // Candle handling
    if (!this._current){
      this._current = { time: this._t, open: this._price, high: this._price, low: this._price, close: this._price };
      this._candles.push(this._current);
      return { type: "candle", candle: { ...this._current }, price: this._price, regime: this._regime };
    }

    // Update current candle
    this._current.high = Math.max(this._current.high, this._price);
    this._current.low  = Math.min(this._current.low, this._price);
    this._current.close = this._price;

    // Wenn Candle-Länge erreicht: neue Candle beginnen
    const age = this._t - this._current.time;
    if (age >= this.candleSeconds){
      this._current = { time: this._t, open: this._price, high: this._price, low: this._price, close: this._price };
      this._candles.push(this._current);

      // Memory begrenzen
      if (this._candles.length > 400){
        this._candles = this._candles.slice(-400);
      }

      return { type: "new_candle", candle: { ...this._current }, price: this._price, regime: this._regime };
    }

    return { type: "update", candle: { ...this._current }, price: this._price, regime: this._regime };
  }
}
